// --- API Helpers ---

async function api(method, url, data) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (data) opts.body = JSON.stringify(data);

  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    toast('Network error: unable to reach server', 'error');
    throw new Error('Network error');
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
    } catch { /* use default message */ }
    toast(msg, 'error');
    throw new Error(msg);
  }

  return res.json();
}

// --- Utility Functions ---

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
