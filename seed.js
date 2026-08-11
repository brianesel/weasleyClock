// Optional: seed a few sample trips so the app has something to show.
// Run with `npm run seed`. Works against whichever backend is configured
// (Postgres if DATABASE_URL is set, otherwise the local JSON file).
// Safe to run repeatedly: it only seeds when the store is empty.

import { init, listTrips, createTrip } from './db.js';

const samples = [
  {
    destination: 'Kilimanjaro, Tanzania',
    status: 'High Altitude',
    startDate: '2026-09-05',
    endDate: '2026-09-14',
    capacity: 4,
    notes: 'Summit trek via the Machame route. Bring warm layers — it gets cold up top!',
  },
  {
    destination: 'Interlaken, Switzerland',
    status: 'Scared Shirtless',
    startDate: '2026-10-02',
    endDate: '2026-10-08',
    capacity: 3,
    notes: 'Skydiving and canyon swings over the Alps. Not for the faint of heart.',
  },
  {
    destination: 'Kyoto, Japan',
    status: 'Vacation',
    startDate: '2026-11-20',
    endDate: '2026-11-30',
    capacity: 6,
    notes: 'Temples, autumn leaves, and far too much ramen. Relaxed pace.',
  },
  {
    destination: 'Reykjavík, Iceland',
    status: 'Traveling',
    startDate: '2026-12-27',
    endDate: '2027-01-03',
    capacity: 0,
    notes: 'Northern lights road trip around the Ring Road.',
  },
];

await init();

if ((await listTrips()).length > 0) {
  console.log('Store already has trips — not seeding. Clear the store to reseed.');
  process.exit(0);
}

for (const s of samples) {
  await createTrip(s);
}
console.log(`Seeded ${samples.length} sample trips.`);
process.exit(0);
