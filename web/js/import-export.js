// --- Import / Export ---

function exportProject() {
  if (!currentProject) return;
  const bundle = {
    version: 1,
    type: 'project-bundle',
    exportedAt: new Date().toISOString(),
    project: currentProject,
    suites: currentSuites.map(s => {
      const { fileName, ...suiteData } = s;
      return { fileName, ...suiteData };
    })
  };
  const filename = `${currentProject.id}-export.json`;
  downloadJson(bundle, filename);
  toast('Project exported');
}

function exportSuite(suiteIdx) {
  const suite = currentSuites[suiteIdx];
  if (!suite) return;
  const { fileName, ...suiteData } = suite;
  const bundle = {
    version: 1,
    type: 'suite',
    exportedAt: new Date().toISOString(),
    ...suiteData
  };
  const filename = fileName || suiteData.suite.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
  downloadJson(bundle, filename);
  toast('Suite exported');
}

function triggerImportProject() {
  const input = document.getElementById('import-project-input');
  input.value = '';
  input.click();
}

function triggerImportSuite() {
  const input = document.getElementById('import-suite-input');
  input.value = '';
  input.click();
}

async function handleImportProject(input) {
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const bundle = JSON.parse(text);

    if (bundle.type === 'project-bundle' && bundle.project && bundle.suites) {
      const result = await api('POST', '/api/import/project', bundle);
      toast(`Project imported with ${result.suitesImported} suite(s)`);
      await loadProjects();
      selectProject(result.project.id);
    } else if (bundle.type === 'suite' || (bundle.suite && bundle.tests)) {
      toast('This is a suite file. Use "Import Suite" instead.', 'error');
    } else {
      toast('Invalid project bundle format', 'error');
    }
  } catch (e) {
    toast('Failed to import: ' + e.message, 'error');
  }
}

// --- Postman Import ---

function triggerImportPostman() {
  const input = document.getElementById('import-postman-input');
  input.value = '';
  input.click();
}

async function handleImportPostman(input) {
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const collection = JSON.parse(text);

    if (!collection.info || !collection.item) {
      return toast('Not a valid Postman collection (v2.1)', 'error');
    }

    const projectName = collection.info.name || 'Postman Import';
    const projectId = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Extract base URL from first request if available
    let baseUrl = '';
    const firstReq = findFirstRequest(collection.item);
    if (firstReq) {
      const url = parsePostmanUrl(firstReq.request?.url);
      try {
        const parsed = new URL(url);
        baseUrl = parsed.origin;
      } catch { /* ignore */ }
    }

    // Convert folders to suites, top-level items to a "General" suite
    const suites = [];
    const topLevelTests = [];

    for (const item of collection.item) {
      if (item.item && Array.isArray(item.item)) {
        // Folder → suite
        const tests = item.item
          .filter(i => i.request)
          .map(i => convertPostmanRequest(i, baseUrl));
        if (tests.length > 0) {
          suites.push({
            fileName: (item.name || 'folder').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json',
            suite: item.name || 'Unnamed Folder',
            tests,
          });
        }
      } else if (item.request) {
        topLevelTests.push(convertPostmanRequest(item, baseUrl));
      }
    }

    if (topLevelTests.length > 0) {
      suites.unshift({
        fileName: 'general.json',
        suite: 'General',
        tests: topLevelTests,
      });
    }

    if (suites.length === 0) {
      return toast('No requests found in collection', 'error');
    }

    // Create project bundle and import
    const bundle = {
      version: 1,
      type: 'project-bundle',
      project: { id: projectId, name: projectName, baseUrl },
      suites,
    };

    const result = await api('POST', '/api/import/project', bundle);
    toast(`Imported "${projectName}" with ${result.suitesImported} suite(s)`);
    await loadProjects();
    selectProject(result.project.id);
  } catch (e) {
    toast('Failed to import Postman collection: ' + e.message, 'error');
  }
}

function findFirstRequest(items) {
  for (const item of items) {
    if (item.request) return item;
    if (item.item) {
      const found = findFirstRequest(item.item);
      if (found) return found;
    }
  }
  return null;
}

function parsePostmanUrl(url) {
  if (!url) return '';
  if (typeof url === 'string') return url;
  // Postman URL object: { raw, protocol, host[], path[] }
  if (url.raw) return url.raw;
  const protocol = url.protocol || 'https';
  const host = Array.isArray(url.host) ? url.host.join('.') : (url.host || '');
  const path = Array.isArray(url.path) ? url.path.join('/') : (url.path || '');
  return `${protocol}://${host}/${path}`;
}

function convertPostmanRequest(item, baseUrl) {
  const req = item.request || {};
  const method = (req.method || 'GET').toUpperCase();
  const fullUrl = parsePostmanUrl(req.url);

  // Extract endpoint (remove base URL)
  let endpoint = fullUrl;
  if (baseUrl && endpoint.startsWith(baseUrl)) {
    endpoint = endpoint.slice(baseUrl.length);
  }
  // Remove leading slash for consistency
  endpoint = endpoint.replace(/^\//, '');

  // Replace Postman variables {{var}} — they already match our format
  // Extract query params from URL object
  const queryParams = {};
  if (req.url && typeof req.url === 'object' && req.url.query) {
    for (const q of req.url.query) {
      if (q.key && !q.disabled) {
        queryParams[q.key] = q.value || '';
      }
    }
  }

  const test = {
    name: item.name || `${method} ${endpoint}`,
    method,
    endpoint,
    expectedStatus: 200,
  };

  if (Object.keys(queryParams).length > 0) test.queryParams = queryParams;

  // Parse body
  if (req.body) {
    if (req.body.mode === 'raw' && req.body.raw) {
      try {
        test.body = JSON.parse(req.body.raw);
      } catch { /* leave as-is if not valid JSON */ }
    }
  }

  return test;
}

// --- OpenAPI / Swagger Import ---

function triggerImportOpenAPI() {
  const input = document.getElementById('import-openapi-input');
  input.value = '';
  input.click();
}

async function handleImportOpenAPI(input) {
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    let spec;
    // Try JSON first, then YAML-like parsing (basic)
    try {
      spec = JSON.parse(text);
    } catch {
      // Basic YAML-to-JSON conversion for simple specs (not full YAML parser)
      return toast('Please provide an OpenAPI spec in JSON format (.json)', 'error');
    }

    // Detect OpenAPI version
    const isSwagger2 = spec.swagger && spec.swagger.startsWith('2');
    const isOpenAPI3 = spec.openapi && spec.openapi.startsWith('3');

    if (!isSwagger2 && !isOpenAPI3) {
      return toast('Not a valid OpenAPI/Swagger spec (need swagger 2.x or openapi 3.x)', 'error');
    }

    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      return toast('No paths found in the spec', 'error');
    }

    // Extract base URL
    let baseUrl = '';
    if (isSwagger2) {
      const scheme = (spec.schemes || ['https'])[0];
      const host = spec.host || 'localhost';
      const basePath = spec.basePath || '';
      baseUrl = `${scheme}://${host}${basePath}`;
    } else if (isOpenAPI3 && spec.servers?.length > 0) {
      baseUrl = spec.servers[0].url || '';
    }

    // Remove trailing slash from baseUrl
    baseUrl = baseUrl.replace(/\/$/, '');

    const title = spec.info?.title || 'OpenAPI Import';
    const projectId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Group endpoints by tag (or by path prefix if no tags)
    const suiteMap = {}; // tag -> tests[]

    for (const [pathStr, pathObj] of Object.entries(spec.paths)) {
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
      for (const method of methods) {
        const operation = pathObj[method];
        if (!operation) continue;

        const tags = operation.tags?.length > 0 ? operation.tags : ['General'];
        const operationId = operation.operationId || '';
        const summary = operation.summary || '';
        const endpoint = pathStr.replace(/^\//, '').replace(/\{([^}]+)\}/g, '{{$1}}');

        // Build test name
        const name = summary || operationId || `${method.toUpperCase()} ${pathStr}`;

        // Determine expected status
        const responses = operation.responses || {};
        const successStatus = Object.keys(responses).find(s => s.startsWith('2'));
        const expectedStatus = successStatus ? parseInt(successStatus) : 200;

        // Extract path parameters
        const allParams = [...(pathObj.parameters || []), ...(operation.parameters || [])];
        const queryParams = {};
        for (const p of allParams) {
          if (p.in === 'query' && p.name) {
            queryParams[p.name] = p.example ?? p.default ?? `{{${p.name}}}`;
          }
        }

        // Build request body for POST/PUT/PATCH
        let body;
        if (['post', 'put', 'patch'].includes(method)) {
          body = extractRequestBody(operation, spec, isSwagger2);
        }

        // Build basic validations from response schema
        const validations = buildOpenAPIValidations(responses, successStatus, spec, isSwagger2);

        const test = { name, method: method.toUpperCase(), endpoint, expectedStatus };
        if (Object.keys(queryParams).length > 0) test.queryParams = queryParams;
        if (body) test.body = body;
        if (validations.length > 0) test.validations = validations;

        for (const tag of tags) {
          if (!suiteMap[tag]) suiteMap[tag] = [];
          suiteMap[tag].push(test);
        }
      }
    }

    const suites = Object.entries(suiteMap).map(([tag, tests]) => ({
      fileName: tag.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json',
      suite: tag,
      tests,
    }));

    if (suites.length === 0) {
      return toast('No operations found in spec', 'error');
    }

    const totalTests = suites.reduce((sum, s) => sum + s.tests.length, 0);

    const bundle = {
      version: 1,
      type: 'project-bundle',
      project: { id: projectId, name: title, baseUrl },
      suites,
    };

    const result = await api('POST', '/api/import/project', bundle);
    toast(`Imported "${title}" — ${result.suitesImported} suite(s), ${totalTests} test(s)`);
    await loadProjects();
    selectProject(result.project.id);
  } catch (e) {
    toast('Failed to import OpenAPI spec: ' + e.message, 'error');
  }
}

function extractRequestBody(operation, spec, isSwagger2) {
  if (isSwagger2) {
    // Swagger 2.0: body parameter
    const bodyParam = (operation.parameters || []).find(p => p.in === 'body');
    if (bodyParam?.schema) {
      return generateExampleFromSchema(bodyParam.schema, spec, isSwagger2);
    }
  } else {
    // OpenAPI 3.x: requestBody
    const content = operation.requestBody?.content;
    if (content) {
      const jsonContent = content['application/json'] || Object.values(content)[0];
      if (jsonContent?.schema) {
        if (jsonContent.example) return jsonContent.example;
        return generateExampleFromSchema(jsonContent.schema, spec, false);
      }
    }
  }
  return undefined;
}

function buildOpenAPIValidations(responses, successStatus, spec, isSwagger2) {
  const validations = [];
  if (!successStatus) return validations;

  const response = responses[successStatus];
  if (!response) return validations;

  let schema;
  if (isSwagger2) {
    schema = response.schema;
  } else {
    const content = response.content;
    if (content) {
      const jsonContent = content['application/json'] || Object.values(content)[0];
      schema = jsonContent?.schema;
    }
  }

  if (!schema) return validations;

  // Resolve $ref
  schema = resolveRef(schema, spec);

  if (schema.type === 'array') {
    validations.push({ type: 'isArray', path: '' });
    if (schema.items) {
      const itemSchema = resolveRef(schema.items, spec);
      if (itemSchema.properties) {
        const requiredFields = itemSchema.required || Object.keys(itemSchema.properties).slice(0, 3);
        for (const field of requiredFields.slice(0, 3)) {
          validations.push({ type: 'arrayEvery', path: '', validations: [{ type: 'exists', path: field }] });
        }
      }
    }
  } else if (schema.type === 'object' && schema.properties) {
    const requiredFields = schema.required || Object.keys(schema.properties).slice(0, 5);
    for (const field of requiredFields.slice(0, 5)) {
      validations.push({ type: 'exists', path: field });
      const propSchema = resolveRef(schema.properties[field], spec);
      if (propSchema?.type) {
        const typeMap = { string: 'string', integer: 'number', number: 'number', boolean: 'boolean', array: 'object' };
        if (typeMap[propSchema.type]) {
          validations.push({ type: 'typeOf', path: field, expected: typeMap[propSchema.type] });
        }
      }
    }
  }

  return validations;
}

function resolveRef(schema, spec) {
  if (!schema || !schema.$ref) return schema || {};
  const ref = schema.$ref;
  // Handle "#/definitions/Model" (Swagger 2) or "#/components/schemas/Model" (OpenAPI 3)
  const parts = ref.replace(/^#\//, '').split('/');
  let resolved = spec;
  for (const part of parts) {
    resolved = resolved?.[part];
  }
  return resolved || {};
}

function generateExampleFromSchema(schema, spec, isSwagger2) {
  schema = resolveRef(schema, spec);
  if (schema.example) return schema.example;

  if (schema.type === 'object' && schema.properties) {
    const obj = {};
    const fields = schema.required || Object.keys(schema.properties);
    for (const key of fields) {
      const prop = resolveRef(schema.properties[key], spec);
      if (prop.example !== undefined) { obj[key] = prop.example; continue; }
      switch (prop.type) {
        case 'string': obj[key] = prop.enum ? prop.enum[0] : 'string'; break;
        case 'integer': case 'number': obj[key] = 0; break;
        case 'boolean': obj[key] = true; break;
        case 'array': obj[key] = []; break;
        case 'object': obj[key] = {}; break;
        default: obj[key] = null;
      }
    }
    return obj;
  }

  if (schema.type === 'array' && schema.items) {
    return [generateExampleFromSchema(schema.items, spec, isSwagger2)];
  }

  return {};
}

async function handleImportSuite(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!currentProject) return toast('Select a project first', 'error');

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const suiteName = data.suite;
    const tests = data.tests;

    if (!suiteName || !Array.isArray(tests)) {
      return toast('Invalid suite format. Expected { "suite": "...", "tests": [...] }', 'error');
    }

    const suiteData = { suite: suiteName, tests };
    const fileName = suiteName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';

    await api('POST', `/api/projects/${currentProject.id}/suites`, { fileName, ...suiteData });
    toast(`Suite "${suiteName}" imported with ${tests.length} test(s)`);
    await loadSuites();
    renderProjectView();
  } catch (e) {
    toast('Failed to import: ' + e.message, 'error');
  }
}
