// --- Test CRUD ---

function addTestToSuite(suiteIdx) {
  editingSuiteFile = currentSuites[suiteIdx].fileName;
  editingTestIdx = null;
  resetTestModal();
  document.getElementById('test-modal-title').textContent = 'New Test Case';
  document.getElementById('test-modal').classList.add('open');
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

  // Query params
  if (test.queryParams) {
    document.getElementById('tm-params').value = Object.entries(test.queryParams).map(([k, v]) => `${k}=${v}`).join('\n');
  } else {
    document.getElementById('tm-params').value = '';
  }

  // Body
  document.getElementById('tm-body').value = test.body ? JSON.stringify(test.body, null, 2) : '';

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

  document.getElementById('test-modal').classList.add('open');
  updateBreadcrumb();
}

function resetTestModal() {
  document.getElementById('tm-name').value = '';
  document.getElementById('tm-method').value = 'GET';
  document.getElementById('tm-endpoint').value = '';
  document.getElementById('tm-status').value = '200';
  document.getElementById('tm-params').value = '';
  document.getElementById('tm-body').value = '';
  document.getElementById('tm-validations').innerHTML = '';
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
}

function closeTestModal() {
  document.getElementById('test-modal').classList.remove('open');
  editingSuiteFile = null;
  editingTestIdx = null;
  currentEditorMode = 'visual';
  updateBreadcrumb();
}

// --- Build / Populate Test Object ---

function buildTestFromForm() {
  const test = {
    name: document.getElementById('tm-name').value,
    method: document.getElementById('tm-method').value,
    endpoint: document.getElementById('tm-endpoint').value,
    expectedStatus: parseInt(document.getElementById('tm-status').value) || 200,
  };

  const paramsText = document.getElementById('tm-params').value.trim();
  if (paramsText) {
    test.queryParams = {};
    paramsText.split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k) test.queryParams[k.trim()] = v.join('=').trim();
    });
  }

  const bodyText = document.getElementById('tm-body').value.trim();
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

  if (test.queryParams) {
    document.getElementById('tm-params').value = Object.entries(test.queryParams).map(([k, v]) => `${k}=${v}`).join('\n');
  } else {
    document.getElementById('tm-params').value = '';
  }

  document.getElementById('tm-body').value = test.body ? JSON.stringify(test.body, null, 2) : '';

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
    test = buildTestFromForm();
  }

  if (!test.name || !test.endpoint) return toast('Name and endpoint are required', 'error');

  // Validate body is proper JSON if it's a string
  if (typeof test.body === 'string') {
    try {
      test.body = JSON.parse(test.body);
    } catch (e) {
      return toast('Invalid JSON in request body', 'error');
    }
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
  row.className = 'validation-row';
  row.style.flexWrap = 'wrap';
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

  row.innerHTML = dragHandle + typeSelect + '<div class="val-fields" style="display:flex;gap:8px;flex:1;flex-wrap:wrap;"></div>' +
    '<button class="validation-remove" onclick="this.parentElement.remove()"><span class="material-symbols-rounded">close</span></button>';

  container.appendChild(row);
  updateValidationFields(row.querySelector('select'), existing);
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

  fieldsContainer.innerHTML = fields.map(f => {
    let val = existing?.[f] || '';
    if (f === 'value' && existing?.value !== undefined) {
      val = typeof existing.value === 'object' ? JSON.stringify(existing.value) : existing.value;
    }
    if (f === 'index' && existing?.index !== undefined) {
      val = existing.index;
    }
    const placeholder = f === 'path' ? (hasNested ? 'array path (e.g. values)' : 'e.g. meta.id') :
                       f === 'value' ? 'expected value' :
                       f === 'pattern' ? 'regex pattern' :
                       f === 'expected' ? 'string|number|boolean|object' :
                       f === 'property' ? 'property name' :
                       f === 'index' ? 'index (0, 1, ...)' :
                       f;
    return `<input data-field="${f}" value="${esc(String(val))}" placeholder="${placeholder}" style="min-width:90px;">`;
  }).join('');

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

    // Collect simple fields
    row.querySelectorAll(':scope > .val-fields input').forEach(input => {
      const field = input.dataset.field;
      let val = input.value.trim();
      if (!val) return;

      if (field === 'value') {
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(val) && val !== '') val = Number(val);
      }
      if (['min', 'max', 'exact', 'index'].includes(field) && val !== '') val = Number(val);

      v[field] = val;
    });

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

  // Parse query params from form
  let queryParams;
  const paramsText = document.getElementById('tm-params').value.trim();
  if (paramsText) {
    queryParams = {};
    paramsText.split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k) queryParams[k.trim()] = v.join('=').trim();
    });
  }

  // Parse body
  let body;
  const bodyText = document.getElementById('tm-body').value.trim();
  if (bodyText) {
    try { body = JSON.parse(bodyText); } catch { body = bodyText; }
  }

  const btn = document.getElementById('tm-autogen-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-rounded spin" style="font-size:16px;vertical-align:-3px;margin-right:2px;">progress_activity</span> Sending...';

  try {
    const includeValues = document.getElementById('tm-autogen-values').checked;
    const result = await api('POST', `/api/projects/${currentProject.id}/try-request`, {
      method, endpoint, queryParams, body, includeValues
    });

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
