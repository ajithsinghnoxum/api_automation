// --- Application State ---

let projects = [];
let currentProject = null;
let currentSuites = [];
let lastRunResults = {};  // { "suiteName::testTitle": "passed"|"failed"|"skipped" }
let lastRunTimings = {};  // { "suiteName::testTitle": "1.5s" }
let editingProjectId = null;
let editingSuiteFile = null;
let editingTestIdx = null;
let currentEditorMode = 'visual';
let selectedEnvironment = '';  // empty = default/no environment override
let activeTagFilters = new Set();  // active tag filters
let searchQuery = '';  // test search query

// --- Theme ---

function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
  if (typeof applyCMTheme === 'function') applyCMTheme();
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle');
  btn.innerHTML = `<span class="material-symbols-rounded icon-filled" style="font-size:20px;">${theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>`;
  btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

// --- Breadcrumb ---

function updateBreadcrumb() {
  const bar = document.getElementById('breadcrumb-bar');
  const bcProject = document.getElementById('bc-project');
  const bcProjectSep = document.getElementById('bc-project-sep');
  const bcSuite = document.getElementById('bc-suite');
  const bcSuiteSep = document.getElementById('bc-suite-sep');
  const bcTest = document.getElementById('bc-test');
  const bcTestSep = document.getElementById('bc-test-sep');

  if (!currentProject) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = '';
  bcProjectSep.style.display = '';
  bcProject.style.display = '';
  bcProject.textContent = currentProject.name;

  // If editing a test, show suite > test
  if (editingSuiteFile !== null && editingTestIdx !== null) {
    const suite = currentSuites.find(s => s.fileName === editingSuiteFile);
    const test = suite?.tests?.[editingTestIdx];
    bcProject.classList.remove('breadcrumb-current');
    bcProject.onclick = () => { closeTestModal(); };
    bcSuiteSep.style.display = '';
    bcSuite.style.display = '';
    bcSuite.textContent = suite?.suite || editingSuiteFile;
    bcSuite.onclick = () => { closeTestModal(); };
    if (test) {
      bcTestSep.style.display = '';
      bcTest.style.display = '';
      bcTest.textContent = test.name || 'Untitled Test';
    } else {
      bcTestSep.style.display = 'none';
      bcTest.style.display = 'none';
    }
  } else {
    bcProject.classList.add('breadcrumb-current');
    bcProject.onclick = null;
    bcSuiteSep.style.display = 'none';
    bcSuite.style.display = 'none';
    bcTestSep.style.display = 'none';
    bcTest.style.display = 'none';
  }
}

function deselectProject() {
  currentProject = null;
  currentSuites = [];
  renderProjectList();
  document.getElementById('project-view').style.display = 'none';
  document.getElementById('empty-state').style.display = '';
  updateBreadcrumb();
}

// --- Sidebar Toggle ---

function toggleSidebar() {
  const layout = document.querySelector('.layout');
  const icon = document.getElementById('sidebar-toggle-icon');
  layout.classList.toggle('sidebar-collapsed');
  const collapsed = layout.classList.contains('sidebar-collapsed');
  icon.textContent = collapsed ? 'menu' : 'menu_open';
  localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '');
  if (collapsed) {
    document.getElementById('sidebar').style.width = '';
  } else {
    const savedWidth = localStorage.getItem('sidebar-width');
    if (savedWidth) document.getElementById('sidebar').style.width = savedWidth + 'px';
  }
}

// --- Sidebar Resize ---

function initSidebarResize() {
  const handle = document.getElementById('sidebar-resize-handle');
  const sidebar = document.getElementById('sidebar');
  if (!handle || !sidebar) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', (e) => {
    if (document.querySelector('.layout').classList.contains('sidebar-collapsed')) return;
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const diff = e.clientX - startX;
    const newWidth = Math.min(Math.max(startWidth + diff, 180), 500);
    sidebar.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    handle.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('sidebar-width', sidebar.offsetWidth);
  });

  // Restore saved width
  const savedWidth = localStorage.getItem('sidebar-width');
  if (savedWidth && !document.querySelector('.layout').classList.contains('sidebar-collapsed')) {
    sidebar.style.width = savedWidth + 'px';
  }
}
