// --- Scheduled Test Runs ---

const cronPresetLabels = {
  "every-5-min": "Every 5 minutes",
  "every-15-min": "Every 15 minutes",
  "every-30-min": "Every 30 minutes",
  "hourly": "Every hour",
  "every-6-hours": "Every 6 hours",
  "daily-midnight": "Daily at midnight",
  "daily-9am": "Daily at 9:00 AM",
  "weekdays-9am": "Weekdays at 9:00 AM",
};

async function showSchedules() {
  if (!currentProject) return;

  const resultDiv = document.getElementById('run-result');
  resultDiv.innerHTML = '<div class="shimmer skeleton-card"></div>';

  let schedules;
  try {
    schedules = await api('GET', `/api/projects/${currentProject.id}/schedules`);
  } catch {
    resultDiv.innerHTML = '';
    return;
  }

  const rows = schedules.map(s => {
    const enabled = s.enabled === 1;
    const nextRun = s.nextRunAt ? new Date(s.nextRunAt) : null;
    const lastRun = s.lastRunAt ? new Date(s.lastRunAt) : null;
    const nextStr = nextRun ? nextRun.toLocaleString() : 'N/A';
    const lastStr = lastRun ? lastRun.toLocaleString() : 'Never';

    return `
      <div class="schedule-row">
        <div class="sched-status-icon ${enabled ? 'sched-active' : 'sched-paused'}">
          <span class="material-symbols-rounded">${enabled ? 'schedule' : 'pause_circle'}</span>
        </div>
        <div class="schedule-info">
          <div class="schedule-name">${esc(s.name)}</div>
          <div class="schedule-meta">
            <code>${esc(s.cronExpr)}</code>
            <span class="schedule-dot">&bull;</span>
            Next: <strong>${nextStr}</strong>
            <span class="schedule-dot">&bull;</span>
            Last: ${lastStr}
          </div>
        </div>
        <div class="schedule-actions">
          <button class="icon-btn" onclick="toggleScheduleEnabled(${s.id}, ${enabled ? 0 : 1})" title="${enabled ? 'Pause' : 'Resume'}">
            <span class="material-symbols-rounded">${enabled ? 'pause' : 'play_arrow'}</span>
          </button>
          <button class="icon-btn danger" onclick="deleteScheduleItem(${s.id})" title="Delete">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </div>`;
  }).join('');

  const presetOptions = Object.entries(cronPresetLabels).map(([key, label]) =>
    `<option value="${key}">${label}</option>`
  ).join('');

  resultDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Scheduled Runs <span class="sched-count-badge">${schedules.length}</span></h3>
        <button class="icon-btn" onclick="document.getElementById('run-result').innerHTML=''" title="Close"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="schedule-add-form">
        <div class="sched-form-row">
          <div class="sched-field sched-field-name">
            <label class="sched-label">Name</label>
            <input type="text" id="sched-name" placeholder="e.g. Nightly Smoke Tests" class="sched-input">
          </div>
          <div class="sched-field sched-field-preset">
            <label class="sched-label">Preset</label>
            <div class="sched-select-wrap">
              <select id="sched-preset" class="sched-input sched-select" onchange="onPresetChange()">
                <option value="">Custom cron...</option>
                ${presetOptions}
              </select>
              <span class="material-symbols-rounded sched-select-arrow">expand_more</span>
            </div>
          </div>
          <div class="sched-field sched-field-cron" id="sched-cron-group">
            <label class="sched-label">Cron Expression</label>
            <input type="text" id="sched-cron" placeholder="*/30 * * * *" class="sched-input sched-input-mono">
          </div>
          <button class="btn btn-primary sched-add-btn" onclick="createSchedule()">
            <span class="material-symbols-rounded" style="font-size:16px;">add</span> Add
          </button>
        </div>
        <div class="sched-help">
          <span class="material-symbols-rounded" style="font-size:14px;vertical-align:-2px;margin-right:2px;">info</span>
          Format: <code>minute hour day-of-month month day-of-week</code>
          <span class="sched-help-sep">&bull;</span>
          <code>*/5 * * * *</code> every 5 min
          <span class="sched-help-sep">&bull;</span>
          <code>0 9 * * 1-5</code> weekdays 9am
        </div>
      </div>

      <div class="schedule-list">
        ${rows || `<div class="sched-empty">
          <span class="material-symbols-rounded" style="font-size:32px;color:var(--text-muted);margin-bottom:4px;">event_busy</span>
          <div>No schedules yet</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Add one above to automate your test runs</div>
        </div>`}
      </div>
    </div>`;
}

function onPresetChange() {
  const preset = document.getElementById('sched-preset').value;
  const cronGroup = document.getElementById('sched-cron-group');
  const cronInput = document.getElementById('sched-cron');
  if (preset) {
    cronGroup.style.display = 'none';
    cronInput.value = '';
  } else {
    cronGroup.style.display = '';
  }
}

async function createSchedule() {
  if (!currentProject) return;

  const name = document.getElementById('sched-name').value.trim();
  const preset = document.getElementById('sched-preset').value;
  const cronExpr = document.getElementById('sched-cron').value.trim();

  if (!preset && !cronExpr) {
    return toast('Select a preset or enter a cron expression', 'error');
  }

  try {
    const body = { name: name || undefined, preset: preset || undefined, cronExpr: cronExpr || undefined };
    await api('POST', `/api/projects/${currentProject.id}/schedules`, body);
    toast('Schedule created');
    showSchedules();
  } catch { /* toasted */ }
}

async function toggleScheduleEnabled(scheduleId, enabled) {
  if (!currentProject) return;
  try {
    await api('PUT', `/api/projects/${currentProject.id}/schedules/${scheduleId}`, { enabled: !!enabled });
    toast(enabled ? 'Schedule resumed' : 'Schedule paused');
    showSchedules();
  } catch { /* toasted */ }
}

async function deleteScheduleItem(scheduleId) {
  if (!currentProject) return;
  if (!confirm('Delete this schedule?')) return;
  try {
    await api('DELETE', `/api/projects/${currentProject.id}/schedules/${scheduleId}`);
    toast('Schedule deleted');
    showSchedules();
  } catch { /* toasted */ }
}
