// --- Settings ---

let currentBrowsePath = '';

async function openSettingsModal() {
  try {
    const settings = await api('GET', '/api/settings');
    document.getElementById('settings-data-dir').value = settings.dataDir || '';
  } catch { /* fallback */ }
  closeFolderBrowser();
  document.getElementById('settings-modal').classList.add('open');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('open');
}

async function saveSettings() {
  const dataDir = document.getElementById('settings-data-dir').value.trim();
  if (!dataDir) return toast('Data directory is required', 'error');

  try {
    const result = await api('PUT', '/api/settings', { dataDir });
    toast(result.message || 'Settings saved');
    closeSettingsModal();

    // Show restart prompt
    if (result.requiresRestart) {
      const restart = confirm('Data directory changed. The server needs to restart for changes to take effect.\n\nPlease restart the server manually (npm start).');
    }
  } catch { /* toasted */ }
}

// --- Folder Browser ---

async function openFolderBrowser() {
  const current = document.getElementById('settings-data-dir').value || '';
  document.getElementById('folder-browser').style.display = '';
  await folderBrowserNavigate(current || '');
}

function closeFolderBrowser() {
  document.getElementById('folder-browser').style.display = 'none';
}

async function folderBrowserNavigate(dir) {
  try {
    const result = await api('POST', '/api/settings/browse', { dir: dir || '' });
    currentBrowsePath = result.current;
    document.getElementById('fb-path').value = result.current;
    document.getElementById('fb-up-btn').disabled = !result.parent;

    const entriesEl = document.getElementById('fb-entries');
    if (result.entries.length === 0) {
      entriesEl.innerHTML = '<div style="padding:12px;text-align:center;font-size:12px;color:var(--text-muted);">No subdirectories</div>';
    } else {
      entriesEl.innerHTML = result.entries.map(e => `
        <div class="folder-entry" ondblclick="folderBrowserNavigate('${esc(e.path.replace(/\\/g, '\\\\'))}')">
          <span class="material-symbols-rounded" style="font-size:18px;color:var(--accent);">folder</span>
          <span class="folder-name">${esc(e.name)}</span>
        </div>`).join('');
    }
  } catch (err) {
    toast('Cannot browse: ' + (err.message || 'unknown error'), 'error');
  }
}

async function folderBrowserUp() {
  try {
    const result = await api('POST', '/api/settings/browse', { dir: currentBrowsePath });
    if (result.parent) {
      await folderBrowserNavigate(result.parent);
    }
  } catch { /* toasted */ }
}

function selectCurrentFolder() {
  document.getElementById('settings-data-dir').value = currentBrowsePath;
  closeFolderBrowser();
}

async function folderBrowserCreateDir() {
  const name = document.getElementById('fb-new-folder').value.trim();
  if (!name) return toast('Enter a folder name', 'error');
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return toast('Invalid folder name (use letters, numbers, -, _, .)', 'error');

  const sep = currentBrowsePath.includes('\\') ? '\\' : '/';
  const newPath = currentBrowsePath + (currentBrowsePath.endsWith(sep) ? '' : sep) + name;

  try {
    await api('POST', '/api/settings/mkdir', { dir: newPath });
    document.getElementById('fb-new-folder').value = '';
    await folderBrowserNavigate(currentBrowsePath);
    toast('Folder created');
  } catch (err) {
    toast('Failed to create folder: ' + (err.message || ''), 'error');
  }
}
