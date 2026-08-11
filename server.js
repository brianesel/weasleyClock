import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STATUSES,
  listTrips,
  getTrip,
  createTrip,
  updateTrip,
  deleteTrip,
  addSignup,
  removeSignup,
} from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
// Change this in production via env var. Anyone with it can add/edit/delete trips.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'weasley';

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// --- Helpers ----------------------------------------------------------------

// Compute the current status given the trips and a reference date (YYYY-MM-DD).
// Returns the status of the trip that "contains" today; otherwise 'Home'.
function computeCurrentStatus(trips, todayStr) {
  const today = todayStr;
  const active = trips.find((t) => t.startDate && t.endDate && t.startDate <= today && today <= t.endDate);
  if (active) return { status: active.status, trip: active };
  return { status: 'Home', trip: null };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Strip private fields (emails) from a trip for public consumption.
function publicTrip(t) {
  const spotsLeft = t.capacity > 0 ? Math.max(0, t.capacity - t.signups.length) : null;
  return {
    id: t.id,
    destination: t.destination,
    status: t.status,
    startDate: t.startDate,
    endDate: t.endDate,
    notes: t.notes,
    capacity: t.capacity,
    signupCount: t.signups.length,
    spotsLeft, // null means unlimited / not tracked
    isFull: t.capacity > 0 && t.signups.length >= t.capacity,
    companions: t.signups.map((s) => ({ name: s.name, note: s.note })),
  };
}

function requireAdmin(req, res, next) {
  const provided = req.get('x-admin-password') || req.query.password;
  if (provided && provided === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// --- Public API -------------------------------------------------------------

// Health check for hosting platforms (Render, Fly, etc.). Returns 200 when the
// server is up and the data store is readable.
app.get('/healthz', (_req, res) => {
  try {
    const trips = listTrips();
    res.json({ status: 'ok', trips: trips.length });
  } catch (e) {
    res.status(500).json({ status: 'error' });
  }
});

app.get('/api/statuses', (_req, res) => {
  res.json({ statuses: STATUSES });
});

app.get('/api/trips', (_req, res) => {
  const trips = listTrips();
  res.json({ trips: trips.map(publicTrip) });
});

app.get('/api/status', (_req, res) => {
  const trips = listTrips();
  const today = todayISO();
  const { status, trip } = computeCurrentStatus(trips, today);
  res.json({
    today,
    status,
    trip: trip ? publicTrip(trip) : null,
  });
});

app.post('/api/trips/:id/signup', (req, res) => {
  const { name, email, note } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name_required' });
  }
  const result = addSignup(req.params.id, { name, email, note });
  if (result.error === 'not_found') return res.status(404).json({ error: 'not_found' });
  if (result.error === 'full') return res.status(409).json({ error: 'full' });
  res.status(201).json({ ok: true, trip: publicTrip(result.trip) });
});

// --- Admin auth check -------------------------------------------------------

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) return res.json({ ok: true });
  return res.status(401).json({ error: 'unauthorized' });
});

// --- Admin API (password protected) ----------------------------------------

// Admin view includes full signup details (with emails).
app.get('/api/admin/trips', requireAdmin, (_req, res) => {
  res.json({ trips: listTrips() });
});

app.post('/api/admin/trips', requireAdmin, (req, res) => {
  const { destination, status, startDate, endDate } = req.body || {};
  if (!destination || !startDate || !endDate) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (startDate > endDate) {
    return res.status(400).json({ error: 'bad_dates' });
  }
  const trip = createTrip(req.body);
  res.status(201).json({ trip });
});

app.put('/api/admin/trips/:id', requireAdmin, (req, res) => {
  const { startDate, endDate } = req.body || {};
  if (startDate && endDate && startDate > endDate) {
    return res.status(400).json({ error: 'bad_dates' });
  }
  const trip = updateTrip(req.params.id, req.body || {});
  if (!trip) return res.status(404).json({ error: 'not_found' });
  res.json({ trip });
});

app.delete('/api/admin/trips/:id', requireAdmin, (req, res) => {
  const ok = deleteTrip(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

app.delete('/api/admin/trips/:tripId/signups/:signupId', requireAdmin, (req, res) => {
  const ok = removeSignup(req.params.tripId, req.params.signupId);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  🧭  Weasley Travel Tracker running at http://localhost:${PORT}`);
  console.log(`      Admin page:  http://localhost:${PORT}/admin.html`);
  console.log(`      Admin password: "${ADMIN_PASSWORD}" (set ADMIN_PASSWORD env var to change)\n`);
});
