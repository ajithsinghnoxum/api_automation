// --- Coverage Heatmap ---

function showCoverageHeatmap() {
  const resultDiv = document.getElementById('run-result');
  if (!currentProject || !currentSuites || currentSuites.length === 0) {
    resultDiv.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>Coverage Heatmap</h3>
          <button class="icon-btn" onclick="document.getElementById('run-result').innerHTML=''" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="card-body" style="padding:32px;text-align:center;color:var(--text-muted);">
          <span class="material-symbols-rounded" style="font-size:48px;opacity:0.4;">grid_off</span>
          <p style="margin-top:12px;">No test suites loaded. Select a project with tests to view coverage.</p>
        </div>
      </div>`;
    return;
  }

  const analysis = analyzeCoverage();
  resultDiv.innerHTML = renderCoverageHeatmap(analysis);
}

function analyzeCoverage() {
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  // endpointMap: { "METHOD /path": [{ test, suite, validations }] }
  const endpointMap = {};
  // pathMap: { "/basepath": { METHOD: [tests] } }
  const pathMap = {};
  let totalTests = 0;
  const validationTypesGlobal = new Set();

  currentSuites.forEach(suite => {
    (suite.tests || []).forEach(test => {
      totalTests++;
      const method = (test.method || 'GET').toUpperCase();
      const endpoint = test.endpoint || '/';
      const key = method + ' ' + endpoint;

      if (!endpointMap[key]) endpointMap[key] = [];
      endpointMap[key].push({ test, suiteName: suite.suite, validations: test.validations || [] });

      // Extract base path: first two segments or the whole path
      const basePath = extractBasePath(endpoint);

      if (!pathMap[basePath]) {
        pathMap[basePath] = {};
        METHODS.forEach(m => { pathMap[basePath][m] = []; });
      }
      if (!pathMap[basePath][method]) pathMap[basePath][method] = [];
      pathMap[basePath][method].push({ test, suiteName: suite.suite, validations: test.validations || [] });

      // Collect validation types
      (test.validations || []).forEach(v => {
        if (v.type) validationTypesGlobal.add(v.type);
      });
    });
  });

  // Compute unique method+endpoint combos tested
  const uniqueEndpoints = Object.keys(endpointMap).length;

  // Compute validation depth per endpoint key
  const validationDepth = {};
  for (const [key, tests] of Object.entries(endpointMap)) {
    const types = new Set();
    tests.forEach(t => (t.validations || []).forEach(v => { if (v.type) types.add(v.type); }));
    validationDepth[key] = { count: types.size, types: [...types] };
  }

  // Detect missing methods
  const missing = detectMissingMethods(pathMap, METHODS);

  // Coverage score: percentage of method+path combos that have at least 1 test
  // out of all method+path combos that exist across all base paths
  const totalPossibleCombos = Object.keys(pathMap).length * METHODS.length;
  let coveredCombos = 0;
  for (const basePath of Object.keys(pathMap)) {
    METHODS.forEach(m => {
      if (pathMap[basePath][m] && pathMap[basePath][m].length > 0) coveredCombos++;
    });
  }
  const coverageScore = totalPossibleCombos > 0 ? Math.round((coveredCombos / totalPossibleCombos) * 100) : 0;

  // Avg tests per endpoint
  const avgTestsPerEndpoint = uniqueEndpoints > 0 ? (totalTests / uniqueEndpoints).toFixed(1) : '0';

  // Validation coverage: endpoints with at least 1 validation / total endpoints
  let endpointsWithValidation = 0;
  for (const tests of Object.values(endpointMap)) {
    if (tests.some(t => t.validations && t.validations.length > 0)) endpointsWithValidation++;
  }
  const validationCoverage = uniqueEndpoints > 0 ? Math.round((endpointsWithValidation / uniqueEndpoints) * 100) : 0;

  return {
    METHODS,
    pathMap,
    endpointMap,
    validationDepth,
    missing,
    coverageScore,
    uniqueEndpoints,
    totalTests,
    avgTestsPerEndpoint,
    validationCoverage,
    totalPossibleCombos,
    coveredCombos
  };
}

function extractBasePath(endpoint) {
  // Normalize: remove query string, trim trailing slash
  let path = (endpoint || '/').split('?')[0].replace(/\/+$/, '') || '/';
  // Split into segments
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  // Take first segment as the base, collapse path params
  // e.g., /users/123/posts -> /users, /users/:id -> /users
  const base = '/' + segments[0];
  return base;
}

function detectMissingMethods(pathMap, METHODS) {
  const missing = [];
  const methodsPresent = {};

  for (const [basePath, methods] of Object.entries(pathMap)) {
    const present = METHODS.filter(m => methods[m] && methods[m].length > 0);
    methodsPresent[basePath] = present;
  }

  for (const [basePath, present] of Object.entries(methodsPresent)) {
    if (present.length === 0) continue;

    // Common REST patterns: if GET exists, suggest POST and DELETE
    const has = m => present.includes(m);

    if (has('GET') && !has('POST')) {
      missing.push({ method: 'POST', path: basePath, reason: 'Has GET but no POST (create)' });
    }
    if (has('GET') && !has('DELETE')) {
      missing.push({ method: 'DELETE', path: basePath, reason: 'Has GET but no DELETE (remove)' });
    }
    if (has('POST') && !has('GET')) {
      missing.push({ method: 'GET', path: basePath, reason: 'Has POST but no GET (read)' });
    }
    if ((has('PUT') || has('PATCH')) && !has('GET')) {
      missing.push({ method: 'GET', path: basePath, reason: 'Has update methods but no GET (read)' });
    }
    if (has('GET') && has('POST') && !has('PUT') && !has('PATCH')) {
      missing.push({ method: 'PUT', path: basePath, reason: 'Has GET and POST but no update method' });
    }
  }

  // Deduplicate
  const seen = new Set();
  return missing.filter(m => {
    const key = m.method + ' ' + m.path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderCoverageHeatmap(a) {
  const METHODS = a.METHODS;
  const sortedPaths = Object.keys(a.pathMap).sort();

  // Stats summary
  const statsHtml = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
      ${hmStatCard('dns', 'Total Endpoints', a.uniqueEndpoints)}
      ${hmStatCard('science', 'Total Tests', a.totalTests)}
      ${hmStatCard('avg_pace', 'Tests / Endpoint', a.avgTestsPerEndpoint)}
      ${hmStatCard('verified', 'Validation Coverage', a.validationCoverage + '%')}
    </div>`;

  // Coverage score
  const scoreColor = a.coverageScore >= 70 ? 'var(--pass)' : a.coverageScore >= 40 ? 'var(--warn)' : 'var(--fail)';
  const scoreHtml = `
    <div style="text-align:center;padding:20px 0 24px;">
      <div style="font-size:64px;font-weight:700;color:${scoreColor};line-height:1;">${a.coverageScore}%</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">
        Coverage Score &mdash; ${a.coveredCombos} of ${a.totalPossibleCombos} method+path combinations tested
      </div>
    </div>`;

  // Heatmap grid
  const gridHtml = renderHeatmapGrid(sortedPaths, METHODS, a.pathMap);

  // Validation depth
  const depthHtml = renderValidationDepth(a.endpointMap, a.validationDepth);

  // Missing methods
  const missingHtml = renderMissingSuggestions(a.missing);

  return `
    <div class="card">
      <div class="card-header">
        <h3><span class="material-symbols-rounded" style="font-size:20px;vertical-align:-4px;margin-right:6px;">grid_view</span>Coverage Heatmap</h3>
        <button class="icon-btn" onclick="document.getElementById('run-result').innerHTML=''" title="Close"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div class="card-body" style="padding:20px;">
        ${statsHtml}
        ${scoreHtml}
        <div style="border-top:1px solid var(--border);padding-top:20px;">
          <h4 style="margin:0 0 12px;font-size:14px;color:var(--text-secondary);">
            <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">view_module</span>
            Endpoint Grid
          </h4>
          ${gridHtml}
        </div>
        <div style="border-top:1px solid var(--border);margin-top:20px;padding-top:20px;">
          <h4 style="margin:0 0 12px;font-size:14px;color:var(--text-secondary);">
            <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">assessment</span>
            Validation Depth
          </h4>
          ${depthHtml}
        </div>
        ${missingHtml}
      </div>
    </div>`;
}

function hmStatCard(icon, label, value) {
  return `
    <div style="background:var(--surface-alt);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;text-align:center;">
      <div style="margin-bottom:4px;">
        <span class="material-symbols-rounded" style="font-size:20px;color:var(--accent);vertical-align:-4px;">${icon}</span>
      </div>
      <div style="font-size:22px;font-weight:700;color:var(--text);">${value}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${label}</div>
    </div>`;
}

function renderHeatmapGrid(sortedPaths, METHODS, pathMap) {
  if (sortedPaths.length === 0) {
    return '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">No endpoints found.</div>';
  }

  const colCount = METHODS.length + 1; // path column + method columns
  let html = `
    <div class="hm-grid" style="display:grid;grid-template-columns:minmax(120px,auto) repeat(${METHODS.length},minmax(60px,80px));gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">`;

  // Header row
  html += `<div class="hm-header" style="background:var(--surface-alt);padding:8px 12px;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;">Endpoint</div>`;
  METHODS.forEach(m => {
    html += `<div class="hm-header" style="background:var(--surface-alt);padding:8px 6px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:center;">${m}</div>`;
  });

  // Data rows
  sortedPaths.forEach(basePath => {
    html += `<div class="hm-path" style="background:var(--surface);padding:8px 12px;font-size:13px;font-weight:500;font-family:monospace;color:var(--text);display:flex;align-items:center;">${esc(basePath)}</div>`;
    METHODS.forEach(method => {
      const tests = pathMap[basePath][method] || [];
      const count = tests.length;
      const cellId = 'hm-cell-' + basePath.replace(/[^a-zA-Z0-9]/g, '_') + '-' + method;
      let bgColor, textColor;
      if (count === 0) {
        bgColor = 'var(--surface)';
        textColor = 'var(--text-muted)';
      } else if (count >= 3) {
        bgColor = 'var(--pass)';
        textColor = '#fff';
      } else {
        bgColor = 'var(--pass-bg)';
        textColor = 'var(--pass)';
      }

      const cursor = count > 0 ? 'cursor:pointer;' : '';
      const onclick = count > 0 ? `onclick="hmShowCellTests('${esc(basePath)}','${method}')"` : '';

      html += `<div id="${cellId}" class="hm-cell" style="background:${bgColor};color:${textColor};padding:8px 6px;text-align:center;font-size:14px;font-weight:600;${cursor}transition:opacity 0.15s;" ${onclick} title="${method} ${esc(basePath)}: ${count} test${count !== 1 ? 's' : ''}">${count > 0 ? count : '<span style="opacity:0.3;">&mdash;</span>'}</div>`;
    });
  });

  html += '</div>';

  // Legend
  html += `
    <div style="display:flex;gap:16px;margin-top:10px;font-size:11px;color:var(--text-muted);align-items:center;">
      <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:var(--pass);"></span> 3+ tests</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:var(--pass-bg);border:1px solid var(--pass);"></span> 1-2 tests</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:var(--surface);border:1px solid var(--border);"></span> No tests</span>
    </div>`;

  // Detail popup container
  html += '<div id="hm-cell-detail" style="display:none;margin-top:12px;"></div>';

  return html;
}

function hmShowCellTests(basePath, method) {
  const detailDiv = document.getElementById('hm-cell-detail');
  if (!detailDiv) return;

  const analysis = analyzeCoverage();
  const tests = (analysis.pathMap[basePath] && analysis.pathMap[basePath][method]) || [];

  if (tests.length === 0) {
    detailDiv.style.display = 'none';
    return;
  }

  const rows = tests.map(t => {
    const validCount = (t.validations || []).length;
    const status = t.test.expectedStatus || '—';
    return `
      <tr>
        <td style="padding:6px 10px;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--border);">${esc(t.suiteName)}</td>
        <td style="padding:6px 10px;font-size:13px;border-bottom:1px solid var(--border);">${esc(t.test.name)}</td>
        <td style="padding:6px 10px;font-size:12px;font-family:monospace;color:var(--text-secondary);border-bottom:1px solid var(--border);">${esc(t.test.endpoint || '/')}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:center;border-bottom:1px solid var(--border);">${status}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:center;border-bottom:1px solid var(--border);">${validCount}</td>
      </tr>`;
  }).join('');

  detailDiv.style.display = 'block';
  detailDiv.innerHTML = `
    <div style="background:var(--surface-alt);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
      <div style="padding:10px 14px;font-size:13px;font-weight:600;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
        <span>
          <span class="method-badge method-${method.toLowerCase()}" style="font-size:10px;padding:1px 5px;margin-right:6px;">${method}</span>
          <span style="font-family:monospace;">${esc(basePath)}</span>
          <span style="color:var(--text-muted);font-weight:400;margin-left:8px;">${tests.length} test${tests.length !== 1 ? 's' : ''}</span>
        </span>
        <button class="icon-btn" onclick="document.getElementById('hm-cell-detail').style.display='none'" title="Close"><span class="material-symbols-rounded" style="font-size:18px;">close</span></button>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:var(--surface);">
            <th style="padding:6px 10px;font-size:11px;font-weight:600;text-align:left;color:var(--text-muted);text-transform:uppercase;">Suite</th>
            <th style="padding:6px 10px;font-size:11px;font-weight:600;text-align:left;color:var(--text-muted);text-transform:uppercase;">Test Name</th>
            <th style="padding:6px 10px;font-size:11px;font-weight:600;text-align:left;color:var(--text-muted);text-transform:uppercase;">Endpoint</th>
            <th style="padding:6px 10px;font-size:11px;font-weight:600;text-align:center;color:var(--text-muted);text-transform:uppercase;">Status</th>
            <th style="padding:6px 10px;font-size:11px;font-weight:600;text-align:center;color:var(--text-muted);text-transform:uppercase;">Validations</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderValidationDepth(endpointMap, validationDepth) {
  const entries = Object.entries(validationDepth).sort((a, b) => b[1].count - a[1].count);

  if (entries.length === 0) {
    return '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">No endpoints to analyze.</div>';
  }

  const maxTypes = Math.max(...entries.map(e => e[1].count), 1);

  const rows = entries.map(([key, depth]) => {
    const barWidth = Math.max((depth.count / Math.max(maxTypes, 6)) * 100, 0);
    let label, labelColor;
    if (depth.count >= 6) {
      label = 'Thorough';
      labelColor = 'var(--pass)';
    } else if (depth.count >= 3) {
      label = 'Good';
      labelColor = 'var(--accent)';
    } else {
      label = 'Basic';
      labelColor = 'var(--warn)';
    }

    const parts = key.split(' ');
    const method = parts[0];
    const path = parts.slice(1).join(' ');

    const typesList = depth.types.length > 0 ? depth.types.map(t => esc(t)).join(', ') : 'None';

    return `
      <div style="display:grid;grid-template-columns:minmax(200px,1fr) 1fr auto;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;display:flex;align-items:center;gap:6px;min-width:0;">
          <span class="method-badge method-${method.toLowerCase()}" style="font-size:10px;padding:1px 5px;flex-shrink:0;">${method}</span>
          <span style="font-family:monospace;font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(path)}">${esc(path)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:8px;background:var(--surface-alt);border-radius:4px;overflow:hidden;border:1px solid var(--border);">
            <div style="height:100%;width:${Math.min(barWidth, 100)}%;background:${labelColor};border-radius:4px;transition:width 0.3s;"></div>
          </div>
          <span style="font-size:11px;color:var(--text-muted);min-width:20px;text-align:right;">${depth.count}</span>
        </div>
        <div style="min-width:65px;text-align:right;">
          <span style="font-size:11px;font-weight:600;color:${labelColor};background:${labelColor}18;padding:2px 8px;border-radius:10px;">${label}</span>
        </div>
      </div>`;
  }).join('');

  return `
    <div style="max-height:300px;overflow-y:auto;">
      ${rows}
    </div>
    <div style="display:flex;gap:16px;margin-top:10px;font-size:11px;color:var(--text-muted);align-items:center;">
      <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--warn);"></span> Basic (1-2 types)</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);"></span> Good (3-5 types)</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--pass);"></span> Thorough (6+ types)</span>
    </div>`;
}

function renderMissingSuggestions(missing) {
  if (missing.length === 0) {
    return `
      <div style="border-top:1px solid var(--border);margin-top:20px;padding-top:20px;">
        <h4 style="margin:0 0 8px;font-size:14px;color:var(--text-secondary);">
          <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">check_circle</span>
          No Missing Patterns Detected
        </h4>
        <p style="font-size:13px;color:var(--text-muted);margin:0;">All common REST method patterns are covered.</p>
      </div>`;
  }

  const items = missing.map(m => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:var(--surface-alt);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;">
      <span class="material-symbols-rounded" style="font-size:18px;color:var(--warn);flex-shrink:0;margin-top:1px;">lightbulb</span>
      <div style="min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--text);">
          Missing: <span class="method-badge method-${m.method.toLowerCase()}" style="font-size:10px;padding:1px 5px;">${m.method}</span>
          <span style="font-family:monospace;margin-left:4px;">${esc(m.path)}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${esc(m.reason)}</div>
      </div>
    </div>`).join('');

  return `
    <div style="border-top:1px solid var(--border);margin-top:20px;padding-top:20px;">
      <h4 style="margin:0 0 12px;font-size:14px;color:var(--text-secondary);">
        <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">lightbulb</span>
        Untested Method Suggestions
        <span style="font-size:11px;font-weight:400;color:var(--text-muted);margin-left:8px;">${missing.length} suggestion${missing.length !== 1 ? 's' : ''}</span>
      </h4>
      ${items}
    </div>`;
}
