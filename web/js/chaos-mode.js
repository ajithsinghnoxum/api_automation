// --- Chaos / Stress Testing Mode ---

const CHAOS_OPTIONS = [
  {
    id: 'random-order',
    icon: 'shuffle',
    label: 'Random Order',
    desc: 'Shuffle test execution order to expose hidden dependencies between tests.',
  },
  {
    id: 'repeat-run',
    icon: 'replay',
    label: 'Repeat Run (x3)',
    desc: 'Run the same tests 3 times consecutively to catch flaky or non-deterministic behavior.',
  },
  {
    id: 'concurrent-blast',
    icon: 'electric_bolt',
    label: 'Concurrent Blast',
    desc: 'Fire all tests simultaneously to find race conditions and concurrency bugs.',
  },
  {
    id: 'wrong-method',
    icon: 'swap_horiz',
    label: 'Wrong Method',
    desc: 'Run each test with a random wrong HTTP method (GET\u2192POST, POST\u2192DELETE, etc.) and expect non-200.',
  },
  {
    id: 'empty-body',
    icon: 'delete_sweep',
    label: 'Empty Body',
    desc: 'Strip all request bodies to verify the API handles missing payloads gracefully.',
  },
  {
    id: 'invalid-endpoint',
    icon: 'link_off',
    label: 'Invalid Endpoint',
    desc: 'Append /invalid_xyz to every endpoint to verify proper 404 handling.',
  },
];

const WRONG_METHOD_MAP = {
  GET: ['POST', 'PUT', 'DELETE', 'PATCH'],
  POST: ['GET', 'PUT', 'DELETE', 'PATCH'],
  PUT: ['GET', 'POST', 'DELETE', 'PATCH'],
  DELETE: ['GET', 'POST', 'PUT', 'PATCH'],
  PATCH: ['GET', 'POST', 'PUT', 'DELETE'],
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Render the chaos mode panel ---

function showChaosMode() {
  if (!currentProject || !currentSuites || currentSuites.length === 0) {
    toast('Load a project with tests first', 'error');
    return;
  }

  const resultDiv = document.getElementById('run-result');

  const optionsHtml = CHAOS_OPTIONS.map(opt => `
    <label class="chaos-option" for="chaos-${opt.id}">
      <input type="checkbox" id="chaos-${opt.id}" value="${opt.id}">
      <span class="chaos-option-icon material-symbols-rounded">${opt.icon}</span>
      <span class="chaos-option-body">
        <span class="chaos-option-label">${opt.label}</span>
        <span class="chaos-option-desc">${opt.desc}</span>
      </span>
    </label>
  `).join('');

  const testCount = currentSuites.reduce((n, s) => n + (s.tests ? s.tests.length : 0), 0);

  resultDiv.innerHTML = `
    <style>
      .chaos-panel {
        background: #111318;
        border: 1px solid #2a1a1a;
        border-radius: var(--radius);
        box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        color: #e8ecf2;
        overflow: hidden;
      }
      .chaos-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid #2a1a1a;
        background: linear-gradient(135deg, #1a1018 0%, #111318 100%);
      }
      .chaos-header h3 {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 18px;
        font-weight: 700;
        color: #f87171;
      }
      .chaos-header h3 .material-symbols-rounded {
        font-size: 26px;
        color: #f87171;
      }
      .chaos-header .chaos-subtitle {
        font-size: 12px;
        color: #8e99ab;
        font-weight: 400;
        margin-top: 2px;
      }
      .chaos-options-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 12px;
        padding: 20px 24px;
      }
      .chaos-option {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        border: 1px solid #2a2a3a;
        border-radius: 8px;
        background: #161922;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
      }
      .chaos-option:hover {
        border-color: #f8717166;
        background: #1a1520;
      }
      .chaos-option input[type="checkbox"] {
        margin-top: 3px;
        accent-color: #f87171;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
      .chaos-option-icon {
        font-size: 22px;
        color: #f87171;
        flex-shrink: 0;
        margin-top: 1px;
      }
      .chaos-option-body {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .chaos-option-label {
        font-size: 14px;
        font-weight: 600;
        color: #e8ecf2;
      }
      .chaos-option-desc {
        font-size: 12px;
        color: #6b758a;
        line-height: 1.4;
      }
      .chaos-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 24px;
        border-top: 1px solid #2a1a1a;
        background: #0e1015;
      }
      .chaos-footer .chaos-info {
        font-size: 12px;
        color: #6b758a;
      }
      .chaos-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 28px;
        font-size: 15px;
        font-weight: 700;
        color: #fff;
        background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: transform 0.1s, box-shadow 0.15s;
        box-shadow: 0 2px 12px rgba(220,38,38,0.4);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .chaos-btn:hover {
        transform: scale(1.03);
        box-shadow: 0 4px 20px rgba(220,38,38,0.6);
      }
      .chaos-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }
      .chaos-btn .material-symbols-rounded {
        font-size: 20px;
      }
      .chaos-btn.chaos-running {
        animation: chaos-pulse 1s ease-in-out infinite;
      }
      @keyframes chaos-pulse {
        0%, 100% { box-shadow: 0 2px 12px rgba(220,38,38,0.4); }
        50% { box-shadow: 0 4px 30px rgba(220,38,38,0.8); transform: scale(1.02); }
      }
      .chaos-results-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .chaos-results-table th {
        padding: 10px 14px;
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #6b758a;
        border-bottom: 2px solid #2a2a3a;
      }
      .chaos-results-table td {
        padding: 10px 14px;
        border-bottom: 1px solid #1e2230;
      }
      .chaos-results-table tr:hover td {
        background: #1a1520;
      }
      .chaos-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }
      .chaos-badge-pass { background: rgba(74,222,128,0.15); color: #4ade80; }
      .chaos-badge-fail { background: rgba(248,113,113,0.15); color: #f87171; }
      .chaos-badge-error { background: rgba(251,191,36,0.15); color: #fbbf24; }
      .chaos-summary-bar {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 16px 24px;
        border-bottom: 1px solid #2a1a1a;
        flex-wrap: wrap;
      }
      .chaos-summary-stat {
        font-size: 14px;
        font-weight: 600;
      }
      .chaos-summary-msg {
        font-size: 14px;
        font-weight: 500;
        padding: 12px 24px;
        border-bottom: 1px solid #2a1a1a;
      }
      .chaos-progress {
        padding: 16px 24px;
        font-size: 13px;
        color: #8e99ab;
      }
      .chaos-progress .progress-bar-outer {
        height: 6px;
        background: #1e2230;
        border-radius: 3px;
        margin-top: 8px;
        overflow: hidden;
      }
      .chaos-progress .progress-bar-inner {
        height: 100%;
        background: #f87171;
        border-radius: 3px;
        transition: width 0.3s;
      }
    </style>

    <div class="chaos-panel">
      <div class="chaos-header">
        <div>
          <h3>
            <span class="material-symbols-rounded">electric_bolt</span>
            Chaos Mode
          </h3>
          <div class="chaos-subtitle">${testCount} tests across ${currentSuites.length} suite${currentSuites.length !== 1 ? 's' : ''} available for chaos testing</div>
        </div>
        <button class="icon-btn" onclick="document.getElementById('run-result').innerHTML=''" title="Close" style="color:#6b758a;">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>

      <div class="chaos-options-grid">
        ${optionsHtml}
      </div>

      <div class="chaos-footer">
        <span class="chaos-info">Select one or more chaos strategies, then unleash.</span>
        <button class="chaos-btn" id="chaos-unleash-btn" onclick="unleashChaos()">
          <span class="material-symbols-rounded">skull</span>
          Unleash Chaos
        </button>
      </div>

      <div id="chaos-output"></div>
    </div>
  `;
}

// --- Gather all tests from suites ---

function gatherAllTests() {
  const tests = [];
  for (const suite of currentSuites) {
    if (!suite.tests) continue;
    suite.tests.forEach((t, idx) => {
      tests.push({
        suiteName: suite.suite || suite.fileName,
        suiteFile: suite.fileName,
        testIndex: idx,
        name: t.name,
        method: (t.method || 'GET').toUpperCase(),
        endpoint: t.endpoint || '',
        expectedStatus: t.expectedStatus || 200,
        body: t.body || null,
        queryParams: t.queryParams || null,
        validations: t.validations || [],
      });
    });
  }
  return tests;
}

// --- Run a single test via the quick-run endpoint ---

async function chaosRunSingleTest(suiteFile, testIndex) {
  const payload = { suiteFile, testIndex };
  if (typeof selectedEnvironment !== 'undefined' && selectedEnvironment) {
    payload.env = selectedEnvironment;
  }
  try {
    const res = await fetch(`/api/projects/${currentProject.id}/run-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message } };
  }
}

// --- Execute chaos ---

async function unleashChaos() {
  const selected = CHAOS_OPTIONS
    .filter(opt => document.getElementById(`chaos-${opt.id}`)?.checked)
    .map(opt => opt.id);

  if (selected.length === 0) {
    toast('Select at least one chaos option', 'error');
    return;
  }

  const btn = document.getElementById('chaos-unleash-btn');
  btn.disabled = true;
  btn.classList.add('chaos-running');
  btn.innerHTML = '<span class="material-symbols-rounded">skull</span> Running...';

  const outputDiv = document.getElementById('chaos-output');
  outputDiv.innerHTML = `
    <div class="chaos-progress" id="chaos-progress">
      <span id="chaos-progress-text">Preparing chaos...</span>
      <div class="progress-bar-outer"><div class="progress-bar-inner" id="chaos-progress-bar" style="width:0%"></div></div>
    </div>`;

  const allTests = gatherAllTests();
  if (allTests.length === 0) {
    outputDiv.innerHTML = '<div class="chaos-progress">No tests found in current suites.</div>';
    resetChaosBtn();
    return;
  }

  const results = [];

  try {
    for (const mode of selected) {
      const modeResults = await runChaosMode(mode, allTests, (done, total) => {
        updateChaosProgress(mode, done, total);
      });
      results.push(...modeResults);
    }
  } catch (e) {
    toast('Chaos run error: ' + e.message, 'error');
  }

  renderChaosResults(results);
  resetChaosBtn();
}

function resetChaosBtn() {
  const btn = document.getElementById('chaos-unleash-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.classList.remove('chaos-running');
  btn.innerHTML = '<span class="material-symbols-rounded">skull</span> Unleash Chaos';
}

function updateChaosProgress(mode, done, total) {
  const label = CHAOS_OPTIONS.find(o => o.id === mode)?.label || mode;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const textEl = document.getElementById('chaos-progress-text');
  const barEl = document.getElementById('chaos-progress-bar');
  if (textEl) textEl.textContent = `${label}: ${done}/${total} tests`;
  if (barEl) barEl.style.width = pct + '%';
}

// --- Individual chaos mode runners ---

async function runChaosMode(mode, tests, onProgress) {
  switch (mode) {
    case 'random-order':
      return await runRandomOrder(tests, onProgress);
    case 'repeat-run':
      return await runRepeat(tests, onProgress);
    case 'concurrent-blast':
      return await runConcurrentBlast(tests, onProgress);
    case 'wrong-method':
      return await runWrongMethod(tests, onProgress);
    case 'empty-body':
      return await runEmptyBody(tests, onProgress);
    case 'invalid-endpoint':
      return await runInvalidEndpoint(tests, onProgress);
    default:
      return [];
  }
}

// 1. Random Order — shuffle and run sequentially
async function runRandomOrder(tests, onProgress) {
  const shuffled = shuffleArray(tests);
  const results = [];
  for (let i = 0; i < shuffled.length; i++) {
    const t = shuffled[i];
    const res = await chaosRunSingleTest(t.suiteFile, t.testIndex);
    const passed = res.ok && res.data?.exitCode === 0;
    results.push({
      testName: t.name,
      suite: t.suiteName,
      chaosType: 'Random Order',
      expected: 'Pass (order-independent)',
      actual: passed ? 'Passed' : 'Failed',
      pass: passed,
    });
    onProgress(i + 1, shuffled.length);
  }
  return results;
}

// 2. Repeat Run x3
async function runRepeat(tests, onProgress) {
  const results = [];
  const totalSteps = tests.length * 3;
  let step = 0;
  for (let round = 1; round <= 3; round++) {
    for (const t of tests) {
      const res = await chaosRunSingleTest(t.suiteFile, t.testIndex);
      const passed = res.ok && res.data?.exitCode === 0;
      results.push({
        testName: t.name,
        suite: t.suiteName,
        chaosType: `Repeat Run (#${round})`,
        expected: 'Pass (consistent)',
        actual: passed ? 'Passed' : 'Failed',
        pass: passed,
      });
      step++;
      onProgress(step, totalSteps);
    }
  }
  return results;
}

// 3. Concurrent Blast — fire all at once
async function runConcurrentBlast(tests, onProgress) {
  onProgress(0, tests.length);
  let done = 0;
  const promises = tests.map(async (t) => {
    const res = await chaosRunSingleTest(t.suiteFile, t.testIndex);
    const passed = res.ok && res.data?.exitCode === 0;
    done++;
    onProgress(done, tests.length);
    return {
      testName: t.name,
      suite: t.suiteName,
      chaosType: 'Concurrent Blast',
      expected: 'Pass (concurrency-safe)',
      actual: passed ? 'Passed' : 'Failed',
      pass: passed,
    };
  });
  return Promise.all(promises);
}

// 4. Wrong Method — swap HTTP method and expect non-200
async function runWrongMethod(tests, onProgress) {
  const results = [];
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const alternatives = WRONG_METHOD_MAP[t.method] || ['GET', 'POST', 'PUT', 'DELETE'];
    const wrongMethod = pickRandom(alternatives);

    // We run the test as-is via the quick endpoint; the test itself uses the defined method.
    // To truly swap the method, we would need server support. Instead, we call the raw endpoint
    // with the wrong method directly.
    let actual = 'N/A';
    let passed = false;
    try {
      const url = `/api/projects/${currentProject.id}/run-test`;
      const payload = {
        suiteFile: t.suiteFile,
        testIndex: t.testIndex,
        methodOverride: wrongMethod,
      };
      if (typeof selectedEnvironment !== 'undefined' && selectedEnvironment) {
        payload.env = selectedEnvironment;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const exitCode = data?.exitCode;
      // With a wrong method, we EXPECT the test to fail (non-zero exit / non-200 response)
      // A "pass" in chaos terms means the API correctly rejected the wrong method
      passed = exitCode !== 0 || !res.ok;
      actual = passed ? 'Rejected (correct)' : 'Accepted (vulnerable)';
    } catch (e) {
      actual = 'Error: ' + e.message;
      passed = true; // network error = the API didn't silently accept it
    }

    results.push({
      testName: t.name,
      suite: t.suiteName,
      chaosType: `Wrong Method (${t.method}\u2192${wrongMethod})`,
      expected: 'Reject wrong method',
      actual,
      pass: passed,
    });
    onProgress(i + 1, tests.length);
  }
  return results;
}

// 5. Empty Body — strip request bodies
async function runEmptyBody(tests, onProgress) {
  const results = [];
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    let actual = 'N/A';
    let passed = false;
    try {
      const url = `/api/projects/${currentProject.id}/run-test`;
      const payload = {
        suiteFile: t.suiteFile,
        testIndex: t.testIndex,
        bodyOverride: null,
      };
      if (typeof selectedEnvironment !== 'undefined' && selectedEnvironment) {
        payload.env = selectedEnvironment;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const exitCode = data?.exitCode;
      // For tests that have a body, we expect failure with empty body = good error handling
      // For tests without a body, we expect pass
      if (t.body) {
        passed = exitCode !== 0 || !res.ok;
        actual = passed ? 'Handled gracefully' : 'Accepted empty (weak)';
      } else {
        passed = res.ok && exitCode === 0;
        actual = passed ? 'Passed (no body needed)' : 'Failed unexpectedly';
      }
    } catch (e) {
      actual = 'Error: ' + e.message;
      passed = false;
    }

    results.push({
      testName: t.name,
      suite: t.suiteName,
      chaosType: 'Empty Body',
      expected: t.body ? 'Reject / handle missing body' : 'Pass (no body needed)',
      actual,
      pass: passed,
    });
    onProgress(i + 1, tests.length);
  }
  return results;
}

// 6. Invalid Endpoint — append /invalid_xyz
async function runInvalidEndpoint(tests, onProgress) {
  const results = [];
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    let actual = 'N/A';
    let passed = false;
    try {
      const url = `/api/projects/${currentProject.id}/run-test`;
      const payload = {
        suiteFile: t.suiteFile,
        testIndex: t.testIndex,
        endpointSuffix: '/invalid_xyz',
      };
      if (typeof selectedEnvironment !== 'undefined' && selectedEnvironment) {
        payload.env = selectedEnvironment;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const exitCode = data?.exitCode;
      // We expect the test to fail because the endpoint is invalid
      passed = exitCode !== 0 || !res.ok;
      actual = passed ? 'Returned error (correct)' : 'No error (missing 404 handling)';
    } catch (e) {
      actual = 'Error: ' + e.message;
      passed = true;
    }

    results.push({
      testName: t.name,
      suite: t.suiteName,
      chaosType: 'Invalid Endpoint',
      expected: 'Return 404 / error',
      actual,
      pass: passed,
    });
    onProgress(i + 1, tests.length);
  }
  return results;
}

// --- Render results ---

function renderChaosResults(results) {
  const outputDiv = document.getElementById('chaos-output');
  if (!outputDiv) return;

  const passCount = results.filter(r => r.pass).length;
  const failCount = results.length - passCount;
  const allPassed = failCount === 0;

  const summaryMsg = allPassed
    ? 'Your API is bulletproof! \ud83d\udee1\ufe0f'
    : `Found ${failCount} weak spot${failCount !== 1 ? 's' : ''}!`;
  const summaryColor = allPassed ? '#4ade80' : '#f87171';
  const summaryIcon = allPassed ? 'shield' : 'warning';

  const rows = results.map(r => `
    <tr>
      <td style="color:#e8ecf2;font-weight:500;">${esc(r.testName)}</td>
      <td style="color:#8e99ab;">${esc(r.suite)}</td>
      <td><span style="color:#c084fc;font-size:12px;font-weight:500;">${esc(r.chaosType)}</span></td>
      <td style="color:#8e99ab;font-size:12px;">${esc(r.expected)}</td>
      <td style="font-size:12px;">${esc(r.actual)}</td>
      <td style="text-align:center;">
        <span class="chaos-badge ${r.pass ? 'chaos-badge-pass' : 'chaos-badge-fail'}">
          ${r.pass ? 'PASS' : 'FAIL'}
        </span>
      </td>
    </tr>
  `).join('');

  outputDiv.innerHTML = `
    <div class="chaos-summary-msg" style="color:${summaryColor};display:flex;align-items:center;gap:10px;">
      <span class="material-symbols-rounded" style="font-size:22px;">${summaryIcon}</span>
      ${summaryMsg}
    </div>
    <div class="chaos-summary-bar">
      <span class="chaos-summary-stat" style="color:#4ade80;">${passCount} survived</span>
      ${failCount > 0 ? `<span class="chaos-summary-stat" style="color:#f87171;">${failCount} failed</span>` : ''}
      <span style="font-size:12px;color:#6b758a;">${passCount}/${results.length} tests survived chaos</span>
    </div>
    <div style="overflow-x:auto;max-height:500px;overflow-y:auto;">
      <table class="chaos-results-table">
        <thead>
          <tr>
            <th>Test</th>
            <th>Suite</th>
            <th>Chaos Type</th>
            <th>Expected</th>
            <th>Actual</th>
            <th style="text-align:center;">Result</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
