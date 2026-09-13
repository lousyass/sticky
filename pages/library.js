/**
 * pages/library.js - Sticky Library Controller
 * Manages search, multi-label filtering, cards rendering, editing, and note creation.
 */

(function () {
  // Application State
  const state = {
    searchQuery: '',
    typeFilter: 'all', // 'all' | 'link' | 'note' | 'unread'
    selectedLabelIds: new Set(),
    sortBy: 'newest',
    labels: [],
    items: [],
    editingItemId: null
  };

  // DOM Elements
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const viewTabBtns = document.querySelectorAll('.tab-btn');
  const sortSelect = document.getElementById('sort-select');
  const labelPillsContainer = document.getElementById('label-pills-container');
  const clearLabelFiltersBtn = document.getElementById('clear-label-filters-btn');
  const itemsCountText = document.getElementById('items-count-text');
  const itemsGrid = document.getElementById('items-grid');
  const emptyState = document.getElementById('empty-state');
  const emptyTitle = document.getElementById('empty-title');
  const emptyDesc = document.getElementById('empty-desc');
  const emptyCreateNoteBtn = document.getElementById('empty-create-note-btn');
  const btnAddNote = document.getElementById('btn-add-note');

  // Modal Elements
  const itemModal = document.getElementById('item-modal');
  const modalHeading = document.getElementById('modal-heading');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const itemForm = document.getElementById('item-form');
  const modalItemId = document.getElementById('modal-item-id');
  const modalItemType = document.getElementById('modal-item-type');
  const modalTitle = document.getElementById('modal-title');
  const groupModalUrl = document.getElementById('group-modal-url');
  const modalUrl = document.getElementById('modal-url');
  const modalNote = document.getElementById('modal-note');
  const modalLabelsContainer = document.getElementById('modal-labels-container');

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async function init() {
    setupEventListeners();
    await loadLabels();
    await refreshItems();

    // Listen for storage changes from background or other tabs
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          if (changes.sticky_items || changes.sticky_labels) {
            refreshItems();
          }
        }
      });
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          if (changes.sticky_items || changes.sticky_labels) {
            refreshItems();
          }
        }
      });
    }
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  function setupEventListeners() {
    // Search input
    let searchDebounceTimer = null;
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      searchClearBtn.style.display = val ? 'block' : 'none';

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        state.searchQuery = val;
        renderItems();
      }, 150);
    });

    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      searchClearBtn.style.display = 'none';
      renderItems();
      searchInput.focus();
    });

    // View type tabs
    viewTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        viewTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.typeFilter = btn.dataset.type;
        renderItems();
      });
    });

    // Sort select
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderItems();
    });

    // Clear label filters button
    clearLabelFiltersBtn.addEventListener('click', () => {
      state.selectedLabelIds.clear();
      updateLabelPillsUI();
      renderItems();
    });

    // Add note buttons
    btnAddNote.addEventListener('click', () => openNoteModal());
    emptyCreateNoteBtn.addEventListener('click', () => openNoteModal());

    // Modal controls
    modalCloseBtn.addEventListener('click', closeModal);
    modalCancelBtn.addEventListener('click', closeModal);
    itemModal.addEventListener('click', (e) => {
      if (e.target === itemModal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && itemModal.style.display !== 'none') {
        closeModal();
      }
    });

    itemForm.addEventListener('submit', handleFormSubmit);
  }

  // ==========================================
  // DATA LOADING & RENDERING
  // ==========================================

  async function loadLabels() {
    try {
      state.labels = await StickyStorage.getLabels();
      renderLabelFilters();
    } catch (err) {
      console.error('Failed to load labels:', err);
    }
  }

  function renderLabelFilters() {
    labelPillsContainer.innerHTML = '';

    if (!state.labels || state.labels.length === 0) {
      labelPillsContainer.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">No labels created yet</span>';
      return;
    }

    state.labels.forEach(lbl => {
      const pill = document.createElement('div');
      pill.className = 'label-pill';
      pill.dataset.id = lbl.id;
      pill.style.setProperty('--pill-color', lbl.color || '#f59e0b');

      const dot = document.createElement('span');
      dot.className = 'label-dot';
      dot.style.backgroundColor = lbl.color || '#f59e0b';

      const name = document.createElement('span');
      name.textContent = lbl.name;

      pill.appendChild(dot);
      pill.appendChild(name);

      pill.addEventListener('click', () => {
        if (state.selectedLabelIds.has(lbl.id)) {
          state.selectedLabelIds.delete(lbl.id);
        } else {
          state.selectedLabelIds.add(lbl.id);
        }
        updateLabelPillsUI();
        renderItems();
      });

      labelPillsContainer.appendChild(pill);
    });

    updateLabelPillsUI();
  }

  function updateLabelPillsUI() {
    const pills = labelPillsContainer.querySelectorAll('.label-pill');
    pills.forEach(pill => {
      const id = pill.dataset.id;
      if (state.selectedLabelIds.has(id)) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    clearLabelFiltersBtn.style.display = state.selectedLabelIds.size > 0 ? 'inline-block' : 'none';
  }

  async function refreshItems() {
    try {
      state.items = await StickyStorage.getItems();
      renderItems();
    } catch (err) {
      console.error('Failed to refresh items:', err);
    }
  }

  function renderItems() {
    // 1. Filter by search query
    let filtered = [...state.items];

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(item => {
        const titleMatch = (item.title || '').toLowerCase().includes(q);
        const noteMatch = (item.note || '').toLowerCase().includes(q);
        const urlMatch = (item.url || '').toLowerCase().includes(q);
        const sourceMatch = (item.source || '').toLowerCase().includes(q);
        return titleMatch || noteMatch || urlMatch || sourceMatch;
      });
    }

    // 2. Filter by tab type
    if (state.typeFilter === 'link') {
      filtered = filtered.filter(i => i.type === 'link');
    } else if (state.typeFilter === 'note') {
      filtered = filtered.filter(i => i.type === 'note');
    } else if (state.typeFilter === 'unread') {
      filtered = filtered.filter(i => !i.read);
    }

    // 3. Filter by selected labels
    if (state.selectedLabelIds.size > 0) {
      filtered = filtered.filter(item => {
        if (!Array.isArray(item.labels)) return false;
        return Array.from(state.selectedLabelIds).some(id => item.labels.includes(id));
      });
    }

    // 4. Sort items
    filtered.sort((a, b) => {
      if (state.sortBy === 'oldest') {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      if (state.sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      // default: newest first
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    // Update count summary
    itemsCountText.textContent = `Showing ${filtered.length} of ${state.items.length} item${state.items.length === 1 ? '' : 's'}`;

    // Render Grid
    itemsGrid.innerHTML = '';

    if (filtered.length === 0) {
      itemsGrid.style.display = 'none';
      emptyState.style.display = 'flex';
      if (state.items.length > 0) {
        emptyTitle.textContent = 'No matching items found';
        emptyDesc.textContent = 'Try adjusting your search query, type filter, or selected labels.';
        emptyCreateNoteBtn.style.display = 'none';
      } else {
        emptyTitle.textContent = 'Nothing saved yet';
        StickyStorage.getSettings().then(settings => {
          const shortcutDisplay = settings?.captureShortcut?.display || 'Ctrl + `';
          const kbdParts = shortcutDisplay.split(' + ').map(p => `<kbd>${p.trim()}</kbd>`).join(' + ');
          emptyDesc.innerHTML = `Press ${kbdParts} while browsing any page or right-click any link, image, or text to save to Sticky.`;
        }).catch(() => {
          emptyDesc.innerHTML = 'Press <kbd>Ctrl</kbd> + <kbd>`</kbd> while browsing any page or right-click any link, image, or text to save to Sticky.';
        });
        emptyCreateNoteBtn.style.display = 'inline-flex';
      }
      return;
    }

    emptyState.style.display = 'none';
    itemsGrid.style.display = 'grid';

    // Render Cards
    filtered.forEach(item => {
      const card = createItemCard(item);
      itemsGrid.appendChild(card);
    });
  }

  // ==========================================
  // CARD GENERATION
  // ==========================================

  function createItemCard(item) {
    const card = document.createElement('div');
    card.className = `item-card ${item.type === 'note' ? 'is-note' : ''}`;
    card.dataset.id = item.id;

    // Unread indicator
    if (!item.read) {
      const pip = document.createElement('span');
      pip.className = 'unread-pip';
      pip.title = 'Unread item';
      card.appendChild(pip);
    }

    // Card Media (for link items)
    if (item.type === 'link') {
      const media = document.createElement('div');
      media.className = 'card-media';

      const thumbImg = document.createElement('img');
      thumbImg.className = 'card-thumb-img';
      thumbImg.alt = item.title;
      thumbImg.style.display = 'none';

      const fallback = document.createElement('div');
      fallback.className = 'card-thumb-fallback';
      fallback.textContent = '🔗';

      media.appendChild(fallback);
      media.appendChild(thumbImg);

      // Asynchronously fetch thumbnail from IndexedDB if key exists
      if (item.thumbnailKey) {
        ThumbnailDB.getThumbnail(item.thumbnailKey).then(thumbUrl => {
          if (thumbUrl) {
            thumbImg.src = thumbUrl;
            thumbImg.onload = () => {
              thumbImg.style.display = 'block';
              fallback.style.display = 'none';
            };
          }
        }).catch(err => {
          console.warn('Could not load thumbnail from IndexedDB:', err);
        });
      } else if (item.faviconUrl) {
        thumbImg.src = item.faviconUrl;
        thumbImg.onload = () => {
          thumbImg.style.display = 'block';
          fallback.style.display = 'none';
        };
      }

      // Clicking media opens link
      if (item.url) {
        media.style.cursor = 'pointer';
        media.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(item.url, '_blank');
        });
      }

      card.appendChild(media);
    } else {
      // Note header banner
      const banner = document.createElement('div');
      banner.className = 'card-note-banner';
      banner.innerHTML = `
        <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px;">
          <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
        </svg>
        <span>Note</span>
      `;
      card.appendChild(banner);
    }

    // Card Body
    const body = document.createElement('div');
    body.className = 'card-body';

    // Meta Top (Favicon, Source, Date)
    const metaTop = document.createElement('div');
    metaTop.className = 'card-meta-top';

    if (item.faviconUrl) {
      const fav = document.createElement('img');
      fav.className = 'card-favicon';
      fav.src = item.faviconUrl;
      fav.alt = '';
      fav.onerror = () => { fav.style.display = 'none'; };
      metaTop.appendChild(fav);
    }

    const sourceEl = document.createElement('span');
    sourceEl.className = 'card-source';
    sourceEl.textContent = item.source || (item.type === 'note' ? 'Quick Note' : 'web');
    metaTop.appendChild(sourceEl);

    const dateEl = document.createElement('span');
    dateEl.className = 'card-date';
    dateEl.textContent = formatDate(item.createdAt);
    metaTop.appendChild(dateEl);

    body.appendChild(metaTop);

    // Title
    const titleEl = document.createElement(item.url ? 'a' : 'div');
    titleEl.className = 'card-title';
    titleEl.textContent = item.title;
    if (item.url) {
      titleEl.href = item.url;
      titleEl.target = '_blank';
      titleEl.rel = 'noopener noreferrer';
    }
    body.appendChild(titleEl);

    // Note preview / text box
    if (item.note && item.note.trim()) {
      const noteBox = document.createElement('div');
      noteBox.className = 'card-note-box';
      noteBox.textContent = item.note;
      body.appendChild(noteBox);
    }

    // Labels
    if (Array.isArray(item.labels) && item.labels.length > 0) {
      const labelsDiv = document.createElement('div');
      labelsDiv.className = 'card-labels';

      item.labels.forEach(lblId => {
        const lbl = state.labels.find(l => l.id === lblId);
        if (lbl) {
          const badge = document.createElement('span');
          badge.className = 'card-label-badge';
          badge.textContent = lbl.name;
          badge.style.setProperty('--badge-color', lbl.color || '#f59e0b');
          badge.title = `Filter by "${lbl.name}"`;
          badge.style.cursor = 'pointer';
          badge.addEventListener('click', (e) => {
            e.stopPropagation();
            state.selectedLabelIds.clear();
            state.selectedLabelIds.add(lbl.id);
            updateLabelPillsUI();
            renderItems();
          });
          labelsDiv.appendChild(badge);
        }
      });

      body.appendChild(labelsDiv);
    }

    card.appendChild(body);

    // Footer Actions
    const footer = document.createElement('div');
    footer.className = 'card-footer';

    // Left info or URL hostname
    const leftInfo = document.createElement('span');
    leftInfo.style.color = 'var(--text-muted)';
    leftInfo.style.fontSize = '11px';
    if (item.url) {
      try {
        leftInfo.textContent = new URL(item.url).hostname;
      } catch {
        leftInfo.textContent = 'link';
      }
    } else {
      leftInfo.textContent = 'text note';
    }
    footer.appendChild(leftInfo);

    // Action Buttons Group
    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'card-actions-group';

    // Toggle Read Button
    const readBtn = document.createElement('button');
    readBtn.className = `icon-btn ${item.read ? 'active-read' : ''}`;
    readBtn.title = item.read ? 'Mark as unread' : 'Mark as read';
    readBtn.innerHTML = `
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
      </svg>
    `;
    readBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newReadState = await StickyStorage.toggleRead(item.id);
      item.read = newReadState;
      renderItems();
    });
    actionsGroup.appendChild(readBtn);

    // Edit Button
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.title = 'Edit item & note';
    editBtn.innerHTML = `
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
    `;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(item);
    });
    actionsGroup.appendChild(editBtn);

    // Delete Button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn danger';
    deleteBtn.title = 'Delete item';
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
      </svg>
    `;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${item.title}"?`)) {
        await StickyStorage.deleteItem(item.id);
        state.items = state.items.filter(i => i.id !== item.id);
        renderItems();
      }
    });
    actionsGroup.appendChild(deleteBtn);

    footer.appendChild(actionsGroup);
    card.appendChild(footer);

    return card;
  }

  // ==========================================
  // MODAL / EDITING
  // ==========================================

  function openNoteModal() {
    state.editingItemId = null;
    modalHeading.textContent = 'Add Note';
    modalItemId.value = '';
    modalItemType.value = 'note';
    modalTitle.value = '';
    modalUrl.value = '';
    groupModalUrl.style.display = 'none';
    modalNote.value = '';

    renderModalLabelCheckboxes([]);
    itemModal.style.display = 'flex';
    modalTitle.focus();
  }

  function openEditModal(item) {
    state.editingItemId = item.id;
    modalHeading.textContent = item.type === 'link' ? 'Edit Link Item' : 'Edit Note';
    modalItemId.value = item.id;
    modalItemType.value = item.type;
    modalTitle.value = item.title || '';
    modalUrl.value = item.url || '';
    groupModalUrl.style.display = item.type === 'link' ? 'flex' : 'none';
    modalNote.value = item.note || '';

    renderModalLabelCheckboxes(item.labels || []);
    itemModal.style.display = 'flex';
    modalNote.focus();
  }

  function renderModalLabelCheckboxes(selectedIds = []) {
    modalLabelsContainer.innerHTML = '';
    if (!state.labels || state.labels.length === 0) {
      modalLabelsContainer.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">No labels available. Create them in Options.</span>';
      return;
    }

    state.labels.forEach(lbl => {
      const isChecked = selectedIds.includes(lbl.id);
      const labelTag = document.createElement('label');
      labelTag.className = `modal-label-check ${isChecked ? 'checked' : ''}`;
      labelTag.style.setProperty('--lbl-color', lbl.color || '#f59e0b');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = lbl.id;
      checkbox.checked = isChecked;

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          labelTag.classList.add('checked');
        } else {
          labelTag.classList.remove('checked');
        }
      });

      labelTag.appendChild(checkbox);
      labelTag.appendChild(document.createTextNode(lbl.name));
      modalLabelsContainer.appendChild(labelTag);
    });
  }

  function closeModal() {
    itemModal.style.display = 'none';
    state.editingItemId = null;
  }

  async function handleFormSubmit(e) {
    e.preventDefault();

    const title = modalTitle.value.trim();
    if (!title) return;

    const type = modalItemType.value;
    const url = type === 'link' ? (modalUrl.value.trim() || null) : null;
    const note = modalNote.value.trim() || null;

    // Get checked labels
    const checkedInputs = modalLabelsContainer.querySelectorAll('input[type="checkbox"]:checked');
    const labels = Array.from(checkedInputs).map(cb => cb.value);

    if (state.editingItemId) {
      // Update existing item
      const updates = { title, note, labels };
      if (type === 'link') updates.url = url;
      await StickyStorage.updateItem(state.editingItemId, updates);
    } else {
      // Create new note item
      await StickyStorage.saveItem({
        type: 'note',
        title,
        note,
        labels,
        source: 'Quick Note'
      });
    }

    closeModal();
    await refreshItems();
  }

  // ==========================================
  // HELPERS
  // ==========================================

  function formatDate(isoDate) {
    if (!isoDate) return '';
    try {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    } catch {
      return '';
    }
  }

  // Run initial setup
  init();
})();
