// --- Test Suggestion Engine (rule-based) ---

/**
 * Extracts the base path from an endpoint by stripping trailing ID segments.
 * e.g. "/users/{{id}}" -> "/users", "/users/:id" -> "/users", "/users/123" -> "/users"
 */
function getBasePath(endpoint) {
  if (!endpoint) return '';
  return endpoint
    .replace(/\/\{\{[^}]+\}\}/g, '')
    .replace(/\/:[^/]+/g, '')
    .replace(/\/\d+$/g, '')
    .replace(/\/+$/, '') || '/';
}

/**
 * Determines whether an endpoint looks like a "list" endpoint (no trailing ID).
 */
function isListEndpoint(endpoint) {
  if (!endpoint) return false;
  return !/\/(\{\{[^}]+\}\}|:[^/]+|\d+)\s*$/.test(endpoint);
}

/**
 * Gathers all tests across all suites into a flat array with suite context.
 */
function gatherAllTests() {
  const all = [];
  for (const suite of currentSuites) {
    for (const test of suite.tests) {
      all.push({ ...test, _suite: suite.suite, _fileName: suite.fileName });
    }
  }
  return all;
}

/**
 * Analyzes all current tests and returns an array of suggestion objects.
 * Each suggestion: { priority, category, title, description, testTemplate }
 */
function analyzeAndSuggest() {
  if (!currentSuites || currentSuites.length === 0) return [];

  const suggestions = [];
  const allTests = gatherAllTests();

  if (allTests.length === 0) return [];

  // Build indexes for efficient lookups
  const methodEndpoints = {};   // "METHOD /path" -> [tests]
  const basePaths = new Set();
  const basePathMethods = {};   // "/base" -> Set of methods
  const statusCodes = new Set();
  const hasExtract = new Set();  // base paths that use extract
  const hasVarRef = new Set();   // base paths that reference {{vars}}

  for (const t of allTests) {
    const key = `${(t.method || 'GET').toUpperCase()} ${t.endpoint || ''}`;
    if (!methodEndpoints[key]) methodEndpoints[key] = [];
    methodEndpoints[key].push(t);

    const base = getBasePath(t.endpoint);
    basePaths.add(base);

    if (!basePathMethods[base]) basePathMethods[base] = new Set();
    basePathMethods[base].add((t.method || 'GET').toUpperCase());

    statusCodes.add(Number(t.expectedStatus) || 200);

    if (t.extract && Object.keys(t.extract).length > 0) {
      hasExtract.add(base);
    }
    if (t.endpoint && /\{\{/.test(t.endpoint)) {
      hasVarRef.add(base);
    }
    if (t.body && /\{\{/.test(JSON.stringify(t.body))) {
      hasVarRef.add(base);
    }
  }

  // --- Rule (a): Missing error cases (high) ---
  for (const t of allTests) {
    const method = (t.method || 'GET').toUpperCase();
    const base = getBasePath(t.endpoint);
    const status = Number(t.expectedStatus) || 200;

    if (method === 'GET' && status >= 200 && status < 300) {
      // Check if there's a 404 test for the same base
      const has404 = allTests.some(
        ot => getBasePath(ot.endpoint) === base &&
              (ot.method || 'GET').toUpperCase() === 'GET' &&
              Number(ot.expectedStatus) === 404
      );
      if (!has404) {
        const idEndpoint = base + '/{{nonExistentId}}';
        suggestions.push({
          priority: 'high',
          category: 'Error Handling',
          title: `Add 404 test for GET ${base}/:id`,
          description: `There is a successful GET test for ${base} but no test verifying a 404 response when accessing a non-existent resource.`,
          testTemplate: {
            name: `GET ${base} - not found (404)`,
            method: 'GET',
            endpoint: idEndpoint,
            expectedStatus: 404,
            validations: [
              { type: 'exists', path: '$.message' }
            ],
            body: null,
            queryParams: {},
            extract: {},
            headers: {},
            tags: ['error-handling', 'suggested']
          }
        });
      }
    }

    if (method === 'POST' && status >= 200 && status < 300) {
      const has400 = allTests.some(
        ot => getBasePath(ot.endpoint) === base &&
              (ot.method || 'GET').toUpperCase() === 'POST' &&
              Number(ot.expectedStatus) === 400
      );
      if (!has400) {
        suggestions.push({
          priority: 'high',
          category: 'Error Handling',
          title: `Add 400 test for POST ${base}`,
          description: `There is a successful POST test for ${base} but no test verifying a 400 response for invalid request body.`,
          testTemplate: {
            name: `POST ${base} - invalid body (400)`,
            method: 'POST',
            endpoint: t.endpoint,
            expectedStatus: 400,
            validations: [
              { type: 'exists', path: '$.message' }
            ],
            body: {},
            queryParams: {},
            extract: {},
            headers: {},
            tags: ['error-handling', 'suggested']
          }
        });
      }
    }
  }

  // --- Rule (b): Missing CRUD methods (medium) ---
  const crudMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  for (const base of basePaths) {
    if (!base || base === '/') continue;
    const existing = basePathMethods[base] || new Set();
    if (existing.has('GET')) {
      for (const m of crudMethods) {
        if (!existing.has(m)) {
          const endpoint = (m === 'PUT' || m === 'DELETE') ? base + '/{{id}}' : base;
          const needsBody = m === 'POST' || m === 'PUT';
          suggestions.push({
            priority: 'medium',
            category: 'CRUD Coverage',
            title: `Add ${m} test for ${base}`,
            description: `GET tests exist for ${base} but no ${m} test was found. Consider adding one for full CRUD coverage.`,
            testTemplate: {
              name: `${m} ${base}`,
              method: m,
              endpoint: endpoint,
              expectedStatus: m === 'POST' ? 201 : (m === 'DELETE' ? 204 : 200),
              validations: [],
              body: needsBody ? {} : null,
              queryParams: {},
              extract: {},
              headers: {},
              tags: ['crud', 'suggested']
            }
          });
        }
      }
    }
  }

  // --- Rule (c): No schema validation (medium) ---
  for (const t of allTests) {
    const hasSchema = (t.validations || []).some(v => v.type === 'schema');
    if (!hasSchema && (t.validations || []).length > 0) {
      suggestions.push({
        priority: 'medium',
        category: 'Validation Quality',
        title: `Add schema validation to "${esc(t.name || 'Untitled')}"`,
        description: `The test "${esc(t.name || 'Untitled')}" has validations but none verify the overall response schema/structure. A schema validation ensures the response shape is correct.`,
        testTemplate: null
      });
    }
  }

  // --- Rule (d): No array validations (medium) ---
  for (const t of allTests) {
    if (!isListEndpoint(t.endpoint)) continue;
    const validations = t.validations || [];
    const hasArrayVal = validations.some(v => v.type === 'arrayEvery' || v.type === 'arraySome');
    if (!hasArrayVal) {
      suggestions.push({
        priority: 'medium',
        category: 'Array Validation',
        title: `Add arrayEvery to validate all items in ${esc(t.endpoint || '')}`,
        description: `The endpoint ${esc(t.endpoint || '')} likely returns an array but no arrayEvery/arraySome validation is used. This ensures each item in the response meets your criteria.`,
        testTemplate: null
      });
    }
  }

  // --- Rule (e): Missing auth test (high) ---
  const hasAuthTest = allTests.some(t => {
    const status = Number(t.expectedStatus) || 200;
    return status === 401 || status === 403;
  });
  if (!hasAuthTest && allTests.length > 0) {
    const firstEndpoint = allTests[0].endpoint || '/';
    suggestions.push({
      priority: 'high',
      category: 'Security',
      title: 'Add unauthorized access test (401)',
      description: 'No test checks for 401 or 403 status codes. Add a test that sends a request without valid authentication to verify the API rejects unauthorized access.',
      testTemplate: {
        name: 'Unauthorized access (401)',
        method: 'GET',
        endpoint: firstEndpoint,
        expectedStatus: 401,
        validations: [
          { type: 'exists', path: '$.message' }
        ],
        body: null,
        queryParams: {},
        extract: {},
        headers: {},
        tags: ['security', 'suggested']
      }
    });
  }

  // --- Rule (f): No response time check (low) ---
  const hasTimeout = allTests.some(t => t.timeout && Number(t.timeout) > 0);
  if (!hasTimeout && allTests.length > 0) {
    suggestions.push({
      priority: 'low',
      category: 'Performance',
      title: 'Add performance test with timeout assertion',
      description: 'No test has a custom timeout set. Consider adding a timeout to verify response times stay within acceptable limits.',
      testTemplate: null
    });
  }

  // --- Rule (g): Empty validations (high) ---
  for (const t of allTests) {
    if (!t.validations || t.validations.length === 0) {
      suggestions.push({
        priority: 'high',
        category: 'Missing Assertions',
        title: `Test "${esc(t.name || 'Untitled')}" has no validations — add assertions`,
        description: `The test "${esc(t.name || 'Untitled')}" in suite "${esc(t._suite || '')}" has no validations. A test without assertions only verifies the status code but not the response content.`,
        testTemplate: null
      });
    }
  }

  // --- Rule (h): No variable chaining (low) ---
  for (const base of basePaths) {
    if (!base || base === '/') continue;
    const testsForBase = allTests.filter(t => getBasePath(t.endpoint) === base);
    if (testsForBase.length >= 2 && !hasExtract.has(base) && !hasVarRef.has(base)) {
      suggestions.push({
        priority: 'low',
        category: 'Test Chaining',
        title: `Chain ${base} tests with variable extraction`,
        description: `Multiple tests target ${base} but none use variable extraction (extract) or reference variables ({{}}). Consider chaining them by extracting an ID from a POST/GET and reusing it in subsequent tests.`,
        testTemplate: null
      });
    }
  }

  // --- Rule (i): Missing boundary tests (medium) ---
  for (const t of allTests) {
    const method = (t.method || 'GET').toUpperCase();
    if (method !== 'POST' && method !== 'PUT') continue;
    const status = Number(t.expectedStatus) || 200;
    if (status >= 400) continue; // already an error test

    const base = getBasePath(t.endpoint);
    const hasBoundary = allTests.some(
      ot => getBasePath(ot.endpoint) === base &&
            (ot.method || 'GET').toUpperCase() === method &&
            Number(ot.expectedStatus) >= 400 &&
            ot.body && Object.keys(ot.body).length === 0
    );
    if (!hasBoundary) {
      suggestions.push({
        priority: 'medium',
        category: 'Boundary Testing',
        title: `Add boundary test with empty body for ${method} ${base}`,
        description: `A successful ${method} test exists for ${base} but there is no test sending an empty body or missing required fields to verify validation handling.`,
        testTemplate: {
          name: `${method} ${base} - empty body (boundary)`,
          method: method,
          endpoint: t.endpoint,
          expectedStatus: 400,
          validations: [
            { type: 'exists', path: '$.message' }
          ],
          body: {},
          queryParams: {},
          extract: {},
          headers: {},
          tags: ['boundary', 'suggested']
        }
      });
    }
  }

  // --- Rule (j): No pagination test (low) ---
  for (const t of allTests) {
    if (!isListEndpoint(t.endpoint)) continue;
    const method = (t.method || 'GET').toUpperCase();
    if (method !== 'GET') continue;

    const base = getBasePath(t.endpoint);
    const hasPagination = allTests.some(ot => {
      if (getBasePath(ot.endpoint) !== base) return false;
      if ((ot.method || 'GET').toUpperCase() !== 'GET') return false;
      const params = ot.queryParams || {};
      const paramKeys = Object.keys(params).map(k => k.toLowerCase());
      return paramKeys.some(k => k === 'page' || k === 'limit' || k === 'offset' || k === 'per_page' || k === 'pagesize');
    });

    if (!hasPagination) {
      suggestions.push({
        priority: 'low',
        category: 'Pagination',
        title: `Add pagination test for GET ${base}`,
        description: `GET ${base} appears to be a list endpoint but no test includes pagination query parameters (page, limit, offset). Consider testing pagination behavior.`,
        testTemplate: {
          name: `GET ${base} - pagination`,
          method: 'GET',
          endpoint: t.endpoint,
          expectedStatus: 200,
          validations: [],
          body: null,
          queryParams: { page: '1', limit: '10' },
          extract: {},
          headers: {},
          tags: ['pagination', 'suggested']
        }
      });
    }
  }

  // Deduplicate by title
  const seen = new Set();
  const deduplicated = [];
  for (const s of suggestions) {
    if (!seen.has(s.title)) {
      seen.add(s.title);
      deduplicated.push(s);
    }
  }

  // Sort: high -> medium -> low
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  deduplicated.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  return deduplicated;
}

/**
 * Applies a test template by opening the test editor pre-filled with the template data.
 * Adds it to the first suite by default.
 */
function applySuggestionTemplate(template) {
  if (!template || !currentSuites || currentSuites.length === 0) {
    toast('No suite available to add the test to', 'error');
    return;
  }

  // Use the first suite
  const suiteIdx = 0;
  editingSuiteFile = currentSuites[suiteIdx].fileName;
  editingTestIdx = null;

  resetTestModal();
  document.getElementById('test-modal-title').textContent = 'New Test Case (Suggested)';

  // Pre-fill fields from template
  document.getElementById('tm-name').value = template.name || '';
  document.getElementById('tm-method').value = template.method || 'GET';
  document.getElementById('tm-endpoint').value = template.endpoint || '';
  document.getElementById('tm-status').value = template.expectedStatus || 200;

  // Query params
  if (template.queryParams && Object.keys(template.queryParams).length > 0) {
    for (const [k, v] of Object.entries(template.queryParams)) {
      addKvRow('tm-params-kv', k, v);
    }
  }

  // Headers
  if (template.headers && Object.keys(template.headers).length > 0) {
    for (const [k, v] of Object.entries(template.headers)) {
      addKvRow('tm-headers-kv', k, v);
    }
  }

  // Body
  if (template.body !== null && template.body !== undefined) {
    setBodyValue(JSON.stringify(template.body, null, 2));
  }

  // Validations
  if (template.validations && template.validations.length > 0) {
    template.validations.forEach(v => addValidationRow(v));
  }

  // Extract
  if (template.extract && Object.keys(template.extract).length > 0) {
    for (const [varName, path] of Object.entries(template.extract)) {
      addExtractRow(varName, path);
    }
  }

  // Tags
  if (template.tags && template.tags.length > 0) {
    document.getElementById('tm-tags').value = template.tags.join(', ');
  }

  document.getElementById('test-modal').classList.add('open');
  initVarAutocompleteFields();
  updateBreadcrumb();

  toast('Template applied — review and save the test', 'info');
}

/**
 * Returns priority badge HTML.
 */
function priorityBadge(priority) {
  const colors = {
    high: { bg: 'var(--red, #e53e3e)', label: 'HIGH' },
    medium: { bg: 'var(--yellow, #d69e2e)', label: 'MED' },
    low: { bg: 'var(--green, #38a169)', label: 'LOW' }
  };
  const c = colors[priority] || colors.low;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;color:#fff;background:${c.bg};letter-spacing:0.5px;">${c.label}</span>`;
}

/**
 * Renders the test suggestions panel inside #run-result.
 */
function showTestSuggestions() {
  const suggestions = analyzeAndSuggest();
  const resultDiv = document.getElementById('run-result');

  if (!resultDiv) {
    toast('Could not find result panel', 'error');
    return;
  }

  if (suggestions.length === 0) {
    resultDiv.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>Test Suggestions</h3>
          <button class="icon-btn" onclick="document.getElementById('run-result').innerHTML=''" title="Close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div class="card-body" style="text-align:center;padding:32px;">
          <span class="material-symbols-rounded" style="font-size:48px;color:var(--green,#38a169);margin-bottom:8px;display:block;">check_circle</span>
          <p style="color:var(--text-muted);margin:0;">Great job! No suggestions found &mdash; your test coverage looks solid.</p>
        </div>
      </div>`;
    return;
  }

  const highCount = suggestions.filter(s => s.priority === 'high').length;
  const medCount = suggestions.filter(s => s.priority === 'medium').length;
  const lowCount = suggestions.filter(s => s.priority === 'low').length;

  // Group by priority
  const grouped = { high: [], medium: [], low: [] };
  for (const s of suggestions) {
    (grouped[s.priority] || grouped.low).push(s);
  }

  let cardsHtml = '';

  const sectionLabels = {
    high: 'High Priority',
    medium: 'Medium Priority',
    low: 'Low Priority'
  };

  const sectionIcons = {
    high: 'error',
    medium: 'warning',
    low: 'info'
  };

  const sectionColors = {
    high: 'var(--red, #e53e3e)',
    medium: 'var(--yellow, #d69e2e)',
    low: 'var(--green, #38a169)'
  };

  for (const prio of ['high', 'medium', 'low']) {
    const items = grouped[prio];
    if (items.length === 0) continue;

    cardsHtml += `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:4px 0;">
          <span class="material-symbols-rounded" style="font-size:18px;color:${sectionColors[prio]};">${sectionIcons[prio]}</span>
          <span style="font-weight:600;font-size:13px;color:${sectionColors[prio]};">${sectionLabels[prio]}</span>
          <span style="font-size:12px;color:var(--text-muted);">(${items.length})</span>
        </div>`;

    for (let i = 0; i < items.length; i++) {
      const s = items[i];
      const templateId = `suggestion-tpl-${prio}-${i}`;
      const applyBtn = s.testTemplate
        ? `<button class="btn btn-sm" style="font-size:12px;padding:4px 12px;" onclick='applySuggestionTemplate(window.__suggestionTemplates["${templateId}"])'>
            <span class="material-symbols-rounded" style="font-size:14px;vertical-align:-2px;margin-right:2px;">add_circle</span>Apply
          </button>`
        : '';

      cardsHtml += `
        <div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:8px;background:var(--bg-card,var(--bg));">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                ${priorityBadge(s.priority)}
                <span style="font-size:11px;color:var(--text-muted);font-weight:500;">${esc(s.category)}</span>
              </div>
              <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${esc(s.title)}</div>
              <div style="font-size:12px;color:var(--text-muted);line-height:1.5;">${esc(s.description)}</div>
            </div>
            <div style="flex-shrink:0;padding-top:2px;">
              ${applyBtn}
            </div>
          </div>
        </div>`;

      // Store template on window for onclick access
      if (s.testTemplate) {
        if (!window.__suggestionTemplates) window.__suggestionTemplates = {};
        window.__suggestionTemplates[templateId] = s.testTemplate;
      }
    }

    cardsHtml += '</div>';
  }

  resultDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Test Suggestions</h3>
        <button class="icon-btn" onclick="document.getElementById('run-result').innerHTML='';window.__suggestionTemplates={};" title="Close">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:10px 14px;border-radius:8px;background:var(--bg-hover,#f7f7f8);border:1px solid var(--border);">
          <span class="material-symbols-rounded" style="font-size:22px;color:var(--accent);">lightbulb</span>
          <div>
            <span style="font-weight:600;font-size:14px;">${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''} found</span>
            <span style="color:var(--text-muted);font-size:13px;margin-left:6px;">&mdash;</span>
            <span style="color:var(--red,#e53e3e);font-weight:600;font-size:13px;margin-left:6px;">${highCount} high</span>
            <span style="color:var(--text-muted);font-size:13px;margin-left:2px;">/</span>
            <span style="color:var(--yellow,#d69e2e);font-weight:600;font-size:13px;margin-left:2px;">${medCount} medium</span>
            <span style="color:var(--text-muted);font-size:13px;margin-left:2px;">/</span>
            <span style="color:var(--green,#38a169);font-weight:600;font-size:13px;margin-left:2px;">${lowCount} low</span>
          </div>
        </div>
        ${cardsHtml}
      </div>
    </div>`;
}
