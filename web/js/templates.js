// --- Test Templates / CRUD Generator ---

const builtInTemplates = [
  {
    id: 'crud',
    name: 'CRUD Suite',
    description: 'GET all, GET by ID, POST create, PUT update, DELETE — full resource lifecycle',
    icon: 'data_object',
    params: [
      { key: 'resource', label: 'Resource name (plural)', placeholder: 'e.g. users, products, orders' },
      { key: 'resourceSingular', label: 'Singular name', placeholder: 'e.g. user, product, order' },
      { key: 'idField', label: 'ID field name', placeholder: 'e.g. id', default: 'id' }
    ],
    generate(p) {
      const r = p.resource;
      const s = p.resourceSingular || r.replace(/s$/, '');
      const idField = p.idField || 'id';
      return {
        suite: `${capitalize(r)} CRUD`,
        tests: [
          {
            name: `List all ${r}`,
            method: 'GET',
            endpoint: r,
            expectedStatus: 200,
            validations: [
              { type: 'isArray' },
              { type: 'arrayLength', min: 0 }
            ]
          },
          {
            name: `Create ${s}`,
            method: 'POST',
            endpoint: r,
            body: {},
            expectedStatus: 201,
            extract: { [`${s}Id`]: `${idField}` },
            validations: [
              { type: 'exists', path: idField }
            ]
          },
          {
            name: `Get ${s} by ID`,
            method: 'GET',
            endpoint: `${r}/{{${s}Id}}`,
            expectedStatus: 200,
            validations: [
              { type: 'exists', path: idField }
            ]
          },
          {
            name: `Update ${s}`,
            method: 'PUT',
            endpoint: `${r}/{{${s}Id}}`,
            body: {},
            expectedStatus: 200,
            validations: [
              { type: 'exists', path: idField }
            ]
          },
          {
            name: `Delete ${s}`,
            method: 'DELETE',
            endpoint: `${r}/{{${s}Id}}`,
            expectedStatus: 200,
            validations: []
          },
          {
            name: `Verify ${s} deleted`,
            method: 'GET',
            endpoint: `${r}/{{${s}Id}}`,
            expectedStatus: 404,
            validations: []
          }
        ]
      };
    }
  },
  {
    id: 'auth-flow',
    name: 'Auth Flow',
    description: 'Register, login, access protected resource, refresh token, logout',
    icon: 'lock',
    params: [
      { key: 'authEndpoint', label: 'Auth base path', placeholder: 'e.g. auth', default: 'auth' },
      { key: 'protectedEndpoint', label: 'Protected resource', placeholder: 'e.g. users/me, profile', default: 'users/me' },
      { key: 'tokenField', label: 'Token field in response', placeholder: 'e.g. token, accessToken', default: 'token' }
    ],
    generate(p) {
      const auth = p.authEndpoint || 'auth';
      const tokenField = p.tokenField || 'token';
      return {
        suite: 'Auth Flow',
        tests: [
          {
            name: 'Register new user',
            method: 'POST',
            endpoint: `${auth}/register`,
            body: { username: '{{$guid}}', email: 'test_{{$timestamp}}@example.com', password: 'Test@12345' },
            expectedStatus: 201,
            extract: { userId: 'id' },
            validations: [
              { type: 'exists', path: 'id' }
            ]
          },
          {
            name: 'Login',
            method: 'POST',
            endpoint: `${auth}/login`,
            body: { email: 'test_{{$timestamp}}@example.com', password: 'Test@12345' },
            expectedStatus: 200,
            extract: { authToken: tokenField },
            validations: [
              { type: 'exists', path: tokenField },
              { type: 'typeOf', path: tokenField, expected: 'string' }
            ]
          },
          {
            name: 'Access protected resource',
            method: 'GET',
            endpoint: p.protectedEndpoint || 'users/me',
            headers: { Authorization: 'Bearer {{authToken}}' },
            expectedStatus: 200,
            validations: []
          },
          {
            name: 'Access without token (should fail)',
            method: 'GET',
            endpoint: p.protectedEndpoint || 'users/me',
            expectedStatus: 401,
            validations: []
          },
          {
            name: 'Logout',
            method: 'POST',
            endpoint: `${auth}/logout`,
            headers: { Authorization: 'Bearer {{authToken}}' },
            expectedStatus: 200,
            validations: []
          }
        ]
      };
    }
  },
  {
    id: 'pagination',
    name: 'Pagination Check',
    description: 'Verify paginated endpoint returns correct pages, limits, and metadata',
    icon: 'view_list',
    params: [
      { key: 'endpoint', label: 'Endpoint', placeholder: 'e.g. users, products' },
      { key: 'pageParam', label: 'Page parameter', placeholder: 'e.g. page', default: 'page' },
      { key: 'limitParam', label: 'Limit parameter', placeholder: 'e.g. limit, per_page', default: 'limit' },
      { key: 'dataPath', label: 'Data array path in response', placeholder: 'e.g. data, results, items', default: 'data' }
    ],
    generate(p) {
      const ep = p.endpoint;
      const pagePrm = p.pageParam || 'page';
      const limitPrm = p.limitParam || 'limit';
      const dataPath = p.dataPath || 'data';
      return {
        suite: `${capitalize(ep)} Pagination`,
        tests: [
          {
            name: 'First page with limit',
            method: 'GET',
            endpoint: ep,
            queryParams: { [pagePrm]: '1', [limitPrm]: '5' },
            expectedStatus: 200,
            validations: [
              { type: 'isArray', path: dataPath },
              { type: 'arrayLength', path: dataPath, max: 5 }
            ]
          },
          {
            name: 'Second page',
            method: 'GET',
            endpoint: ep,
            queryParams: { [pagePrm]: '2', [limitPrm]: '5' },
            expectedStatus: 200,
            validations: [
              { type: 'isArray', path: dataPath }
            ]
          },
          {
            name: 'Large page number (empty or last)',
            method: 'GET',
            endpoint: ep,
            queryParams: { [pagePrm]: '9999', [limitPrm]: '5' },
            expectedStatus: 200,
            validations: [
              { type: 'isArray', path: dataPath },
              { type: 'arrayLength', path: dataPath, exact: 0 }
            ]
          },
          {
            name: 'Custom limit',
            method: 'GET',
            endpoint: ep,
            queryParams: { [pagePrm]: '1', [limitPrm]: '2' },
            expectedStatus: 200,
            validations: [
              { type: 'isArray', path: dataPath },
              { type: 'arrayLength', path: dataPath, max: 2 }
            ]
          }
        ]
      };
    }
  },
  {
    id: 'health',
    name: 'Health & Status',
    description: 'Health check, readiness, version endpoint, and response time validation',
    icon: 'monitor_heart',
    params: [
      { key: 'healthPath', label: 'Health endpoint', placeholder: 'e.g. health, api/health', default: 'health' },
      { key: 'versionPath', label: 'Version endpoint (optional)', placeholder: 'e.g. version, api/version' }
    ],
    generate(p) {
      const tests = [
        {
          name: 'Health check returns 200',
          method: 'GET',
          endpoint: p.healthPath || 'health',
          expectedStatus: 200,
          validations: []
        },
        {
          name: 'Health check response time',
          method: 'GET',
          endpoint: p.healthPath || 'health',
          expectedStatus: 200,
          timeout: 5000,
          validations: []
        }
      ];
      if (p.versionPath) {
        tests.push({
          name: 'Version endpoint',
          method: 'GET',
          endpoint: p.versionPath,
          expectedStatus: 200,
          validations: [
            { type: 'exists', path: 'version' },
            { type: 'typeOf', path: 'version', expected: 'string' }
          ]
        });
      }
      return { suite: 'Health & Status', tests };
    }
  },
  {
    id: 'search-filter',
    name: 'Search & Filter',
    description: 'Test search queries, filters, sorting, and empty results',
    icon: 'search',
    params: [
      { key: 'endpoint', label: 'Search endpoint', placeholder: 'e.g. users, products/search' },
      { key: 'searchParam', label: 'Search query parameter', placeholder: 'e.g. q, search, query', default: 'q' },
      { key: 'sortParam', label: 'Sort parameter', placeholder: 'e.g. sort, orderBy', default: 'sort' },
      { key: 'dataPath', label: 'Results array path', placeholder: 'e.g. data, results', default: 'data' }
    ],
    generate(p) {
      const ep = p.endpoint;
      const searchPrm = p.searchParam || 'q';
      const sortPrm = p.sortParam || 'sort';
      const dataPath = p.dataPath || 'data';
      return {
        suite: `${capitalize(ep)} Search & Filter`,
        tests: [
          {
            name: 'Search with keyword',
            method: 'GET',
            endpoint: ep,
            queryParams: { [searchPrm]: 'test' },
            expectedStatus: 200,
            validations: [
              { type: 'isArray', path: dataPath }
            ]
          },
          {
            name: 'Search with no results',
            method: 'GET',
            endpoint: ep,
            queryParams: { [searchPrm]: 'zzz_nonexistent_query_zzz' },
            expectedStatus: 200,
            validations: [
              { type: 'isArray', path: dataPath },
              { type: 'arrayLength', path: dataPath, exact: 0 }
            ]
          },
          {
            name: 'Sort ascending',
            method: 'GET',
            endpoint: ep,
            queryParams: { [sortPrm]: 'asc' },
            expectedStatus: 200,
            validations: [
              { type: 'isArray', path: dataPath }
            ]
          },
          {
            name: 'Sort descending',
            method: 'GET',
            endpoint: ep,
            queryParams: { [sortPrm]: 'desc' },
            expectedStatus: 200,
            validations: [
              { type: 'isArray', path: dataPath }
            ]
          },
          {
            name: 'Empty search query',
            method: 'GET',
            endpoint: ep,
            queryParams: { [searchPrm]: '' },
            expectedStatus: 200,
            validations: [
              { type: 'isArray', path: dataPath }
            ]
          }
        ]
      };
    }
  },
  {
    id: 'error-handling',
    name: 'Error Handling',
    description: 'Test 404, 400, 405 responses and error message format',
    icon: 'error',
    params: [
      { key: 'resource', label: 'Resource endpoint', placeholder: 'e.g. users, products' },
      { key: 'errorMsgField', label: 'Error message field', placeholder: 'e.g. message, error', default: 'message' }
    ],
    generate(p) {
      const r = p.resource;
      const msgField = p.errorMsgField || 'message';
      return {
        suite: `${capitalize(r)} Error Handling`,
        tests: [
          {
            name: 'GET non-existent resource (404)',
            method: 'GET',
            endpoint: `${r}/999999999`,
            expectedStatus: 404,
            validations: [
              { type: 'exists', path: msgField }
            ]
          },
          {
            name: 'POST with empty body (400)',
            method: 'POST',
            endpoint: r,
            body: {},
            expectedStatus: 400,
            validations: [
              { type: 'exists', path: msgField }
            ]
          },
          {
            name: 'Invalid endpoint (404)',
            method: 'GET',
            endpoint: `${r}/invalid/path/here`,
            expectedStatus: 404,
            validations: []
          },
          {
            name: 'PATCH unsupported method (405)',
            method: 'PATCH',
            endpoint: r,
            expectedStatus: 405,
            validations: []
          }
        ]
      };
    }
  }
];

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- Template Modal ---

function openTemplateModal() {
  document.getElementById('template-modal').classList.add('open');
  renderTemplateList();
}

function closeTemplateModal() {
  document.getElementById('template-modal').classList.remove('open');
}

function renderTemplateList() {
  const container = document.getElementById('template-content');
  // Combine built-in + custom templates
  const customTemplates = (currentProject && currentProject.customTemplates) || [];
  const allTemplates = [...builtInTemplates, ...customTemplates];

  container.innerHTML = `
    <div class="template-grid">
      ${allTemplates.map(t => `
        <div class="template-card" onclick="selectTemplate('${esc(t.id)}')">
          <span class="material-symbols-rounded template-icon">${esc(t.icon || 'description')}</span>
          <h4>${esc(t.name)}</h4>
          <p>${esc(t.description)}</p>
        </div>
      `).join('')}
    </div>`;
}

function selectTemplate(templateId) {
  const customTemplates = (currentProject && currentProject.customTemplates) || [];
  const allTemplates = [...builtInTemplates, ...customTemplates];
  const tmpl = allTemplates.find(t => t.id === templateId);
  if (!tmpl) return;

  const container = document.getElementById('template-content');
  container.innerHTML = `
    <div class="template-config">
      <button class="btn" onclick="renderTemplateList()" style="margin-bottom:12px;">
        <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:2px;">arrow_back</span> Back to templates
      </button>
      <h3><span class="material-symbols-rounded" style="vertical-align:-5px;margin-right:6px;">${esc(tmpl.icon || 'description')}</span>${esc(tmpl.name)}</h3>
      <p style="color:var(--text-secondary);margin-bottom:16px;">${esc(tmpl.description)}</p>
      <div class="template-params">
        ${(tmpl.params || []).map(p => `
          <div class="form-group" style="margin-bottom:12px;">
            <label>${esc(p.label)}</label>
            <input type="text" id="tpl-param-${esc(p.key)}" placeholder="${esc(p.placeholder || '')}" value="${esc(p.default || '')}" class="input">
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="generateFromTemplate('${esc(templateId)}')">
          <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">auto_fix_high</span>Generate Suite
        </button>
        <button class="btn" onclick="previewTemplate('${esc(templateId)}')">
          <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">visibility</span>Preview
        </button>
      </div>
      <div id="template-preview" style="margin-top:16px;"></div>
    </div>`;
}

function getTemplateParams(tmpl) {
  const params = {};
  (tmpl.params || []).forEach(p => {
    const el = document.getElementById(`tpl-param-${p.key}`);
    params[p.key] = el ? el.value.trim() : (p.default || '');
  });
  return params;
}

function previewTemplate(templateId) {
  const allTemplates = [...builtInTemplates, ...((currentProject && currentProject.customTemplates) || [])];
  const tmpl = allTemplates.find(t => t.id === templateId);
  if (!tmpl) return;

  const params = getTemplateParams(tmpl);

  // Validate required params
  const missing = (tmpl.params || []).filter(p => !p.default && !params[p.key]);
  if (missing.length) {
    toast(`Please fill in: ${missing.map(p => p.label).join(', ')}`, 'error');
    return;
  }

  const result = tmpl.generate(params);
  const previewEl = document.getElementById('template-preview');
  previewEl.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">
      <div style="background:var(--surface-secondary);padding:8px 12px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border);">
        Preview: ${esc(result.suite)} (${result.tests.length} tests)
      </div>
      <div style="max-height:300px;overflow:auto;padding:8px;">
        ${result.tests.map((t, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;${i % 2 ? 'background:var(--surface-secondary);' : ''}">
            <span class="method-badge method-${t.method.toLowerCase()}" style="font-size:11px;padding:2px 6px;">${t.method}</span>
            <span style="font-size:13px;color:var(--text-primary);">${esc(t.name)}</span>
            <span style="font-size:12px;color:var(--text-secondary);margin-left:auto;">${esc(t.endpoint)}</span>
            <span style="font-size:11px;color:var(--text-muted);">${t.expectedStatus}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
}

async function generateFromTemplate(templateId) {
  const allTemplates = [...builtInTemplates, ...((currentProject && currentProject.customTemplates) || [])];
  const tmpl = allTemplates.find(t => t.id === templateId);
  if (!tmpl) return;

  const params = getTemplateParams(tmpl);

  // Validate required params
  const missing = (tmpl.params || []).filter(p => !p.default && !params[p.key]);
  if (missing.length) {
    toast(`Please fill in: ${missing.map(p => p.label).join(', ')}`, 'error');
    return;
  }

  const result = tmpl.generate(params);

  try {
    const fileName = result.suite.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
    await api('POST', `/api/projects/${currentProject.id}/suites`, {
      fileName,
      suite: result.suite,
      tests: result.tests
    });
    toast(`Suite "${result.suite}" created with ${result.tests.length} tests`);
    closeTemplateModal();
    await loadSuites();
    renderProjectView();
  } catch { /* error already toasted by api() */ }
}
