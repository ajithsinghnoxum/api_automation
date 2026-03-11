// --- Schema Drift Detection ---

async function captureSchemaBaseline() {
  if (!currentProject) return;

  const btn = document.getElementById('baseline-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-rounded spin" style="font-size:16px;vertical-align:-3px;">progress_activity</span> Capturing...';
  }

  try {
    const result = await api('POST', `/api/projects/${currentProject.id}/schema-baseline`);
    toast(`Schema baseline captured: ${result.captured} of ${result.total} tests`);
  } catch { /* toasted */ } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">bookmark</span>Save Baseline';
    }
  }
}

async function detectSchemaDrift() {
  if (!currentProject) return;

  const btn = document.getElementById('drift-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-rounded spin" style="font-size:16px;vertical-align:-3px;">progress_activity</span> Detecting...';
  }

  let data;
  try {
    data = await api('POST', `/api/projects/${currentProject.id}/schema-drift`);
  } catch {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">radar</span>Detect Drift';
    }
    return;
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">radar</span>Detect Drift';
  }

  renderDriftReport(data);
}

function renderDriftReport(data) {
  const resultDiv = document.getElementById('run-result');
  const report = data.report || [];

  const rows = report.map((r, i) => {
    const hasDrift = r.drifted;
    const diffCount = r.diffs?.length || 0;

    const statusIcon = hasDrift
      ? '<span class="material-symbols-rounded" style="font-size:18px;color:var(--fail);">warning</span>'
      : '<span class="material-symbols-rounded" style="font-size:18px;color:var(--pass);">check_circle</span>';

    const diffSummary = hasDrift ? diffCount + ' change' + (diffCount !== 1 ? 's' : '') : 'No drift';

    return `
      <tr class="drift-row ${hasDrift ? 'drift-row-changed' : ''}" onclick="toggleDriftDetail(${i})">
        <td class="drift-cell">${statusIcon}</td>
        <td class="drift-cell">
          <span class="method-badge method-${(r.method || 'GET').toLowerCase()}" style="font-size:10px;padding:1px 5px;">${r.method || 'GET'}</span>
        </td>
        <td class="drift-cell">
          <span style="color:var(--text-muted);font-size:11px;">${esc(r.suite)}</span><br>
          <strong style="font-size:13px;">${esc(r.testName)}</strong>
          <span style="font-size:11px;color:var(--text-muted);font-family:monospace;margin-left:6px;">${esc(r.endpoint)}</span>
        </td>
        <td class="drift-cell" style="text-align:center;font-size:12px;color:${hasDrift ? 'var(--fail)' : 'var(--pass)'};">
          ${diffSummary}
        </td>
      </tr>
      <tr class="drift-detail-row" id="drift-detail-${i}" style="display:none;">
        <td colspan="4" style="padding:0;">
          ${hasDrift ? renderDriftDiffs(r.diffs, r.baselineCapturedAt) : ''}
        </td>
      </tr>`;
  }).join('');

  resultDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Schema Drift Report
          <span style="font-size:12px;font-weight:400;color:var(--text-muted);">
            (${data.drifted} drifted &middot; ${data.stable} stable &middot; ${data.total} total)
          </span>
        </h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn" id="baseline-btn" onclick="captureSchemaBaseline()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">bookmark</span>Save Baseline</button>
          <button class="btn" onclick="showRunHistory()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">arrow_back</span>Back</button>
        </div>
      </div>
      <div class="drift-summary-bar">
        <div class="drift-bar-fill drift-bar-stable" style="width:${data.total ? (data.stable / data.total * 100) : 0}%;"></div>
        <div class="drift-bar-fill drift-bar-drifted" style="width:${data.total ? (data.drifted / data.total * 100) : 0}%;"></div>
      </div>
      <div style="overflow-x:auto;">
        <table class="drift-table">
          <thead>
            <tr>
              <th style="width:40px;"></th>
              <th style="width:50px;"></th>
              <th>Test</th>
              <th style="width:100px;text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderDriftDiffs(diffs, capturedAt) {
  if (!diffs || diffs.length === 0) return '';

  const rows = diffs.map(d => {
    let icon, label, detail;
    switch (d.change) {
      case 'field_added':
        icon = '<span class="material-symbols-rounded" style="font-size:14px;color:var(--pass);">add_circle</span>';
        label = 'New field';
        detail = `<code>${esc(d.path)}</code> <span style="color:var(--text-muted);">(${d.type || 'unknown'})</span>`;
        break;
      case 'field_removed':
        icon = '<span class="material-symbols-rounded" style="font-size:14px;color:var(--fail);">remove_circle</span>';
        label = 'Removed field';
        detail = `<code>${esc(d.path)}</code> <span style="color:var(--text-muted);">(was ${d.type || 'unknown'})</span>`;
        break;
      case 'type_changed':
        icon = '<span class="material-symbols-rounded" style="font-size:14px;color:var(--accent);">change_circle</span>';
        label = 'Type changed';
        detail = `<code>${esc(d.path)}</code>: <span style="color:var(--fail);">${d.from}</span> &rarr; <span style="color:var(--pass);">${d.to}</span>`;
        break;
      case 'error':
        icon = '<span class="material-symbols-rounded" style="font-size:14px;color:var(--fail);">error</span>';
        label = 'Error';
        detail = esc(d.message || 'Request failed');
        break;
      default:
        icon = '<span class="material-symbols-rounded" style="font-size:14px;">help</span>';
        label = d.change;
        detail = `<code>${esc(d.path)}</code>`;
    }

    return `
      <div class="drift-diff-item">
        ${icon}
        <span class="drift-diff-label">${label}</span>
        <span class="drift-diff-detail">${detail}</span>
      </div>`;
  }).join('');

  const dateStr = capturedAt ? new Date(capturedAt).toLocaleString() : 'unknown';

  return `
    <div class="drift-detail-content">
      <div style="font-size:11px;color:var(--text-muted);padding:8px 12px;border-bottom:1px solid var(--border);">
        Baseline captured: ${dateStr}
      </div>
      ${rows}
    </div>`;
}

function toggleDriftDetail(idx) {
  const row = document.getElementById(`drift-detail-${idx}`);
  if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

// Add drift buttons to run history
function getDriftButtonsHtml() {
  return `
    <button class="btn" id="baseline-btn" onclick="captureSchemaBaseline()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">bookmark</span>Save Baseline</button>
    <button class="btn" id="drift-btn" onclick="detectSchemaDrift()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">radar</span>Detect Drift</button>`;
}
