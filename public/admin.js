// Admin dashboard: password login (kept in sessionStorage), CRUD trips, view signups.

let PASSWORD = sessionStorage.getItem('adminPassword') || null;
let STATUSES = [];

function authHeaders(extra = {}) {
  return { 'x-admin-password': PASSWORD, ...extra };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// --- Auth -------------------------------------------------------------------

async function tryLogin(password) {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

function showAdmin() {
  document.getElementById('loginView').hidden = true;
  document.getElementById('adminView').hidden = false;
  loadStatuses().then(loadTrips);
}

function showLogin() {
  document.getElementById('adminView').hidden = true;
  document.getElementById('loginView').hidden = false;
}

function logout() {
  PASSWORD = null;
  sessionStorage.removeItem('adminPassword');
  showLogin();
}

// --- Data -------------------------------------------------------------------

async function loadStatuses() {
  const res = await fetch('/api/statuses');
  STATUSES = (await res.json()).statuses;
  const sel = document.getElementById('statusSelect');
  sel.innerHTML = STATUSES.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

async function loadTrips() {
  const box = document.getElementById('adminTrips');
  const res = await fetch('/api/admin/trips', { headers: authHeaders() });
  if (res.status === 401) return logout();
  const { trips } = await res.json();
  if (!trips.length) {
    box.innerHTML = '<p class="hint">No trips yet. Add one on the left.</p>';
    return;
  }
  box.innerHTML = '';
  trips.forEach((t) => box.appendChild(renderAdminTrip(t)));
}

function fmt(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderAdminTrip(t) {
  const el = document.createElement('div');
  el.className = 'admin-trip';
  const cap = t.capacity > 0 ? `${t.signups.length}/${t.capacity} signed up` : `${t.signups.length} signed up (no cap)`;

  const signupRows = t.signups.length
    ? t.signups
        .map(
          (s) => `
      <div class="signup-row">
        <span>${escapeHtml(s.name)}${s.email ? ` &lt;${escapeHtml(s.email)}&gt;` : ''}${s.note ? ` — <span class="hint">${escapeHtml(s.note)}</span>` : ''}</span>
        <button class="btn btn-sm btn-danger" data-rm-signup="${t.id}:${s.id}">Remove</button>
      </div>`,
        )
        .join('')
    : '<p class="hint" style="margin:6px 0 0;">No signups yet.</p>';

  el.innerHTML = `
    <div class="row">
      <h4>${escapeHtml(t.destination)}</h4>
      <div class="admin-actions">
        <button class="btn btn-sm" data-edit="${t.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-del="${t.id}">Delete</button>
      </div>
    </div>
    <p class="hint">${escapeHtml(t.status)} · ${fmt(t.startDate)} – ${fmt(t.endDate)} · ${cap}</p>
    ${t.notes ? `<p style="margin:6px 0;">${escapeHtml(t.notes)}</p>` : ''}
    <div class="signups">${signupRows}</div>
  `;

  el.querySelector('[data-edit]').addEventListener('click', () => startEdit(t));
  el.querySelector('[data-del]').addEventListener('click', () => delTrip(t));
  el.querySelectorAll('[data-rm-signup]').forEach((b) => {
    b.addEventListener('click', () => {
      const [tripId, signupId] = b.dataset.rmSignup.split(':');
      rmSignup(tripId, signupId);
    });
  });
  return el;
}

// --- Create / edit ----------------------------------------------------------

function startEdit(t) {
  const f = document.getElementById('tripForm');
  f.id.value = t.id;
  f.destination.value = t.destination;
  f.status.value = t.status;
  f.startDate.value = t.startDate;
  f.endDate.value = t.endDate;
  f.capacity.value = t.capacity;
  f.notes.value = t.notes || '';
  document.getElementById('formTitle').textContent = 'Edit trip';
  document.getElementById('saveBtn').textContent = 'Save changes';
  document.getElementById('cancelEdit').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  const f = document.getElementById('tripForm');
  f.reset();
  f.id.value = '';
  f.capacity.value = '0';
  document.getElementById('formTitle').textContent = 'Add a trip';
  document.getElementById('saveBtn').textContent = 'Add trip';
  document.getElementById('cancelEdit').hidden = true;
  document.getElementById('tripError').hidden = true;
  document.getElementById('tripOk').hidden = true;
}

async function saveTrip(e) {
  e.preventDefault();
  const f = e.target;
  const err = document.getElementById('tripError');
  const ok = document.getElementById('tripOk');
  err.hidden = true;
  ok.hidden = true;

  const id = f.id.value;
  const payload = {
    destination: f.destination.value.trim(),
    status: f.status.value,
    startDate: f.startDate.value,
    endDate: f.endDate.value,
    capacity: parseInt(f.capacity.value, 10) || 0,
    notes: f.notes.value.trim(),
  };
  if (payload.startDate > payload.endDate) {
    err.textContent = 'End date must be on or after the start date.';
    err.hidden = false;
    return;
  }

  const url = id ? `/api/admin/trips/${id}` : '/api/admin/trips';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) return logout();
  if (!res.ok) {
    err.textContent = 'Could not save the trip. Check the fields and try again.';
    err.hidden = false;
    return;
  }
  ok.textContent = id ? 'Trip updated.' : 'Trip added.';
  ok.hidden = false;
  resetForm();
  ok.hidden = false; // resetForm hides it; show again briefly
  setTimeout(() => (ok.hidden = true), 2500);
  loadTrips();
}

async function delTrip(t) {
  if (!confirm(`Delete the trip to "${t.destination}"? This also removes its signups.`)) return;
  const res = await fetch(`/api/admin/trips/${t.id}`, { method: 'DELETE', headers: authHeaders() });
  if (res.status === 401) return logout();
  loadTrips();
}

async function rmSignup(tripId, signupId) {
  const res = await fetch(`/api/admin/trips/${tripId}/signups/${signupId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (res.status === 401) return logout();
  loadTrips();
}

// --- Init -------------------------------------------------------------------

async function init() {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('loginError');
    err.hidden = true;
    const pw = e.target.password.value;
    if (await tryLogin(pw)) {
      PASSWORD = pw;
      sessionStorage.setItem('adminPassword', pw);
      showAdmin();
    } else {
      err.textContent = 'Wrong password.';
      err.hidden = false;
    }
  });
  document.getElementById('tripForm').addEventListener('submit', saveTrip);
  document.getElementById('cancelEdit').addEventListener('click', resetForm);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Auto-resume session if we have a stored password that still works.
  if (PASSWORD && (await tryLogin(PASSWORD))) {
    showAdmin();
  } else {
    logout();
  }
}

init();
