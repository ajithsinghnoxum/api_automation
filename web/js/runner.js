// --- Test Selection ---

function getSelectedTestNames() {
  const checked = document.querySelectorAll('.test-check:checked');
  return Array.from(checked).map(cb => cb.dataset.testName);
}

function getSelectedCount() {
  return document.querySelectorAll('.test-check:checked').length;
}

function getTotalCount() {
  return document.querySelectorAll('.test-check').length;
}

function updateSelectionInfo() {
  const selected = getSelectedCount();
  const total = getTotalCount();
  const info = document.getElementById('selection-info');
  const count = document.getElementById('run-count');
  if (info) info.textContent = `${selected} of ${total} selected`;
  if (count) count.textContent = selected;
}

function onSuiteCheckChange(si) {
  const suiteCheck = document.querySelector(`.suite-check[data-suite="${si}"]`);
  const testChecks = document.querySelectorAll(`.test-check[data-suite="${si}"]`);
  testChecks.forEach(cb => cb.checked = suiteCheck.checked);
  updateSelectionInfo();
}

function onTestCheckChange(si) {
  const testChecks = document.querySelectorAll(`.test-check[data-suite="${si}"]`);
  const suiteCheck = document.querySelector(`.suite-check[data-suite="${si}"]`);
  const allChecked = Array.from(testChecks).every(cb => cb.checked);
  const someChecked = Array.from(testChecks).some(cb => cb.checked);
  suiteCheck.checked = allChecked;
  suiteCheck.indeterminate = !allChecked && someChecked;
  updateSelectionInfo();
}

function selectAllTests(checked) {
  document.querySelectorAll('.suite-check, .test-check').forEach(cb => {
    cb.checked = checked;
    cb.indeterminate = false;
  });
  updateSelectionInfo();
}

// --- Run Tests ---

async function runTests() {
  const selectedNames = getSelectedTestNames();
  if (selectedNames.length === 0) return toast('No tests selected', 'error');

  const runBtn = document.getElementById('run-btn');
  runBtn.disabled = true;
  runBtn.innerHTML = '<span class="spinner"></span>Running...';

  const total = getTotalCount();
  const resultDiv = document.getElementById('run-result');
  resultDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Running Tests <span style="font-size:12px;font-weight:400;color:var(--text-muted);">(${selectedNames.length} of ${total})</span></h3>
        <span class="spinner" style="border-color:var(--border);border-top-color:var(--accent);width:20px;height:20px;"></span>
      </div>
      <div class="card-body">
        <div class="run-output" id="run-output-live"></div>
      </div>
    </div>`;

  let body = {};
  if (selectedNames.length < total) {
    const escaped = selectedNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    body.grep = escaped.join('|');
  }
  if (selectedEnvironment) {
    body.env = selectedEnvironment;
  }
  if (activeTagFilters.size > 0) {
    body.tags = Array.from(activeTagFilters).join(',');
  }

  try {
    const response = await fetch(`/api/run/${currentProject.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const outputEl = document.getElementById('run-output-live');
    let fullOutput = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      let eventType = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7);
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (eventType === 'output') {
            fullOutput += data.text;
            outputEl.textContent = fullOutput;
            outputEl.scrollTop = outputEl.scrollHeight;
          } else if (eventType === 'done') {
            finishRun(data.exitCode, fullOutput, selectedNames.length, total);
          } else if (eventType === 'error') {
            outputEl.textContent = fullOutput + '\nError: ' + data.message;
            toast('Test runner error', 'error');
          }
        }
      }
    }
  } catch (e) {
    resultDiv.innerHTML = `<div class="card"><div class="card-body"><div class="run-output">Error: ${e.message}</div></div></div>`;
    toast('Failed to run tests', 'error');
  }

  runBtn.disabled = false;
  const count = getSelectedCount();
  runBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:18px;vertical-align:-4px;margin-right:4px;">play_arrow</span>Run <span id="run-count">${count}</span> Test${count !== 1 ? 's' : ''}`;
}

function finishRun(exitCode, output, selected, total) {
  const isPass = exitCode === 0;
  const resultDiv = document.getElementById('run-result');

  // Parse summary stats from Playwright output
  const summaryMatch = output.match(/(\d+)\s+passed/);
  const failedMatch = output.match(/(\d+)\s+failed/);
  const skippedMatch = output.match(/(\d+)\s+skipped/);
  const durationMatch = output.match(/\((\d+(?:\.\d+)?(?:m|s|ms)(?:\s*\d+(?:\.\d+)?(?:m|s|ms))?)\)/);
  const passed = summaryMatch ? summaryMatch[1] : '?';
  const failed = failedMatch ? failedMatch[1] : '0';
  const skipped = skippedMatch ? skippedMatch[1] : '0';
  const duration = durationMatch ? durationMatch[1] : '';

  const summaryHtml = `
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
      <span style="font-size:13px;font-weight:600;color:var(--pass);">${passed} passed</span>
      ${failed !== '0' ? `<span style="font-size:13px;font-weight:600;color:var(--fail);">${failed} failed</span>` : ''}
      ${skipped !== '0' ? `<span style="font-size:13px;font-weight:600;color:var(--skip);">${skipped} skipped</span>` : ''}
      ${duration ? `<span style="font-size:12px;color:var(--text-muted);font-family:monospace;">⏱ ${duration}</span>` : ''}
    </div>`;

  resultDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Test Run Result <span style="font-size:12px;font-weight:400;color:var(--text-muted);">(${selected} of ${total} tests)</span></h3>
        <span style="font-size:13px;font-weight:600;color:${isPass ? 'var(--pass)' : 'var(--fail)'}">
          ${isPass ? 'ALL PASSED' : 'HAS FAILURES'}
        </span>
      </div>
      <div class="card-body">
        ${summaryHtml}
        <div class="run-output">${esc(output)}</div>
        <div style="margin-top:12px;">
          <button class="btn" onclick="window.open('/report/index.html?t=' + Date.now(), '_blank')"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">assessment</span>View HTML Report</button>
        </div>
      </div>
    </div>`;

  parseTestResults(output);
  renderProjectView();

  toast(isPass ? 'All tests passed!' : 'Some tests failed', isPass ? 'success' : 'error');
}

// Strip ANSI escape codes from terminal output
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\u001b\[[0-9;]*m/g, '');
}

function parseTestResults(output) {
  lastRunResults = {};
  lastRunTimings = {};
  const clean = stripAnsi(output);
  const lines = clean.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*(✓|ok|✘|✗|x|-)\s+\d+\s+\[.*?\]\s+›\s+[^›]+›\s+(.+?)\s+›\s+(.+?)(?:\s+\(([^)]+)\))?\s*$/);
    if (m) {
      const statusChar = m[1];
      const suite = m[2].trim();
      const testTitle = m[3].trim();
      const key = suite + '::' + testTitle;
      if (statusChar === '✓' || statusChar === 'ok') lastRunResults[key] = 'passed';
      else if (statusChar === '✘' || statusChar === '✗' || statusChar === 'x') lastRunResults[key] = 'failed';
      else if (statusChar === '-') lastRunResults[key] = 'skipped';
      if (m[4]) lastRunTimings[key] = m[4];
    }
  }
}

// --- Run History ---

async function showRunHistory() {
  if (!currentProject) return;

  const resultDiv = document.getElementById('run-result');
  resultDiv.innerHTML = '<div class="shimmer skeleton-card"></div>';

  let runs;
  try {
    runs = await api('GET', `/api/projects/${currentProject.id}/runs`);
  } catch {
    resultDiv.innerHTML = '';
    return;
  }

  if (runs.length === 0) {
    resultDiv.innerHTML = `
      <div class="card">
        <div class="card-body" style="text-align:center;color:var(--text-muted);padding:32px;">
          No test runs yet. Run some tests to see history here.
        </div>
      </div>`;
    return;
  }

  const rowsHtml = runs.map(run => {
    const date = new Date(run.timestamp);
    const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    const isPass = run.exitCode === 0;
    const statusHtml = isPass
      ? '<span style="color:var(--pass);font-weight:600;">PASSED</span>'
      : '<span style="color:var(--fail);font-weight:600;">FAILED</span>';
    const grepInfo = run.grep ? `<span style="font-size:11px;color:var(--text-muted);margin-left:8px;">filtered</span>` : '';

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="viewRunDetail(${run.id})">
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" class="run-check compare-check" value="${run.id}" onclick="event.stopPropagation(); updateCompareBtn()" title="Select for comparison">
          <span style="font-size:13px;font-weight:500;">${timeStr}</span>${grepInfo}
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${statusHtml}
          <button class="icon-btn" onclick="event.stopPropagation(); openRunReport(${run.id})" title="View Report"><span class="material-symbols-rounded" style="font-size:18px;">assessment</span></button>
          <button class="icon-btn" onclick="event.stopPropagation(); downloadJUnitXml(${run.id})" title="Download JUnit XML"><span class="material-symbols-rounded" style="font-size:18px;">download</span></button>
          <button class="icon-btn" onclick="event.stopPropagation(); downloadCsv(${run.id})" title="Download CSV"><span class="material-symbols-rounded" style="font-size:18px;">table_chart</span></button>
          <button class="icon-btn" onclick="event.stopPropagation(); openPdfReport(${run.id})" title="Print / PDF"><span class="material-symbols-rounded" style="font-size:18px;">picture_as_pdf</span></button>
          <span class="material-symbols-rounded" style="font-size:16px;color:var(--text-muted);">chevron_right</span>
        </div>
      </div>`;
  }).join('');

  resultDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Run History <span style="font-size:12px;font-weight:400;color:var(--text-muted);">(${runs.length} runs)</span></h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-accent" id="snapshot-btn" onclick="captureSnapshot()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">photo_camera</span>Snapshot</button>
          <button class="btn" id="baseline-btn" onclick="captureSchemaBaseline()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">bookmark</span>Save Baseline</button>
          <button class="btn" id="drift-btn" onclick="detectSchemaDrift()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">radar</span>Detect Drift</button>
          <button class="btn" id="compare-runs-btn" onclick="compareSelectedRunsEnhanced()" style="display:none;"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">compare_arrows</span>Compare</button>
          <button class="icon-btn" onclick="document.getElementById('run-result').innerHTML=''" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
      </div>
      <div id="trend-chart-container" style="padding:16px;border-bottom:1px solid var(--border);"></div>
      <div style="max-height:400px;overflow-y:auto;">
        ${rowsHtml}
      </div>
    </div>`;

  // Load and render trend chart
  loadTrendChart();
}

async function viewRunDetail(runId) {
  if (!currentProject) return;

  const resultDiv = document.getElementById('run-result');
  resultDiv.innerHTML = '<div class="shimmer skeleton-card"></div>';

  let run;
  try {
    run = await api('GET', `/api/projects/${currentProject.id}/runs/${runId}`);
  } catch {
    resultDiv.innerHTML = '';
    return;
  }
  const isPass = run.exitCode === 0;
  const date = new Date(run.timestamp);
  const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

  resultDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Run: ${timeStr}</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="font-size:13px;font-weight:600;color:${isPass ? 'var(--pass)' : 'var(--fail)'}">
            ${isPass ? 'PASSED' : 'FAILED'}
          </span>
          <button class="btn" onclick="openRunReport(${runId})"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">assessment</span>Report</button>
          <button class="btn" onclick="downloadJUnitXml(${runId})" title="Download JUnit XML"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">download</span>JUnit XML</button>
          <button class="btn" onclick="downloadCsv(${runId})" title="Download CSV"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">table_chart</span>CSV</button>
          <button class="btn" onclick="openPdfReport(${runId})" title="Print / PDF"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">picture_as_pdf</span>PDF</button>
          <button class="btn" onclick="showRunHistory()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">arrow_back</span>Back</button>
        </div>
      </div>
      <div class="card-body">
        <div class="run-output">${esc(run.output || 'No output')}</div>
      </div>
    </div>`;
}

function openRunReport(runId) {
  if (!currentProject) return;
  window.open(`/api/projects/${currentProject.id}/runs/${runId}/report`, '_blank');
}

function downloadJUnitXml(runId) {
  if (!currentProject) return;
  window.open(`/api/projects/${currentProject.id}/runs/${runId}/junit`, '_blank');
}

function downloadCsv(runId) {
  if (!currentProject) return;
  window.open(`/api/projects/${currentProject.id}/runs/${runId}/csv`, '_blank');
}

function openPdfReport(runId) {
  if (!currentProject) return;
  window.open(`/api/projects/${currentProject.id}/runs/${runId}/pdf`, '_blank');
}

// --- Trend Chart ---

async function loadTrendChart() {
  if (!currentProject) return;
  const container = document.getElementById('trend-chart-container');
  if (!container) return;

  let trends;
  try {
    trends = await api('GET', `/api/projects/${currentProject.id}/trends`);
  } catch {
    container.innerHTML = '';
    return;
  }

  if (!trends || trends.length < 2) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:8px;">Need at least 2 runs for trend chart</div>';
    return;
  }

  const W = container.clientWidth - 32 || 500;
  const H = 120;
  const pad = { top: 10, right: 10, bottom: 24, left: 32 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const maxTotal = Math.max(...trends.map(t => t.total), 1);

  function x(i) { return pad.left + (i / (trends.length - 1)) * chartW; }
  function y(val) { return pad.top + chartH - (val / maxTotal) * chartH; }

  // Build SVG
  let svg = `<svg width="${W}" height="${H}" style="display:block;">`;

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const yy = pad.top + (i / 4) * chartH;
    svg += `<line x1="${pad.left}" y1="${yy}" x2="${W - pad.right}" y2="${yy}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,4"/>`;
  }

  // Y-axis labels
  svg += `<text x="${pad.left - 4}" y="${pad.top + 4}" fill="var(--text-muted)" font-size="10" text-anchor="end">${maxTotal}</text>`;
  svg += `<text x="${pad.left - 4}" y="${pad.top + chartH + 4}" fill="var(--text-muted)" font-size="10" text-anchor="end">0</text>`;

  // Stacked area: passed (bottom), failed (top), skipped
  // Build path for passed area
  let passedPath = `M ${x(0)} ${y(0)}`;
  let failedPath = `M ${x(0)} ${y(0)}`;
  for (let i = 0; i < trends.length; i++) {
    passedPath += ` L ${x(i)} ${y(trends[i].passed)}`;
    failedPath += ` L ${x(i)} ${y(trends[i].passed + trends[i].failed)}`;
  }

  // Close passed area
  const passedArea = passedPath + ` L ${x(trends.length - 1)} ${y(0)} Z`;
  svg += `<path d="${passedArea}" fill="var(--pass)" opacity="0.2"/>`;
  svg += `<polyline points="${trends.map((t, i) => `${x(i)},${y(t.passed)}`).join(' ')}" fill="none" stroke="var(--pass)" stroke-width="2"/>`;

  // Failed line
  if (trends.some(t => t.failed > 0)) {
    svg += `<polyline points="${trends.map((t, i) => `${x(i)},${y(t.passed + t.failed)}`).join(' ')}" fill="none" stroke="var(--fail)" stroke-width="2" stroke-dasharray="4,2"/>`;
  }

  // Dots
  for (let i = 0; i < trends.length; i++) {
    const t = trends[i];
    svg += `<circle cx="${x(i)}" cy="${y(t.passed)}" r="3" fill="var(--pass)"><title>${new Date(t.timestamp).toLocaleDateString()}: ${t.passed}P / ${t.failed}F / ${t.skipped}S</title></circle>`;
    if (t.failed > 0) {
      svg += `<circle cx="${x(i)}" cy="${y(t.passed + t.failed)}" r="3" fill="var(--fail)"><title>${t.failed} failed</title></circle>`;
    }
  }

  // X-axis labels (first and last)
  const first = new Date(trends[0].timestamp);
  const last = new Date(trends[trends.length - 1].timestamp);
  svg += `<text x="${pad.left}" y="${H - 2}" fill="var(--text-muted)" font-size="10">${first.toLocaleDateString()}</text>`;
  svg += `<text x="${W - pad.right}" y="${H - 2}" fill="var(--text-muted)" font-size="10" text-anchor="end">${last.toLocaleDateString()}</text>`;

  svg += '</svg>';

  // Legend
  const legend = `<div style="display:flex;gap:16px;justify-content:center;margin-top:4px;">
    <span style="font-size:11px;color:var(--pass);">&#9679; Passed</span>
    <span style="font-size:11px;color:var(--fail);">&#9679; Failed</span>
    <span style="font-size:11px;color:var(--text-muted);">&#9679; Total</span>
  </div>`;

  container.innerHTML = `<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">Pass/Fail Trend</div>${svg}${legend}`;
}

// --- Run Comparison ---

function updateCompareBtn() {
  const checked = document.querySelectorAll('.compare-check:checked');
  const btn = document.getElementById('compare-runs-btn');
  if (btn) btn.style.display = checked.length === 2 ? '' : 'none';
  // Limit to 2 selections
  if (checked.length > 2) {
    checked[0].checked = false;
    updateCompareBtn();
  }
}

function parseRunOutput(output) {
  const results = {};
  const clean = stripAnsi(output);
  const lines = clean.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*(✓|ok|✘|✗|x|-)\s+\d+\s+\[.*?\]\s+›\s+[^›]+›\s+(.+?)\s+›\s+(.+?)(?:\s+\(([^)]+)\))?\s*$/);
    if (m) {
      const statusChar = m[1];
      const suite = m[2].trim();
      const testTitle = m[3].trim();
      const key = suite + '::' + testTitle;
      let status = 'skipped';
      if (statusChar === '✓' || statusChar === 'ok') status = 'passed';
      else if (statusChar === '✘' || statusChar === '✗' || statusChar === 'x') status = 'failed';
      results[key] = { status, timing: m[4] || '' };
    }
  }
  return results;
}

async function compareSelectedRuns() {
  const checked = Array.from(document.querySelectorAll('.compare-check:checked'));
  if (checked.length !== 2) return;

  const [id1, id2] = checked.map(cb => cb.value);
  const resultDiv = document.getElementById('run-result');
  resultDiv.innerHTML = '<div class="shimmer skeleton-card"></div>';

  let run1, run2;
  try {
    [run1, run2] = await Promise.all([
      api('GET', `/api/projects/${currentProject.id}/runs/${id1}`),
      api('GET', `/api/projects/${currentProject.id}/runs/${id2}`)
    ]);
  } catch { resultDiv.innerHTML = ''; return; }

  const results1 = parseRunOutput(run1.output || '');
  const results2 = parseRunOutput(run2.output || '');

  const allKeys = new Set([...Object.keys(results1), ...Object.keys(results2)]);
  const date1 = new Date(run1.timestamp);
  const date2 = new Date(run2.timestamp);
  const time1 = date1.toLocaleDateString() + ' ' + date1.toLocaleTimeString();
  const time2 = date2.toLocaleDateString() + ' ' + date2.toLocaleTimeString();

  let rows = '';
  let changed = 0;
  for (const key of Array.from(allKeys).sort()) {
    const r1 = results1[key];
    const r2 = results2[key];
    const s1 = r1?.status || 'N/A';
    const s2 = r2?.status || 'N/A';
    const t1 = r1?.timing || '';
    const t2 = r2?.timing || '';
    const statusChanged = s1 !== s2;
    if (statusChanged) changed++;
    const color1 = s1 === 'passed' ? 'var(--pass)' : s1 === 'failed' ? 'var(--fail)' : 'var(--text-muted)';
    const color2 = s2 === 'passed' ? 'var(--pass)' : s2 === 'failed' ? 'var(--fail)' : 'var(--text-muted)';
    const [suite, test] = key.split('::');
    const highlight = statusChanged ? 'background:var(--accent-bg);' : '';
    rows += `
      <tr style="${highlight}">
        <td style="padding:6px 10px;font-size:12px;color:var(--text-muted);white-space:nowrap;">${esc(suite)}</td>
        <td style="padding:6px 10px;font-size:13px;">${esc(test)}</td>
        <td style="padding:6px 10px;text-align:center;"><span style="color:${color1};font-weight:600;font-size:12px;">${s1}</span>${t1 ? `<br><span style="font-size:10px;color:var(--text-muted);font-family:monospace;">${t1}</span>` : ''}</td>
        <td style="padding:6px 10px;text-align:center;"><span style="color:${color2};font-weight:600;font-size:12px;">${s2}</span>${t2 ? `<br><span style="font-size:10px;color:var(--text-muted);font-family:monospace;">${t2}</span>` : ''}</td>
        <td style="padding:6px 10px;text-align:center;">${statusChanged ? '<span class="material-symbols-rounded" style="font-size:16px;color:var(--accent);">change_circle</span>' : '<span style="font-size:12px;color:var(--text-muted);">—</span>'}</td>
      </tr>`;
  }

  resultDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Run Comparison <span style="font-size:12px;font-weight:400;color:var(--text-muted);">(${changed} change${changed !== 1 ? 's' : ''} across ${allKeys.size} tests)</span></h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn" onclick="showRunHistory()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">arrow_back</span>Back</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:2px solid var(--border);">
              <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--text-muted);">Suite</th>
              <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--text-muted);">Test</th>
              <th style="padding:8px 10px;text-align:center;font-size:12px;font-weight:600;color:var(--text-muted);">${time1}</th>
              <th style="padding:8px 10px;text-align:center;font-size:12px;font-weight:600;color:var(--text-muted);">${time2}</th>
              <th style="padding:8px 10px;text-align:center;font-size:12px;font-weight:600;color:var(--text-muted);">Diff</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}
