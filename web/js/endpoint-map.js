// --- Endpoint Map: Interactive Node Graph Visualization ---

function showEndpointMap() {
  if (!currentSuites || !currentSuites.length) {
    toast('No suites loaded', 'error');
    return;
  }

  const resultDiv = document.getElementById('run-result');

  // --- Build cross-suite chain data ---
  const extractMap = {}; // variableName -> { suiteIdx, testIdx, suiteName, testName }
  const allNodes = [];   // { suiteIdx, testIdx, test, suiteName }
  const allEdges = [];   // { fromSuite, fromTest, toSuite, toTest, variable }

  currentSuites.forEach((s, si) => {
    (s.tests || []).forEach((t, ti) => {
      allNodes.push({ suiteIdx: si, testIdx: ti, test: t, suiteName: s.suite || s.fileName || `Suite ${si + 1}` });
      if (t.extract) {
        Object.keys(t.extract).forEach(v => {
          extractMap[v] = { suiteIdx: si, testIdx: ti, suiteName: s.suite || s.fileName, testName: t.name };
        });
      }
    });
  });

  // Find consumed variables and build edges
  const varRegex = /\{\{(\w+)\}\}/g;
  allNodes.forEach(node => {
    const searchStr = JSON.stringify({
      endpoint: node.test.endpoint,
      body: node.test.body,
      queryParams: node.test.queryParams,
      validations: node.test.validations
    });
    let match;
    const seen = new Set();
    while ((match = varRegex.exec(searchStr)) !== null) {
      const v = match[1];
      if (v.startsWith('$') || seen.has(v)) continue;
      seen.add(v);
      const src = extractMap[v];
      if (src && !(src.suiteIdx === node.suiteIdx && src.testIdx === node.testIdx)) {
        allEdges.push({
          fromSuite: src.suiteIdx, fromTest: src.testIdx,
          toSuite: node.suiteIdx, toTest: node.testIdx,
          variable: v
        });
      }
    }
  });

  // --- Stats ---
  const totalEndpoints = allNodes.length;
  const totalChains = allEdges.length;
  const totalSuites = currentSuites.length;

  // --- Method colors ---
  const methodColors = {
    GET: '#3b82f6', POST: '#16a34a', PUT: '#d97706',
    PATCH: '#8b5cf6', DELETE: '#dc2626', HEAD: '#6b7280', OPTIONS: '#6b7280'
  };

  // --- Layout constants ---
  const NODE_W = 220;
  const NODE_H = 54;
  const NODE_PAD_X = 60;
  const NODE_PAD_Y = 20;
  const SUITE_PAD_X = 40;
  const SUITE_HEADER_H = 36;
  const MARGIN = 40;

  // --- Compute positions per suite (grid layout) ---
  const suitePositions = []; // [{ x, y, w, h, nodes: [{ x, y, nodeRef }] }]
  let curX = MARGIN;

  currentSuites.forEach((s, si) => {
    const tests = s.tests || [];
    if (tests.length === 0) {
      suitePositions.push({ x: curX, y: MARGIN, w: 0, h: 0, nodes: [] });
      return;
    }
    const suiteY = MARGIN;
    const nodePositions = [];
    tests.forEach((t, ti) => {
      const nx = curX;
      const ny = suiteY + SUITE_HEADER_H + ti * (NODE_H + NODE_PAD_Y);
      nodePositions.push({ x: nx, y: ny, suiteIdx: si, testIdx: ti });
    });
    const suiteW = NODE_W;
    const suiteH = SUITE_HEADER_H + tests.length * (NODE_H + NODE_PAD_Y) - NODE_PAD_Y + 16;
    suitePositions.push({ x: curX - 12, y: suiteY - 12, w: suiteW + 24, h: suiteH + 24, nodes: nodePositions });
    curX += NODE_W + NODE_PAD_X + SUITE_PAD_X;
  });

  // Build a lookup: (suiteIdx, testIdx) -> { x, y }
  const posLookup = {};
  suitePositions.forEach(sp => {
    sp.nodes.forEach(n => {
      posLookup[`${n.suiteIdx}:${n.testIdx}`] = n;
    });
  });

  // Total SVG size
  const svgW = Math.max(800, curX + MARGIN);
  const svgH = Math.max(500, Math.max(...suitePositions.map(sp => sp.y + sp.h)) + MARGIN + 40);

  // --- Build HTML ---
  resultDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3><span class="material-symbols-rounded" style="font-size:20px;vertical-align:-4px;margin-right:6px;">hub</span>Endpoint Map</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-accent" id="emap-fit-btn" onclick="emapFitToView()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">fit_screen</span>Fit to View</button>
          <button class="icon-btn" onclick="document.getElementById('run-result').innerHTML=''" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
      </div>
      <div style="display:flex;gap:16px;padding:12px 16px;border-bottom:1px solid var(--border);font-size:13px;color:var(--text-secondary);flex-wrap:wrap;align-items:center;">
        <span><strong style="color:var(--text);font-size:18px;">${totalEndpoints}</strong> endpoints</span>
        <span><strong style="color:var(--text);font-size:18px;">${totalChains}</strong> chain connections</span>
        <span><strong style="color:var(--text);font-size:18px;">${totalSuites}</strong> suites</span>
        <span style="margin-left:auto;display:flex;gap:12px;align-items:center;font-size:11px;">
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:var(--pass);display:inline-block;"></span>Passed</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:var(--fail);display:inline-block;"></span>Failed</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:var(--border);display:inline-block;"></span>Not run</span>
          <span style="display:flex;align-items:center;gap:4px;"><svg width="18" height="10"><line x1="0" y1="5" x2="14" y2="5" stroke="var(--accent)" stroke-width="2"/><polygon points="14,2 18,5 14,8" fill="var(--accent)"/></svg>Variable chain</span>
        </span>
      </div>
      <div id="emap-viewport" style="overflow:hidden;position:relative;height:520px;cursor:grab;background:var(--surface-alt);">
        <svg id="emap-svg" width="${svgW}" height="${svgH}" style="transform-origin:0 0;"></svg>
      </div>
    </div>`;

  // --- Render SVG ---
  const svg = document.getElementById('emap-svg');
  const ns = 'http://www.w3.org/2000/svg';

  // Defs: arrow marker
  const defs = document.createElementNS(ns, 'defs');
  const marker = document.createElementNS(ns, 'marker');
  marker.setAttribute('id', 'emap-arrowhead');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const arrowPoly = document.createElementNS(ns, 'polygon');
  arrowPoly.setAttribute('points', '0 0, 8 3, 0 6');
  arrowPoly.setAttribute('fill', 'var(--accent)');
  marker.appendChild(arrowPoly);
  defs.appendChild(marker);

  // Dimmed arrow marker for non-highlighted state during hover
  const markerDim = document.createElementNS(ns, 'marker');
  markerDim.setAttribute('id', 'emap-arrowhead-dim');
  markerDim.setAttribute('markerWidth', '8');
  markerDim.setAttribute('markerHeight', '6');
  markerDim.setAttribute('refX', '8');
  markerDim.setAttribute('refY', '3');
  markerDim.setAttribute('orient', 'auto');
  const arrowPolyDim = document.createElementNS(ns, 'polygon');
  arrowPolyDim.setAttribute('points', '0 0, 8 3, 0 6');
  arrowPolyDim.setAttribute('fill', 'var(--border)');
  markerDim.appendChild(arrowPolyDim);
  defs.appendChild(markerDim);

  svg.appendChild(defs);

  // --- Draw suite backgrounds ---
  suitePositions.forEach((sp, si) => {
    if (sp.nodes.length === 0) return;
    const suite = currentSuites[si];
    const suiteName = suite.suite || suite.fileName || `Suite ${si + 1}`;

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', sp.x);
    rect.setAttribute('y', sp.y);
    rect.setAttribute('width', sp.w);
    rect.setAttribute('height', sp.h);
    rect.setAttribute('rx', '8');
    rect.setAttribute('fill', 'var(--surface)');
    rect.setAttribute('stroke', 'var(--border)');
    rect.setAttribute('stroke-width', '1');
    svg.appendChild(rect);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', sp.x + 12);
    label.setAttribute('y', sp.y + 20);
    label.setAttribute('font-size', '11');
    label.setAttribute('font-weight', '700');
    label.setAttribute('fill', 'var(--text-muted)');
    label.setAttribute('letter-spacing', '0.5');
    label.textContent = suiteName.toUpperCase();
    svg.appendChild(label);
  });

  // --- Draw edges (behind nodes) ---
  const edgeEls = [];
  allEdges.forEach((edge, ei) => {
    const fromPos = posLookup[`${edge.fromSuite}:${edge.fromTest}`];
    const toPos = posLookup[`${edge.toSuite}:${edge.toTest}`];
    if (!fromPos || !toPos) return;

    const x1 = fromPos.x + NODE_W;
    const y1 = fromPos.y + NODE_H / 2;
    const x2 = toPos.x;
    const y2 = toPos.y + NODE_H / 2;

    // Curved path
    const dx = Math.abs(x2 - x1);
    const cpOffset = Math.max(40, dx * 0.4);
    const d = `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`;

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--accent)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-opacity', '0.5');
    path.setAttribute('marker-end', 'url(#emap-arrowhead)');
    path.dataset.edgeIdx = ei;
    path.dataset.fromKey = `${edge.fromSuite}:${edge.fromTest}`;
    path.dataset.toKey = `${edge.toSuite}:${edge.toTest}`;
    path.classList.add('emap-edge');
    svg.appendChild(path);

    // Label on midpoint
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - 8;
    const lbl = document.createElementNS(ns, 'text');
    lbl.setAttribute('x', mx);
    lbl.setAttribute('y', my);
    lbl.setAttribute('font-size', '10');
    lbl.setAttribute('fill', 'var(--accent)');
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-weight', '600');
    lbl.setAttribute('opacity', '0.7');
    lbl.textContent = edge.variable;
    lbl.classList.add('emap-edge-label');
    lbl.dataset.edgeIdx = ei;
    lbl.dataset.fromKey = `${edge.fromSuite}:${edge.fromTest}`;
    lbl.dataset.toKey = `${edge.toSuite}:${edge.toTest}`;
    svg.appendChild(lbl);

    edgeEls.push({ path, lbl, edge });
  });

  // --- Draw nodes ---
  const nodeEls = [];
  allNodes.forEach((node, ni) => {
    const pos = posLookup[`${node.suiteIdx}:${node.testIdx}`];
    if (!pos) return;

    const t = node.test;
    const method = (t.method || 'GET').toUpperCase();
    const statusKey = `${node.suiteName}::${t.name}`;
    const status = lastRunResults[statusKey];

    let borderColor = 'var(--border)';
    let bgColor = 'var(--surface)';
    if (status === 'passed') { borderColor = 'var(--pass)'; bgColor = 'var(--pass-bg, rgba(34,197,94,0.06))'; }
    else if (status === 'failed') { borderColor = 'var(--fail)'; bgColor = 'var(--fail-bg, rgba(239,68,68,0.06))'; }

    const methodColor = methodColors[method] || 'var(--accent)';

    const g = document.createElementNS(ns, 'g');
    g.classList.add('emap-node');
    g.dataset.nodeKey = `${node.suiteIdx}:${node.testIdx}`;
    g.style.cursor = 'pointer';

    // Main rect
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', pos.x);
    rect.setAttribute('y', pos.y);
    rect.setAttribute('width', NODE_W);
    rect.setAttribute('height', NODE_H);
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', bgColor);
    rect.setAttribute('stroke', borderColor);
    rect.setAttribute('stroke-width', '2');
    g.appendChild(rect);

    // Method stripe
    const stripe = document.createElementNS(ns, 'rect');
    stripe.setAttribute('x', pos.x);
    stripe.setAttribute('y', pos.y);
    stripe.setAttribute('width', '5');
    stripe.setAttribute('height', NODE_H);
    stripe.setAttribute('rx', '6');
    stripe.setAttribute('fill', methodColor);

    // Clip the stripe's right corners to match the main rect shape
    const clipRect = document.createElementNS(ns, 'rect');
    clipRect.setAttribute('x', pos.x);
    clipRect.setAttribute('y', pos.y);
    clipRect.setAttribute('width', '5');
    clipRect.setAttribute('height', NODE_H);
    clipRect.setAttribute('fill', methodColor);
    g.appendChild(clipRect);
    g.appendChild(stripe);

    // Method badge text
    const methodText = document.createElementNS(ns, 'text');
    methodText.setAttribute('x', pos.x + 14);
    methodText.setAttribute('y', pos.y + 20);
    methodText.setAttribute('font-size', '9');
    methodText.setAttribute('font-weight', '800');
    methodText.setAttribute('fill', methodColor);
    methodText.setAttribute('letter-spacing', '0.3');
    methodText.textContent = method;
    g.appendChild(methodText);

    // Test name (truncated)
    const nameText = document.createElementNS(ns, 'text');
    nameText.setAttribute('x', pos.x + 14);
    nameText.setAttribute('y', pos.y + 35);
    nameText.setAttribute('font-size', '12');
    nameText.setAttribute('font-weight', '600');
    nameText.setAttribute('fill', 'var(--text)');
    const maxNameLen = 28;
    const displayName = t.name && t.name.length > maxNameLen ? t.name.slice(0, maxNameLen) + '...' : (t.name || 'Untitled');
    nameText.textContent = displayName;
    g.appendChild(nameText);

    // Endpoint (truncated, secondary color)
    const epText = document.createElementNS(ns, 'text');
    epText.setAttribute('x', pos.x + 14);
    epText.setAttribute('y', pos.y + 48);
    epText.setAttribute('font-size', '10');
    epText.setAttribute('fill', 'var(--text-muted)');
    const ep = t.endpoint || '/';
    const maxEpLen = 32;
    epText.textContent = ep.length > maxEpLen ? ep.slice(0, maxEpLen) + '...' : ep;
    g.appendChild(epText);

    // Status indicator dot
    if (status) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', pos.x + NODE_W - 12);
      dot.setAttribute('cy', pos.y + 12);
      dot.setAttribute('r', '4');
      dot.setAttribute('fill', status === 'passed' ? 'var(--pass)' : status === 'failed' ? 'var(--fail)' : 'var(--border)');
      g.appendChild(dot);
    }

    svg.appendChild(g);
    nodeEls.push({ g, node, pos });

    // --- Interactivity: hover ---
    g.addEventListener('mouseenter', () => emapHighlight(`${node.suiteIdx}:${node.testIdx}`, true));
    g.addEventListener('mouseleave', () => emapHighlight(`${node.suiteIdx}:${node.testIdx}`, false));

    // --- Interactivity: click tooltip ---
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      emapShowTooltip(node, pos, status);
    });
  });

  // --- Store refs for interactivity ---
  window._emapEdgeEls = edgeEls;
  window._emapNodeEls = nodeEls;

  // --- Pan & Zoom ---
  emapInitPanZoom();
}

// --- Highlight connected nodes/edges on hover ---
function emapHighlight(nodeKey, active) {
  const edgeEls = window._emapEdgeEls || [];
  const nodeEls = window._emapNodeEls || [];

  // Find connected node keys
  const connectedKeys = new Set();
  if (active) connectedKeys.add(nodeKey);

  edgeEls.forEach(({ path, lbl, edge }) => {
    const isConnected = path.dataset.fromKey === nodeKey || path.dataset.toKey === nodeKey;
    if (active) {
      if (isConnected) {
        path.setAttribute('stroke-opacity', '1');
        path.setAttribute('stroke-width', '3');
        path.setAttribute('marker-end', 'url(#emap-arrowhead)');
        lbl.setAttribute('opacity', '1');
        lbl.setAttribute('font-size', '11');
        connectedKeys.add(path.dataset.fromKey);
        connectedKeys.add(path.dataset.toKey);
      } else {
        path.setAttribute('stroke-opacity', '0.15');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('marker-end', 'url(#emap-arrowhead-dim)');
        lbl.setAttribute('opacity', '0.2');
      }
    } else {
      path.setAttribute('stroke-opacity', '0.5');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('marker-end', 'url(#emap-arrowhead)');
      lbl.setAttribute('opacity', '0.7');
      lbl.setAttribute('font-size', '10');
    }
  });

  nodeEls.forEach(({ g }) => {
    if (active) {
      const key = g.dataset.nodeKey;
      g.style.opacity = connectedKeys.has(key) ? '1' : '0.3';
    } else {
      g.style.opacity = '1';
    }
  });
}

// --- Tooltip on click ---
function emapShowTooltip(node, pos, status) {
  // Remove existing tooltip
  const old = document.getElementById('emap-tooltip');
  if (old) old.remove();

  const t = node.test;
  const method = (t.method || 'GET').toUpperCase();
  const validCount = (t.validations || []).length;
  const extractCount = t.extract ? Object.keys(t.extract).length : 0;
  const statusLabel = status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : status === 'skipped' ? 'Skipped' : 'Not run';
  const statusColor = status === 'passed' ? 'var(--pass)' : status === 'failed' ? 'var(--fail)' : 'var(--text-muted)';

  const tooltip = document.createElement('div');
  tooltip.id = 'emap-tooltip';
  tooltip.style.cssText = `
    position:absolute;z-index:100;background:var(--surface);border:1px solid var(--border);
    border-radius:var(--radius);padding:12px 14px;font-size:12px;min-width:200px;max-width:300px;
    box-shadow:0 8px 24px rgba(0,0,0,0.15);pointer-events:auto;
  `;

  tooltip.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong style="color:var(--text);font-size:13px;">${esc(t.name || 'Untitled')}</strong>
      <span style="cursor:pointer;color:var(--text-muted);font-size:16px;line-height:1;" onclick="this.parentElement.parentElement.remove()">&times;</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;color:var(--text-secondary);">
      <div><strong>Method:</strong> <span style="font-weight:700;">${esc(method)}</span></div>
      <div><strong>Endpoint:</strong> <code style="font-size:11px;background:var(--surface-alt);padding:1px 4px;border-radius:3px;">${esc(t.endpoint || '/')}</code></div>
      <div><strong>Expected:</strong> ${t.expectedStatus || '—'}</div>
      <div><strong>Validations:</strong> ${validCount}</div>
      ${extractCount > 0 ? `<div><strong>Extracts:</strong> ${Object.keys(t.extract).map(k => '<code style="font-size:10px;background:var(--accent-bg);color:var(--accent);padding:1px 4px;border-radius:3px;">' + esc(k) + '</code>').join(' ')}</div>` : ''}
      <div><strong>Status:</strong> <span style="color:${statusColor};font-weight:600;">${statusLabel}</span></div>
    </div>
  `;

  // Position the tooltip relative to the viewport
  const viewport = document.getElementById('emap-viewport');
  const svgEl = document.getElementById('emap-svg');
  if (!viewport || !svgEl) return;

  // Get current transform
  const transform = window._emapTransform || { x: 0, y: 0, scale: 1 };
  const tipX = pos.x * transform.scale + transform.x + 230 * transform.scale;
  const tipY = pos.y * transform.scale + transform.y;

  tooltip.style.left = tipX + 'px';
  tooltip.style.top = Math.max(4, tipY) + 'px';

  viewport.appendChild(tooltip);

  // Close on outside click
  const closeHandler = (e) => {
    if (!tooltip.contains(e.target) && !e.target.closest('.emap-node')) {
      tooltip.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 10);
}

// --- Pan & Zoom ---
function emapInitPanZoom() {
  const viewport = document.getElementById('emap-viewport');
  const svg = document.getElementById('emap-svg');
  if (!viewport || !svg) return;

  const state = { x: 0, y: 0, scale: 1, dragging: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
  window._emapTransform = state;

  function applyTransform() {
    svg.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  }

  // Mouse wheel zoom
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.15, Math.min(3, state.scale * delta));

    // Zoom toward cursor
    state.x = mx - (mx - state.x) * (newScale / state.scale);
    state.y = my - (my - state.y) * (newScale / state.scale);
    state.scale = newScale;

    applyTransform();
  }, { passive: false });

  // Pan via drag
  viewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('.emap-node') || e.target.id === 'emap-tooltip' || e.target.closest('#emap-tooltip')) return;
    state.dragging = true;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.startTx = state.x;
    state.startTy = state.y;
    viewport.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.dragging) return;
    state.x = state.startTx + (e.clientX - state.startX);
    state.y = state.startTy + (e.clientY - state.startY);
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    if (state.dragging) {
      state.dragging = false;
      const vp = document.getElementById('emap-viewport');
      if (vp) vp.style.cursor = 'grab';
    }
  });

  // Close tooltip on background click
  viewport.addEventListener('click', (e) => {
    if (!e.target.closest('.emap-node') && !e.target.closest('#emap-tooltip')) {
      const tt = document.getElementById('emap-tooltip');
      if (tt) tt.remove();
    }
  });

  // Initial fit
  emapFitToView();
}

function emapFitToView() {
  const viewport = document.getElementById('emap-viewport');
  const svg = document.getElementById('emap-svg');
  if (!viewport || !svg) return;

  const state = window._emapTransform;
  if (!state) return;

  const svgW = parseFloat(svg.getAttribute('width'));
  const svgH = parseFloat(svg.getAttribute('height'));
  const vpW = viewport.clientWidth;
  const vpH = viewport.clientHeight;

  if (svgW === 0 || svgH === 0) return;

  const scaleX = vpW / svgW;
  const scaleY = vpH / svgH;
  const scale = Math.min(scaleX, scaleY, 1) * 0.92;

  state.scale = scale;
  state.x = (vpW - svgW * scale) / 2;
  state.y = (vpH - svgH * scale) / 2;

  svg.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}
