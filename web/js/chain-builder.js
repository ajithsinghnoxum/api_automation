// --- Chain Builder / Flow Editor ---

let chainSuiteIdx = null;

function openChainView(suiteIdx) {
  chainSuiteIdx = suiteIdx;
  const suite = currentSuites[suiteIdx];
  if (!suite || !suite.tests?.length) return toast('Suite has no tests', 'error');

  const chain = buildChain(suite.tests);
  renderChain(suite, chain);
  document.getElementById('chain-modal').classList.add('open');
}

function closeChainView() {
  document.getElementById('chain-modal').classList.remove('open');
  chainSuiteIdx = null;
}

// --- Dependency Detection ---

function buildChain(tests) {
  // For each test, find which variables it extracts and which it consumes
  const nodes = tests.map((t, idx) => {
    const extracts = t.extract ? Object.keys(t.extract) : [];
    const consumes = findConsumedVars(t);
    return { idx, test: t, extracts, consumes };
  });

  // Build edges: for each consumed variable, find the test that extracts it
  const edges = []; // { from: idx, to: idx, variable: string }
  const extractMap = {}; // variable -> source test idx
  nodes.forEach(n => {
    n.extracts.forEach(v => { extractMap[v] = n.idx; });
  });

  nodes.forEach(n => {
    n.consumes.forEach(v => {
      if (extractMap[v] !== undefined && extractMap[v] !== n.idx) {
        edges.push({ from: extractMap[v], to: n.idx, variable: v });
      }
    });
  });

  return { nodes, edges };
}

function findConsumedVars(test) {
  const vars = new Set();
  const regex = /\{\{(\w+)\}\}/g;

  // Search in endpoint, body, queryParams, validations
  const searchStr = JSON.stringify({
    endpoint: test.endpoint,
    body: test.body,
    queryParams: test.queryParams,
    validations: test.validations,
    beforeRequest: test.beforeRequest,
    afterResponse: test.afterResponse,
  });

  let match;
  while ((match = regex.exec(searchStr)) !== null) {
    // Skip built-in variables
    if (!match[1].startsWith('$')) {
      vars.add(match[1]);
    }
  }

  return Array.from(vars);
}

// --- Rendering ---

function renderChain(suite, chain) {
  const container = document.getElementById('chain-content');
  const { nodes, edges } = chain;

  // Group edges by target for incoming display
  const incomingByNode = {};
  const outgoingByNode = {};
  edges.forEach(e => {
    (incomingByNode[e.to] ||= []).push(e);
    (outgoingByNode[e.from] ||= []).push(e);
  });

  let html = `<div class="chain-title">${esc(suite.suite)}</div>`;
  html += '<div class="chain-flow">';

  nodes.forEach((node, i) => {
    const t = node.test;
    const incoming = incomingByNode[i] || [];
    const outgoing = outgoingByNode[i] || [];
    const statusKey = suite.suite + '::' + t.method + ' ' + t.endpoint + ' - ' + t.name;
    const lastStatus = lastRunResults[statusKey];
    const statusCls = lastStatus ? ' chain-node-' + lastStatus : '';
    const skipCls = t.skip ? ' chain-node-skipped' : '';

    html += `<div class="chain-node${statusCls}${skipCls}" data-chain-idx="${i}">`;

    // Node header
    html += `<div class="chain-node-header">
      <span class="chain-step">${i + 1}</span>
      <span class="method-badge method-${t.method}">${t.method}</span>
      <span class="chain-node-name">${esc(t.name)}</span>
      ${t.skip ? '<span class="skip-badge">SKIP</span>' : ''}
    </div>`;

    // Endpoint
    html += `<div class="chain-node-endpoint">${esc(t.endpoint)}</div>`;

    // Incoming variables (consumed)
    if (incoming.length > 0) {
      html += '<div class="chain-vars chain-vars-in">';
      html += '<span class="chain-var-label">Uses:</span>';
      incoming.forEach(e => {
        html += `<span class="chain-var-badge chain-var-in" title="From step ${e.from + 1}: ${esc(nodes[e.from].test.name)}">{{${esc(e.variable)}}}</span>`;
      });
      html += '</div>';
    }

    // Outgoing variables (extracts)
    if (node.extracts.length > 0) {
      html += '<div class="chain-vars chain-vars-out">';
      html += '<span class="chain-var-label">Extracts:</span>';
      node.extracts.forEach(v => {
        const usedBy = (outgoingByNode[i] || []).filter(e => e.variable === v);
        const targets = usedBy.map(e => `step ${e.to + 1}`).join(', ');
        const title = targets ? `Used by ${targets}` : 'Not used by other tests';
        html += `<span class="chain-var-badge chain-var-out" title="${title}">${esc(v)} &larr; ${esc(node.test.extract[v])}</span>`;
      });
      html += '</div>';
    }

    // Validations summary
    if (t.validations?.length) {
      html += `<div class="chain-validations">${t.validations.length} validation${t.validations.length !== 1 ? 's' : ''}</div>`;
    }

    html += '</div>'; // .chain-node

    // Arrow connector between nodes
    if (i < nodes.length - 1) {
      const edgesHere = edges.filter(e => e.from === i && e.to === i + 1);
      html += '<div class="chain-connector">';
      html += '<div class="chain-arrow"></div>';
      if (edgesHere.length > 0) {
        html += '<div class="chain-connector-vars">';
        edgesHere.forEach(e => {
          html += `<span class="chain-var-badge chain-var-flow">{{${esc(e.variable)}}}</span>`;
        });
        html += '</div>';
      }
      html += '</div>';
    }
  });

  html += '</div>'; // .chain-flow

  // Summary
  const totalExtracts = nodes.reduce((sum, n) => sum + n.extracts.length, 0);
  const totalEdges = edges.length;
  const orphanVars = [];
  nodes.forEach(n => {
    n.consumes.forEach(v => {
      if (!Object.keys(edges.reduce((map, e) => { map[e.variable] = true; return map; }, {})).includes(v)) {
        // Check if it has a source
        const hasSource = nodes.some(other => other.extracts.includes(v));
        if (!hasSource) orphanVars.push({ test: n.test.name, variable: v });
      }
    });
  });

  html += '<div class="chain-summary">';
  html += `<div class="chain-stat"><strong>${nodes.length}</strong> tests</div>`;
  html += `<div class="chain-stat"><strong>${totalExtracts}</strong> extracted variables</div>`;
  html += `<div class="chain-stat"><strong>${totalEdges}</strong> variable connections</div>`;

  if (orphanVars.length > 0) {
    html += '<div class="chain-warnings">';
    html += '<strong>Warnings:</strong>';
    orphanVars.forEach(o => {
      html += `<div class="chain-warning">Variable <code>{{${esc(o.variable)}}}</code> used in "${esc(o.test)}" but no test extracts it</div>`;
    });
    html += '</div>';
  }

  html += '</div>';

  container.innerHTML = html;
}

// --- Step-Through Execution ---

let chainStepIdx = 0;
let chainStepResults = [];
let chainStepRunning = false;

async function startChainStepThrough() {
  if (chainSuiteIdx === null) return;
  const suite = currentSuites[chainSuiteIdx];
  if (!suite?.tests?.length) return;

  chainStepIdx = 0;
  chainStepResults = [];
  chainStepRunning = true;

  // Reset UI
  document.querySelectorAll('.chain-node').forEach(n => {
    n.classList.remove('chain-node-active', 'chain-node-step-passed', 'chain-node-step-failed');
  });
  document.getElementById('chain-step-panel').innerHTML = '';
  document.getElementById('chain-step-panel').style.display = 'block';
  document.getElementById('chain-step-controls').style.display = 'flex';
  updateStepControls();

  // Highlight first step
  highlightStep(0);
}

function stopChainStepThrough() {
  chainStepRunning = false;
  document.getElementById('chain-step-controls').style.display = 'none';
  document.getElementById('chain-step-panel').style.display = 'none';
}

function updateStepControls() {
  const suite = currentSuites[chainSuiteIdx];
  const total = suite?.tests?.length || 0;
  document.getElementById('chain-step-info').textContent = `Step ${chainStepIdx + 1} of ${total}`;
  document.getElementById('chain-step-next-btn').disabled = chainStepIdx >= total;
  document.getElementById('chain-step-prev-btn').disabled = chainStepIdx <= 0;
}

function highlightStep(idx) {
  document.querySelectorAll('.chain-node').forEach(n => n.classList.remove('chain-node-active'));
  const node = document.querySelector(`.chain-node[data-chain-idx="${idx}"]`);
  if (node) {
    node.classList.add('chain-node-active');
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function executeChainStep() {
  if (chainSuiteIdx === null || !chainStepRunning) return;
  const suite = currentSuites[chainSuiteIdx];
  const test = suite?.tests?.[chainStepIdx];
  if (!test) return;

  const btn = document.getElementById('chain-step-next-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-rounded spin" style="font-size:16px;vertical-align:-3px;">progress_activity</span>';

  const panel = document.getElementById('chain-step-panel');

  try {
    // Build request info
    const payload = {
      method: test.method,
      endpoint: test.endpoint,
      queryParams: test.queryParams,
      body: test.body,
    };

    const result = await api('POST', `/api/projects/${currentProject.id}/try-request`, payload);
    chainStepResults[chainStepIdx] = result;

    // Mark node as passed/failed based on status match
    const node = document.querySelector(`.chain-node[data-chain-idx="${chainStepIdx}"]`);
    const statusMatch = result.status === (test.expectedStatus || 200);
    if (node) {
      node.classList.remove('chain-node-active');
      node.classList.add(statusMatch ? 'chain-node-step-passed' : 'chain-node-step-failed');
    }

    // Show response in panel
    panel.innerHTML = `
      <div class="chain-step-result">
        <div class="chain-step-result-header">
          <span class="method-badge method-${test.method}">${test.method}</span>
          <span>${esc(test.endpoint)}</span>
          <span class="chain-step-status ${statusMatch ? 'status-pass' : 'status-fail'}">${result.status}</span>
          ${!statusMatch ? `<span class="chain-step-expected">(expected ${test.expectedStatus || 200})</span>` : ''}
        </div>
        <div class="chain-step-response">
          <div class="chain-step-response-label">Response Body</div>
          <pre class="chain-step-json">${esc(JSON.stringify(result.data, null, 2))}</pre>
        </div>
        ${result.headers ? `<details class="chain-step-headers">
          <summary>Response Headers</summary>
          <pre class="chain-step-json">${esc(JSON.stringify(result.headers, null, 2))}</pre>
        </details>` : ''}
      </div>`;

    // Move to next step
    chainStepIdx++;
    updateStepControls();
    if (chainStepIdx < suite.tests.length) {
      highlightStep(chainStepIdx);
    }

  } catch (err) {
    const node = document.querySelector(`.chain-node[data-chain-idx="${chainStepIdx}"]`);
    if (node) {
      node.classList.remove('chain-node-active');
      node.classList.add('chain-node-step-failed');
    }
    panel.innerHTML = `<div class="chain-step-result chain-step-error">Request failed. Check that the server is reachable and credentials are configured.</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:2px;">play_arrow</span> Execute Step';
    updateStepControls();
  }
}

function prevChainStep() {
  if (chainStepIdx > 0) {
    chainStepIdx--;
    updateStepControls();
    highlightStep(chainStepIdx);
  }
}
