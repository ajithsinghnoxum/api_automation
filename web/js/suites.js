// --- Context Menu ---

let activeCtxMenu = null;

function showTestContextMenu(e, suiteIdx, testIdx) {
  e.preventDefault();
  e.stopPropagation();
  dismissCtxMenu();

  const test = currentSuites[suiteIdx]?.tests?.[testIdx];
  if (!test) return;

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  const items = [
    { icon: 'play_arrow', label: 'Quick Run', action: () => { const btn = document.getElementById(`qr-btn-${suiteIdx}-${testIdx}`); if (btn) quickRunTest(suiteIdx, testIdx, btn); } },
    { icon: 'edit', label: 'Edit', action: () => editTest(suiteIdx, testIdx) },
    { icon: 'content_copy', label: 'Duplicate', action: () => duplicateTest(suiteIdx, testIdx) },
    { icon: 'terminal', label: 'Copy as cURL', action: () => copyAsCurl(suiteIdx, testIdx) },
    { sep: true },
    { icon: 'arrow_upward', label: 'Move Up', action: () => moveTest(suiteIdx, testIdx, testIdx - 1), disabled: testIdx === 0 },
    { icon: 'arrow_downward', label: 'Move Down', action: () => moveTest(suiteIdx, testIdx, testIdx + 1), disabled: testIdx >= (currentSuites[suiteIdx]?.tests?.length || 1) - 1 },
    { sep: true },
    { icon: test.skip ? 'visibility' : 'visibility_off', label: test.skip ? 'Unskip' : 'Skip', action: () => toggleTestSkip(suiteIdx, testIdx) },
    { icon: 'delete', label: 'Delete', action: () => deleteTest(suiteIdx, testIdx), danger: true },
  ];

  items.forEach(item => {
    if (item.sep) {
      const sep = document.createElement('div');
      sep.className = 'ctx-menu-sep';
      menu.appendChild(sep);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'ctx-menu-item' + (item.danger ? ' danger' : '');
    btn.innerHTML = `<span class="material-symbols-rounded">${item.icon}</span> ${item.label}`;
    if (item.disabled) { btn.disabled = true; btn.style.opacity = '0.4'; btn.style.cursor = 'default'; }
    btn.onclick = () => { dismissCtxMenu(); item.action(); };
    menu.appendChild(btn);
  });

  // Position the menu
  let x = e.clientX, y = e.clientY;
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  activeCtxMenu = menu;
}

function dismissCtxMenu() {
  if (activeCtxMenu) { activeCtxMenu.remove(); activeCtxMenu = null; }
}

document.addEventListener('click', dismissCtxMenu);
document.addEventListener('contextmenu', (e) => {
  if (activeCtxMenu && !activeCtxMenu.contains(e.target)) dismissCtxMenu();
});

async function moveTest(suiteIdx, fromIdx, toIdx) {
  if (toIdx < 0 || toIdx >= (currentSuites[suiteIdx]?.tests?.length || 0)) return;
  try {
    const suite = currentSuites[suiteIdx];
    const { fileName, ...suiteData } = suite;
    const tests = [...suiteData.tests];
    const [moved] = tests.splice(fromIdx, 1);
    tests.splice(toIdx, 0, moved);
    suiteData.tests = tests;
    await api('PUT', `/api/projects/${currentProject.id}/suites/${fileName}`, suiteData);
    await loadSuites();
    renderProjectView();
  } catch { /* error already toasted */ }
}

async function toggleTestSkip(suiteIdx, testIdx) {
  try {
    const suite = currentSuites[suiteIdx];
    const { fileName, ...suiteData } = suite;
    suiteData.tests[testIdx].skip = !suiteData.tests[testIdx].skip;
    await api('PUT', `/api/projects/${currentProject.id}/suites/${fileName}`, suiteData);
    toast(suiteData.tests[testIdx].skip ? 'Test skipped' : 'Test unskipped');
    await loadSuites();
    renderProjectView();
  } catch { /* error already toasted */ }
}

// --- Suites ---

async function loadSuites() {
  if (!currentProject) return;
  currentSuites = await api('GET', `/api/projects/${currentProject.id}/suites`);
}

function showProjectViewShimmer() {
  document.getElementById('empty-state').style.display = 'none';
  const view = document.getElementById('project-view');
  view.style.display = '';
  view.innerHTML = `
    <div class="shimmer skeleton-header"></div>
    <div class="shimmer skeleton-card"></div>
    <div class="shimmer skeleton-card"></div>`;
}

function renderProjectView() {
  document.getElementById('empty-state').style.display = 'none';
  const view = document.getElementById('project-view');
  view.style.display = '';

  let suitesHtml = '';
  if (currentSuites.length === 0) {
    suitesHtml = `
      <div class="empty-state">
        <h3>No test suites yet</h3>
        <p>Create a test suite to start adding tests.</p>
        <button class="btn btn-primary" onclick="openSuiteModal()">Create Test Suite</button>
      </div>`;
  } else {
    suitesHtml = currentSuites.map((suite, si) => {
      const testsHtml = (suite.tests || []).map((t, ti) => {
        const statusKey = suite.suite + '::' + t.method + ' ' + t.endpoint + ' - ' + t.name;
        const lastStatus = lastRunResults[statusKey];
        const statusDot = lastStatus === 'passed' ? '<span class="run-status-dot pass" title="Passed"></span>'
          : lastStatus === 'failed' ? '<span class="run-status-dot fail" title="Failed"></span>'
          : lastStatus === 'skipped' ? '<span class="run-status-dot skip" title="Skipped"></span>'
          : '';
        const skipBadge = t.skip ? '<span class="skip-badge">SKIP</span>' : '';
        const timeoutBadge = t.timeout ? '<span class="timeout-badge">' + t.timeout + 'ms</span>' : '';
        const dataSetBadge = t.dataSet?.length ? '<span class="timeout-badge">' + t.dataSet.length + 'x data</span>' : '';
        const tagBadges = (t.tags || []).map(tag => '<span class="tag-badge">' + esc(tag) + '</span>').join('');
        const timing = lastRunTimings[statusKey];
        const timingBadge = timing ? '<span class="timing-badge">' + timing + '</span>' : '';
        return `
        <div class="test-item ${lastStatus ? 'test-' + lastStatus : ''}" draggable="true" data-anim data-suite-idx="${si}" data-test-idx="${ti}" style="animation-delay:${ti * 30}ms" ondragstart="onTestDragStart(event)" ondragover="onTestDragOver(event)" ondrop="onTestDrop(event)" ondragend="onTestDragEnd(event)" oncontextmenu="showTestContextMenu(event, ${si}, ${ti})">
          <div class="test-item-header" onclick="toggleTestBody('suite${si}-test${ti}')">
            <div class="test-item-left">
              ${getBulkCheckboxHtml(si, ti)}
              <span class="drag-handle" onmousedown="event.stopPropagation()" title="Drag to reorder"><span class="material-symbols-rounded" style="font-size:16px;color:var(--text-muted);cursor:grab;">drag_indicator</span></span>
              <input type="checkbox" class="run-check test-check" data-suite="${si}" data-test="${ti}" data-test-name="${esc(t.name)}" ${t.skip ? '' : 'checked'} onclick="event.stopPropagation(); onTestCheckChange(${si})">
              ${statusDot}
              <span class="method-badge method-${t.method}">${t.method}</span>
              <span style="font-size:14px; font-weight:500;">${esc(t.name)}</span>
              <span style="font-size:12px; color:var(--text-muted); font-family:monospace;">${esc(t.endpoint)}</span>
              ${skipBadge}${timeoutBadge}${dataSetBadge}${tagBadges}${timingBadge}
            </div>
            <div style="display:flex; gap:4px;">
              <button class="icon-btn quick-run-btn" onclick="event.stopPropagation(); quickRunTest(${si}, ${ti}, this)" title="Quick Run" id="qr-btn-${si}-${ti}"><span class="material-symbols-rounded">play_arrow</span></button>
              <button class="icon-btn" onclick="event.stopPropagation(); copyAsCurl(${si}, ${ti})" title="Copy as cURL"><span class="material-symbols-rounded">terminal</span></button>
              <button class="icon-btn" onclick="event.stopPropagation(); duplicateTest(${si}, ${ti})" title="Duplicate"><span class="material-symbols-rounded">content_copy</span></button>
              <button class="icon-btn" onclick="event.stopPropagation(); editTest(${si}, ${ti})" title="Edit"><span class="material-symbols-rounded">edit</span></button>
              <button class="icon-btn danger" onclick="event.stopPropagation(); deleteTest(${si}, ${ti})" title="Delete"><span class="material-symbols-rounded">delete</span></button>
            </div>
          </div>
          <div class="test-item-body" id="suite${si}-test${ti}">
            <div style="font-size:13px;">
              <strong>Expected Status:</strong> ${t.expectedStatus}<br>
              ${t.queryParams ? '<strong>Query Params:</strong> ' + esc(JSON.stringify(t.queryParams)) + '<br>' : ''}
              ${t.headers ? '<strong>Headers:</strong> ' + esc(JSON.stringify(t.headers)) + '<br>' : ''}
              ${t.body ? '<strong>Body:</strong> <pre style="margin:4px 0;padding:8px;background:var(--bg);border-radius:6px;font-size:12px;">' + esc(JSON.stringify(t.body, null, 2)) + '</pre>' : ''}
              ${t.extract ? '<strong>Extract:</strong> <pre style="margin:4px 0;padding:8px;background:var(--bg);border-radius:6px;font-size:12px;">' + esc(JSON.stringify(t.extract, null, 2)) + '</pre>' : ''}
              ${t.validations?.length ? '<strong>Validations (' + t.validations.length + '):</strong><pre style="margin:4px 0;padding:8px;background:var(--bg);border-radius:6px;font-size:12px;">' + esc(JSON.stringify(t.validations, null, 2)) + '</pre>' : ''}
            </div>
          </div>
          <div class="quick-run-result" id="qr-result-${si}-${ti}"></div>
        </div>`}).join('');

      return `
        <div class="card suite-card" data-suite-card="${si}">
          <div class="card-header suite-header">
            <div class="suite-check-row">
              <button class="icon-btn collapse-btn" onclick="toggleSuiteCollapse(${si})" title="Collapse/Expand">
                <span class="material-symbols-rounded suite-collapse-icon" id="collapse-icon-${si}">expand_more</span>
              </button>
              ${getBulkSuiteCheckboxHtml(si)}
              <input type="checkbox" class="run-check suite-check" data-suite="${si}" checked onclick="onSuiteCheckChange(${si})">
              <h3>${esc(suite.suite)}<span class="suite-count">${suite.tests?.length || 0}</span></h3>
            </div>
            <div class="suite-actions">
              <button class="btn btn-sm" onclick="addTestToSuite(${si})"><span class="material-symbols-rounded" style="font-size:14px;">add</span> Add Test</button>
              <button class="icon-btn" onclick="openChainView(${si})" title="Chain View"><span class="material-symbols-rounded">account_tree</span></button>
              <button class="icon-btn" onclick="exportSuite(${si})" title="Export Suite"><span class="material-symbols-rounded">download</span></button>
              <button class="icon-btn" onclick="cloneSuite(${si})" title="Clone Suite"><span class="material-symbols-rounded">content_copy</span></button>
              <button class="icon-btn danger" onclick="deleteSuite(${si})" title="Delete Suite"><span class="material-symbols-rounded">delete</span></button>
            </div>
          </div>
          <div class="card-body suite-body" id="suite-body-${si}" style="padding:8px 12px;">
            ${testsHtml || '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">No tests in this suite. Click "Add Test" to create one.</div>'}
          </div>
        </div>`;
    }).join('');
  }

  const totalTests = currentSuites.reduce((sum, s) => sum + (s.tests?.length || 0), 0);

  // Collect all unique tags
  const allTags = new Set();
  currentSuites.forEach(s => (s.tests || []).forEach(t => (t.tags || []).forEach(tag => allTags.add(tag))));
  const tagFilterHtml = allTags.size > 0 ? `
    <div class="tag-filter-bar" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px 0;">
      <span style="font-size:12px;color:var(--text-muted);font-weight:500;">Filter:</span>
      ${Array.from(allTags).map(tag => `<button class="tag-chip" onclick="toggleTagFilter('${esc(tag)}')" data-tag="${esc(tag)}">${esc(tag)}</button>`).join('')}
      <button class="tag-chip tag-chip-clear" onclick="clearTagFilter()" style="display:none;" id="clear-tag-filter">Clear</button>
    </div>` : '';

  const envOptions = (currentProject.environments || []);
  const envSelector = envOptions.length > 0 ? `
    <select id="env-selector" onchange="selectedEnvironment=this.value" style="font-size:13px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface-input);color:var(--text-primary);">
      <option value="">Default Environment</option>
      ${envOptions.map(e => `<option value="${esc(e.name)}" ${selectedEnvironment === e.name ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
    </select>` : '';

  view.innerHTML = `
    <div class="project-toolbar">
      <div class="project-toolbar-top">
        <h2 class="project-title">${esc(currentProject.name)}</h2>
        <button class="btn btn-primary run-btn-main" id="run-btn" onclick="runTests()"><span class="material-symbols-rounded" style="font-size:18px;">play_arrow</span>Run <span id="run-count">${totalTests}</span> Test${totalTests !== 1 ? 's' : ''}</button>
      </div>
      <div class="project-toolbar-actions">
        ${envSelector}
        <div class="toolbar-group">
          <button class="toolbar-btn" onclick="openSuiteModal()" title="New Suite"><span class="material-symbols-rounded">add</span><span>New Suite</span></button>
          <button class="toolbar-btn highlight" onclick="openTemplateModal()" title="From Template"><span class="material-symbols-rounded">auto_fix_high</span><span>Template</span></button>
          <button class="toolbar-btn" onclick="triggerImportSuite()" title="Import Suite"><span class="material-symbols-rounded">upload</span><span>Import</span></button>
          <button class="toolbar-btn" onclick="exportProject()" title="Export"><span class="material-symbols-rounded">download</span><span>Export</span></button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button class="toolbar-btn" onclick="showRunHistory()" title="History"><span class="material-symbols-rounded">history</span><span>History</span></button>
          <button class="toolbar-btn" onclick="showSchedules()" title="Schedules"><span class="material-symbols-rounded">schedule</span><span>Schedules</span></button>
          <button class="toolbar-btn ${bulkMode ? 'active' : ''}" onclick="toggleBulkMode()" title="Bulk Edit"><span class="material-symbols-rounded">checklist</span><span>Bulk</span></button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button class="toolbar-btn" onclick="showHealthDashboard()" title="API Health"><span class="material-symbols-rounded">monitor_heart</span><span>Health</span></button>
          <button class="toolbar-btn" onclick="showCoverageHeatmap()" title="Coverage"><span class="material-symbols-rounded">grid_view</span><span>Coverage</span></button>
          <button class="toolbar-btn" onclick="showEndpointMap()" title="Endpoint Map"><span class="material-symbols-rounded">hub</span><span>Map</span></button>
          <button class="toolbar-btn" onclick="showResponseRace()" title="Response Race"><span class="material-symbols-rounded">sprint</span><span>Race</span></button>
          <button class="toolbar-btn" onclick="showTestSuggestions()" title="Suggestions"><span class="material-symbols-rounded">lightbulb</span><span>Suggest</span></button>
          <button class="toolbar-btn" onclick="showChaosMode()" title="Chaos Mode"><span class="material-symbols-rounded">electric_bolt</span><span>Chaos</span></button>
        </div>
      </div>
    </div>
    ${getBulkToolbarHtml()}
    ${tagFilterHtml}
    ${totalTests > 0 ? `<div class="search-filter-bar">
      <div class="search-box">
        <span class="material-symbols-rounded" style="font-size:16px;color:var(--text-muted);">search</span>
        <input type="text" id="test-search" placeholder="Search tests by name or endpoint..." oninput="applyTestSearch()" value="${searchQuery || ''}">
        ${searchQuery ? '<button class="search-clear" onclick="clearTestSearch()"><span class="material-symbols-rounded" style="font-size:14px;">close</span></button>' : ''}
      </div>
    </div>
    <div class="run-selection-bar">
      <span id="selection-info">${totalTests} of ${totalTests} selected</span>
      &middot;
      <a onclick="selectAllTests(true)">Select All</a>
      &middot;
      <a onclick="selectAllTests(false)">Deselect All</a>
      ${Object.values(lastRunResults).includes('failed') ? '&middot; <a onclick="selectFailedTests()" style="color:var(--fail);">Select Failed</a>' : ''}
    </div>` : ''}
    ${suitesHtml}
    <div id="run-result"></div>`;
}

function toggleTestBody(id) {
  document.getElementById(id)?.classList.toggle('open');
}

// --- Suite CRUD ---

function openSuiteModal() {
  const name = prompt('Enter test suite name:');
  if (!name) return;
  createSuite(name);
}

async function createSuite(name) {
  try {
    const fileName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
    await api('POST', `/api/projects/${currentProject.id}/suites`, {
      fileName,
      suite: name,
      tests: []
    });
    toast('Suite created');
    await loadSuites();
    renderProjectView();
  } catch { /* error already toasted by api() */ }
}

async function deleteSuite(suiteIdx) {
  if (!confirm('Delete this test suite?')) return;
  try {
    const suite = currentSuites[suiteIdx];
    await api('DELETE', `/api/projects/${currentProject.id}/suites/${suite.fileName}`);
    toast('Suite deleted');
    await loadSuites();
    renderProjectView();
  } catch { /* error already toasted by api() */ }
}

async function cloneSuite(suiteIdx) {
  try {
    const suite = currentSuites[suiteIdx];
    const { fileName, ...suiteData } = suite;
    const cloned = JSON.parse(JSON.stringify(suiteData));
    cloned.suite = cloned.suite + ' (copy)';
    const newFileName = cloned.suite.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
    await api('POST', `/api/projects/${currentProject.id}/suites`, { fileName: newFileName, ...cloned });
    toast('Suite cloned');
    await loadSuites();
    renderProjectView();
  } catch { /* error already toasted by api() */ }
}

// --- Tag Filtering ---

function toggleTagFilter(tag) {
  if (activeTagFilters.has(tag)) {
    activeTagFilters.delete(tag);
  } else {
    activeTagFilters.add(tag);
  }
  applyTagFilter();
}

function clearTagFilter() {
  activeTagFilters.clear();
  applyTagFilter();
}

function applyTagFilter() {
  document.querySelectorAll('.tag-chip[data-tag]').forEach(chip => {
    chip.classList.toggle('active', activeTagFilters.has(chip.dataset.tag));
  });
  const clearBtn = document.getElementById('clear-tag-filter');
  if (clearBtn) clearBtn.style.display = activeTagFilters.size > 0 ? '' : 'none';
  applyFilters();
}

// --- Search ---

function applyTestSearch() {
  const input = document.getElementById('test-search');
  searchQuery = (input?.value || '').trim().toLowerCase();
  applyFilters();
}

function clearTestSearch() {
  searchQuery = '';
  const input = document.getElementById('test-search');
  if (input) input.value = '';
  applyFilters();
}

// --- Combined filter logic (tags + search) ---

function applyFilters() {
  document.querySelectorAll('.test-item[data-suite-idx]').forEach(item => {
    const si = parseInt(item.dataset.suiteIdx);
    const ti = parseInt(item.dataset.testIdx);
    const test = currentSuites[si]?.tests?.[ti];
    if (!test) return;

    let visible = true;

    // Tag filter
    if (activeTagFilters.size > 0) {
      const testTags = test.tags || [];
      if (!testTags.some(t => activeTagFilters.has(t))) visible = false;
    }

    // Search filter
    if (visible && searchQuery) {
      const haystack = (test.name + ' ' + test.endpoint + ' ' + test.method).toLowerCase();
      if (!haystack.includes(searchQuery)) visible = false;
    }

    item.style.display = visible ? '' : 'none';
    const cb = item.querySelector('.test-check');
    if (cb) cb.checked = visible;
  });

  // Hide empty suites when filtering
  document.querySelectorAll('.card').forEach(card => {
    const items = card.querySelectorAll('.test-item[data-suite-idx]');
    if (items.length === 0) return;
    const anyVisible = Array.from(items).some(i => i.style.display !== 'none');
    card.style.display = (activeTagFilters.size > 0 || searchQuery) && !anyVisible ? 'none' : '';
  });

  updateSelectionInfo();
}

// --- Select Failed Tests ---

function selectFailedTests() {
  document.querySelectorAll('.test-item[data-suite-idx]').forEach(item => {
    const si = parseInt(item.dataset.suiteIdx);
    const ti = parseInt(item.dataset.testIdx);
    const test = currentSuites[si]?.tests?.[ti];
    if (!test) return;
    const suite = currentSuites[si];
    const statusKey = suite.suite + '::' + test.method + ' ' + test.endpoint + ' - ' + test.name;
    const isFailed = lastRunResults[statusKey] === 'failed';
    item.style.display = isFailed ? '' : 'none';
    const cb = item.querySelector('.test-check');
    if (cb) cb.checked = isFailed;
  });
  updateSelectionInfo();
}

// --- Collapsible Suites ---

function toggleSuiteCollapse(si) {
  const body = document.getElementById(`suite-body-${si}`);
  const icon = document.getElementById(`collapse-icon-${si}`);
  if (!body) return;
  body.classList.toggle('collapsed');
  icon.textContent = body.classList.contains('collapsed') ? 'chevron_right' : 'expand_more';
}

function collapseAllSuites(collapse) {
  currentSuites.forEach((_, si) => {
    const body = document.getElementById(`suite-body-${si}`);
    const icon = document.getElementById(`collapse-icon-${si}`);
    if (!body) return;
    if (collapse) {
      body.classList.add('collapsed');
      icon.textContent = 'chevron_right';
    } else {
      body.classList.remove('collapsed');
      icon.textContent = 'expand_more';
    }
  });
}

// --- Copy as cURL ---

// --- Quick Single-Test Run ---

async function quickRunTest(suiteIdx, testIdx, btn) {
  const test = currentSuites[suiteIdx]?.tests?.[testIdx];
  if (!test || !currentProject) return;

  const resultEl = document.getElementById(`qr-result-${suiteIdx}-${testIdx}`);
  if (!resultEl) return;

  // Toggle off if already showing results — clicking play again hides them
  if (resultEl.classList.contains('open') && !resultEl.classList.contains('qr-loading')) {
    resultEl.classList.remove('open');
    resultEl.innerHTML = '';
    return;
  }

  // Show loading state
  btn.disabled = true;
  btn.querySelector('span').textContent = 'progress_activity';
  btn.querySelector('span').classList.add('spin');
  resultEl.innerHTML = '<div class="qr-loading-bar"><span class="material-symbols-rounded spin" style="font-size:16px;">progress_activity</span> Running test...</div>';
  resultEl.classList.add('open', 'qr-loading');

  try {
    const envParam = selectedEnvironment ? `?env=${encodeURIComponent(selectedEnvironment)}` : '';
    const result = await api('POST', `/api/projects/${currentProject.id}/quick-run${envParam}`, test);

    resultEl.classList.remove('qr-loading');

    if (result.error) {
      resultEl.innerHTML = `
        <div class="qr-summary qr-fail">
          <span class="material-symbols-rounded">error</span>
          <span class="qr-status-text">Error</span>
          <span class="qr-duration">${result.duration}ms</span>
          <button class="icon-btn qr-close" onclick="closeQuickRunResult(${suiteIdx}, ${testIdx})"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="qr-detail"><span class="qr-error-msg">${esc(result.error)}</span></div>`;
      return;
    }

    // Store response data for visualizer
    if (typeof result.data === 'object' && result.data !== null) {
      window['_lastQrData_' + suiteIdx + '_' + testIdx] = result.data;
    }

    const passedCount = (result.validations || []).filter(v => v.status === 'passed').length;
    const failedCount = (result.validations || []).filter(v => v.status === 'failed').length;
    const totalValidations = (result.validations || []).length;

    const validationRows = (result.validations || []).map(v => `
      <div class="qr-validation ${v.status}">
        <span class="material-symbols-rounded" style="font-size:14px;">${v.status === 'passed' ? 'check_circle' : 'cancel'}</span>
        <span class="qr-val-msg">${esc(v.message)}</span>
        ${v.status === 'failed' && v.actual !== undefined ? '<span class="qr-val-actual">got: ' + esc(JSON.stringify(v.actual)) + '</span>' : ''}
      </div>`).join('');

    resultEl.innerHTML = `
      <div class="qr-summary ${result.passed ? 'qr-pass' : 'qr-fail'}">
        <span class="material-symbols-rounded">${result.passed ? 'check_circle' : 'cancel'}</span>
        <span class="qr-status-text">${result.passed ? 'PASSED' : 'FAILED'}</span>
        <span class="qr-http-status ${result.statusPassed ? '' : 'qr-status-mismatch'}">HTTP ${result.status}${!result.statusPassed ? ' (expected ' + result.expectedStatus + ')' : ''}</span>
        <span class="qr-duration">${result.duration}ms</span>
        ${totalValidations > 0 ? '<span class="qr-val-count">' + passedCount + '/' + totalValidations + ' validations</span>' : ''}
        <button class="icon-btn qr-close" onclick="closeQuickRunResult(${suiteIdx}, ${testIdx})"><span class="material-symbols-rounded">close</span></button>
      </div>
      ${validationRows ? '<div class="qr-validations">' + validationRows + '</div>' : ''}
      <details class="qr-response-details">
        <summary style="cursor:pointer;font-size:12px;color:var(--text-muted);padding:6px 10px;">
          Response Body
          ${typeof result.data === 'object' && result.data !== null ? '<button class="btn btn-sm" onclick="event.stopPropagation(); openResponseViz(window._lastQrData_' + suiteIdx + '_' + testIdx + ')" style="font-size:10px;padding:1px 6px;margin-left:8px;"><span class=&quot;material-symbols-rounded&quot; style=&quot;font-size:13px;vertical-align:-2px;margin-right:2px;&quot;>account_tree</span>Explore</button>' : ''}
        </summary>
        <pre class="qr-response-body">${esc(typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2))}</pre>
      </details>`;

    // Update the status dot on the test card
    const testItem = btn.closest('.test-item');
    if (testItem) {
      testItem.classList.remove('test-passed', 'test-failed');
      testItem.classList.add(result.passed ? 'test-passed' : 'test-failed');
    }

  } catch (err) {
    resultEl.classList.remove('qr-loading');
    resultEl.innerHTML = `
      <div class="qr-summary qr-fail">
        <span class="material-symbols-rounded">error</span>
        <span class="qr-status-text">Error</span>
        <button class="icon-btn qr-close" onclick="closeQuickRunResult(${suiteIdx}, ${testIdx})"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div class="qr-detail"><span class="qr-error-msg">${esc(err.message || 'Unknown error')}</span></div>`;
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'play_arrow';
    btn.querySelector('span').classList.remove('spin');
  }
}

function closeQuickRunResult(suiteIdx, testIdx) {
  const el = document.getElementById(`qr-result-${suiteIdx}-${testIdx}`);
  if (el) {
    el.classList.remove('open');
    el.innerHTML = '';
  }
}

// --- Copy as cURL ---

function copyAsCurl(suiteIdx, testIdx) {
  const test = currentSuites[suiteIdx]?.tests?.[testIdx];
  if (!test || !currentProject) return;

  const baseUrl = currentProject.baseUrl.replace(/\/?$/, '/');
  const url = baseUrl + test.endpoint;

  let curl = `curl -X ${test.method}`;

  // Headers
  curl += ` \\\n  -H "Content-Type: application/json"`;
  curl += ` \\\n  -H "Accept: application/json"`;

  // Per-test headers
  if (test.headers) {
    for (const [k, v] of Object.entries(test.headers)) {
      curl += ` \\\n  -H "${k}: ${v}"`;
    }
  }

  if (currentProject.authType === 'bearer' && currentProject.credentials?.token) {
    curl += ` \\\n  -H "Authorization: Bearer ${currentProject.credentials.token}"`;
  } else if (currentProject.authType === 'api-key' && currentProject.credentials?.apiKey) {
    const header = currentProject.credentials.apiKeyHeader || 'X-API-Key';
    curl += ` \\\n  -H "${header}: ${currentProject.credentials.apiKey}"`;
  }

  // Body
  if (test.body && ['POST', 'PUT', 'PATCH'].includes(test.method)) {
    curl += ` \\\n  -d '${JSON.stringify(test.body)}'`;
  }

  // Query params
  let fullUrl = url;
  if (test.queryParams && Object.keys(test.queryParams).length > 0) {
    const params = new URLSearchParams(test.queryParams).toString();
    fullUrl += '?' + params;
  }

  curl += ` \\\n  "${fullUrl}"`;

  navigator.clipboard.writeText(curl).then(() => {
    toast('cURL copied to clipboard');
  }).catch(() => {
    // Fallback
    prompt('Copy cURL command:', curl);
  });
}
