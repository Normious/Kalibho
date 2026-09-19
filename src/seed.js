import { getDatabase } from './db.js';

const db = getDatabase();
const now = Date.now();

db.prepare(`
  INSERT OR IGNORE INTO projects
  (name, api_key, max_slug_length, collision_strategy, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(
  'Shop A',
  'shop-a-kalibho-key-2026',
  80, 'suffix',
  now, now
);

db.prepare(`
  INSERT OR IGNORE INTO projects
  (name, api_key, max_slug_length, collision_strategy, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(
  'Gig4Gig',
  'gig4gig-kalibho-key-2026',
  60, 'timestamp',
  now, now
);

console.log('✅ Seed data inserted');
