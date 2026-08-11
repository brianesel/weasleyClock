// Home page: draw the Weasley-style clock, load trips, handle signups.

const SVGNS = 'http://www.w3.org/2000/svg';
const CX = 200;
const CY = 200;
let STATUSES = [];
let currentStatus = 'Home';

// --- Clock face -------------------------------------------------------------

// Position for a given index around the circle, starting at top (12 o'clock)
// and going clockwise.
function anglePos(index, total, radius) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2; // -90° so 0 is at top
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
    deg: (index / total) * 360,
  };
}

function drawFace(statuses) {
  const ticks = document.getElementById('ticks');
  const labels = document.getElementById('labels');
  ticks.innerHTML = '';
  labels.innerHTML = '';

  statuses.forEach((status, i) => {
    const outer = anglePos(i, statuses.length, 176);
    const inner = anglePos(i, statuses.length, 162);

    // Tick mark
    const line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('x1', outer.x);
    line.setAttribute('y1', outer.y);
    line.setAttribute('x2', inner.x);
    line.setAttribute('y2', inner.y);
    line.setAttribute('stroke', '#caa24a');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('opacity', '0.7');
    ticks.appendChild(line);

    // Label, placed a bit inside the tick and rotated to stay upright & readable.
    const lp = anglePos(i, statuses.length, 128);
    const text = document.createElementNS(SVGNS, 'text');
    text.setAttribute('x', lp.x);
    text.setAttribute('y', lp.y);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('class', 'clock-label');
    text.dataset.status = status;

    // Split long labels ("High Altitude", "Scared Shirtless") across two lines.
    const words = status.split(' ');
    if (words.length > 1) {
      words.forEach((w, wi) => {
        const tspan = document.createElementNS(SVGNS, 'tspan');
        tspan.setAttribute('x', lp.x);
        tspan.setAttribute('dy', wi === 0 ? '-0.55em' : '1.1em');
        tspan.textContent = w;
        text.appendChild(tspan);
      });
    } else {
      text.textContent = status;
    }
    labels.appendChild(text);
  });
}

function pointHandAt(status) {
  const idx = STATUSES.indexOf(status);
  const target = idx >= 0 ? idx : 0;
  const { deg } = anglePos(target, STATUSES.length, 1);
  const hand = document.getElementById('hand');
  hand.style.transform = `rotate(${deg}deg)`;

  // Highlight the active label.
  document.querySelectorAll('.clock-label').forEach((el) => {
    el.classList.toggle('active', el.dataset.status === status);
  });

  document.getElementById('statusPill').textContent = status;
}

// --- Data -------------------------------------------------------------------

function fmtDateRange(start, end) {
  const opts = { month: 'short', day: 'numeric' };
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sameYear = s.getFullYear() === e.getFullYear();
  const yr = e.getFullYear();
  const startStr = s.toLocaleDateString(undefined, opts);
  const endStr = e.toLocaleDateString(undefined, opts);
  return `${startStr} – ${endStr}, ${yr}${sameYear ? '' : ''}`;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - today) / 86400000);
}

function tripPhase(trip, today) {
  if (trip.startDate <= today && today <= trip.endDate) return 'now';
  if (trip.endDate < today) return 'past';
  return 'future';
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    currentStatus = data.status;
    pointHandAt(currentStatus);
    const summary = document.getElementById('statusSummary');
    if (data.trip) {
      summary.innerHTML = `Currently in <strong>${escapeHtml(data.trip.destination)}</strong> &mdash; back on ${new Date(data.trip.endDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.`;
    } else {
      summary.textContent = 'Home for now. Check the schedule below for upcoming adventures.';
    }
  } catch (e) {
    document.getElementById('statusSummary').textContent = 'Could not reach the clock.';
  }
}

async function loadTrips() {
  const list = document.getElementById('tripList');
  try {
    const res = await fetch('/api/trips');
    const { trips } = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = trips.filter((t) => tripPhase(t, today) !== 'past');

    if (upcoming.length === 0) {
      list.innerHTML = '<p class="muted loading">No trips on the schedule yet. Check back soon!</p>';
      return;
    }

    list.innerHTML = '';
    upcoming.forEach((t) => list.appendChild(renderTrip(t, today)));
  } catch (e) {
    list.innerHTML = '<p class="muted loading">Could not load trips.</p>';
  }
}

function renderTrip(t, today) {
  const phase = tripPhase(t, today);
  const card = document.createElement('article');
  card.className = 'trip-card' + (phase === 'now' ? ' is-now' : '');

  const spotsHtml =
    t.spotsLeft === null
      ? '<span class="spots"><span class="n">Open</span> — no cap</span>'
      : t.isFull
        ? '<span class="spots full"><span class="n">Full</span></span>'
        : `<span class="spots"><span class="n">${t.spotsLeft}</span> spot${t.spotsLeft === 1 ? '' : 's'} left</span>`;

  const whenBadge =
    phase === 'now'
      ? '<span class="badge now">Right now</span>'
      : `<span class="badge">in ${daysUntil(t.startDate)} day${daysUntil(t.startDate) === 1 ? '' : 's'}</span>`;

  const companionsHtml =
    t.companions.length > 0
      ? `<details class="companions">
           <summary>${t.companions.length} ${t.companions.length === 1 ? 'person is' : 'people are'} coming along</summary>
           <ul>${t.companions
             .map(
               (c) =>
                 `<li>${escapeHtml(c.name)}${c.note ? ` <span class="cnote">— ${escapeHtml(c.note)}</span>` : ''}</li>`,
             )
             .join('')}</ul>
         </details>`
      : '';

  card.innerHTML = `
    <div class="trip-main">
      <div class="trip-badges">
        <span class="badge status">${escapeHtml(t.status)}</span>
        ${whenBadge}
      </div>
      <h3>${escapeHtml(t.destination)}</h3>
      <p class="trip-dates">${fmtDateRange(t.startDate, t.endDate)}</p>
      ${t.notes ? `<p class="trip-notes">${escapeHtml(t.notes)}</p>` : ''}
      ${companionsHtml}
    </div>
    <div class="trip-side">
      ${spotsHtml}
      <button class="btn btn-primary btn-sm" ${t.isFull ? 'disabled' : ''} data-signup="${t.id}" data-dest="${escapeHtml(t.destination)}">
        ${t.isFull ? 'Full' : 'Join me'}
      </button>
    </div>
  `;

  const btn = card.querySelector('[data-signup]');
  if (btn && !t.isFull) {
    btn.addEventListener('click', () => openSignup(t));
  }
  return card;
}

// --- Signup modal -----------------------------------------------------------

let activeTripId = null;

function openSignup(trip) {
  activeTripId = trip.id;
  document.getElementById('signupTitle').textContent = `Join: ${trip.destination}`;
  document.getElementById('signupTripInfo').textContent = `${fmtDateRange(trip.startDate, trip.endDate)} · ${trip.status}`;
  const form = document.getElementById('signupForm');
  form.reset();
  document.getElementById('signupError').hidden = true;
  document.getElementById('signupModal').hidden = false;
  form.querySelector('input[name="name"]').focus();
}

function closeSignup() {
  document.getElementById('signupModal').hidden = true;
  activeTripId = null;
}

async function submitSignup(e) {
  e.preventDefault();
  const form = e.target;
  const err = document.getElementById('signupError');
  err.hidden = true;
  const payload = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    note: form.note.value.trim(),
  };
  if (!payload.name) {
    err.textContent = 'Please enter your name.';
    err.hidden = false;
    return;
  }
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing up…';
  try {
    const res = await fetch(`/api/trips/${activeTripId}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 409) throw new Error('Sorry, this trip just filled up.');
    if (!res.ok) throw new Error('Something went wrong. Please try again.');
    closeSignup();
    await loadTrips();
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Count me in';
  }
}

// --- Utils ------------------------------------------------------------------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// --- Init -------------------------------------------------------------------

async function init() {
  document.getElementById('signupClose').addEventListener('click', closeSignup);
  document.getElementById('signupModal').addEventListener('click', (e) => {
    if (e.target.id === 'signupModal') closeSignup();
  });
  document.getElementById('signupForm').addEventListener('submit', submitSignup);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSignup();
  });

  const res = await fetch('/api/statuses');
  STATUSES = (await res.json()).statuses;
  drawFace(STATUSES);
  pointHandAt('Home');

  await loadStatus();
  await loadTrips();
}

init();
