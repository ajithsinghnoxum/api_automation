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
        <div class="schedule-info">
          <div class="schedule-name">
            <span class="material-symbols-rounded" style="font-size:18px;color:${enabled ? 'var(--pass)' : 'var(--text-muted)'};vertical-align:-4px;margin-right:4px;">
              ${enabled ? 'schedule' : 'pause_circle'}
            </span>
            ${esc(s.name)}
          </div>
          <div class="schedule-meta">
            <code>${esc(s.cronExpr)}</code>
            <span class="schedule-dot">&middot;</span>
            Next: <strong>${nextStr}</strong>
            <span class="schedule-dot">&middot;</span>
            Last: ${lastStr}
          </div>
        </div>
        <div class="schedule-actions">
          <button class="btn btn-sm" onclick="toggleScheduleEnabled(${s.id}, ${enabled ? 0 : 1})" title="${enabled ? 'Pause' : 'Resume'}">
            <span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">${enabled ? 'pause' : 'play_arrow'}</span>
            ${enabled ? 'Pause' : 'Resume'}
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteScheduleItem(${s.id})">
            <span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">delete</span>
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
        <h3>Scheduled Runs <span style="font-size:12px;font-weight:400;color:var(--text-muted);">(${schedules.length} schedule${schedules.length !== 1 ? 's' : ''})</span></h3>
        <button class="icon-btn" onclick="document.getElementById('run-result').innerHTML=''" title="Close"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="schedule-add-form">
        <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;">
          <div class="form-group" style="flex:1;min-width:140px;">
            <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px;">Name</label>
            <input type="text" id="sched-name" placeholder="e.g. Nightly Smoke Tests" class="input sched-input">
          </div>
          <div class="form-group" style="min-width:160px;">
            <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px;">Preset</label>
            <select id="sched-preset" class="input sched-input" onchange="onPresetChange()">
              <option value="">Custom cron...</option>
              ${presetOptions}
            </select>
          </div>
          <div class="form-group" id="sched-cron-group" style="min-width:120px;">
            <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px;">Cron Expression</label>
            <input type="text" id="sched-cron" placeholder="*/30 * * * *" class="input sched-input" style="font-family:monospace;">
          </div>
          <button class="btn btn-primary" onclick="createSchedule()" style="height:34px;">
            <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:4px;">add</span>Add
          </button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
          Format: <code>minute hour day-of-month month day-of-week</code> &nbsp;|&nbsp;
          Examples: <code>*/5 * * * *</code> (every 5 min), <code>0 9 * * 1-5</code> (weekdays 9am)
        </div>
      </div>

      <div class="schedule-list">
        ${rows || '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">No schedules yet. Add one above.</div>'}
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
