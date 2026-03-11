// --- Projects ---

async function loadProjects() {
  // Show shimmer while loading
  const list = document.getElementById('project-list');
  list.innerHTML = Array(3).fill('<div class="shimmer skeleton-project"></div>').join('');

  projects = await api('GET', '/api/projects');
  renderProjectList();
}

function renderProjectList() {
  const list = document.getElementById('project-list');
  if (projects.length === 0) {
    list.innerHTML = '<div style="padding: 8px 12px; font-size: 13px; color: var(--text-muted);">No projects yet</div>';
    return;
  }
  list.innerHTML = projects.map(p => {
    const initials = p.name.split(/[\s-]+/).map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2);
    return `
    <div class="project-item ${currentProject?.id === p.id ? 'active' : ''}" onclick="selectProject('${p.id}')" data-initials="${esc(initials)}" title="${esc(p.name)}">
      <div class="project-info">
        <div class="name">${esc(p.name)}</div>
        <div class="count">${esc(p.baseUrl || 'No URL set')}</div>
      </div>
      <div class="actions">
        <button class="icon-btn" onclick="event.stopPropagation(); cloneProject('${p.id}')" title="Clone"><span class="material-symbols-rounded">content_copy</span></button>
        <button class="icon-btn" onclick="event.stopPropagation(); editProject('${p.id}')" title="Edit"><span class="material-symbols-rounded">edit</span></button>
        <button class="icon-btn danger" onclick="event.stopPropagation(); deleteProject('${p.id}')" title="Delete"><span class="material-symbols-rounded">delete</span></button>
      </div>
    </div>`;
  }).join('');
}

async function selectProject(id) {
  currentProject = projects.find(p => p.id === id);
  selectedEnvironment = '';
  renderProjectList();
  showProjectViewShimmer();
  await loadSuites();
  renderProjectView();
  updateBreadcrumb();
}

function openProjectModal(editing = null) {
  editingProjectId = editing?.id || null;
  document.getElementById('project-modal-title').textContent = editing ? 'Edit Project' : 'New Project';
  document.getElementById('pm-name').value = editing?.name || '';
  document.getElementById('pm-id').value = editing?.id || '';
  document.getElementById('pm-baseUrl').value = editing?.baseUrl || '';
  document.getElementById('pm-authType').value = editing?.authType || 'none';
  document.getElementById('pm-token').value = editing?.credentials?.token || '';
  document.getElementById('pm-username').value = editing?.credentials?.username || '';
  document.getElementById('pm-password').value = editing?.credentials?.password || '';
  document.getElementById('pm-apikey').value = editing?.credentials?.apiKey || '';
  document.getElementById('pm-apikeyheader').value = editing?.credentials?.apiKeyHeader || 'X-API-Key';
  toggleAuthFields();
  renderEnvironmentRows(editing?.environments || []);
  populateNotificationFields(editing?.notifications || {});
  document.getElementById('project-modal').classList.add('open');

  // Auto-generate ID from name
  const nameInput = document.getElementById('pm-name');
  const idInput = document.getElementById('pm-id');
  if (!editing) {
    nameInput.oninput = () => {
      idInput.value = nameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    };
  }
}

function closeProjectModal() {
  document.getElementById('project-modal').classList.remove('open');
  editingProjectId = null;
}

function toggleAuthFields() {
  const authType = document.getElementById('pm-authType').value;
  const groups = {
    bearer: ['pm-token-group'],
    basic: ['pm-username-group', 'pm-password-group'],
    'api-key': ['pm-apikey-group', 'pm-apikeyheader-group'],
  };
  const allIds = ['pm-token-group', 'pm-username-group', 'pm-password-group', 'pm-apikey-group', 'pm-apikeyheader-group'];
  const activeIds = groups[authType] || [];
  allIds.forEach(id => {
    const el = document.getElementById(id);
    if (activeIds.includes(id)) {
      el.style.display = '';
      el.classList.remove('field-hidden');
    } else {
      el.classList.add('field-hidden');
      // After transition, hide with display:none
      setTimeout(() => { if (el.classList.contains('field-hidden')) el.style.display = 'none'; }, 200);
    }
  });
}

async function saveProject() {
  const data = {
    id: document.getElementById('pm-id').value || undefined,
    name: document.getElementById('pm-name').value,
    baseUrl: document.getElementById('pm-baseUrl').value,
    authType: document.getElementById('pm-authType').value,
    credentials: {
      token: document.getElementById('pm-token').value,
      username: document.getElementById('pm-username').value,
      password: document.getElementById('pm-password').value,
      apiKey: document.getElementById('pm-apikey').value,
      apiKeyHeader: document.getElementById('pm-apikeyheader').value || 'X-API-Key',
    },
    environments: collectEnvironments(),
    notifications: collectNotifications(),
  };

  if (!data.name) return toast('Project name is required', 'error');

  try {
    if (editingProjectId) {
      await api('PUT', `/api/projects/${editingProjectId}`, data);
      toast('Project updated');
    } else {
      await api('POST', '/api/projects', data);
      toast('Project created');
    }

    closeProjectModal();
    await loadProjects();
    if (data.id || editingProjectId) selectProject(data.id || editingProjectId);
  } catch { /* error already toasted by api() */ }
}

function editProject(id) {
  const p = projects.find(pr => pr.id === id);
  if (p) openProjectModal(p);
}

async function deleteProject(id) {
  if (!confirm('Delete this project and all its test suites?')) return;
  try {
    await api('DELETE', `/api/projects/${id}`);
    if (currentProject?.id === id) {
      currentProject = null;
      document.getElementById('project-view').style.display = 'none';
      document.getElementById('empty-state').style.display = '';
    }
    toast('Project deleted');
    await loadProjects();
  } catch { /* error already toasted by api() */ }
}

// --- Clone Project ---

async function cloneProject(id) {
  try {
    const allProjects = await api('GET', '/api/projects');
    const project = allProjects.find(p => p.id === id);
    if (!project) return toast('Project not found', 'error');

    const suites = await api('GET', `/api/projects/${id}/suites`);
    const bundle = {
      version: 1,
      type: 'project-bundle',
      project: { ...project, id: project.id + '-copy', name: project.name + ' (copy)' },
      suites: suites.map(s => {
        const { fileName, ...suiteData } = s;
        return { fileName, ...suiteData };
      })
    };

    const result = await api('POST', '/api/import/project', bundle);
    toast(`Project cloned with ${result.suitesImported} suite(s)`);
    await loadProjects();
    selectProject(result.project.id);
  } catch (e) {
    toast('Failed to clone: ' + e.message, 'error');
  }
}

// --- Environment Management ---

function renderEnvironmentRows(environments) {
  const container = document.getElementById('pm-environments');
  container.innerHTML = '';
  (environments || []).forEach((env, i) => addEnvironmentRow(env));
}

function addEnvironmentRow(env) {
  const container = document.getElementById('pm-environments');
  const row = document.createElement('div');
  row.className = 'env-row';
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;padding:12px;background:var(--surface-alt);border-radius:8px;flex-wrap:wrap;';
  row.innerHTML = `
    <div style="flex:1;min-width:120px;">
      <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px;">Name</label>
      <input type="text" class="env-name" value="${esc(env?.name || '')}" placeholder="staging" style="width:100%;">
    </div>
    <div style="flex:2;min-width:200px;">
      <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px;">Base URL</label>
      <input type="text" class="env-baseUrl" value="${esc(env?.baseUrl || '')}" placeholder="https://staging-api.example.com" style="width:100%;">
    </div>
    <div style="flex:1;min-width:120px;">
      <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px;">Auth Type</label>
      <select class="env-authType" style="width:100%;">
        <option value="">Same as project</option>
        <option value="none" ${env?.authType === 'none' ? 'selected' : ''}>None</option>
        <option value="bearer" ${env?.authType === 'bearer' ? 'selected' : ''}>Bearer</option>
        <option value="basic" ${env?.authType === 'basic' ? 'selected' : ''}>Basic</option>
        <option value="api-key" ${env?.authType === 'api-key' ? 'selected' : ''}>API Key</option>
      </select>
    </div>
    <div style="flex:2;min-width:200px;">
      <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px;">Credentials (JSON)</label>
      <input type="text" class="env-credentials" value="${esc(env?.credentials ? JSON.stringify(env.credentials) : '')}" placeholder='{"token":"..."}' style="width:100%;font-family:monospace;font-size:12px;">
    </div>
    <button class="icon-btn danger" onclick="this.parentElement.remove()" title="Remove" style="margin-top:18px;">
      <span class="material-symbols-rounded">close</span>
    </button>
  `;
  container.appendChild(row);
}

function collectEnvironments() {
  const rows = document.querySelectorAll('#pm-environments .env-row');
  const envs = [];
  rows.forEach(row => {
    const name = row.querySelector('.env-name').value.trim();
    if (!name) return;
    const env = { name, baseUrl: row.querySelector('.env-baseUrl').value.trim() };
    const authType = row.querySelector('.env-authType').value;
    if (authType) env.authType = authType;
    const credsStr = row.querySelector('.env-credentials').value.trim();
    if (credsStr) {
      try { env.credentials = JSON.parse(credsStr); } catch { /* ignore invalid JSON */ }
    }
    envs.push(env);
  });
  return envs;
}

// --- Notification Config ---

function populateNotificationFields(notif) {
  document.getElementById('pm-notif-enabled').checked = !!notif.enabled;
  document.getElementById('pm-notif-failure-only').checked = notif.onFailureOnly !== false;
  document.getElementById('pm-notif-slack-url').value = notif.slack?.webhookUrl || '';
  document.getElementById('pm-notif-teams-url').value = notif.teams?.webhookUrl || '';
  document.getElementById('pm-notif-email-to').value = notif.email?.to || '';
  document.getElementById('pm-notif-email-from').value = notif.email?.from || '';
  document.getElementById('pm-notif-smtp-host').value = notif.email?.smtpHost || '';
  document.getElementById('pm-notif-smtp-port').value = notif.email?.smtpPort || '';
  document.getElementById('pm-notif-smtp-user').value = notif.email?.smtpUser || '';
  document.getElementById('pm-notif-smtp-pass').value = notif.email?.smtpPass || '';
  updateNotifChannelStatus();
}

function collectNotifications() {
  const notif = {
    enabled: document.getElementById('pm-notif-enabled').checked,
    onFailureOnly: document.getElementById('pm-notif-failure-only').checked,
  };

  const slackUrl = document.getElementById('pm-notif-slack-url').value.trim();
  if (slackUrl) notif.slack = { webhookUrl: slackUrl };

  const teamsUrl = document.getElementById('pm-notif-teams-url').value.trim();
  if (teamsUrl) notif.teams = { webhookUrl: teamsUrl };

  const emailTo = document.getElementById('pm-notif-email-to').value.trim();
  const smtpHost = document.getElementById('pm-notif-smtp-host').value.trim();
  if (emailTo || smtpHost) {
    notif.email = {
      to: emailTo,
      from: document.getElementById('pm-notif-email-from').value.trim() || undefined,
      smtpHost: smtpHost || undefined,
      smtpPort: parseInt(document.getElementById('pm-notif-smtp-port').value) || undefined,
      smtpUser: document.getElementById('pm-notif-smtp-user').value.trim() || undefined,
      smtpPass: document.getElementById('pm-notif-smtp-pass').value.trim() || undefined,
    };
  }

  return notif;
}

function updateNotifChannelStatus() {
  const slackUrl = document.getElementById('pm-notif-slack-url').value.trim();
  const teamsUrl = document.getElementById('pm-notif-teams-url').value.trim();
  const emailTo = document.getElementById('pm-notif-email-to').value.trim();

  const slackStatus = document.getElementById('notif-slack-status');
  const teamsStatus = document.getElementById('notif-teams-status');
  const emailStatus = document.getElementById('notif-email-status');

  if (slackStatus) slackStatus.textContent = slackUrl ? 'Configured' : '';
  if (teamsStatus) teamsStatus.textContent = teamsUrl ? 'Configured' : '';
  if (emailStatus) emailStatus.textContent = emailTo ? 'Configured' : '';
}

async function testNotification() {
  if (!editingProjectId && !currentProject) return toast('Save the project first', 'error');

  // Save current config first, then test
  const projectId = editingProjectId || currentProject?.id;
  if (!projectId) return toast('No project selected', 'error');

  const btn = event.target.closest('button');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-rounded spin" style="font-size:15px;vertical-align:-3px;">progress_activity</span> Sending...';
  }

  try {
    // Save project first to persist notification config
    await saveProject();

    const result = await api('POST', `/api/projects/${projectId}/test-notification`);
    toast(result.message || 'Test notification sent');
  } catch {
    /* toasted */
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;margin-right:4px;">send</span> Send Test Notification';
    }
  }
}
