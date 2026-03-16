// --- Key-Value Pair Editor ---

function addKvRow(containerId, key, value) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'kv-row';
  row.innerHTML = `
    <input data-kv-key placeholder="key" class="kv-key">
    <span class="kv-sep">=</span>
    <input data-kv-value placeholder="value" class="kv-value">
    <button class="validation-remove" onclick="this.parentElement.remove()"><span class="material-symbols-rounded">close</span></button>
  `;
  container.appendChild(row);
  if (key !== undefined) row.querySelector('[data-kv-key]').value = key;
  if (value !== undefined) row.querySelector('[data-kv-value]').value = String(value);
}

function collectKvRows(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return {};
  const result = {};
  container.querySelectorAll('.kv-row').forEach(row => {
    const k = row.querySelector('[data-kv-key]')?.value.trim();
    const v = row.querySelector('[data-kv-value]')?.value || '';
    if (k) result[k] = v;
  });
  return result;
}

// --- Variable Autocomplete ---

let lastTryResponseData = null;
let activeAutocomplete = null;

const BUILTIN_VARS = [
  { name: '$timestamp', desc: 'Unix timestamp' },
  { name: '$isoDate', desc: 'ISO 8601 date' },
  { name: '$guid', desc: 'UUID v4' },
  { name: '$uuid', desc: 'UUID v4' },
  { name: '$randomInt', desc: 'Random 1–100000' },
  { name: '$randomEmail', desc: 'Random email' },
  { name: '$randomString', desc: '12-char random string' },
  { name: '$increment', desc: 'Auto-increment (1, 2, 3...)' },
  { name: '$sequence', desc: 'Sequence counter per suite' },
  { name: '$randomName', desc: 'Random name + number' },
];

function getAvailableVars() {
  const vars = [...BUILTIN_VARS];
  // Add extracted vars from earlier tests in the same suite
  if (editingSuiteFile) {
    const suite = currentSuites.find(s => s.fileName === editingSuiteFile);
    if (suite) {
      const maxIdx = editingTestIdx !== null ? editingTestIdx : suite.tests.length;
      for (let i = 0; i < maxIdx; i++) {
        const t = suite.tests[i];
        if (t.extract) {
          for (const varName of Object.keys(t.extract)) {
            vars.push({ name: varName, desc: `from "${t.name}" → ${t.extract[varName]}` });
          }
        }
      }
    }
  }
  return vars;
}

function setupVarAutocomplete(input) {
  if (!input || input.dataset.varAc) return;
  input.dataset.varAc = '1';
  input.addEventListener('input', onVarInput);
  input.addEventListener('keydown', onVarKeydown);
  input.addEventListener('blur', () => setTimeout(dismissAutocomplete, 150));
}

function onVarInput(e) {
  const input = e.target;
  const val = input.value;
  const pos = input.selectionStart;
  // Find {{ before cursor
  const before = val.substring(0, pos);
  const match = before.match(/\{\{([^}]*)$/);
  if (!match) { dismissAutocomplete(); return; }
  const query = match[1].toLowerCase();
  const vars = getAvailableVars().filter(v => v.name.toLowerCase().includes(query));
  if (vars.length === 0) { dismissAutocomplete(); return; }
  showAutocomplete(input, vars, match.index, match[0].length);
}

function onVarKeydown(e) {
  if (!activeAutocomplete) return;
  const items = activeAutocomplete.el.querySelectorAll('.ac-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeAutocomplete.idx = Math.min(activeAutocomplete.idx + 1, items.length - 1);
    updateAcHighlight(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeAutocomplete.idx = Math.max(activeAutocomplete.idx - 1, 0);
    updateAcHighlight(items);
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (activeAutocomplete.idx >= 0) {
      e.preventDefault();
      items[activeAutocomplete.idx].click();
    }
  } else if (e.key === 'Escape') {
    dismissAutocomplete();
  }
}

function updateAcHighlight(items) {
  items.forEach((item, i) => item.classList.toggle('ac-active', i === activeAutocomplete.idx));
}

function showAutocomplete(input, vars, matchStart, matchLen) {
  dismissAutocomplete();
  const dropdown = document.createElement('div');
  dropdown.className = 'var-autocomplete';
  vars.slice(0, 8).forEach((v, i) => {
    const item = document.createElement('div');
    item.className = 'ac-item' + (i === 0 ? ' ac-active' : '');
    item.innerHTML = `<span class="ac-name">{{${esc(v.name)}}}</span><span class="ac-desc">${esc(v.desc)}</span>`;
    item.onmousedown = (e) => {
      e.preventDefault();
      const val = input.value;
      const before = val.substring(0, matchStart);
      const after = val.substring(matchStart + matchLen);
      input.value = before + '{{' + v.name + '}}' + after;
      const newPos = matchStart + v.name.length + 4;
      input.setSelectionRange(newPos, newPos);
      input.focus();
      dismissAutocomplete();
    };
    dropdown.appendChild(item);
  });
  // Position relative to input
  const rect = input.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.left = rect.left + 'px';
  dropdown.style.top = (rect.bottom + 2) + 'px';
  dropdown.style.width = Math.max(rect.width, 250) + 'px';
  document.body.appendChild(dropdown);
  activeAutocomplete = { el: dropdown, input, idx: 0 };
}

function dismissAutocomplete() {
  if (activeAutocomplete) {
    activeAutocomplete.el.remove();
    activeAutocomplete = null;
  }
}

// --- Response Path Autocomplete for Validation Builder ---

function getResponsePaths() {
  if (!lastTryResponseData) return [];
  const paths = [];
  function walk(obj, prefix) {
    if (obj === null || obj === undefined) return;
    if (Array.isArray(obj)) {
      paths.push({ path: prefix || '(root)', type: 'array', len: obj.length });
      if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
        walk(obj[0], (prefix ? prefix + '[0]' : '[0]'));
      }
    } else if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        const fullPath = prefix ? prefix + '.' + key : key;
        const val = obj[key];
        const type = val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val;
        paths.push({ path: fullPath, type, preview: type !== 'object' && type !== 'array' ? String(val).substring(0, 40) : undefined });
        if (typeof val === 'object' && val !== null) {
          walk(val, fullPath);
        }
      }
    }
  }
  walk(lastTryResponseData, '');
  return paths;
}

function setupPathAutocomplete(input) {
  if (!input || input.dataset.pathAc) return;
  input.dataset.pathAc = '1';
  input.addEventListener('input', onPathInput);
  input.addEventListener('keydown', onPathKeydown);
  input.addEventListener('blur', () => setTimeout(dismissAutocomplete, 150));
}

function onPathInput(e) {
  const input = e.target;
  if (input.dataset.field !== 'path') return;
  const paths = getResponsePaths();
  if (paths.length === 0) { dismissAutocomplete(); return; }
  const query = input.value.toLowerCase();
  const filtered = paths.filter(p => p.path.toLowerCase().includes(query));
  if (filtered.length === 0) { dismissAutocomplete(); return; }
  showPathAutocomplete(input, filtered);
}

function onPathKeydown(e) {
  // Reuse the same keyboard nav as var autocomplete
  onVarKeydown(e);
}

function showPathAutocomplete(input, paths) {
  dismissAutocomplete();
  const dropdown = document.createElement('div');
  dropdown.className = 'var-autocomplete path-autocomplete';
  paths.slice(0, 10).forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'ac-item' + (i === 0 ? ' ac-active' : '');
    const previewStr = p.preview ? ` = ${p.preview}` : p.len !== undefined ? ` [${p.len}]` : '';
    item.innerHTML = `<span class="ac-name">${esc(p.path)}</span><span class="ac-desc">${esc(p.type)}${esc(previewStr)}</span>`;
    item.onmousedown = (e) => {
      e.preventDefault();
      input.value = p.path;
      input.focus();
      dismissAutocomplete();
    };
    dropdown.appendChild(item);
  });
  const rect = input.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.left = rect.left + 'px';
  dropdown.style.top = (rect.bottom + 2) + 'px';
  dropdown.style.width = Math.max(rect.width, 280) + 'px';
  document.body.appendChild(dropdown);
  activeAutocomplete = { el: dropdown, input, idx: 0 };
}

// --- Body Variable Picker (for CodeMirror body editor) ---

function showBodyVarPicker(btn, fullscreen) {
  dismissAutocomplete();
  const vars = getAvailableVars();
  const dropdown = document.createElement('div');
  dropdown.className = 'var-autocomplete';
  vars.forEach((v, i) => {
    const item = document.createElement('div');
    item.className = 'ac-item';
    item.innerHTML = `<span class="ac-name">${esc(v.name)}</span><span class="ac-desc">${esc(v.desc)}</span>`;
    item.onmousedown = (e) => {
      e.preventDefault();
      const cm = fullscreen ? cmBodyFullscreen : getOrCreateBodyCM();
      if (cm) {
        const cursor = cm.getCursor();
        cm.replaceRange(`{{${v.name}}}`, cursor);
        cm.focus();
      }
      dismissAutocomplete();
    };
    dropdown.appendChild(item);
  });
  const rect = btn.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
  dropdown.style.top = (rect.bottom + 2) + 'px';
  dropdown.style.width = '260px';
  document.body.appendChild(dropdown);
  activeAutocomplete = { el: dropdown, input: btn, idx: -1 };
  // Close on click outside
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target)) {
        dismissAutocomplete();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    document.addEventListener('mousedown', closeHandler);
  }, 0);
}

// Attach path autocomplete to all validation path inputs via delegation
document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('.val-fields input[data-field="path"]')) {
    if (!e.target.dataset.pathAc) setupPathAutocomplete(e.target);
    onPathInput(e);
  }
});

// --- Test CRUD ---

function addTestToSuite(suiteIdx) {
  editingSuiteFile = currentSuites[suiteIdx].fileName;
  editingTestIdx = null;
  resetTestModal();
  document.getElementById('test-modal-title').textContent = 'New Test Case';
  document.getElementById('test-modal').classList.add('open');
  initVarAutocompleteFields();
  updateBreadcrumb();
}

function editTest(suiteIdx, testIdx) {
  const suite = currentSuites[suiteIdx];
  const test = suite.tests[testIdx];
  editingSuiteFile = suite.fileName;
  editingTestIdx = testIdx;

  document.getElementById('test-modal-title').textContent = 'Edit Test Case';
  document.getElementById('tm-name').value = test.name || '';
  document.getElementById('tm-method').value = test.method || 'GET';
  document.getElementById('tm-endpoint').value = test.endpoint || '';
  document.getElementById('tm-status').value = test.expectedStatus || 200;

  // Query params (key-value editor)
  const paramsKv = document.getElementById('tm-params-kv');
  paramsKv.innerHTML = '';
  if (test.queryParams) {
    for (const [k, v] of Object.entries(test.queryParams)) {
      addKvRow('tm-params-kv', k, v);
    }
  }

  // Headers (key-value editor)
  const headersKv = document.getElementById('tm-headers-kv');
  headersKv.innerHTML = '';
  if (test.headers) {
    for (const [k, v] of Object.entries(test.headers)) {
      addKvRow('tm-headers-kv', k, v);
    }
  }

  // Body
  setBodyValue(test.body ? JSON.stringify(test.body, null, 2) : '');

  // Validations
  const container = document.getElementById('tm-validations');
  container.innerHTML = '';
  if (test.validations) {
    test.validations.forEach(v => addValidationRow(v));
  }

  // Extract variables
  const extractContainer = document.getElementById('tm-extract');
  extractContainer.innerHTML = '';
  if (test.extract) {
    for (const [varName, path] of Object.entries(test.extract)) {
      addExtractRow(varName, path);
    }
  }

  // Tags, skip, timeout
  document.getElementById('tm-tags').value = (test.tags || []).join(', ');
  document.getElementById('tm-skip').checked = !!test.skip;
  document.getElementById('tm-timeout').value = test.timeout || '';

  // Advanced fields
  document.getElementById('tm-onlyif-env').value = test.onlyIf?.env || '';
  document.getElementById('tm-before-hook').value = test.beforeRequest || '';
  document.getElementById('tm-after-hook').value = test.afterResponse || '';
  document.getElementById('tm-poll').value = test.poll ? JSON.stringify(test.poll, null, 2) : '';
  document.getElementById('tm-dataset').value = test.dataSet ? JSON.stringify(test.dataSet, null, 2) : '';

  document.getElementById('test-modal').classList.add('open');
  initVarAutocompleteFields();
  updateBreadcrumb();
}

function initVarAutocompleteFields() {
  setupVarAutocomplete(document.getElementById('tm-endpoint'));
}

function resetTestModal() {
  clearFieldErrors();
  document.getElementById('tm-name').value = '';
  document.getElementById('tm-method').value = 'GET';
  document.getElementById('tm-endpoint').value = '';
  document.getElementById('tm-status').value = '200';
  document.getElementById('tm-params-kv').innerHTML = '';
  document.getElementById('tm-headers-kv').innerHTML = '';
  setBodyValue('');
  document.getElementById('tm-validations').innerHTML = '';
  const valToolbar = document.getElementById('val-toolbar');
  if (valToolbar) valToolbar.style.display = 'none';
  const valCount = document.getElementById('val-count');
  if (valCount) valCount.textContent = '';
  const selectAll = document.getElementById('val-select-all');
  if (selectAll) selectAll.checked = false;
  const valFilter = document.getElementById('val-filter');
  if (valFilter) valFilter.value = '';
  valGroupsActive = false;
  const groupBtn = document.getElementById('val-group-btn');
  if (groupBtn) groupBtn.classList.remove('active');
  document.getElementById('tm-extract').innerHTML = '';
  document.getElementById('tm-dataset').value = '';
  document.getElementById('tm-tags').value = '';
  document.getElementById('tm-skip').checked = false;
  document.getElementById('tm-timeout').value = '';
  document.getElementById('tm-onlyif-env').value = '';
  document.getElementById('tm-before-hook').value = '';
  document.getElementById('tm-after-hook').value = '';
  document.getElementById('tm-poll').value = '';
  // Reset editor mode to visual
  document.getElementById('tm-json-editor').value = '';
  if (cmEditor) cmEditor.setValue('');
  document.getElementById('tm-json-error').style.display = 'none';
  currentEditorMode = 'visual';
  document.getElementById('tm-json-mode').style.display = 'none';
  document.getElementById('tm-visual-mode').style.display = 'block';
  document.getElementById('toggle-visual').classList.add('active');
  document.getElementById('toggle-json').classList.remove('active');
  const previewPanel = document.getElementById('tm-request-preview');
  if (previewPanel) previewPanel.removeAttribute('open');
}

function closeTestModal() {
  document.getElementById('test-modal').classList.remove('open');
  // Reset fullscreen state
  const modal = document.querySelector('#test-modal .modal');
  modal.classList.remove('modal-fullscreen');
  const fsBtn = document.getElementById('tm-fullscreen-btn');
  if (fsBtn) fsBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px;">fullscreen</span>';
  // Close fullscreen body editor if open
  closeBodyFullscreen();
  // Hide visualize button
  const vizBtn = document.getElementById('tm-viz-btn');
  if (vizBtn) vizBtn.style.display = 'none';
  editingSuiteFile = null;
  editingTestIdx = null;
  currentEditorMode = 'visual';
  updateBreadcrumb();
}

function toggleTestModalFullscreen() {
  const modal = document.querySelector('#test-modal .modal');
  const btn = document.getElementById('tm-fullscreen-btn');
  const isFullscreen = modal.classList.toggle('modal-fullscreen');
  btn.innerHTML = `<span class="material-symbols-rounded" style="font-size:18px;">${isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</span>`;
  btn.title = isFullscreen ? 'Exit fullscreen (F11)' : 'Toggle fullscreen (F11)';
  // Refresh CodeMirror editors to adjust to new size
  if (typeof cmBody !== 'undefined' && cmBody) setTimeout(() => cmBody.refresh(), 50);
  if (typeof cmEditor !== 'undefined' && cmEditor) setTimeout(() => cmEditor.refresh(), 50);
}

// --- Fullscreen Body Editor ---
let cmBodyFullscreen = null;

function openBodyFullscreen() {
  const modal = document.getElementById('body-fullscreen-modal');
  modal.classList.add('open');
  // Create or get fullscreen CM
  if (!cmBodyFullscreen) {
    const wrap = document.getElementById('body-fullscreen-cm-wrap');
    cmBodyFullscreen = CodeMirror(wrap, {
      mode: { name: 'javascript', json: true },
      lineNumbers: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      tabSize: 2,
      theme: 'default',
      lineWrapping: true,
      placeholder: '{ "name": "Test {{$increment}}" }',
    });
    applyBodyFullscreenTheme();
  }
  // Copy current body content into fullscreen editor
  const currentValue = cmBody ? cmBody.getValue() : document.getElementById('tm-body').value;
  cmBodyFullscreen.setValue(currentValue);
  setTimeout(() => cmBodyFullscreen.refresh(), 50);
  setTimeout(() => cmBodyFullscreen.focus(), 100);
}

function closeBodyFullscreen() {
  const modal = document.getElementById('body-fullscreen-modal');
  if (!modal.classList.contains('open')) return;
  // Sync fullscreen content back to main body editor
  if (cmBodyFullscreen) {
    const val = cmBodyFullscreen.getValue();
    if (cmBody) {
      cmBody.setValue(val);
    }
    document.getElementById('tm-body').value = val;
  }
  modal.classList.remove('open');
}

function formatBodyFullscreen() {
  if (!cmBodyFullscreen) return;
  try {
    const val = cmBodyFullscreen.getValue().trim();
    if (val) {
      const formatted = JSON.stringify(JSON.parse(val), null, 2);
      cmBodyFullscreen.setValue(formatted);
    }
  } catch (e) {
    // Not valid JSON, ignore
  }
}

function applyBodyFullscreenTheme() {
  const wrap = document.getElementById('body-fullscreen-cm-wrap');
  if (!wrap) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  wrap.classList.toggle('cm-dark', isDark);
}

// --- Build / Populate Test Object ---

function buildTestFromForm() {
  const test = {
    name: document.getElementById('tm-name').value,
    method: document.getElementById('tm-method').value,
    endpoint: document.getElementById('tm-endpoint').value,
    expectedStatus: parseInt(document.getElementById('tm-status').value) || 200,
  };

  const queryParams = collectKvRows('tm-params-kv');
  if (Object.keys(queryParams).length > 0) test.queryParams = queryParams;

  const headers = collectKvRows('tm-headers-kv');
  if (Object.keys(headers).length > 0) test.headers = headers;

  const bodyText = getBodyValue().trim();
  if (bodyText) {
    try { test.body = JSON.parse(bodyText); } catch (e) { test.body = bodyText; }
  }

  const validations = collectValidations();
  if (validations.length > 0) test.validations = validations;

  const extract = collectExtractVars();
  if (Object.keys(extract).length > 0) test.extract = extract;

  const dataSetText = document.getElementById('tm-dataset').value.trim();
  if (dataSetText) {
    try {
      const ds = JSON.parse(dataSetText);
      if (Array.isArray(ds) && ds.length > 0) test.dataSet = ds;
    } catch { /* ignore invalid JSON */ }
  }

  const tagsText = document.getElementById('tm-tags').value.trim();
  if (tagsText) {
    test.tags = tagsText.split(',').map(t => t.trim()).filter(Boolean);
  }

  if (document.getElementById('tm-skip').checked) test.skip = true;
  const timeoutVal = parseInt(document.getElementById('tm-timeout').value);
  if (timeoutVal > 0) test.timeout = timeoutVal;

  // Advanced: onlyIf
  const onlyIfEnv = document.getElementById('tm-onlyif-env').value.trim();
  if (onlyIfEnv) test.onlyIf = { env: onlyIfEnv };

  // Advanced: hooks
  const beforeHook = document.getElementById('tm-before-hook').value.trim();
  if (beforeHook) test.beforeRequest = beforeHook;
  const afterHook = document.getElementById('tm-after-hook').value.trim();
  if (afterHook) test.afterResponse = afterHook;

  // Advanced: poll
  const pollText = document.getElementById('tm-poll').value.trim();
  if (pollText) {
    try { test.poll = JSON.parse(pollText); } catch { /* ignore invalid */ }
  }

  return test;
}

function populateFormFromTest(test) {
  document.getElementById('tm-name').value = test.name || '';
  document.getElementById('tm-method').value = test.method || 'GET';
  document.getElementById('tm-endpoint').value = test.endpoint || '';
  document.getElementById('tm-status').value = test.expectedStatus || 200;

  document.getElementById('tm-params-kv').innerHTML = '';
  if (test.queryParams) {
    for (const [k, v] of Object.entries(test.queryParams)) {
      addKvRow('tm-params-kv', k, v);
    }
  }

  document.getElementById('tm-headers-kv').innerHTML = '';
  if (test.headers) {
    for (const [k, v] of Object.entries(test.headers)) {
      addKvRow('tm-headers-kv', k, v);
    }
  }

  setBodyValue(test.body ? JSON.stringify(test.body, null, 2) : '');

  const container = document.getElementById('tm-validations');
  container.innerHTML = '';
  if (test.validations) {
    test.validations.forEach(v => addValidationRow(v));
  }

  const extractContainer = document.getElementById('tm-extract');
  extractContainer.innerHTML = '';
  if (test.extract) {
    for (const [varName, path] of Object.entries(test.extract)) {
      addExtractRow(varName, path);
    }
  }

  document.getElementById('tm-dataset').value = test.dataSet ? JSON.stringify(test.dataSet, null, 2) : '';
  document.getElementById('tm-tags').value = (test.tags || []).join(', ');
  document.getElementById('tm-skip').checked = !!test.skip;
  document.getElementById('tm-timeout').value = test.timeout || '';

  // Advanced fields
  document.getElementById('tm-onlyif-env').value = test.onlyIf?.env || '';
  document.getElementById('tm-before-hook').value = test.beforeRequest || '';
  document.getElementById('tm-after-hook').value = test.afterResponse || '';
  document.getElementById('tm-poll').value = test.poll ? JSON.stringify(test.poll, null, 2) : '';
}

// --- Body CodeMirror Editor ---

let cmBody = null;

function getOrCreateBodyCM() {
  if (cmBody) return cmBody;
  const wrap = document.getElementById('tm-body-cm-wrap');
  if (!wrap) return null;
  cmBody = CodeMirror(wrap, {
    mode: { name: 'javascript', json: true },
    lineNumbers: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    tabSize: 2,
    theme: 'default',
    lineWrapping: true,
    placeholder: '{ "name": "Test {{$increment}}" }',
  });
  cmBody.setSize('100%', '160px');
  // Sync to hidden textarea
  cmBody.on('change', () => {
    document.getElementById('tm-body').value = cmBody.getValue();
  });
  applyBodyCMTheme();
  return cmBody;
}

function applyBodyCMTheme() {
  const wrap = document.getElementById('tm-body-cm-wrap');
  if (!wrap) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  wrap.classList.toggle('cm-dark', isDark);
}

function getBodyValue() {
  return cmBody ? cmBody.getValue() : document.getElementById('tm-body').value;
}

function setBodyValue(val) {
  const cm = getOrCreateBodyCM();
  if (cm) {
    cm.setValue(val);
    setTimeout(() => cm.refresh(), 10);
  } else {
    document.getElementById('tm-body').value = val;
  }
}

// --- JSON Editor Mode (CodeMirror) ---

let cmEditor = null;

function getOrCreateCM() {
  if (cmEditor) return cmEditor;
  const wrap = document.getElementById('tm-codemirror-wrap');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  cmEditor = CodeMirror(wrap, {
    mode: { name: 'javascript', json: true },
    lineNumbers: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    tabSize: 2,
    theme: 'default',
    lineWrapping: true,
  });
  cmEditor.setSize('100%', '400px');
  applyCMTheme();
  return cmEditor;
}

function applyCMTheme() {
  const wrap = document.getElementById('tm-codemirror-wrap');
  if (!wrap) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  wrap.classList.toggle('cm-dark', isDark);
  applyBodyCMTheme();
  applyBodyFullscreenTheme();
}

function getCMValue() {
  return cmEditor ? cmEditor.getValue() : document.getElementById('tm-json-editor').value;
}

function setCMValue(val) {
  const cm = getOrCreateCM();
  cm.setValue(val);
  setTimeout(() => cm.refresh(), 10);
}

function setEditorMode(mode) {
  const jsonDiv = document.getElementById('tm-json-mode');
  const visualDiv = document.getElementById('tm-visual-mode');
  const toggleVisual = document.getElementById('toggle-visual');
  const toggleJson = document.getElementById('toggle-json');
  const errorDiv = document.getElementById('tm-json-error');

  if (mode === 'json') {
    // Serialize visual form -> JSON
    const test = buildTestFromForm();
    errorDiv.style.display = 'none';
    visualDiv.style.display = 'none';
    jsonDiv.style.display = 'block';
    setCMValue(JSON.stringify(test, null, 2));
    toggleVisual.classList.remove('active');
    toggleJson.classList.add('active');
  } else {
    // Parse JSON -> visual form
    if (currentEditorMode === 'json') {
      const jsonText = getCMValue().trim();
      if (jsonText) {
        try {
          const test = JSON.parse(jsonText);
          populateFormFromTest(test);
          errorDiv.style.display = 'none';
        } catch (e) {
          errorDiv.textContent = 'Invalid JSON: ' + e.message;
          errorDiv.style.display = 'block';
          return; // Don't switch if JSON is invalid
        }
      }
    }
    jsonDiv.style.display = 'none';
    visualDiv.style.display = 'block';
    toggleJson.classList.remove('active');
    toggleVisual.classList.add('active');
  }
  currentEditorMode = mode;
}

// --- Inline Form Validation ---

function clearFieldErrors() {
  document.querySelectorAll('.form-field-error').forEach(el => el.classList.remove('form-field-error'));
  document.querySelectorAll('.field-error-msg').forEach(el => { el.classList.remove('show'); el.textContent = ''; });
}

function showFieldError(inputId, msg) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.classList.add('form-field-error');
  input.classList.remove('shake');
  void input.offsetWidth;
  input.classList.add('shake');
  let errEl = input.parentElement.querySelector('.field-error-msg');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.className = 'field-error-msg';
    input.insertAdjacentElement('afterend', errEl);
  }
  errEl.textContent = msg;
  errEl.classList.add('show');
}

function validateTestForm() {
  clearFieldErrors();
  let valid = true;
  const name = document.getElementById('tm-name').value.trim();
  const endpoint = document.getElementById('tm-endpoint').value.trim();

  if (!name) { showFieldError('tm-name', 'Test name is required'); valid = false; }
  if (!endpoint) { showFieldError('tm-endpoint', 'Endpoint is required'); valid = false; }

  const bodyText = getBodyValue().trim();
  if (bodyText) {
    try { JSON.parse(bodyText); } catch (e) {
      showFieldError('tm-body', 'Invalid JSON: ' + e.message);
      valid = false;
    }
  }

  const dataSetText = document.getElementById('tm-dataset').value.trim();
  if (dataSetText) {
    try {
      const ds = JSON.parse(dataSetText);
      if (!Array.isArray(ds)) { showFieldError('tm-dataset', 'Dataset must be a JSON array'); valid = false; }
    } catch (e) {
      showFieldError('tm-dataset', 'Invalid JSON: ' + e.message);
      valid = false;
    }
  }

  const pollText = document.getElementById('tm-poll').value.trim();
  if (pollText) {
    try { JSON.parse(pollText); } catch (e) {
      showFieldError('tm-poll', 'Invalid JSON: ' + e.message);
      valid = false;
    }
  }

  return valid;
}

// Clear error styling on input
document.addEventListener('input', (e) => {
  if (e.target.classList?.contains('form-field-error')) {
    e.target.classList.remove('form-field-error');
    const errEl = e.target.parentElement?.querySelector('.field-error-msg');
    if (errEl) { errEl.classList.remove('show'); errEl.textContent = ''; }
  }
});

// --- Request Preview ---

function updateRequestPreview() {
  const panel = document.getElementById('tm-request-preview');
  const content = document.getElementById('tm-preview-content');
  const badge = document.getElementById('tm-preview-badge');
  if (!panel || !content || !currentProject) return;

  const method = document.getElementById('tm-method').value;
  const endpoint = document.getElementById('tm-endpoint').value.trim();
  const queryParams = collectKvRows('tm-params-kv');
  const headers = collectKvRows('tm-headers-kv');
  const bodyText = getBodyValue().trim();

  // Build full URL
  let baseUrl = currentProject.baseUrl || 'https://api.example.com';
  if (!baseUrl.endsWith('/')) baseUrl += '/';

  // Resolve variables for preview (show as-is if unresolvable)
  let fullUrl = baseUrl + endpoint;
  const paramStr = Object.entries(queryParams).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  if (paramStr) fullUrl += '?' + paramStr;

  // Build headers display
  const allHeaders = {};
  // Add project auth headers
  if (currentProject.authType === 'bearer' && currentProject.authToken) {
    allHeaders['Authorization'] = 'Bearer ' + currentProject.authToken;
  } else if (currentProject.authType === 'basic' && currentProject.authUser) {
    allHeaders['Authorization'] = 'Basic ' + btoa(currentProject.authUser + ':' + (currentProject.authPass || ''));
  } else if (currentProject.authType === 'apikey' && currentProject.apiKeyName) {
    allHeaders[currentProject.apiKeyName] = currentProject.apiKeyValue || '***';
  }
  allHeaders['Content-Type'] = 'application/json';
  Object.assign(allHeaders, headers);

  // Build preview HTML
  let html = `<span class="preview-label">Request</span>`;
  html += `<span class="preview-method ${method}">${method}</span> ${esc(fullUrl)}\n`;
  html += `\n<span class="preview-label">Headers</span>`;
  for (const [k, v] of Object.entries(allHeaders)) {
    const masked = k.toLowerCase() === 'authorization' ? v.substring(0, 12) + '...' : v;
    html += `${esc(k)}: ${esc(masked)}\n`;
  }

  if (bodyText) {
    html += `\n<span class="preview-label">Body</span>`;
    try {
      html += esc(JSON.stringify(JSON.parse(bodyText), null, 2));
    } catch {
      html += esc(bodyText);
    }
  }

  // cURL preview
  html += `\n\n<span class="preview-label">cURL</span>`;
  let curl = `curl -X ${method}`;
  for (const [k, v] of Object.entries(allHeaders)) {
    const masked = k.toLowerCase() === 'authorization' ? v.substring(0, 12) + '...' : v;
    curl += ` \\\n  -H '${k}: ${masked}'`;
  }
  if (bodyText) {
    try {
      curl += ` \\\n  -d '${JSON.stringify(JSON.parse(bodyText))}'`;
    } catch {
      curl += ` \\\n  -d '${bodyText}'`;
    }
  }
  curl += ` \\\n  '${fullUrl}'`;
  html += esc(curl);

  content.innerHTML = html;
  badge.textContent = `${method} ${endpoint || '...'}`;
}

// Debounced preview update
let previewTimer = null;
function schedulePreviewUpdate() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updateRequestPreview, 300);
}

// Listen for changes to update preview
document.addEventListener('input', (e) => {
  const previewPanel = document.getElementById('tm-request-preview');
  if (!previewPanel || !previewPanel.open) return;
  const id = e.target.id;
  if (id === 'tm-method' || id === 'tm-endpoint' || id === 'tm-body' || id === 'tm-status' ||
      e.target.closest('#tm-params-kv') || e.target.closest('#tm-headers-kv')) {
    schedulePreviewUpdate();
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'tm-method') schedulePreviewUpdate();
});

// Update preview when panel is toggled open
document.addEventListener('toggle', (e) => {
  if (e.target.id === 'tm-request-preview' && e.target.open) updateRequestPreview();
}, true);

// --- Save Test ---

async function saveTest() {
  let test;

  if (currentEditorMode === 'json') {
    const jsonText = getCMValue().trim();
    if (!jsonText) return toast('JSON editor is empty', 'error');
    try {
      test = JSON.parse(jsonText);
    } catch (e) {
      document.getElementById('tm-json-error').textContent = 'Invalid JSON: ' + e.message;
      document.getElementById('tm-json-error').style.display = 'block';
      return toast('Invalid JSON in editor', 'error');
    }
  } else {
    if (!validateTestForm()) return;
    test = buildTestFromForm();
  }

  // Find the suite and update
  const suite = currentSuites.find(s => s.fileName === editingSuiteFile);
  if (!suite) return;

  const { fileName, ...suiteData } = suite;
  if (editingTestIdx !== null) {
    suiteData.tests[editingTestIdx] = test;
  } else {
    suiteData.tests.push(test);
  }

  try {
    await api('PUT', `/api/projects/${currentProject.id}/suites/${fileName}`, suiteData);
    toast(editingTestIdx !== null ? 'Test updated' : 'Test added');
    closeTestModal();
    await loadSuites();
    renderProjectView();
  } catch { /* error already toasted by api() */ }
}

async function duplicateTest(suiteIdx, testIdx) {
  try {
    const suite = currentSuites[suiteIdx];
    const original = suite.tests[testIdx];
    const copy = JSON.parse(JSON.stringify(original));
    copy.name = copy.name + ' (copy)';

    const { fileName, ...suiteData } = suite;
    suiteData.tests.splice(testIdx + 1, 0, copy);
    await api('PUT', `/api/projects/${currentProject.id}/suites/${fileName}`, suiteData);
    toast('Test duplicated');
    await loadSuites();
    renderProjectView();
  } catch { /* error already toasted by api() */ }
}

async function deleteTest(suiteIdx, testIdx) {
  if (!confirm('Delete this test?')) return;
  try {
    const suite = currentSuites[suiteIdx];
    const { fileName, ...suiteData } = suite;
    suiteData.tests.splice(testIdx, 1);
    await api('PUT', `/api/projects/${currentProject.id}/suites/${fileName}`, suiteData);
    toast('Test deleted');
    await loadSuites();
    renderProjectView();
  } catch { /* error already toasted by api() */ }
}

// --- Validations ---

const TRIM_TYPES = ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'endsWith'];
const VALIDATION_FIELDS = {
  equals: ['path', 'value'],
  notEquals: ['path', 'value'],
  exists: ['path'],
  notExists: ['path'],
  contains: ['path', 'value'],
  notContains: ['path', 'value'],
  startsWith: ['path', 'value'],
  endsWith: ['path', 'value'],
  regex: ['path', 'pattern'],
  typeOf: ['path', 'expected'],
  isArray: ['path'],
  isEmpty: ['path'],
  isNotEmpty: ['path'],
  arrayLength: ['path', 'min', 'max', 'exact'],
  stringLength: ['path', 'min', 'max', 'exact'],
  greaterThan: ['path', 'value'],
  lessThan: ['path', 'value'],
  greaterThanOrEqual: ['path', 'value'],
  lessThanOrEqual: ['path', 'value'],
  between: ['path', 'min', 'max'],
  hasProperty: ['path', 'property'],
  schema: { fields: ['path'], hasSchema: true },
  arrayEvery: { fields: ['path'], hasNested: true },
  arraySome: { fields: ['path'], hasNested: true },
  arrayNone: { fields: ['path'], hasNested: true },
  arrayItemAt: { fields: ['path', 'index'], hasNested: true },
  arrayFind: { fields: ['path'], hasNested: true, hasWhere: true },
};

const NESTED_TYPES = ['arrayEvery', 'arraySome', 'arrayNone', 'arrayItemAt', 'arrayFind'];
const SIMPLE_TYPES = Object.keys(VALIDATION_FIELDS).filter(t => !NESTED_TYPES.includes(t));

function addValidationRow(existing, container, isNested) {
  container = container || document.getElementById('tm-validations');
  const row = document.createElement('div');
  row.className = 'validation-row' + (existing?.disabled ? ' val-disabled' : '');
  if (!isNested) {
    row.draggable = true;
    row.ondragstart = onValDragStart;
    row.ondragover = onValDragOver;
    row.ondrop = onValDrop;
    row.ondragend = onValDragEnd;
  }

  const type = existing?.type || 'equals';
  const typeOptions = isNested ? SIMPLE_TYPES : Object.keys(VALIDATION_FIELDS);
  const typeSelect = `<select onchange="updateValidationFields(this)">
    ${typeOptions.map(t => `<option value="${t}" ${t === type ? 'selected' : ''}>${t}</option>`).join('')}
  </select>`;

  const dragHandle = isNested ? '' : '<span class="drag-handle val-drag-handle" title="Drag to reorder"><span class="material-symbols-rounded" style="font-size:16px;">drag_indicator</span></span>';
  const selectCheck = isNested ? '' : '<input type="checkbox" class="val-select-cb" onchange="updateValToolbar()">';
  const numBadge = '<span class="val-num"></span>';
  const disableBtn = isNested ? '' : `<button class="val-toggle-btn" onclick="toggleValidationDisabled(this)" title="${existing?.disabled ? 'Enable' : 'Disable'} validation"><span class="material-symbols-rounded" style="font-size:16px;">${existing?.disabled ? 'visibility_off' : 'visibility'}</span></button>`;

  row.innerHTML = selectCheck + dragHandle + numBadge + typeSelect + '<div class="val-fields"></div>' +
    disableBtn +
    '<button class="validation-remove" onclick="this.parentElement.remove(); renumberValidations(); updateValToolbar()"><span class="material-symbols-rounded">close</span></button>';

  container.appendChild(row);
  updateValidationFields(row.querySelector('select'), existing);
  renumberValidations();
}

function renumberValidations() {
  const container = document.getElementById('tm-validations');
  if (!container) return;
  const rows = container.querySelectorAll(':scope > .validation-row');
  rows.forEach((row, i) => {
    const badge = row.querySelector(':scope > .val-num');
    if (badge) badge.textContent = i + 1;
  });
  // Update count & toolbar visibility
  const countEl = document.getElementById('val-count');
  if (countEl) countEl.textContent = rows.length > 0 ? `(${rows.length})` : '';
  const toolbar = document.getElementById('val-toolbar');
  if (toolbar) toolbar.style.display = rows.length > 0 ? '' : 'none';
}

// --- Bulk actions ---

function updateValToolbar() {
  const container = document.getElementById('tm-validations');
  if (!container) return;
  const cbs = container.querySelectorAll(':scope > .validation-row > .val-select-cb');
  const checked = container.querySelectorAll(':scope > .validation-row > .val-select-cb:checked');
  const selectAll = document.getElementById('val-select-all');
  if (selectAll) {
    selectAll.checked = cbs.length > 0 && checked.length === cbs.length;
    selectAll.indeterminate = checked.length > 0 && checked.length < cbs.length;
  }
}

function toggleSelectAllValidations(checked) {
  const container = document.getElementById('tm-validations');
  if (!container) return;
  container.querySelectorAll(':scope > .validation-row > .val-select-cb').forEach(cb => { cb.checked = checked; });
}

function deleteSelectedValidations() {
  const container = document.getElementById('tm-validations');
  if (!container) return;
  const selected = container.querySelectorAll(':scope > .validation-row > .val-select-cb:checked');
  if (selected.length === 0) return toast('No validations selected', 'error');
  selected.forEach(cb => cb.closest('.validation-row').remove());
  document.getElementById('val-select-all').checked = false;
  renumberValidations();
  updateValToolbar();
}

function toggleSelectedValidations(enable) {
  const container = document.getElementById('tm-validations');
  if (!container) return;
  const selected = container.querySelectorAll(':scope > .validation-row > .val-select-cb:checked');
  if (selected.length === 0) return toast('No validations selected', 'error');
  selected.forEach(cb => {
    const row = cb.closest('.validation-row');
    if (enable) {
      row.classList.remove('val-disabled');
    } else {
      row.classList.add('val-disabled');
    }
    const icon = row.querySelector(':scope > .val-toggle-btn .material-symbols-rounded');
    if (icon) icon.textContent = enable ? 'visibility' : 'visibility_off';
  });
}

function toggleValidationDisabled(btn) {
  const row = btn.closest('.validation-row');
  const isDisabled = row.classList.toggle('val-disabled');
  const icon = btn.querySelector('.material-symbols-rounded');
  icon.textContent = isDisabled ? 'visibility_off' : 'visibility';
  btn.title = isDisabled ? 'Enable validation' : 'Disable validation';
}

// --- Filter validations ---

function filterValidations(query) {
  const container = document.getElementById('tm-validations');
  if (!container) return;
  const q = query.toLowerCase();
  container.querySelectorAll(':scope > .validation-row').forEach(row => {
    if (!q) { row.style.display = ''; return; }
    const type = row.querySelector(':scope > select')?.value || '';
    const fields = Array.from(row.querySelectorAll('.val-fields input')).map(i => i.value).join(' ');
    const text = (type + ' ' + fields).toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
  // Also hide/show group headers based on visible children
  container.querySelectorAll(':scope > .val-group-header').forEach(hdr => {
    if (!q) { hdr.style.display = ''; return; }
    const groupName = hdr.dataset.group;
    const hasVisible = Array.from(container.querySelectorAll(`:scope > .validation-row[data-group="${groupName}"]`))
      .some(r => r.style.display !== 'none');
    hdr.style.display = hasVisible ? '' : 'none';
  });
}

// --- Group by path prefix ---

let valGroupsActive = false;

function getValPathPrefix(row) {
  const type = row.querySelector(':scope > select')?.value || '';
  // Types without meaningful paths
  if (['isArray', 'arrayLength', 'schema', 'arrayEvery', 'arraySome', 'arrayNone'].includes(type)) {
    const pathInput = row.querySelector('.val-fields input[data-field="path"]');
    const p = pathInput?.value?.trim();
    if (!p) return '_structure';
  }
  const pathInput = row.querySelector('.val-fields input[data-field="path"]');
  const path = pathInput?.value?.trim() || '';
  if (!path) return '_root';
  // Extract top-level prefix: "meta.id" -> "meta", "values[0].attr" -> "values[0]", "[0].name" -> "[0]"
  const m = path.match(/^([^.[]+(?:\[\d+\])?)/);
  return m ? m[1] : path;
}

function toggleValGroups() {
  valGroupsActive = !valGroupsActive;
  const btn = document.getElementById('val-group-btn');
  if (btn) {
    const icon = btn.querySelector('.material-symbols-rounded');
    if (valGroupsActive) {
      btn.classList.add('active');
      icon.textContent = 'folder_open';
      buildValGroups();
    } else {
      btn.classList.remove('active');
      icon.textContent = 'folder_open';
      removeValGroups();
    }
  }
}

function buildValGroups() {
  const container = document.getElementById('tm-validations');
  if (!container) return;

  // Remove old headers
  container.querySelectorAll(':scope > .val-group-header').forEach(h => h.remove());

  // Collect rows and their prefixes
  const rows = Array.from(container.querySelectorAll(':scope > .validation-row'));
  if (rows.length === 0) return;

  const groups = {};
  rows.forEach(row => {
    const prefix = getValPathPrefix(row);
    row.dataset.group = prefix;
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(row);
  });

  // Sort groups: _structure first, _root second, then alphabetical
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === '_structure') return -1;
    if (b === '_structure') return 1;
    if (a === '_root') return -1;
    if (b === '_root') return 1;
    return a.localeCompare(b);
  });

  // Reorder DOM: insert group headers, then rows
  sortedKeys.forEach(key => {
    const label = key === '_structure' ? 'Structure' : key === '_root' ? 'Response' : key;
    const hdr = document.createElement('div');
    hdr.className = 'val-group-header';
    hdr.dataset.group = key;
    hdr.innerHTML = `<span class="material-symbols-rounded">expand_more</span> ${esc(label)} <span class="val-group-count">(${groups[key].length})</span>`;
    hdr.onclick = () => toggleGroupCollapse(hdr);
    container.appendChild(hdr);
    groups[key].forEach(row => container.appendChild(row));
  });

  renumberValidations();
}

function removeValGroups() {
  const container = document.getElementById('tm-validations');
  if (!container) return;
  container.querySelectorAll(':scope > .val-group-header').forEach(h => h.remove());
  container.querySelectorAll(':scope > .validation-row').forEach(r => {
    r.style.display = '';
    delete r.dataset.group;
  });
}

function toggleGroupCollapse(hdr) {
  const collapsed = hdr.classList.toggle('collapsed');
  const container = hdr.parentElement;
  const groupName = hdr.dataset.group;
  container.querySelectorAll(`:scope > .validation-row[data-group="${groupName}"]`).forEach(row => {
    row.style.display = collapsed ? 'none' : '';
  });
}

function updateValidationFields(select, existing) {
  const row = select.closest('.validation-row');
  const fieldsContainer = row.querySelector('.val-fields');
  const type = select.value;
  const config = VALIDATION_FIELDS[type];
  const fields = Array.isArray(config) ? config : (config?.fields || []);
  const hasNested = config?.hasNested || false;
  const hasWhere = config?.hasWhere || false;
  const hasSchema = config?.hasSchema || false;

  // Remove any existing sub-validations, where-fields, or schema-builder
  row.querySelectorAll(':scope > .sub-validations, :scope > .where-fields, :scope > .schema-builder').forEach(el => el.remove());

  const fieldHtml = fields.map(f => {
    const placeholder = f === 'path' ? (hasNested ? 'array path (e.g. values)' : 'e.g. meta.id') :
                       f === 'value' ? 'expected value' :
                       f === 'pattern' ? 'regex pattern' :
                       f === 'expected' ? 'string|number|boolean|object' :
                       f === 'property' ? 'property name' :
                       f === 'index' ? 'index (0, 1, ...)' :
                       f;
    return `<input data-field="${f}" placeholder="${placeholder}">`;
  }).join('');

  fieldsContainer.innerHTML = fieldHtml;

  // Add trim checkbox outside val-fields so it doesn't wrap
  row.querySelectorAll(':scope > .val-trim-label').forEach(el => el.remove());
  if (TRIM_TYPES.includes(type)) {
    const trimLabel = document.createElement('label');
    trimLabel.className = 'val-trim-label';
    trimLabel.title = 'Trim whitespace before comparing';
    trimLabel.innerHTML = `<input type="checkbox" data-field="trim" ${existing?.trim ? 'checked' : ''} style="width:auto;margin:0;"> Trim`;
    // Insert before the remove button
    const removeBtn = row.querySelector(':scope > .validation-remove');
    row.insertBefore(trimLabel, removeBtn);
  }

  // Set input values via DOM to avoid HTML attribute escaping issues with quotes/angle brackets
  if (existing) {
    fieldsContainer.querySelectorAll('input[data-field]').forEach(input => {
      const f = input.dataset.field;
      if (f === 'trim') return; // checkbox, already handled
      let val = existing[f];
      if (f === 'value' && existing.value !== undefined) {
        val = typeof existing.value === 'object' ? JSON.stringify(existing.value) : existing.value;
      }
      if (val !== undefined && val !== null) {
        input.value = String(val);
      }
    });
  }

  // Add "where" clause fields for arrayFind
  if (hasWhere) {
    const whereDiv = document.createElement('div');
    whereDiv.className = 'where-fields';
    const wp = existing?.where?.path || '';
    const wv = existing?.where?.value !== undefined ? (typeof existing.where.value === 'object' ? JSON.stringify(existing.where.value) : existing.where.value) : '';
    whereDiv.innerHTML = `
      <label>Find where:</label>
      <input data-field="where.path" value="${esc(String(wp))}" placeholder="field path (e.g. attribute)" style="min-width:90px;flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface-input);color:var(--text);">
      <label>=</label>
      <input data-field="where.value" value="${esc(String(wv))}" placeholder="match value" style="min-width:90px;flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface-input);color:var(--text);">
    `;
    row.appendChild(whereDiv);
  }

  // Add nested validations container for array types
  if (hasNested) {
    const subDiv = document.createElement('div');
    subDiv.className = 'sub-validations';
    subDiv.innerHTML = `
      <span class="sub-label">Nested Validations (applied to each array item)</span>
      <div class="sub-rows"></div>
      <button class="sub-add-btn" onclick="addValidationRow(null, this.previousElementSibling, true)"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:-3px;margin-right:2px;">add</span> Add Sub-Validation</button>
    `;
    row.appendChild(subDiv);

    // Load existing nested validations
    if (existing?.validations?.length) {
      const subRows = subDiv.querySelector('.sub-rows');
      for (const v of existing.validations) {
        addValidationRow(v, subRows, true);
      }
    }
  }

  // Add schema properties builder
  if (hasSchema) {
    const schemaDiv = document.createElement('div');
    schemaDiv.className = 'schema-builder';
    schemaDiv.innerHTML = `
      <span class="sub-label">Schema Properties (property name &rarr; expected type)</span>
      <div class="schema-rows"></div>
      <button class="sub-add-btn" onclick="addSchemaPropertyRow(this.previousElementSibling)"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:-3px;margin-right:2px;">add</span> Add Property</button>
    `;
    row.appendChild(schemaDiv);

    // Load existing properties
    if (existing?.properties) {
      const schemaRows = schemaDiv.querySelector('.schema-rows');
      for (const [key, type] of Object.entries(existing.properties)) {
        addSchemaPropertyRow(schemaRows, key, type);
      }
    }
  }
}

function addSchemaPropertyRow(container, key, type) {
  const row = document.createElement('div');
  row.className = 'schema-prop-row';
  row.innerHTML = `
    <input data-schema-key placeholder="property name (e.g. id)" value="${esc(key || '')}">
    <select data-schema-type>
      <option value="string" ${type === 'string' ? 'selected' : ''}>string</option>
      <option value="number" ${type === 'number' ? 'selected' : ''}>number</option>
      <option value="boolean" ${type === 'boolean' ? 'selected' : ''}>boolean</option>
      <option value="object" ${type === 'object' ? 'selected' : ''}>object</option>
      <option value="array" ${type === 'array' ? 'selected' : ''}>array</option>
    </select>
    <button class="validation-remove" onclick="this.parentElement.remove()"><span class="material-symbols-rounded">close</span></button>
  `;
  container.appendChild(row);
}

function collectValidationsFromContainer(container) {
  const rows = container.querySelectorAll(':scope > .validation-row');
  const validations = [];

  rows.forEach(row => {
    const type = row.querySelector(':scope > select').value;
    const v = { type };

    // Collect disabled state
    if (row.classList.contains('val-disabled')) {
      v.disabled = true;
    }

    // Collect simple fields
    row.querySelectorAll(':scope > .val-fields input').forEach(input => {
      const field = input.dataset.field;
      let val = field === 'value' ? input.value : input.value.trim();
      if (!val && val !== 0) return;

      if (field === 'value') {
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(val) && val !== '') val = Number(val);
      }
      if (['min', 'max', 'exact', 'index'].includes(field) && val !== '') val = Number(val);

      v[field] = val;
    });

    // Collect trim checkbox
    const trimCheck = row.querySelector(':scope > .val-trim-label input[data-field="trim"]');
    if (trimCheck && trimCheck.checked) {
      v.trim = true;
    }

    // Collect "where" clause for arrayFind
    const whereFields = row.querySelector(':scope > .where-fields');
    if (whereFields) {
      const wp = whereFields.querySelector('[data-field="where.path"]')?.value.trim() || '';
      let wv = whereFields.querySelector('[data-field="where.value"]')?.value.trim() || '';
      if (wp) {
        if (wv === 'true') wv = true;
        else if (wv === 'false') wv = false;
        else if (!isNaN(wv) && wv !== '') wv = Number(wv);
        v.where = { path: wp, value: wv };
      }
    }

    // Collect nested validations
    const subRows = row.querySelector(':scope > .sub-validations > .sub-rows');
    if (subRows) {
      v.validations = collectValidationsFromContainer(subRows);
    }

    // Collect schema properties
    const schemaRows = row.querySelector(':scope > .schema-builder > .schema-rows');
    if (schemaRows) {
      const props = {};
      schemaRows.querySelectorAll('.schema-prop-row').forEach(propRow => {
        const key = propRow.querySelector('[data-schema-key]')?.value.trim();
        const type = propRow.querySelector('[data-schema-type]')?.value;
        if (key) props[key] = type;
      });
      if (Object.keys(props).length > 0) v.properties = props;
    }

    validations.push(v);
  });

  return validations;
}

function collectValidations() {
  return collectValidationsFromContainer(document.getElementById('tm-validations'));
}

// --- Extract Variables ---

function addExtractRow(varName, path) {
  const container = document.getElementById('tm-extract');
  const row = document.createElement('div');
  row.className = 'extract-row';
  row.innerHTML = `
    <input data-extract-var placeholder="variable name (e.g. userId)" value="${esc(varName || '')}">
    <span class="arrow">&larr;</span>
    <input data-extract-path placeholder="response path (e.g. data.id)" value="${esc(path || '')}">
    <button class="validation-remove" onclick="this.parentElement.remove()"><span class="material-symbols-rounded">close</span></button>
  `;
  container.appendChild(row);
}

function collectExtractVars() {
  const rows = document.querySelectorAll('#tm-extract .extract-row');
  const extract = {};
  rows.forEach(row => {
    const varName = row.querySelector('[data-extract-var]')?.value.trim();
    const path = row.querySelector('[data-extract-path]')?.value.trim();
    if (varName && path) extract[varName] = path;
  });
  return extract;
}

// --- Try Request & Auto-Generate Validations ---

async function tryAndAutoGenerate() {
  if (!currentProject) return toast('No project selected', 'error');

  const method = document.getElementById('tm-method').value;
  const endpoint = document.getElementById('tm-endpoint').value.trim();
  if (!endpoint) return toast('Endpoint is required to send a request', 'error');

  // Collect query params from KV editor
  const queryParams = collectKvRows('tm-params-kv');
  const headers = collectKvRows('tm-headers-kv');

  // Parse body
  let body;
  const bodyText = getBodyValue().trim();
  if (bodyText) {
    try { body = JSON.parse(bodyText); } catch { body = bodyText; }
  }

  const btn = document.getElementById('tm-autogen-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-rounded spin" style="font-size:16px;vertical-align:-3px;margin-right:2px;">progress_activity</span> Sending...';

  try {
    const profile = document.getElementById('tm-autogen-profile').value;
    const result = await api('POST', `/api/projects/${currentProject.id}/try-request`, {
      method, endpoint, queryParams, body, headers, profile
    });

    // Store response data for path autocomplete in validations
    lastTryResponseData = result.data;

    // Show Visualize button if response is structured
    const vizBtn = document.getElementById('tm-viz-btn');
    if (vizBtn && typeof result.data === 'object' && result.data !== null) {
      vizBtn.style.display = '';
    }

    // Show response status
    toast(`Response: ${result.status} — ${result.validations.length} validations generated`, 'success');

    // Update expected status from actual response
    document.getElementById('tm-status').value = result.status;

    // Ask user whether to replace or append
    const container = document.getElementById('tm-validations');
    const existingCount = container.querySelectorAll('.validation-row').length;

    if (existingCount > 0) {
      const action = confirm(
        `You have ${existingCount} existing validation(s).\n\nOK = Replace all with ${result.validations.length} generated\nCancel = Append generated to existing`
      );
      if (action) container.innerHTML = '';
    }

    // Add generated validations to the form
    for (const v of result.validations) {
      addValidationRow(v);
    }

  } catch (err) {
    // api() already shows toast on error
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}
