// --- App Initialization ---

// Initialize theme
initTheme();

// Restore sidebar state
if (localStorage.getItem('sidebar-collapsed') === '1') {
  document.querySelector('.layout').classList.add('sidebar-collapsed');
  document.getElementById('sidebar-toggle-icon').textContent = 'menu';
}

// Load projects, then reveal the app
loadProjects().then(() => {
  const loader = document.getElementById('app-loader');
  const shell = document.getElementById('app-shell');
  shell.style.display = '';
  loader.classList.add('fade-out');
  setTimeout(() => loader.remove(), 300);
});

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
  // Escape — close any open modal
  if (e.key === 'Escape') {
    const shortcutsModal = document.getElementById('shortcuts-modal');
    if (shortcutsModal?.classList.contains('open')) { closeShortcutsModal(); return; }
    const projectModal = document.getElementById('project-modal');
    const testModal = document.getElementById('test-modal');
    if (testModal?.classList.contains('open')) { closeTestModal(); return; }
    if (projectModal?.classList.contains('open')) { closeProjectModal(); return; }
  }

  // ? — show keyboard shortcuts help (only when not typing in an input)
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const tag = document.activeElement?.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !document.activeElement?.isContentEditable) {
      e.preventDefault();
      openShortcutsModal();
      return;
    }
  }

  // Ctrl+S / Cmd+S — save test (when test modal is open)
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    const testModal = document.getElementById('test-modal');
    if (testModal?.classList.contains('open')) {
      e.preventDefault();
      saveTest();
      return;
    }
  }

  // Ctrl+Enter / Cmd+Enter — run tests
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const runBtn = document.getElementById('run-btn');
    if (runBtn && !runBtn.disabled && currentProject) {
      e.preventDefault();
      runTests();
    }
  }

  // Ctrl+Shift+N — new suite
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
    if (currentProject) {
      e.preventDefault();
      openSuiteModal();
    }
  }

  // Ctrl+Shift+F — focus search
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
    const searchInput = document.getElementById('test-search');
    if (searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  }

  // Ctrl+Shift+D — toggle theme
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
    e.preventDefault();
    toggleTheme();
  }
});

// --- Shortcuts Modal ---
function openShortcutsModal() {
  document.getElementById('shortcuts-modal').classList.add('open');
}

function closeShortcutsModal() {
  document.getElementById('shortcuts-modal').classList.remove('open');
}
