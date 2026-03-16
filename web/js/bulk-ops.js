// --- Bulk Test Operations ---

let bulkMode = false;
let bulkSelected = []; // Array of { suiteIdx, testIdx }

function toggleBulkMode() {
  bulkMode = !bulkMode;
  bulkSelected = [];
  renderProjectView();
}

function isBulkSelected(si, ti) {
  return bulkSelected.some(s => s.suiteIdx === si && s.testIdx === ti);
}

function toggleBulkSelect(si, ti, event) {
  if (event) event.stopPropagation();
  const idx = bulkSelected.findIndex(s => s.suiteIdx === si && s.testIdx === ti);
  if (idx >= 0) {
    bulkSelected.splice(idx, 1);
  } else {
    bulkSelected.push({ suiteIdx: si, testIdx: ti });
  }
  updateBulkUI();
}

function bulkSelectAllInSuite(si, event) {
  if (event) event.stopPropagation();
  const suite = currentSuites[si];
  if (!suite) return;
  const allSelected = (suite.tests || []).every((_, ti) => isBulkSelected(si, ti));
  if (allSelected) {
    // Deselect all in this suite
    bulkSelected = bulkSelected.filter(s => s.suiteIdx !== si);
  } else {
    // Select all in this suite
    (suite.tests || []).forEach((_, ti) => {
      if (!isBulkSelected(si, ti)) {
        bulkSelected.push({ suiteIdx: si, testIdx: ti });
      }
    });
  }
  updateBulkUI();
}

function bulkSelectAll() {
  bulkSelected = [];
  currentSuites.forEach((suite, si) => {
    (suite.tests || []).forEach((_, ti) => {
      bulkSelected.push({ suiteIdx: si, testIdx: ti });
    });
  });
  updateBulkUI();
}

function bulkDeselectAll() {
  bulkSelected = [];
  updateBulkUI();
}

function updateBulkUI() {
  // Update checkboxes
  document.querySelectorAll('.bulk-check').forEach(cb => {
    const si = parseInt(cb.dataset.suite);
    const ti = parseInt(cb.dataset.test);
    cb.checked = isBulkSelected(si, ti);
  });

  // Update suite-level checkboxes
  document.querySelectorAll('.bulk-suite-check').forEach(cb => {
    const si = parseInt(cb.dataset.suite);
    const suite = currentSuites[si];
    if (suite) {
      const allSelected = (suite.tests || []).length > 0 && (suite.tests || []).every((_, ti) => isBulkSelected(si, ti));
      const someSelected = (suite.tests || []).some((_, ti) => isBulkSelected(si, ti));
      cb.checked = allSelected;
      cb.indeterminate = someSelected && !allSelected;
    }
  });

  // Update toolbar count
  const countEl = document.getElementById('bulk-count');
  if (countEl) countEl.textContent = bulkSelected.length;

  // Show/hide toolbar
  const toolbar = document.getElementById('bulk-toolbar');
  if (toolbar) toolbar.style.display = bulkSelected.length > 0 ? 'flex' : 'none';
}

// --- Bulk Actions ---

async function bulkAddTags() {
  const input = prompt('Enter tags to add (comma-separated):');
  if (!input) return;
  const newTags = input.split(',').map(t => t.trim()).filter(Boolean);
  if (!newTags.length) return;

  await applyBulkUpdate((test) => {
    if (!test.tags) test.tags = [];
    newTags.forEach(tag => {
      if (!test.tags.includes(tag)) test.tags.push(tag);
    });
  });
  toast(`Added tags: ${newTags.join(', ')}`);
}

async function bulkRemoveTags() {
  // Collect all tags from selected tests
  const allTags = new Set();
  bulkSelected.forEach(({ suiteIdx, testIdx }) => {
    const test = currentSuites[suiteIdx]?.tests?.[testIdx];
    if (test?.tags) test.tags.forEach(t => allTags.add(t));
  });

  if (allTags.size === 0) return toast('Selected tests have no tags', 'error');

  const input = prompt(`Tags found: ${[...allTags].join(', ')}\n\nEnter tags to remove (comma-separated, or * for all):`);
  if (!input) return;

  const removeAll = input.trim() === '*';
  const removeTags = removeAll ? [] : input.split(',').map(t => t.trim()).filter(Boolean);

  await applyBulkUpdate((test) => {
    if (removeAll) {
      delete test.tags;
    } else if (test.tags) {
      test.tags = test.tags.filter(t => !removeTags.includes(t));
      if (test.tags.length === 0) delete test.tags;
    }
  });
  toast(removeAll ? 'Removed all tags' : `Removed tags: ${removeTags.join(', ')}`);
}

async function bulkSkip() {
  const reason = prompt('Skip reason (leave empty for no reason, cancel to abort):');
  if (reason === null) return;

  await applyBulkUpdate((test) => {
    test.skip = reason || true;
  });
  toast(`Skipped ${bulkSelected.length} tests`);
}

async function bulkUnskip() {
  await applyBulkUpdate((test) => {
    delete test.skip;
  });
  toast(`Unskipped ${bulkSelected.length} tests`);
}

async function bulkUpdateStatus() {
  const status = prompt('Enter expected status code (e.g. 200, 201, 404):');
  if (!status) return;
  const code = parseInt(status);
  if (isNaN(code) || code < 100 || code > 599) return toast('Invalid status code', 'error');

  await applyBulkUpdate((test) => {
    test.expectedStatus = code;
  });
  toast(`Updated expected status to ${code}`);
}

async function bulkUpdateTimeout() {
  const input = prompt('Enter timeout in ms (e.g. 30000, or 0 to remove):');
  if (!input && input !== '0') return;
  const ms = parseInt(input);
  if (isNaN(ms) || ms < 0) return toast('Invalid timeout', 'error');

  await applyBulkUpdate((test) => {
    if (ms === 0) {
      delete test.timeout;
    } else {
      test.timeout = ms;
    }
  });
  toast(ms === 0 ? 'Removed timeout override' : `Set timeout to ${ms}ms`);
}

async function bulkUpdateMethod() {
  const method = prompt('Enter HTTP method (GET, POST, PUT, PATCH, DELETE):');
  if (!method) return;
  const m = method.toUpperCase().trim();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(m)) {
    return toast('Invalid HTTP method', 'error');
  }

  await applyBulkUpdate((test) => {
    test.method = m;
  });
  toast(`Updated method to ${m}`);
}

async function bulkFindReplace() {
  const find = prompt('Find text in endpoints:');
  if (!find) return;
  const replace = prompt(`Replace "${find}" with:`);
  if (replace === null) return;

  let count = 0;
  await applyBulkUpdate((test) => {
    if (test.endpoint && test.endpoint.includes(find)) {
      test.endpoint = test.endpoint.split(find).join(replace);
      count++;
    }
  });
  toast(`Replaced in ${count} endpoint(s)`);
}

async function bulkAutoGenerate() {
  if (!confirm(`Auto-generate validations for ${bulkSelected.length} selected tests?\n\nThis will send real API requests and replace existing validations.`)) return;

  const includeValues = confirm('Include value checks (equals for every response value)?');
  let success = 0;
  let failed = 0;

  const btn = document.getElementById('bulk-autogen-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-rounded spin" style="font-size:14px;vertical-align:-3px;">progress_activity</span> Generating...';
  }

  // Group by suite for batch saving
  const suiteUpdates = new Map();

  for (const { suiteIdx, testIdx } of bulkSelected) {
    const suite = currentSuites[suiteIdx];
    const test = suite?.tests?.[testIdx];
    if (!test) { failed++; continue; }

    try {
      const result = await api('POST', `/api/projects/${currentProject.id}/try-request`, {
        method: test.method,
        endpoint: test.endpoint,
        queryParams: test.queryParams,
        body: test.body,
        headers: test.headers,
        includeValues
      });

      test.expectedStatus = result.status;
      test.validations = result.validations;
      if (!suiteUpdates.has(suiteIdx)) suiteUpdates.set(suiteIdx, true);
      success++;
    } catch {
      failed++;
    }
  }

  // Save all modified suites
  for (const suiteIdx of suiteUpdates.keys()) {
    const suite = currentSuites[suiteIdx];
    const { fileName, ...suiteData } = suite;
    try {
      await api('PUT', `/api/projects/${currentProject.id}/suites/${fileName}`, suiteData);
    } catch { /* ignore */ }
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;vertical-align:-3px;">auto_fix_high</span> Auto-Generate';
  }

  await loadSuites();
  renderProjectView();
  toast(`Auto-generated: ${success} succeeded, ${failed} failed`);
}

async function bulkDelete() {
  if (!confirm(`Delete ${bulkSelected.length} selected tests? This cannot be undone.`)) return;

  // Group by suite, sort test indices descending so splicing doesn't shift indices
  const bySuite = new Map();
  bulkSelected.forEach(({ suiteIdx, testIdx }) => {
    if (!bySuite.has(suiteIdx)) bySuite.set(suiteIdx, []);
    bySuite.get(suiteIdx).push(testIdx);
  });

  for (const [suiteIdx, testIndices] of bySuite.entries()) {
    const suite = currentSuites[suiteIdx];
    const { fileName, ...suiteData } = suite;
    // Remove from highest index first
    testIndices.sort((a, b) => b - a).forEach(ti => {
      suiteData.tests.splice(ti, 1);
    });
    try {
      await api('PUT', `/api/projects/${currentProject.id}/suites/${fileName}`, suiteData);
    } catch { /* ignore */ }
  }

  bulkSelected = [];
  await loadSuites();
  renderProjectView();
  toast('Tests deleted');
}

// --- Helper: Apply update function to all selected tests and save ---

async function applyBulkUpdate(updateFn) {
  const suiteUpdates = new Set();

  bulkSelected.forEach(({ suiteIdx, testIdx }) => {
    const test = currentSuites[suiteIdx]?.tests?.[testIdx];
    if (test) {
      updateFn(test);
      suiteUpdates.add(suiteIdx);
    }
  });

  for (const suiteIdx of suiteUpdates) {
    const suite = currentSuites[suiteIdx];
    const { fileName, ...suiteData } = suite;
    try {
      await api('PUT', `/api/projects/${currentProject.id}/suites/${fileName}`, suiteData);
    } catch { /* ignore */ }
  }

  await loadSuites();
  renderProjectView();
  if (typeof unlockAchievement === 'function') unlockAchievement('bulk_master');
}

// --- Render Helpers ---

function getBulkCheckboxHtml(si, ti) {
  if (!bulkMode) return '';
  return `<input type="checkbox" class="bulk-check" data-suite="${si}" data-test="${ti}" ${isBulkSelected(si, ti) ? 'checked' : ''} onclick="toggleBulkSelect(${si}, ${ti}, event)">`;
}

function getBulkSuiteCheckboxHtml(si) {
  if (!bulkMode) return '';
  const suite = currentSuites[si];
  const allSelected = (suite.tests || []).length > 0 && (suite.tests || []).every((_, ti) => isBulkSelected(si, ti));
  return `<input type="checkbox" class="bulk-suite-check" data-suite="${si}" ${allSelected ? 'checked' : ''} onclick="bulkSelectAllInSuite(${si}, event)">`;
}

function getBulkToolbarHtml() {
  if (!bulkMode) return '';
  return `
    <div id="bulk-toolbar" class="bulk-toolbar" style="display:${bulkSelected.length > 0 ? 'flex' : 'none'};">
      <span class="bulk-toolbar-label"><span id="bulk-count">${bulkSelected.length}</span> tests selected</span>
      <div class="bulk-toolbar-actions">
        <button class="btn btn-sm" onclick="bulkAddTags()" title="Add tags"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">label</span> Add Tags</button>
        <button class="btn btn-sm" onclick="bulkRemoveTags()" title="Remove tags"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">label_off</span> Remove Tags</button>
        <button class="btn btn-sm" onclick="bulkSkip()" title="Skip tests"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">skip_next</span> Skip</button>
        <button class="btn btn-sm" onclick="bulkUnskip()" title="Unskip tests"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">play_arrow</span> Unskip</button>
        <div class="bulk-divider"></div>
        <button class="btn btn-sm" onclick="bulkUpdateStatus()" title="Update expected status"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">pin</span> Status</button>
        <button class="btn btn-sm" onclick="bulkUpdateTimeout()" title="Set timeout"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">timer</span> Timeout</button>
        <button class="btn btn-sm" onclick="bulkUpdateMethod()" title="Change HTTP method"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">swap_horiz</span> Method</button>
        <button class="btn btn-sm" onclick="bulkFindReplace()" title="Find & replace in endpoints"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">find_replace</span> Find/Replace</button>
        <div class="bulk-divider"></div>
        <button class="btn btn-sm btn-accent" id="bulk-autogen-btn" onclick="bulkAutoGenerate()" title="Auto-generate validations"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">auto_fix_high</span> Auto-Generate</button>
        <button class="btn btn-sm btn-danger" onclick="bulkDelete()" title="Delete selected tests"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">delete</span> Delete</button>
      </div>
      <div class="bulk-toolbar-select">
        <a onclick="bulkSelectAll()">Select All</a> &middot; <a onclick="bulkDeselectAll()">Deselect All</a>
      </div>
    </div>`;
}
