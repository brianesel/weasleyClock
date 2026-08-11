// Data store with two interchangeable backends, chosen at startup:
//
//   * Postgres  — used when DATABASE_URL is set (e.g. Neon on Render).
//   * JSON file — used otherwise (zero-config local development).
//
// Both expose the SAME async API so the rest of the app doesn't care which is
// active. Data shape returned to callers:
//   { id, destination, status, startDate, endDate, notes, capacity,
//     createdAt, signups: [ { id, name, email, note, createdAt } ] }

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Valid clock statuses. The first is the default "at rest" state.
export const STATUSES = [
  'Home',
  'Traveling',
  'In Transit',
  'Work',
  'Vacation',
  'High Altitude',
  'Lost',
  'Mortal Peril',
  'Scared Shirtless',
];

const USE_PG = !!process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// JSON-file backend
// ---------------------------------------------------------------------------

// DATA_DIR lets a host point the store at a mounted persistent volume.
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'trips.json');

function fileEnsure() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) writeFileSync(DATA_FILE, JSON.stringify({ trips: [] }, null, 2));
}
function fileLoad() {
  fileEnsure();
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { trips: [] };
  }
}
function fileSave(data) {
  fileEnsure();
  const tmp = DATA_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, DATA_FILE);
}

function normalizeTripInput(input, existing = {}) {
  return {
    destination:
      input.destination !== undefined ? String(input.destination).trim() : existing.destination,
    status:
      input.status !== undefined && STATUSES.includes(input.status)
        ? input.status
        : existing.status ?? 'Traveling',
    startDate: input.startDate !== undefined ? input.startDate : existing.startDate,
    endDate: input.endDate !== undefined ? input.endDate : existing.endDate,
    notes: input.notes !== undefined ? String(input.notes).trim() : existing.notes ?? '',
    capacity:
      input.capacity !== undefined
        ? Math.max(0, parseInt(input.capacity, 10) || 0)
        : existing.capacity ?? 0,
  };
}

const fileBackend = {
  async init() {
    fileEnsure();
  },
  async listTrips() {
    const { trips } = fileLoad();
    return trips
      .slice()
      .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  },
  async getTrip(id) {
    return fileLoad().trips.find((t) => t.id === id) || null;
  },
  async createTrip(input) {
    const data = fileLoad();
    const n = normalizeTripInput(input);
    const trip = {
      id: randomUUID(),
      destination: n.destination || '',
      status: n.status,
      startDate: n.startDate,
      endDate: n.endDate,
      notes: n.notes,
      capacity: n.capacity,
      createdAt: new Date().toISOString(),
      signups: [],
    };
    data.trips.push(trip);
    fileSave(data);
    return trip;
  },
  async updateTrip(id, input) {
    const data = fileLoad();
    const trip = data.trips.find((t) => t.id === id);
    if (!trip) return null;
    const n = normalizeTripInput(input, trip);
    Object.assign(trip, n);
    fileSave(data);
    return trip;
  },
  async deleteTrip(id) {
    const data = fileLoad();
    const before = data.trips.length;
    data.trips = data.trips.filter((t) => t.id !== id);
    fileSave(data);
    return data.trips.length < before;
  },
  async addSignup(tripId, input) {
    const data = fileLoad();
    const trip = data.trips.find((t) => t.id === tripId);
    if (!trip) return { error: 'not_found' };
    if (trip.capacity > 0 && trip.signups.length >= trip.capacity) return { error: 'full' };
    const signup = {
      id: randomUUID(),
      name: String(input.name || '').trim(),
      email: String(input.email || '').trim(),
      note: String(input.note || '').trim(),
      createdAt: new Date().toISOString(),
    };
    trip.signups.push(signup);
    fileSave(data);
    return { signup, trip };
  },
  async removeSignup(tripId, signupId) {
    const data = fileLoad();
    const trip = data.trips.find((t) => t.id === tripId);
    if (!trip) return false;
    const before = trip.signups.length;
    trip.signups = trip.signups.filter((s) => s.id !== signupId);
    fileSave(data);
    return trip.signups.length < before;
  },
};

// ---------------------------------------------------------------------------
// Postgres backend
// ---------------------------------------------------------------------------

let pool = null;

async function getPool() {
  if (pool) return pool;
  const { default: pg } = await import('pg');
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Managed Postgres (Neon, Render, etc.) requires TLS. Set DATABASE_SSL=false
    // for a local server that doesn't use SSL.
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  return pool;
}

// Dates are stored as TEXT ('YYYY-MM-DD') so string comparisons behave exactly
// like the JSON backend and there are no timezone surprises.
function rowToTrip(row, signups) {
  return {
    id: row.id,
    destination: row.destination,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes || '',
    capacity: row.capacity,
    createdAt: row.created_at,
    signups: signups || [],
  };
}
function rowToSignup(row) {
  return { id: row.id, name: row.name, email: row.email || '', note: row.note || '', createdAt: row.created_at };
}

const pgBackend = {
  async init() {
    const p = await getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id          UUID PRIMARY KEY,
        destination TEXT NOT NULL,
        status      TEXT NOT NULL,
        start_date  TEXT NOT NULL,
        end_date    TEXT NOT NULL,
        notes       TEXT NOT NULL DEFAULT '',
        capacity    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS signups (
        id         UUID PRIMARY KEY,
        trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        email      TEXT NOT NULL DEFAULT '',
        note       TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS signups_trip_id_idx ON signups(trip_id);
    `);
  },

  async listTrips() {
    const p = await getPool();
    const { rows: trips } = await p.query('SELECT * FROM trips ORDER BY start_date ASC');
    if (trips.length === 0) return [];
    const ids = trips.map((t) => t.id);
    const { rows: signups } = await p.query(
      'SELECT * FROM signups WHERE trip_id = ANY($1) ORDER BY created_at ASC',
      [ids],
    );
    const byTrip = new Map();
    for (const s of signups) {
      if (!byTrip.has(s.trip_id)) byTrip.set(s.trip_id, []);
      byTrip.get(s.trip_id).push(rowToSignup(s));
    }
    return trips.map((t) => rowToTrip(t, byTrip.get(t.id) || []));
  },

  async getTrip(id) {
    const p = await getPool();
    const { rows } = await p.query('SELECT * FROM trips WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    const { rows: signups } = await p.query(
      'SELECT * FROM signups WHERE trip_id = $1 ORDER BY created_at ASC',
      [id],
    );
    return rowToTrip(rows[0], signups.map(rowToSignup));
  },

  async createTrip(input) {
    const p = await getPool();
    const n = normalizeTripInput(input);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await p.query(
      `INSERT INTO trips (id, destination, status, start_date, end_date, notes, capacity, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, n.destination || '', n.status, n.startDate, n.endDate, n.notes, n.capacity, createdAt],
    );
    return { id, ...n, destination: n.destination || '', createdAt, signups: [] };
  },

  async updateTrip(id, input) {
    const p = await getPool();
    const existing = await this.getTrip(id);
    if (!existing) return null;
    const n = normalizeTripInput(input, existing);
    await p.query(
      `UPDATE trips SET destination=$2, status=$3, start_date=$4, end_date=$5, notes=$6, capacity=$7
       WHERE id=$1`,
      [id, n.destination || '', n.status, n.startDate, n.endDate, n.notes, n.capacity],
    );
    return { ...existing, ...n, destination: n.destination || '' };
  },

  async deleteTrip(id) {
    const p = await getPool();
    const { rowCount } = await p.query('DELETE FROM trips WHERE id = $1', [id]);
    return rowCount > 0;
  },

  async addSignup(tripId, input) {
    const p = await getPool();
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      // Lock the trip row so a concurrent signup can't overshoot capacity.
      const { rows } = await client.query('SELECT * FROM trips WHERE id = $1 FOR UPDATE', [tripId]);
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'not_found' };
      }
      const trip = rows[0];
      const { rows: countRows } = await client.query(
        'SELECT COUNT(*)::int AS c FROM signups WHERE trip_id = $1',
        [tripId],
      );
      const count = countRows[0].c;
      if (trip.capacity > 0 && count >= trip.capacity) {
        await client.query('ROLLBACK');
        return { error: 'full' };
      }
      const signup = {
        id: randomUUID(),
        name: String(input.name || '').trim(),
        email: String(input.email || '').trim(),
        note: String(input.note || '').trim(),
        createdAt: new Date().toISOString(),
      };
      await client.query(
        'INSERT INTO signups (id, trip_id, name, email, note, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [signup.id, tripId, signup.name, signup.email, signup.note, signup.createdAt],
      );
      await client.query('COMMIT');
      const full = await this.getTrip(tripId);
      return { signup, trip: full };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  async removeSignup(tripId, signupId) {
    const p = await getPool();
    const { rowCount } = await p.query('DELETE FROM signups WHERE id = $1 AND trip_id = $2', [
      signupId,
      tripId,
    ]);
    return rowCount > 0;
  },
};

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const backend = USE_PG ? pgBackend : fileBackend;

export const usingPostgres = USE_PG;
export const init = () => backend.init();
export const listTrips = () => backend.listTrips();
export const getTrip = (id) => backend.getTrip(id);
export const createTrip = (input) => backend.createTrip(input);
export const updateTrip = (id, input) => backend.updateTrip(id, input);
export const deleteTrip = (id) => backend.deleteTrip(id);
export const addSignup = (tripId, input) => backend.addSignup(tripId, input);
export const removeSignup = (tripId, signupId) => backend.removeSignup(tripId, signupId);
