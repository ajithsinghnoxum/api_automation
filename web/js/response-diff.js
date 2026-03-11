// --- Response Comparison / Diff Mode ---

// Capture a snapshot of all test responses
async function captureSnapshot() {
  if (!currentProject) return;

  const btn = document.getElementById('snapshot-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-rounded spin" style="font-size:16px;vertical-align:-3px;">progress_activity</span> Capturing...';
  }

  try {
    const result = await api('POST', `/api/projects/${currentProject.id}/snapshot`);
    toast(`Snapshot captured: ${result.passed} passed, ${result.failed} failed (Run #${result.runId})`);
    // Refresh history
    showRunHistory();
  } catch {
    /* toasted by api() */
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">photo_camera</span>Snapshot';
    }
  }
}

// Compare two runs with response body diff
async function compareRunResponses(runId1, runId2) {
  if (!currentProject) return;

  const resultDiv = document.getElementById('run-result');
  resultDiv.innerHTML = '<div class="shimmer skeleton-card"></div>';

  let data;
  try {
    data = await api('GET', `/api/projects/${currentProject.id}/compare/${runId1}/${runId2}`);
  } catch {
    resultDiv.innerHTML = '';
    return;
  }

  const comparisons = data.comparisons || [];
  let changed = 0, added = 0, removed = 0, unchanged = 0;
  comparisons.forEach(c => {
    if (c.bodyDiff === 'changed') changed++;
    else if (c.bodyDiff === 'added') added++;
    else if (c.bodyDiff === 'removed') removed++;
    else unchanged++;
  });

  const summaryParts = [];
  if (changed) summaryParts.push(`<span style="color:var(--accent);">${changed} changed</span>`);
  if (added) summaryParts.push(`<span style="color:var(--pass);">${added} added</span>`);
  if (removed) summaryParts.push(`<span style="color:var(--fail);">${removed} removed</span>`);
  summaryParts.push(`${unchanged} unchanged`);

  const filterBtns = `
    <div class="diff-filters" style="display:flex;gap:6px;padding:12px 16px;border-bottom:1px solid var(--border);">
      <button class="btn btn-sm diff-filter-btn active" onclick="filterDiffRows('all', this)">All (${comparisons.length})</button>
      <button class="btn btn-sm diff-filter-btn" onclick="filterDiffRows('changed', this)">Changed (${changed})</button>
      <button class="btn btn-sm diff-filter-btn" onclick="filterDiffRows('added', this)">Added (${added})</button>
      <button class="btn btn-sm diff-filter-btn" onclick="filterDiffRows('removed', this)">Removed (${removed})</button>
      <button class="btn btn-sm diff-filter-btn" onclick="filterDiffRows('unchanged', this)">Unchanged (${unchanged})</button>
    </div>`;

  const rows = comparisons.map((c, i) => {
    const s1 = c.run1;
    const s2 = c.run2;
    const statusColor1 = s1 ? (s1.status === 'passed' ? 'var(--pass)' : 'var(--fail)') : 'var(--text-muted)';
    const statusColor2 = s2 ? (s2.status === 'passed' ? 'var(--pass)' : 'var(--fail)') : 'var(--text-muted)';

    const diffIcon = c.bodyDiff === 'changed' ? '<span class="material-symbols-rounded" style="font-size:16px;color:var(--accent);">change_circle</span>'
      : c.bodyDiff === 'added' ? '<span class="material-symbols-rounded" style="font-size:16px;color:var(--pass);">add_circle</span>'
      : c.bodyDiff === 'removed' ? '<span class="material-symbols-rounded" style="font-size:16px;color:var(--fail);">remove_circle</span>'
      : '<span style="font-size:12px;color:var(--text-muted);">—</span>';

    const expandable = c.bodyDiff === 'changed' || c.bodyDiff === 'added' || c.bodyDiff === 'removed';

    return `
      <tr class="diff-row" data-diff-type="${c.bodyDiff}">
        <td class="diff-cell">
          <span class="method-badge method-${(c.method || 'GET').toLowerCase()}" style="font-size:10px;padding:1px 5px;">${c.method || 'GET'}</span>
        </td>
        <td class="diff-cell" style="font-size:13px;">
          <span style="color:var(--text-muted);font-size:11px;">${esc(c.suite)}</span><br>
          <strong>${esc(c.testName)}</strong>
          <span style="font-size:11px;color:var(--text-muted);font-family:monospace;margin-left:6px;">${esc(c.endpoint)}</span>
        </td>
        <td class="diff-cell" style="text-align:center;">
          ${s1 ? `<span style="color:${statusColor1};font-weight:600;font-size:12px;">${s1.httpStatus}</span><br><span style="font-size:10px;color:var(--text-muted);">${s1.responseTime}ms</span>` : '<span style="color:var(--text-muted);font-size:12px;">N/A</span>'}
        </td>
        <td class="diff-cell" style="text-align:center;">
          ${s2 ? `<span style="color:${statusColor2};font-weight:600;font-size:12px;">${s2.httpStatus}</span><br><span style="font-size:10px;color:var(--text-muted);">${s2.responseTime}ms</span>` : '<span style="color:var(--text-muted);font-size:12px;">N/A</span>'}
        </td>
        <td class="diff-cell" style="text-align:center;">${diffIcon}</td>
        <td class="diff-cell" style="text-align:center;">
          ${expandable ? `<button class="icon-btn" onclick="toggleDiffDetail(${i})" title="View diff"><span class="material-symbols-rounded" style="font-size:16px;">unfold_more</span></button>` : ''}
        </td>
      </tr>
      <tr class="diff-detail-row" id="diff-detail-${i}" style="display:none;" data-diff-type="${c.bodyDiff}">
        <td colspan="6" style="padding:0;">
          <div class="diff-detail-content" id="diff-detail-content-${i}"></div>
        </td>
      </tr>`;
  }).join('');

  resultDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Response Comparison <span style="font-size:12px;font-weight:400;color:var(--text-muted);">(${summaryParts.join(' &middot; ')})</span></h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn" onclick="showRunHistory()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">arrow_back</span>Back</button>
        </div>
      </div>
      ${filterBtns}
      <div style="overflow-x:auto;">
        <table class="diff-table">
          <thead>
            <tr>
              <th style="width:50px;"></th>
              <th>Test</th>
              <th style="width:80px;text-align:center;">Run #${runId1}</th>
              <th style="width:80px;text-align:center;">Run #${runId2}</th>
              <th style="width:50px;text-align:center;">Diff</th>
              <th style="width:40px;"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;

  // Store comparison data for lazy diff rendering
  window._diffComparisons = comparisons;
}

function toggleDiffDetail(idx) {
  const row = document.getElementById(`diff-detail-${idx}`);
  if (!row) return;

  const isVisible = row.style.display !== 'none';
  row.style.display = isVisible ? 'none' : '';

  if (!isVisible) {
    // Lazy render diff content
    const contentEl = document.getElementById(`diff-detail-content-${idx}`);
    if (contentEl && !contentEl.dataset.rendered) {
      const c = window._diffComparisons[idx];
      renderDiffContent(contentEl, c);
      contentEl.dataset.rendered = 'true';
    }
  }
}

function renderDiffContent(el, comparison) {
  const body1 = comparison.run1?.responseBody || '';
  const body2 = comparison.run2?.responseBody || '';

  // Try to parse and pretty-print JSON
  let pretty1, pretty2;
  try { pretty1 = JSON.stringify(JSON.parse(body1), null, 2); } catch { pretty1 = body1; }
  try { pretty2 = JSON.stringify(JSON.parse(body2), null, 2); } catch { pretty2 = body2; }

  if (comparison.bodyDiff === 'added') {
    el.innerHTML = `
      <div class="diff-panel">
        <div class="diff-panel-header diff-added-header">New in Run #2</div>
        <pre class="diff-code">${esc(pretty2)}</pre>
      </div>`;
    return;
  }

  if (comparison.bodyDiff === 'removed') {
    el.innerHTML = `
      <div class="diff-panel">
        <div class="diff-panel-header diff-removed-header">Only in Run #1</div>
        <pre class="diff-code">${esc(pretty1)}</pre>
      </div>`;
    return;
  }

  // For changed: compute field-level diff
  const lines1 = pretty1.split('\n');
  const lines2 = pretty2.split('\n');
  const diffHtml = computeLineDiff(lines1, lines2);

  el.innerHTML = `
    <div class="diff-side-by-side">
      <div class="diff-panel">
        <div class="diff-panel-header">Run #1 (baseline)</div>
        <pre class="diff-code">${diffHtml.left}</pre>
      </div>
      <div class="diff-panel">
        <div class="diff-panel-header">Run #2 (current)</div>
        <pre class="diff-code">${diffHtml.right}</pre>
      </div>
    </div>`;
}

function computeLineDiff(lines1, lines2) {
  // Simple LCS-based line diff
  const max = Math.max(lines1.length, lines2.length);
  let leftHtml = '';
  let rightHtml = '';

  // Build a map of common lines using longest common subsequence approach (simplified)
  const lcs = buildLCS(lines1, lines2);
  let i = 0, j = 0, k = 0;

  while (i < lines1.length || j < lines2.length) {
    if (k < lcs.length && i < lines1.length && lines1[i] === lcs[k] &&
        j < lines2.length && lines2[j] === lcs[k]) {
      // Common line
      leftHtml += `<div class="diff-line">${esc(lines1[i])}</div>`;
      rightHtml += `<div class="diff-line">${esc(lines2[j])}</div>`;
      i++; j++; k++;
    } else if (k < lcs.length && j < lines2.length && lines2[j] === lcs[k]) {
      // Line removed from left
      leftHtml += `<div class="diff-line diff-line-removed">${esc(lines1[i])}</div>`;
      rightHtml += `<div class="diff-line diff-line-empty"></div>`;
      i++;
    } else if (k < lcs.length && i < lines1.length && lines1[i] === lcs[k]) {
      // Line added on right
      leftHtml += `<div class="diff-line diff-line-empty"></div>`;
      rightHtml += `<div class="diff-line diff-line-added">${esc(lines2[j])}</div>`;
      j++;
    } else {
      // Both differ
      if (i < lines1.length) {
        leftHtml += `<div class="diff-line diff-line-removed">${esc(lines1[i])}</div>`;
        i++;
      }
      if (j < lines2.length) {
        rightHtml += `<div class="diff-line diff-line-added">${esc(lines2[j])}</div>`;
        j++;
      }
    }
  }

  return { left: leftHtml, right: rightHtml };
}

function buildLCS(a, b) {
  const m = a.length, n = b.length;
  // For very large responses, limit LCS computation
  if (m > 500 || n > 500) {
    // Fallback: just match identical lines in order
    const result = [];
    let j = 0;
    for (let i = 0; i < m && j < n; i++) {
      if (a[i] === b[j]) { result.push(a[i]); j++; }
    }
    return result;
  }

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { result.unshift(a[i - 1]); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return result;
}

function filterDiffRows(type, btn) {
  // Update active button
  document.querySelectorAll('.diff-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.querySelectorAll('.diff-row').forEach(row => {
    const rowType = row.dataset.diffType;
    row.style.display = (type === 'all' || rowType === type) ? '' : 'none';
  });
  // Also hide detail rows
  document.querySelectorAll('.diff-detail-row').forEach(row => {
    const rowType = row.dataset.diffType;
    if (type !== 'all' && rowType !== type) row.style.display = 'none';
  });
}

// Enhanced compareSelectedRuns - check if runs have stored results
async function compareSelectedRunsEnhanced() {
  const checked = Array.from(document.querySelectorAll('.compare-check:checked'));
  if (checked.length !== 2) return;

  const [id1, id2] = checked.map(cb => parseInt(cb.value));

  // Check if both runs have stored results
  let results1, results2;
  try {
    [results1, results2] = await Promise.all([
      api('GET', `/api/projects/${currentProject.id}/runs/${id1}/results`),
      api('GET', `/api/projects/${currentProject.id}/runs/${id2}/results`)
    ]);
  } catch { results1 = []; results2 = []; }

  if (results1.length > 0 && results2.length > 0) {
    // Use enhanced response comparison
    compareRunResponses(id1, id2);
  } else {
    // Fall back to basic status comparison
    compareSelectedRuns();
  }
}
