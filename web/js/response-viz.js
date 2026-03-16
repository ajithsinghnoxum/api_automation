// --- Response Explorer (Collapsible JSON Tree View) ---

let vizData = null;
let vizSearchTerm = '';

function openResponseViz(data) {
  if (!data || (typeof data !== 'object' && !Array.isArray(data))) {
    toast('No structured response data to explore', 'error');
    return;
  }
  vizData = data;
  vizSearchTerm = '';
  if (typeof unlockAchievement === 'function') unlockAchievement('explorer');
  vizExpanded = false;
  const modal = document.getElementById('response-viz-modal');
  modal.classList.add('open');
  const searchInput = document.getElementById('viz-search');
  if (searchInput) searchInput.value = '';
  const toggleBtn = document.getElementById('viz-toggle-expand');
  if (toggleBtn) {
    toggleBtn.querySelector('.material-symbols-rounded').textContent = 'unfold_more';
    toggleBtn.title = 'Expand all';
  }
  renderJsonTree();
}

function closeResponseViz() {
  document.getElementById('response-viz-modal').classList.remove('open');
  vizData = null;
  vizSearchTerm = '';
}

function renderJsonTree() {
  const container = document.getElementById('viz-tree-container');
  const stats = analyzeJson(vizData);
  document.getElementById('viz-stats').textContent =
    `${stats.fields} fields \u2022 ${stats.depth} levels deep \u2022 ${stats.arrays} arrays \u2022 ${stats.objects} objects`;
  container.innerHTML = '';
  const tree = buildTreeNode('Response', vizData, 0, true);
  container.appendChild(tree);
}

function vizSearchChanged(val) {
  vizSearchTerm = val.toLowerCase().trim();
  renderJsonTree();
}

function buildTreeNode(key, value, depth, isRoot) {
  const type = getVizType(value);
  const row = document.createElement('div');
  row.className = 'jt-node';
  if (depth > 0) row.style.marginLeft = '16px';

  const header = document.createElement('div');
  header.className = 'jt-row';

  const isExpandable = type === 'object' || type === 'array';
  const shouldExpand = isRoot || depth < 2;

  // Toggle arrow
  const arrow = document.createElement('span');
  arrow.className = 'jt-arrow' + (isExpandable ? '' : ' jt-arrow-hidden');
  arrow.textContent = shouldExpand ? '\u25BC' : '\u25B6';
  header.appendChild(arrow);

  // Key
  const keyEl = document.createElement('span');
  keyEl.className = 'jt-key';
  keyEl.textContent = key;
  highlightSearch(keyEl);
  header.appendChild(keyEl);

  // Separator
  const sep = document.createElement('span');
  sep.className = 'jt-sep';
  sep.textContent = ': ';
  header.appendChild(sep);

  if (type === 'object') {
    const keys = Object.keys(value);
    const badge = document.createElement('span');
    badge.className = 'jt-badge jt-badge-obj';
    badge.textContent = `{${keys.length}}`;
    header.appendChild(badge);

    // Inline preview when collapsed
    const preview = document.createElement('span');
    preview.className = 'jt-preview';
    preview.textContent = ' ' + getObjectPreview(value);
    if (!shouldExpand) preview.style.display = '';
    else preview.style.display = 'none';
    header.appendChild(preview);

    const children = document.createElement('div');
    children.className = 'jt-children';
    children.style.display = shouldExpand ? '' : 'none';

    for (const k of keys) {
      const child = buildTreeNode(k, value[k], depth + 1, false);
      if (vizSearchTerm && !matchesSearch(k, value[k])) {
        child.style.display = 'none';
      }
      children.appendChild(child);
    }

    arrow.onclick = () => toggleNode(arrow, children, preview);
    header.style.cursor = 'pointer';
    header.onclick = (e) => { if (e.target === header || e.target === keyEl || e.target === badge || e.target === sep) toggleNode(arrow, children, preview); };

    row.appendChild(header);
    row.appendChild(children);

  } else if (type === 'array') {
    const badge = document.createElement('span');
    badge.className = 'jt-badge jt-badge-arr';
    badge.textContent = `[${value.length}]`;
    header.appendChild(badge);

    const preview = document.createElement('span');
    preview.className = 'jt-preview';
    preview.textContent = ' ' + getArrayPreview(value);
    if (!shouldExpand) preview.style.display = '';
    else preview.style.display = 'none';
    header.appendChild(preview);

    const children = document.createElement('div');
    children.className = 'jt-children';
    children.style.display = shouldExpand ? '' : 'none';

    for (let i = 0; i < value.length; i++) {
      const child = buildTreeNode(String(i), value[i], depth + 1, false);
      if (vizSearchTerm && !matchesSearch(String(i), value[i])) {
        child.style.display = 'none';
      }
      children.appendChild(child);
    }

    arrow.onclick = () => toggleNode(arrow, children, preview);
    header.style.cursor = 'pointer';
    header.onclick = (e) => { if (e.target === header || e.target === keyEl || e.target === badge || e.target === sep) toggleNode(arrow, children, preview); };

    row.appendChild(header);
    row.appendChild(children);

  } else {
    // Leaf value
    const valEl = document.createElement('span');
    valEl.className = 'jt-value jt-value-' + type;
    if (value === null || value === undefined) {
      valEl.textContent = 'null';
    } else if (typeof value === 'string') {
      const display = value.length > 120 ? value.slice(0, 120) + '...' : value;
      valEl.textContent = '"' + display + '"';
      if (value.length > 120) {
        valEl.title = value;
        valEl.style.cursor = 'pointer';
        valEl.onclick = () => {
          if (valEl.dataset.expanded === '1') {
            valEl.textContent = '"' + display + '"';
            valEl.dataset.expanded = '0';
          } else {
            valEl.textContent = '"' + value + '"';
            valEl.dataset.expanded = '1';
          }
        };
      }
    } else {
      valEl.textContent = String(value);
    }
    highlightSearch(valEl);
    header.appendChild(valEl);

    // Copy value button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'jt-copy';
    copyBtn.textContent = '\u2398';
    copyBtn.title = 'Copy value';
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      const text = value === null || value === undefined ? 'null' : String(value);
      navigator.clipboard.writeText(text).then(() => toast('Value copied'));
    };
    header.appendChild(copyBtn);

    row.appendChild(header);
  }

  // Copy path button for all nodes
  if (!isRoot) {
    const pathBtn = document.createElement('button');
    pathBtn.className = 'jt-copy-path';
    pathBtn.textContent = '\u29C9';
    pathBtn.title = 'Copy JSON path';
    pathBtn.onclick = (e) => {
      e.stopPropagation();
      const path = getNodePath(row);
      navigator.clipboard.writeText(path).then(() => toast('Path copied: ' + path));
    };
    header.appendChild(pathBtn);
  }

  return row;
}

function toggleNode(arrow, children, preview) {
  const isOpen = children.style.display !== 'none';
  children.style.display = isOpen ? 'none' : '';
  arrow.textContent = isOpen ? '\u25B6' : '\u25BC';
  if (preview) preview.style.display = isOpen ? '' : 'none';
}

let vizExpanded = false;

function toggleExpandCollapse() {
  if (vizExpanded) {
    collapseAll();
  } else {
    expandAll();
  }
  vizExpanded = !vizExpanded;
  const btn = document.getElementById('viz-toggle-expand');
  if (btn) {
    btn.querySelector('.material-symbols-rounded').textContent = vizExpanded ? 'unfold_less' : 'unfold_more';
    btn.title = vizExpanded ? 'Collapse all' : 'Expand all';
  }
}

function expandAll() {
  const container = document.getElementById('viz-tree-container');
  container.querySelectorAll('.jt-children').forEach(c => c.style.display = '');
  container.querySelectorAll('.jt-arrow').forEach(a => { if (!a.classList.contains('jt-arrow-hidden')) a.textContent = '\u25BC'; });
  container.querySelectorAll('.jt-preview').forEach(p => p.style.display = 'none');
}

function collapseAll() {
  const container = document.getElementById('viz-tree-container');
  const allChildren = container.querySelectorAll('.jt-children');
  allChildren.forEach((c, i) => { if (i > 0) c.style.display = 'none'; });
  const allArrows = container.querySelectorAll('.jt-arrow');
  allArrows.forEach((a, i) => { if (!a.classList.contains('jt-arrow-hidden') && i > 0) a.textContent = '\u25B6'; });
  container.querySelectorAll('.jt-preview').forEach((p, i) => { if (i > 0) p.style.display = ''; });
}

function copyFullJson() {
  if (!vizData) return;
  navigator.clipboard.writeText(JSON.stringify(vizData, null, 2)).then(() => toast('JSON copied to clipboard'));
}

// --- Helpers ---

function getVizType(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function getObjectPreview(obj) {
  const keys = Object.keys(obj);
  if (keys.length === 0) return '{}';
  const parts = [];
  for (let i = 0; i < Math.min(keys.length, 4); i++) {
    const v = obj[keys[i]];
    parts.push(keys[i] + ': ' + getShortPreview(v));
  }
  let s = '{ ' + parts.join(', ');
  if (keys.length > 4) s += ', ...';
  return s + ' }';
}

function getArrayPreview(arr) {
  if (arr.length === 0) return '[]';
  const parts = [];
  for (let i = 0; i < Math.min(arr.length, 3); i++) {
    parts.push(getShortPreview(arr[i]));
  }
  let s = '[ ' + parts.join(', ');
  if (arr.length > 3) s += ', ...';
  return s + ' ]';
}

function getShortPreview(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return '"' + (v.length > 20 ? v.slice(0, 20) + '...' : v) + '"';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return '[' + v.length + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).length + '}';
  return String(v);
}

function getNodePath(node) {
  const parts = [];
  let el = node;
  while (el && el.classList) {
    if (el.classList.contains('jt-node')) {
      const keyEl = el.querySelector(':scope > .jt-row > .jt-key');
      if (keyEl) {
        const k = keyEl.textContent;
        if (k !== 'Response') parts.unshift(k);
      }
    }
    el = el.parentElement;
  }
  // Build JSONPath-like string
  let path = '';
  for (const p of parts) {
    if (/^\d+$/.test(p)) path += '[' + p + ']';
    else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p)) path += (path ? '.' : '') + p;
    else path += '["' + p + '"]';
  }
  return path || '$';
}

function matchesSearch(key, value) {
  if (!vizSearchTerm) return true;
  if (key.toLowerCase().includes(vizSearchTerm)) return true;
  if (value !== null && value !== undefined && typeof value !== 'object') {
    if (String(value).toLowerCase().includes(vizSearchTerm)) return true;
  }
  // Check nested
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (matchesSearch(String(i), value[i])) return true;
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const k of Object.keys(value)) {
      if (matchesSearch(k, value[k])) return true;
    }
  }
  return false;
}

function highlightSearch(el) {
  if (!vizSearchTerm || !el.textContent) return;
  const text = el.textContent;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(vizSearchTerm);
  if (idx === -1) return;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + vizSearchTerm.length);
  const after = text.slice(idx + vizSearchTerm.length);
  el.innerHTML = '';
  if (before) el.appendChild(document.createTextNode(before));
  const mark = document.createElement('mark');
  mark.className = 'jt-highlight';
  mark.textContent = match;
  el.appendChild(mark);
  if (after) el.appendChild(document.createTextNode(after));
}

function analyzeJson(data, depth) {
  depth = depth || 0;
  const result = { fields: 0, depth: depth, arrays: 0, objects: 0 };
  if (Array.isArray(data)) {
    result.arrays = 1;
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      const sub = analyzeJson(data[0], depth + 1);
      result.fields += sub.fields;
      result.depth = Math.max(result.depth, sub.depth);
      result.arrays += sub.arrays;
      result.objects += sub.objects;
    }
  } else if (typeof data === 'object' && data !== null) {
    result.objects = 1;
    const keys = Object.keys(data);
    result.fields = keys.length;
    for (const k of keys) {
      if (typeof data[k] === 'object' && data[k] !== null) {
        const sub = analyzeJson(data[k], depth + 1);
        result.fields += sub.fields;
        result.depth = Math.max(result.depth, sub.depth);
        result.arrays += sub.arrays;
        result.objects += sub.objects;
      }
    }
  }
  return result;
}
