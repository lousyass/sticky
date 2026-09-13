/**
 * pages/options.js - Sticky Options & Settings Controller
 * Manages label CRUD, shortcut instructions, and full JSON backup/restore.
 */

(function () {
  // DOM Elements
  const createLabelForm = document.getElementById('create-label-form');
  const newLabelColor = document.getElementById('new-label-color');
  const newLabelName = document.getElementById('new-label-name');
  const labelsList = document.getElementById('labels-list');

  // Shortcut Customizer Elements
  const currentShortcutBadge = document.getElementById('current-shortcut-badge');
  const shortcutRecorder = document.getElementById('shortcut-recorder');
  const recorderIdleView = document.getElementById('recorder-idle-view');
  const recorderActiveView = document.getElementById('recorder-active-view');
  const btnSaveShortcut = document.getElementById('btn-save-shortcut');
  const btnResetShortcut = document.getElementById('btn-reset-shortcut');
  const shortcutSaveFeedback = document.getElementById('shortcut-save-feedback');

  const btnCopyShortcutUrl = document.getElementById('btn-copy-shortcut-url');
  const copyFeedback = document.getElementById('copy-feedback');

  const btnExportBackup = document.getElementById('btn-export-backup');
  const btnTriggerImport = document.getElementById('btn-trigger-import');
  const importFileInput = document.getElementById('import-file-input');
  const importStatus = document.getElementById('import-status');

  let candidateShortcut = null;
  let isRecording = false;

  const DEFAULT_SHORTCUT = {
    display: 'Ctrl + `',
    key: '`',
    code: 'Backquote',
    shiftKey: false,
    ctrlKey: true,
    altKey: false,
    metaKey: false
  };

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async function init() {
    setupEventListeners();
    await loadLabels();
    await loadShortcut();
  }

  function setupEventListeners() {
    // Add Label Form
    createLabelForm.addEventListener('submit', handleCreateLabel);

    // Shortcut Customizer Events
    shortcutRecorder.addEventListener('click', startRecording);
    shortcutRecorder.addEventListener('keydown', handleRecordingKeyDown);
    shortcutRecorder.addEventListener('blur', () => {
      if (isRecording) stopRecording(false);
    });

    btnSaveShortcut.addEventListener('click', handleSaveShortcut);
    btnResetShortcut.addEventListener('click', handleResetShortcut);

    // Copy Shortcut Instructions
    btnCopyShortcutUrl.addEventListener('click', () => {
      const text = 'about:addons';
      navigator.clipboard.writeText(text).then(() => {
        copyFeedback.style.display = 'inline';
        setTimeout(() => {
          copyFeedback.style.display = 'none';
        }, 2500);
      }).catch(() => {
        prompt('Copy the URL below and paste into your address bar:', text);
      });
    });

    // Export Backup
    btnExportBackup.addEventListener('click', handleExportBackup);

    // Import Backup Trigger
    btnTriggerImport.addEventListener('click', () => {
      importFileInput.value = '';
      importFileInput.click();
    });

    importFileInput.addEventListener('change', handleImportFileSelected);
  }

  // ==========================================
  // SHORTCUT MANAGEMENT
  // ==========================================

  async function loadShortcut() {
    try {
      const settings = await StickyStorage.getSettings();
      const shortcut = settings.captureShortcut || DEFAULT_SHORTCUT;
      renderShortcutBadge(shortcut);
    } catch (err) {
      console.error('Failed to load shortcut:', err);
      renderShortcutBadge(DEFAULT_SHORTCUT);
    }
  }

  function renderShortcutBadge(shortcut) {
    currentShortcutBadge.innerHTML = '';
    const parts = (shortcut.display || 'Shift + E').split(' + ');
    parts.forEach((part, index) => {
      const kbd = document.createElement('kbd');
      kbd.textContent = part.trim();
      currentShortcutBadge.appendChild(kbd);

      if (index < parts.length - 1) {
        currentShortcutBadge.appendChild(document.createTextNode(' + '));
      }
    });
  }

  function startRecording() {
    isRecording = true;
    shortcutRecorder.classList.add('recording');
    recorderIdleView.style.display = 'none';
    recorderActiveView.style.display = 'flex';
    recorderActiveView.innerHTML = `
      <span class="recording-pulse"></span>
      <span>Press keys now (e.g. Shift + E, Alt + S)...</span>
    `;
    shortcutRecorder.focus();
  }

  function stopRecording(hasRecordedKey = false) {
    isRecording = false;
    shortcutRecorder.classList.remove('recording');
    recorderActiveView.style.display = 'none';
    recorderIdleView.style.display = 'flex';

    if (!hasRecordedKey) {
      recorderIdleView.innerHTML = `
        <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
          <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
        </svg>
        <span>Click here to record a new key combination</span>
      `;
    }
  }

  function handleRecordingKeyDown(e) {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    // Cancel on Escape
    if (e.key === 'Escape') {
      stopRecording(false);
      return;
    }

    // Ignore standalone modifier presses until primary key is pressed
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
      const activeMods = [];
      if (e.ctrlKey) activeMods.push('Ctrl');
      if (e.altKey) activeMods.push('Alt');
      if (e.shiftKey) activeMods.push('Shift');
      if (e.metaKey) activeMods.push('Cmd');
      recorderActiveView.innerHTML = `
        <span class="recording-pulse"></span>
        <span>${activeMods.join(' + ')} + ...</span>
      `;
      return;
    }

    // Determine primary key name
    let primaryKey = e.key.toUpperCase();
    if (e.code && e.code.startsWith('Key')) {
      primaryKey = e.code.replace('Key', '');
    } else if (e.code && e.code.startsWith('Digit')) {
      primaryKey = e.code.replace('Digit', '');
    } else if (e.code === 'Backquote' || e.key === '`') {
      primaryKey = '`';
    }

    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Cmd');
    parts.push(primaryKey);

    const displayString = parts.join(' + ');

    candidateShortcut = {
      display: displayString,
      key: e.key.toLowerCase(),
      code: e.code,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      metaKey: e.metaKey
    };

    stopRecording(true);
    recorderIdleView.innerHTML = `
      <span style="color:var(--text-primary);">Recorded: <strong>${displayString}</strong></span>
      <span style="color:var(--text-muted);font-size:12px;">(Click "Save Shortcut" below to apply)</span>
    `;
    btnSaveShortcut.disabled = false;
  }

  async function handleSaveShortcut() {
    if (!candidateShortcut) return;

    btnSaveShortcut.disabled = true;
    try {
      await StickyStorage.saveSettings({ captureShortcut: candidateShortcut });
      renderShortcutBadge(candidateShortcut);

      // Attempt to sync browser command if shortcut has Ctrl or Alt
      const ext = typeof browser !== 'undefined' ? browser : chrome;
      if (ext && ext.commands && ext.commands.update && (candidateShortcut.ctrlKey || candidateShortcut.altKey)) {
        try {
          const cmdParts = [];
          if (candidateShortcut.ctrlKey) cmdParts.push('Ctrl');
          if (candidateShortcut.altKey) cmdParts.push('Alt');
          if (candidateShortcut.shiftKey) cmdParts.push('Shift');
          cmdParts.push(candidateShortcut.key.toUpperCase());
          await ext.commands.update({
            name: 'save-to-sticky',
            shortcut: cmdParts.join('+')
          });
        } catch (cmdErr) {
          // Ignore if command format not accepted by browser
        }
      }

      shortcutSaveFeedback.style.display = 'inline';
      shortcutSaveFeedback.textContent = `✓ Shortcut saved as ${candidateShortcut.display}!`;
      setTimeout(() => {
        shortcutSaveFeedback.style.display = 'none';
      }, 3500);

      recorderIdleView.innerHTML = `
        <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
          <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
        </svg>
        <span>Click here to record a new key combination</span>
      `;
      candidateShortcut = null;
    } catch (err) {
      alert(`Could not save shortcut: ${err.message}`);
      btnSaveShortcut.disabled = false;
    }
  }

  async function handleResetShortcut() {
    try {
      await StickyStorage.saveSettings({ captureShortcut: DEFAULT_SHORTCUT });
      renderShortcutBadge(DEFAULT_SHORTCUT);

      shortcutSaveFeedback.style.display = 'inline';
      shortcutSaveFeedback.textContent = '✓ Shortcut reset to default (Ctrl + `)!';
      setTimeout(() => {
        shortcutSaveFeedback.style.display = 'none';
      }, 3500);

      recorderIdleView.innerHTML = `
        <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
          <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
        </svg>
        <span>Click here to record a new key combination</span>
      `;
      btnSaveShortcut.disabled = true;
      candidateShortcut = null;
    } catch (err) {
      alert(`Could not reset shortcut: ${err.message}`);
    }
  }

  // ==========================================
  // LABELS MANAGEMENT
  // ==========================================

  async function loadLabels() {
    try {
      const labels = await StickyStorage.getLabels();
      renderLabels(labels);
    } catch (err) {
      console.error('Failed to load labels:', err);
    }
  }

  function renderLabels(labels) {
    labelsList.innerHTML = '';

    if (!labels || labels.length === 0) {
      labelsList.innerHTML = '<div style="padding: 16px; font-size: 13px; color: var(--text-muted); text-align: center;">No labels created yet. Add one above!</div>';
      return;
    }

    labels.forEach(lbl => {
      const row = document.createElement('div');
      row.className = 'label-row';

      const info = document.createElement('div');
      info.className = 'label-row-info';

      // Color picker
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'label-color-picker';
      colorInput.value = lbl.color || '#f59e0b';
      colorInput.title = 'Click to change color';

      colorInput.addEventListener('change', async () => {
        await StickyStorage.saveLabel({
          id: lbl.id,
          name: lbl.name,
          color: colorInput.value
        });
        lbl.color = colorInput.value;
      });

      // Label name input
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'label-name-input';
      nameInput.value = lbl.name;

      nameInput.addEventListener('blur', async () => {
        const val = nameInput.value.trim();
        if (val && val !== lbl.name) {
          lbl.name = val;
          await StickyStorage.saveLabel({
            id: lbl.id,
            name: val,
            color: lbl.color
          });
        } else {
          nameInput.value = lbl.name;
        }
      });

      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          nameInput.blur();
        }
      });

      info.appendChild(colorInput);
      info.appendChild(nameInput);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'label-actions';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete-label';
      deleteBtn.title = 'Delete label';
      deleteBtn.innerHTML = `
        <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;">
          <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
      `;

      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Are you sure you want to delete the "${lbl.name}" label? It will be removed from all associated items.`)) {
          await StickyStorage.deleteLabel(lbl.id);
          await loadLabels();
        }
      });

      actions.appendChild(deleteBtn);

      row.appendChild(info);
      row.appendChild(actions);
      labelsList.appendChild(row);
    });
  }

  async function handleCreateLabel(e) {
    e.preventDefault();
    const name = newLabelName.value.trim();
    if (!name) return;

    const color = newLabelColor.value || '#F59E0B';

    try {
      await StickyStorage.saveLabel({ name, color });
      newLabelName.value = '';
      await loadLabels();
    } catch (err) {
      alert(`Error creating label: ${err.message}`);
    }
  }

  // ==========================================
  // BACKUP EXPORT & IMPORT
  // ==========================================

  async function handleExportBackup() {
    btnExportBackup.disabled = true;
    btnExportBackup.textContent = 'Generating backup...';

    try {
      const backup = await StickyStorage.exportBackup();
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const filename = `sticky-backup-${new Date().toISOString().slice(0, 10)}.json`;

      // Check for browser.downloads API
      const ext = typeof browser !== 'undefined' ? browser : chrome;
      if (ext && ext.downloads && ext.downloads.download) {
        const url = URL.createObjectURL(blob);
        await ext.downloads.download({
          url,
          filename,
          saveAs: true
        });
      } else {
        // Fallback to HTML anchor download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert(`Export failed: ${err.message}`);
    } finally {
      btnExportBackup.disabled = false;
      btnExportBackup.innerHTML = `
        <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
          <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
        Export to JSON
      `;
    }
  }

  function handleImportFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        if (!json || !Array.isArray(json.items)) {
          throw new Error('Invalid Sticky backup format (missing items array)');
        }

        const modeEl = document.querySelector('input[name="import-mode"]:checked');
        const mode = modeEl ? modeEl.value : 'merge';

        if (mode === 'replace') {
          if (!confirm('Warning: "Replace all data" will overwrite all your current items and labels. Do you want to proceed?')) {
            return;
          }
        }

        btnTriggerImport.disabled = true;
        showImportStatus('Importing data...', 'info');

        const result = await StickyStorage.importBackup(json, mode);

        showImportStatus(
          `Successfully imported ${result.importedItemsCount} items and ${result.importedLabelsCount} labels!`,
          'success'
        );

        await loadLabels();
      } catch (err) {
        console.error('Import error:', err);
        showImportStatus(`Import failed: ${err.message}`, 'error');
      } finally {
        btnTriggerImport.disabled = false;
      }
    };

    reader.onerror = () => {
      showImportStatus('Could not read the selected file.', 'error');
    };

    reader.readAsText(file);
  }

  function showImportStatus(message, type) {
    importStatus.style.display = 'block';
    importStatus.className = `import-status ${type}`;
    importStatus.textContent = message;

    if (type === 'success') {
      setTimeout(() => {
        importStatus.style.display = 'none';
      }, 5000);
    }
  }

  // Initialize options page
  init();
})();
