// --- API Health Dashboard ---

async function showHealthDashboard() {
  if (!currentProject) return;

  const resultDiv = document.getElementById('run-result');
  resultDiv.innerHTML = '<div class="shimmer skeleton-card"></div>';

  // Fetch last 10 runs
  let runs;
  try {
    runs = await api('GET', `/api/projects/${currentProject.id}/runs`);
  } catch {
    resultDiv.innerHTML = '';
    toast('Failed to load run history', 'error');
    return;
  }

  runs = runs.slice(0, 10);

  if (runs.length === 0) {
    resultDiv.innerHTML = `
      <div class="card">
        <div class="card-body" style="text-align:center;color:var(--text-muted);padding:32px;">
          No test runs yet. Run some tests to see health data here.
        </div>
      </div>`;
    return;
  }

  // Fetch results for each run in parallel
  let runResults;
  try {
    runResults = await Promise.all(
      runs.map(r => api('GET', `/api/projects/${currentProject.id}/runs/${r.id}/results`).catch(() => []))
    );
  } catch {
    resultDiv.innerHTML = '';
    toast('Failed to load run results', 'error');
    return;
  }

  // Aggregate data
  const allResults = [];
  const perRunStats = [];

  for (let i = 0; i < runs.length; i++) {
    const results = runResults[i] || [];
    allResults.push(...results);
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const total = passed + failed;
    perRunStats.push({
      run: runs[i],
      results,
      passed,
      failed,
      total,
      passRate: total > 0 ? passed / total : 0
    });
  }

  // Overall health score
  const totalPassed = allResults.filter(r => r.status === 'passed').length;
  const totalFailed = allResults.filter(r => r.status === 'failed').length;
  const totalTests = totalPassed + totalFailed;
  const healthScore = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

  // Streak counter (consecutive passing runs, most recent first)
  const streak = computeStreak(runs);

  // Endpoint aggregation
  const endpointMap = aggregateEndpoints(allResults);

  // Build dashboard
  resultDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>API Health Dashboard <span style="font-size:12px;font-weight:400;color:var(--text-muted);">(last ${runs.length} runs)</span></h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn" onclick="showRunHistory()"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">history</span>History</button>
          <button class="icon-btn" onclick="document.getElementById('run-result').innerHTML=''" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <!-- Top row: health score + streak + sparkline -->
        <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:0;border-bottom:1px solid var(--border);">
          <div style="padding:24px;text-align:center;border-right:1px solid var(--border);">
            ${renderHealthCircle(healthScore)}
            <div style="margin-top:8px;font-size:12px;font-weight:600;color:var(--text-secondary);">Overall Health</div>
            <div style="font-size:11px;color:var(--text-muted);">${totalPassed} passed / ${totalFailed} failed</div>
          </div>
          <div style="padding:24px;text-align:center;border-right:1px solid var(--border);display:flex;flex-direction:column;justify-content:center;">
            ${renderStreakDisplay(streak, runs)}
          </div>
          <div style="padding:24px;">
            <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">Pass Rate Trend</div>
            ${renderSparkline(perRunStats)}
          </div>
        </div>

        <!-- Response Time Distribution -->
        <div style="border-bottom:1px solid var(--border);padding:20px 24px;">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:12px;">Slowest Endpoints (Avg Response Time)</div>
          ${renderResponseTimeBars(endpointMap)}
        </div>

        <!-- Endpoint Health Table -->
        <div style="padding:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);padding:16px 24px 8px;">Endpoint Health</div>
          ${renderEndpointTable(endpointMap)}
        </div>
      </div>
    </div>`;
}

// --- Health Circle (SVG) ---

function renderHealthCircle(score) {
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score > 90 ? 'var(--pass)' : score >= 70 ? 'var(--warn)' : 'var(--fail)';

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;margin:0 auto;">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
        fill="none" stroke="var(--border)" stroke-width="${strokeWidth}" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
        fill="none" stroke="${color}" stroke-width="${strokeWidth}"
        stroke-linecap="round"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${offset}"
        transform="rotate(-90 ${size / 2} ${size / 2})"
        style="transition:stroke-dashoffset 0.6s ease;" />
      <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
        fill="${color}" font-size="24" font-weight="700" font-family="inherit">${score}%</text>
    </svg>`;
}

// --- Streak ---

function computeStreak(runs) {
  let streak = 0;
  for (const run of runs) {
    if (run.exitCode === 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function renderStreakDisplay(streak, runs) {
  if (streak >= 1) {
    const fire = streak >= 3 ? '<span style="font-size:28px;">&#128293;</span>' : '';
    return `
      <div style="font-size:36px;font-weight:700;color:var(--pass);">${streak}</div>
      ${fire}
      <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-top:4px;">
        ${streak >= 3 ? '&#128293;' : ''} ${streak} run streak
      </div>
      <div style="font-size:11px;color:var(--text-muted);">consecutive passes</div>`;
  }

  // Find how many runs ago the last pass was
  let runsAgo = -1;
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].exitCode === 0) { runsAgo = i; break; }
  }

  if (runsAgo === -1) {
    return `
      <div style="font-size:36px;font-weight:700;color:var(--fail);">0</div>
      <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-top:4px;">No passing runs</div>
      <div style="font-size:11px;color:var(--text-muted);">in recent history</div>`;
  }

  return `
    <div style="font-size:36px;font-weight:700;color:var(--fail);">0</div>
    <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-top:4px;">Last passed: ${runsAgo} run${runsAgo !== 1 ? 's' : ''} ago</div>
    <div style="font-size:11px;color:var(--text-muted);">streak broken</div>`;
}

function renderStreakBadge() {
  // Returns an HTML string for inline toolbar display
  // This is a synchronous helper; streak data must be precomputed
  // Uses the _healthStreakCache if available
  const cache = window._healthStreakCache;
  if (!cache || cache.streak === undefined) return '';

  const streak = cache.streak;
  if (streak === 0) return '';

  const fire = streak >= 3 ? '&#128293; ' : '';
  const color = streak >= 3 ? 'var(--pass)' : 'var(--text-secondary)';

  return `<span style="font-size:12px;font-weight:600;color:${color};margin-left:8px;white-space:nowrap;">${fire}${streak} run streak</span>`;
}

// Preload streak data for toolbar badge
async function preloadStreakData() {
  if (!currentProject) {
    window._healthStreakCache = null;
    return;
  }

  try {
    const runs = await api('GET', `/api/projects/${currentProject.id}/runs`);
    const recent = runs.slice(0, 10);
    window._healthStreakCache = {
      streak: computeStreak(recent),
      totalRuns: recent.length
    };
  } catch {
    window._healthStreakCache = null;
  }
}

// --- Sparkline Chart (SVG) ---

function renderSparkline(perRunStats) {
  if (perRunStats.length < 2) {
    return '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:16px;">Need at least 2 runs for trend chart</div>';
  }

  const W = 360;
  const H = 100;
  const pad = { top: 8, right: 12, bottom: 20, left: 12 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  // Data is ordered most-recent-first; reverse so chart reads left-to-right chronologically
  const stats = [...perRunStats].reverse();

  function x(i) { return pad.left + (i / (stats.length - 1)) * chartW; }
  function y(rate) { return pad.top + chartH - rate * chartH; }

  // Build area fill path
  let areaPath = `M ${x(0)} ${y(0)}`;
  let linePath = `M ${x(0)} ${y(stats[0].passRate)}`;
  for (let i = 0; i < stats.length; i++) {
    if (i === 0) {
      areaPath = `M ${x(0)} ${y(stats[0].passRate)}`;
    } else {
      areaPath += ` L ${x(i)} ${y(stats[i].passRate)}`;
      linePath += ` L ${x(i)} ${y(stats[i].passRate)}`;
    }
  }
  const areaClose = ` L ${x(stats.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

  let svg = `<svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="display:block;">`;

  // Grid lines at 0%, 50%, 100%
  [0, 0.5, 1].forEach(rate => {
    svg += `<line x1="${pad.left}" y1="${y(rate)}" x2="${W - pad.right}" y2="${y(rate)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`;
  });

  // Y labels
  svg += `<text x="${pad.left + 2}" y="${y(1) - 2}" fill="var(--text-muted)" font-size="9">100%</text>`;
  svg += `<text x="${pad.left + 2}" y="${y(0.5) - 2}" fill="var(--text-muted)" font-size="9">50%</text>`;

  // Area fill
  svg += `<path d="${areaPath}${areaClose}" fill="var(--pass)" opacity="0.15"/>`;

  // Line
  svg += `<polyline points="${stats.map((s, i) => `${x(i)},${y(s.passRate)}`).join(' ')}" fill="none" stroke="var(--pass)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

  // Dots
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i];
    const dotColor = s.passRate >= 0.9 ? 'var(--pass)' : s.passRate >= 0.7 ? 'var(--warn)' : 'var(--fail)';
    const date = new Date(s.run.timestamp);
    const label = date.toLocaleDateString() + ': ' + Math.round(s.passRate * 100) + '% (' + s.passed + '/' + s.total + ')';
    svg += `<circle cx="${x(i)}" cy="${y(s.passRate)}" r="4" fill="${dotColor}" stroke="var(--surface)" stroke-width="2"><title>${label}</title></circle>`;
  }

  // X-axis: first and last dates
  const firstDate = new Date(stats[0].run.timestamp).toLocaleDateString();
  const lastDate = new Date(stats[stats.length - 1].run.timestamp).toLocaleDateString();
  svg += `<text x="${pad.left}" y="${H - 2}" fill="var(--text-muted)" font-size="9">${firstDate}</text>`;
  svg += `<text x="${W - pad.right}" y="${H - 2}" fill="var(--text-muted)" font-size="9" text-anchor="end">${lastDate}</text>`;

  svg += '</svg>';
  return svg;
}

// --- Endpoint Aggregation ---

function aggregateEndpoints(allResults) {
  const map = {};

  for (const r of allResults) {
    const key = (r.method || 'GET') + ' ' + (r.endpoint || '/unknown');
    if (!map[key]) {
      map[key] = {
        method: r.method || 'GET',
        endpoint: r.endpoint || '/unknown',
        passed: 0,
        failed: 0,
        total: 0,
        responseTimes: [],
        lastStatus: r.status
      };
    }
    const ep = map[key];
    ep.total++;
    if (r.status === 'passed') ep.passed++;
    else ep.failed++;
    if (r.responseTime !== undefined && r.responseTime !== null) {
      ep.responseTimes.push(Number(r.responseTime));
    }
    ep.lastStatus = r.status;
  }

  // Calculate avg response times
  for (const key of Object.keys(map)) {
    const ep = map[key];
    const times = ep.responseTimes;
    ep.avgResponseTime = times.length > 0
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : 0;
    ep.successRate = ep.total > 0 ? ep.passed / ep.total : 0;
  }

  return map;
}

// --- Endpoint Health Table ---

function renderEndpointTable(endpointMap) {
  const endpoints = Object.values(endpointMap);

  // Sort: failing first, then by slowest
  endpoints.sort((a, b) => {
    if (a.successRate !== b.successRate) return a.successRate - b.successRate;
    return b.avgResponseTime - a.avgResponseTime;
  });

  if (endpoints.length === 0) {
    return '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:16px;">No endpoint data available</div>';
  }

  const methodColors = {
    GET: '#3b82f6',
    POST: '#16a34a',
    PUT: '#d97706',
    PATCH: '#8b5cf6',
    DELETE: '#dc2626',
    HEAD: '#6b7280',
    OPTIONS: '#6b7280'
  };

  let rows = '';
  for (const ep of endpoints) {
    const rate = Math.round(ep.successRate * 100);
    const barColor = rate > 90 ? 'var(--pass)' : rate >= 70 ? 'var(--warn)' : 'var(--fail)';
    const methodColor = methodColors[ep.method] || 'var(--accent)';
    const statusDot = ep.lastStatus === 'passed'
      ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--pass);"></span>'
      : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--fail);"></span>';
    const avgTime = ep.avgResponseTime;
    const timeColor = avgTime < 200 ? 'var(--pass)' : avgTime <= 500 ? 'var(--warn)' : 'var(--fail)';

    rows += `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:10px 16px;white-space:nowrap;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;color:white;background:${methodColor};letter-spacing:0.5px;">${esc(ep.method)}</span>
          <span style="font-size:13px;font-family:monospace;margin-left:8px;color:var(--text);">${esc(ep.endpoint)}</span>
        </td>
        <td style="padding:10px 16px;min-width:160px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${rate}%;background:${barColor};border-radius:3px;transition:width 0.4s ease;"></div>
            </div>
            <span style="font-size:12px;font-weight:600;color:${barColor};min-width:36px;text-align:right;">${rate}%</span>
          </div>
        </td>
        <td style="padding:10px 16px;text-align:center;white-space:nowrap;">
          <span style="font-size:12px;font-family:monospace;font-weight:600;color:${timeColor};">${avgTime}ms</span>
        </td>
        <td style="padding:10px 16px;text-align:center;">
          ${statusDot}
        </td>
      </tr>`;
  }

  return `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid var(--border);">
            <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Endpoint</th>
            <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Success Rate</th>
            <th style="padding:8px 16px;text-align:center;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Avg Time</th>
            <th style="padding:8px 16px;text-align:center;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Last</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// --- Response Time Distribution (Horizontal Bar Chart) ---

function renderResponseTimeBars(endpointMap) {
  const endpoints = Object.values(endpointMap)
    .filter(ep => ep.avgResponseTime > 0)
    .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
    .slice(0, 5);

  if (endpoints.length === 0) {
    return '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:8px;">No response time data available</div>';
  }

  const maxTime = Math.max(...endpoints.map(ep => ep.avgResponseTime), 1);

  let html = '<div style="display:flex;flex-direction:column;gap:10px;">';

  for (const ep of endpoints) {
    const pct = (ep.avgResponseTime / maxTime) * 100;
    const barColor = ep.avgResponseTime < 200 ? 'var(--pass)' : ep.avgResponseTime <= 500 ? 'var(--warn)' : 'var(--fail)';
    const methodColors = {
      GET: '#3b82f6', POST: '#16a34a', PUT: '#d97706',
      PATCH: '#8b5cf6', DELETE: '#dc2626'
    };
    const mColor = methodColors[ep.method] || 'var(--accent)';

    html += `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div style="font-size:12px;display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;">
            <span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;color:white;background:${mColor};letter-spacing:0.5px;flex-shrink:0;">${esc(ep.method)}</span>
            <span style="font-family:monospace;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(ep.endpoint)}</span>
          </div>
          <span style="font-size:12px;font-weight:600;font-family:monospace;color:${barColor};flex-shrink:0;margin-left:8px;">${ep.avgResponseTime}ms</span>
        </div>
        <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width 0.4s ease;"></div>
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}
