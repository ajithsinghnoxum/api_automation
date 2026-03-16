// --- Response Time Race Animation ---
// Playful visualization where API endpoints race across the screen
// based on their response times from the last test run.

let raceCleanupFns = [];

function raceCleanup() {
  raceCleanupFns.forEach(fn => fn());
  raceCleanupFns = [];
  const style = document.getElementById('race-keyframes');
  if (style) style.remove();
}

async function showResponseRace() {
  if (!currentProject) return toast('No project selected', 'error');
  raceCleanup();

  const resultDiv = document.getElementById('run-result');
  resultDiv.innerHTML = '<div class="shimmer skeleton-card"></div>';

  let runs;
  try {
    runs = await api('GET', `/api/projects/${currentProject.id}/runs`);
  } catch { resultDiv.innerHTML = ''; return; }

  if (!runs || runs.length === 0) {
    resultDiv.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;color:var(--text-muted);padding:48px;">No runs yet. Run some tests first!</div></div>`;
    return;
  }

  const latestRun = runs[0];
  let results;
  try {
    results = await api('GET', `/api/projects/${currentProject.id}/runs/${latestRun.id}/results`);
  } catch { resultDiv.innerHTML = ''; return; }

  // Filter to results with response time data, take up to 10
  const racers = (results || [])
    .filter(r => r.responseTime && r.responseTime > 0)
    .slice(0, 10);

  if (racers.length === 0) {
    resultDiv.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;color:var(--text-muted);padding:48px;">No response time data available in the latest run.</div></div>`;
    return;
  }

  // Sort by response time for leaderboard (fastest first)
  const sorted = [...racers].sort((a, b) => a.responseTime - b.responseTime);

  // Build race UI
  resultDiv.innerHTML = buildRaceHTML(racers, sorted);
  injectRaceStyles(racers);
  startCountdown(racers, sorted);
}

function getMethodColor(method) {
  const m = (method || '').toUpperCase();
  if (m === 'GET') return '#22c55e';
  if (m === 'POST') return '#3b82f6';
  if (m === 'PUT') return '#f59e0b';
  if (m === 'DELETE') return '#ef4444';
  if (m === 'PATCH') return '#a855f7';
  return 'var(--accent)';
}

function getMedal(rank) {
  if (rank === 0) return '<span class="race-medal" title="1st Place">&#x1F3C6;</span>';
  if (rank === 1) return '<span class="race-medal" title="2nd Place">&#x1F948;</span>';
  if (rank === 2) return '<span class="race-medal" title="3rd Place">&#x1F949;</span>';
  return '';
}

function buildRaceHTML(racers, sorted) {
  const maxTime = Math.max(...racers.map(r => r.responseTime));

  let lanesHTML = '';
  for (let i = 0; i < racers.length; i++) {
    const r = racers[i];
    const color = getMethodColor(r.method);
    const altBg = i % 2 === 0 ? 'var(--surface)' : 'var(--surface-alt)';
    const endpoint = esc(r.endpoint || r.testName || 'Unknown');
    const method = esc((r.method || 'GET').toUpperCase());

    lanesHTML += `
      <div class="race-lane" style="background:${altBg};">
        <div class="race-label">
          <span class="race-method" style="background:${color};">${method}</span>
          <span class="race-endpoint" title="${endpoint}">${endpoint}</span>
        </div>
        <div class="race-track">
          <div class="race-bar" id="race-bar-${i}" style="background:${color};"></div>
          <span class="race-time" id="race-time-${i}"></span>
        </div>
      </div>`;
  }

  return `
    <div class="card" id="race-card">
      <div class="card-header">
        <h3><span class="material-symbols-rounded" style="font-size:20px;vertical-align:-4px;margin-right:6px;">sprint</span>Response Time Race</h3>
        <span style="font-size:12px;color:var(--text-muted);">Run #${esc(String(sorted[0] && sorted[0].runId || ''))}</span>
      </div>
      <div class="card-body" style="padding:0;">
        <div id="race-countdown" style="text-align:center;font-size:48px;font-weight:800;padding:32px 0;color:var(--accent);display:block;"></div>
        <div id="race-arena" style="display:none;position:relative;">
          <div class="race-finish-line"></div>
          ${lanesHTML}
        </div>
        <div id="race-leaderboard" style="display:none;"></div>
      </div>
    </div>`;
}

function injectRaceStyles(racers) {
  // Remove any old style element
  const old = document.getElementById('race-keyframes');
  if (old) old.remove();

  const maxTime = Math.max(...racers.map(r => r.responseTime));
  const totalDuration = 3; // seconds for the slowest racer

  let css = `
    .race-lane {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      gap: 12px;
      min-height: 44px;
      border-bottom: 1px solid var(--border);
    }
    .race-lane:last-child { border-bottom: none; }
    .race-label {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 200px;
      max-width: 200px;
      flex-shrink: 0;
    }
    .race-method {
      font-size: 10px;
      font-weight: 700;
      color: #fff;
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }
    .race-endpoint {
      font-size: 13px;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: 'Fira Code', 'Consolas', monospace;
    }
    .race-track {
      flex: 1;
      position: relative;
      height: 28px;
      border-radius: var(--radius);
      overflow: visible;
    }
    .race-bar {
      position: absolute;
      left: 0;
      top: 2px;
      height: 24px;
      border-radius: var(--radius);
      width: 0;
      opacity: 0.85;
      transition: none;
    }
    .race-time {
      position: absolute;
      right: -4px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 11px;
      font-weight: 700;
      color: var(--text-secondary);
      opacity: 0;
      white-space: nowrap;
      transition: opacity 0.3s;
    }
    .race-time.visible {
      opacity: 1;
    }
    .race-finish-line {
      position: absolute;
      right: 12px;
      top: 0;
      bottom: 0;
      width: 2px;
      border-right: 2px dashed var(--border);
      z-index: 1;
      pointer-events: none;
    }
    .race-medal {
      font-size: 16px;
      margin-right: 4px;
    }

    /* Leaderboard */
    .race-lb-row {
      display: flex;
      align-items: center;
      padding: 10px 16px;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    .race-lb-row:last-child { border-bottom: none; }
    .race-lb-rank {
      width: 32px;
      text-align: center;
      font-weight: 700;
      font-size: 14px;
      color: var(--text-muted);
    }
    .race-lb-info {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .race-lb-endpoint {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: 'Fira Code', 'Consolas', monospace;
    }
    .race-lb-time {
      font-weight: 700;
      font-size: 14px;
      min-width: 70px;
      text-align: right;
      color: var(--text);
    }
    .race-lb-status {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .race-lb-actions {
      padding: 16px;
      text-align: center;
    }

    #race-countdown {
      font-variant-numeric: tabular-nums;
      user-select: none;
    }
  `;

  // Keyframes for each racer
  for (let i = 0; i < racers.length; i++) {
    const r = racers[i];
    // Faster endpoints finish earlier, duration proportional to response time
    const duration = (r.responseTime / maxTime) * totalDuration;
    const stagger = (i * 0.05); // slight stagger per lane

    css += `
    @keyframes race-run-${i} {
      0% { width: 0; }
      100% { width: calc(100% - 24px); }
    }
    .race-bar.racing-${i} {
      animation: race-run-${i} ${duration.toFixed(2)}s ease-out ${stagger.toFixed(2)}s forwards;
    }`;
  }

  const style = document.createElement('style');
  style.id = 'race-keyframes';
  style.textContent = css;
  document.head.appendChild(style);
  raceCleanupFns.push(() => { const el = document.getElementById('race-keyframes'); if (el) el.remove(); });
}

function startCountdown(racers, sorted) {
  const countdownEl = document.getElementById('race-countdown');
  const arenaEl = document.getElementById('race-arena');
  if (!countdownEl || !arenaEl) return;

  const steps = [
    { text: '3', delay: 0 },
    { text: '2', delay: 400 },
    { text: '1', delay: 800 },
    { text: 'GO!', delay: 1200 }
  ];

  const timers = [];

  steps.forEach(step => {
    const t = setTimeout(() => {
      if (!countdownEl) return;
      countdownEl.textContent = step.text;
      countdownEl.style.transform = 'scale(1.2)';
      countdownEl.style.transition = 'transform 0.15s ease-out';
      setTimeout(() => { countdownEl.style.transform = 'scale(1)'; }, 150);
    }, step.delay);
    timers.push(t);
  });

  const goTimer = setTimeout(() => {
    countdownEl.style.display = 'none';
    arenaEl.style.display = 'block';
    startRace(racers, sorted);
  }, 1500);
  timers.push(goTimer);

  raceCleanupFns.push(() => timers.forEach(t => clearTimeout(t)));
}

function startRace(racers, sorted) {
  const maxTime = Math.max(...racers.map(r => r.responseTime));
  const totalDuration = 3;
  const timers = [];

  for (let i = 0; i < racers.length; i++) {
    const bar = document.getElementById(`race-bar-${i}`);
    const timeEl = document.getElementById(`race-time-${i}`);
    if (!bar) continue;

    // Start the animation
    bar.classList.add(`racing-${i}`);

    // Show time when the bar finishes
    const r = racers[i];
    const duration = (r.responseTime / maxTime) * totalDuration;
    const stagger = i * 0.05;
    const finishDelay = (duration + stagger) * 1000 + 50;

    const t = setTimeout(() => {
      if (!timeEl) return;
      // Position the time label at the end of the bar
      const rank = sorted.findIndex(s => s === r);
      const medal = getMedal(rank);
      timeEl.innerHTML = `${medal}${r.responseTime}ms`;
      timeEl.style.right = 'auto';
      timeEl.style.left = 'calc(100% - 16px)';
      timeEl.classList.add('visible');
    }, finishDelay);
    timers.push(t);
  }

  // Show leaderboard after all racers finish
  const slowest = (maxTime / maxTime) * totalDuration + racers.length * 0.05;
  const lbTimer = setTimeout(() => {
    showLeaderboard(sorted);
  }, (slowest + 0.5) * 1000);
  timers.push(lbTimer);

  raceCleanupFns.push(() => timers.forEach(t => clearTimeout(t)));
}

function showLeaderboard(sorted) {
  const lb = document.getElementById('race-leaderboard');
  if (!lb) return;

  let html = `
    <div style="padding:16px 16px 8px;border-top:1px solid var(--border);">
      <h4 style="margin:0 0 12px;font-size:14px;color:var(--text-secondary);">
        <span class="material-symbols-rounded" style="font-size:18px;vertical-align:-3px;margin-right:4px;">leaderboard</span>
        Leaderboard
      </h4>`;

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const medal = getMedal(i);
    const color = getMethodColor(r.method);
    const method = esc((r.method || 'GET').toUpperCase());
    const endpoint = esc(r.endpoint || r.testName || 'Unknown');
    const passed = r.status === 'pass' || r.status === 'passed';
    const statusColor = passed ? 'var(--pass)' : 'var(--fail)';
    const statusTitle = passed ? 'Passed' : 'Failed';

    html += `
      <div class="race-lb-row">
        <div class="race-lb-rank">${medal || (i + 1)}</div>
        <div class="race-lb-info">
          <span class="race-method" style="background:${color};">${method}</span>
          <span class="race-lb-endpoint" title="${endpoint}">${endpoint}</span>
        </div>
        <div class="race-lb-time">${r.responseTime}ms</div>
        <div class="race-lb-status" style="background:${statusColor};" title="${statusTitle}"></div>
      </div>`;
  }

  html += `
    </div>
    <div class="race-lb-actions">
      <button class="btn btn-secondary" onclick="showResponseRace()" style="gap:6px;">
        <span class="material-symbols-rounded" style="font-size:16px;">replay</span>
        Race Again
      </button>
    </div>`;

  lb.innerHTML = html;
  lb.style.display = 'block';
}
