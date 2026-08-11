// Tiny JSON-file-backed data store. No native dependencies, so it runs anywhere.
// Data shape:
// {
//   trips: [
//     { id, destination, status, startDate, endDate, notes, capacity, signups: [ { id, name, email, note, createdAt } ] }
//   ]
// }

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
// DATA_DIR lets a host point the store at a mounted persistent volume
// (e.g. Fly's /data). Falls back to the local ./data folder for dev.
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'trips.json');

function ensureStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) writeFileSync(DATA_FILE, JSON.stringify({ trips: [] }, null, 2));
}

function load() {
  ensureStore();
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { trips: [] };
  }
}

function save(data) {
  ensureStore();
  // Atomic write: write to a temp file then rename.
  const tmp = DATA_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, DATA_FILE);
}

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

export function listTrips() {
  const { trips } = load();
  return trips
    .slice()
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
}

export function getTrip(id) {
  return load().trips.find((t) => t.id === id) || null;
}

export function createTrip(input) {
  const data = load();
  const trip = {
    id: randomUUID(),
    destination: String(input.destination || '').trim(),
    status: STATUSES.includes(input.status) ? input.status : 'Traveling',
    startDate: input.startDate,
    endDate: input.endDate,
    notes: String(input.notes || '').trim(),
    capacity: Math.max(0, parseInt(input.capacity, 10) || 0),
    createdAt: new Date().toISOString(),
    signups: [],
  };
  data.trips.push(trip);
  save(data);
  return trip;
}

export function updateTrip(id, input) {
  const data = load();
  const trip = data.trips.find((t) => t.id === id);
  if (!trip) return null;
  if (input.destination !== undefined) trip.destination = String(input.destination).trim();
  if (input.status !== undefined && STATUSES.includes(input.status)) trip.status = input.status;
  if (input.startDate !== undefined) trip.startDate = input.startDate;
  if (input.endDate !== undefined) trip.endDate = input.endDate;
  if (input.notes !== undefined) trip.notes = String(input.notes).trim();
  if (input.capacity !== undefined) trip.capacity = Math.max(0, parseInt(input.capacity, 10) || 0);
  save(data);
  return trip;
}

export function deleteTrip(id) {
  const data = load();
  const before = data.trips.length;
  data.trips = data.trips.filter((t) => t.id !== id);
  save(data);
  return data.trips.length < before;
}

export function addSignup(tripId, input) {
  const data = load();
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return { error: 'not_found' };
  if (trip.capacity > 0 && trip.signups.length >= trip.capacity) {
    return { error: 'full' };
  }
  const signup = {
    id: randomUUID(),
    name: String(input.name || '').trim(),
    email: String(input.email || '').trim(),
    note: String(input.note || '').trim(),
    createdAt: new Date().toISOString(),
  };
  trip.signups.push(signup);
  save(data);
  return { signup, trip };
}

export function removeSignup(tripId, signupId) {
  const data = load();
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return false;
  const before = trip.signups.length;
  trip.signups = trip.signups.filter((s) => s.id !== signupId);
  save(data);
  return trip.signups.length < before;
}
