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

  const btnCopyShortcutUrl = document.getElementById('btn-copy-shortcut-url');
  const copyFeedback = document.getElementById('copy-feedback');

  const btnExportBackup = document.getElementById('btn-export-backup');
  const btnTriggerImport = document.getElementById('btn-trigger-import');
  const importFileInput = document.getElementById('import-file-input');
  const importStatus = document.getElementById('import-status');

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async function init() {
    setupEventListeners();
    await loadLabels();
  }

  function setupEventListeners() {
    // Add Label Form
    createLabelForm.addEventListener('submit', handleCreateLabel);

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
