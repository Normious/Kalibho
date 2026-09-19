import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Isolated test DB
process.env.DATABASE_PATH = './data/kalibho.test.db';
process.env.PORT = '4020';
try { fs.unlinkSync('./data/kalibho.test.db'); } catch {}
try { fs.unlinkSync('./data/kalibho.test.db-wal'); } catch {}
try { fs.unlinkSync('./data/kalibho.test.db-shm'); } catch {}

const { default: app } = await import('../src/server.js');
const { getDatabase } = await import('../src/db.js');

const KEY = 'test-key-123';
let projectId;

before(async () => {
  const db = getDatabase();
  const now = Date.now();
  db.prepare(`DELETE FROM slug_history WHERE project_id IN (SELECT id FROM projects WHERE api_key IN (?, ?))`).run(KEY, 'other-key-456');
  db.prepare(`DELETE FROM slugs WHERE project_id IN (SELECT id FROM projects WHERE api_key IN (?, ?))`).run(KEY, 'other-key-456');
  db.prepare(`DELETE FROM projects WHERE api_key IN (?, ?)`).run(KEY, 'other-key-456');
  const r = db.prepare(
    `INSERT INTO projects (name, api_key, max_slug_length, collision_strategy, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('Test Project', KEY, 80, 'suffix', now, now);
  projectId = r.lastInsertRowid;
  assert.ok(projectId);
});

after(async () => {
  await app.close();
});

const H = { 'x-api-key': KEY, 'content-type': 'application/json' };

describe('Kalibho API', () => {
  it('401 without key', async () => {
    const res = await app.inject({ method: 'POST', url: '/slug/generate', payload: { title: 'x' } });
    assert.equal(res.statusCode, 401);
  });

  it('generate simple slug', async () => {
    const res = await app.inject({ method: 'POST', url: '/slug/generate', headers: H, payload: { title: 'Wireless Headphones Pro Max' } });
    assert.equal(res.statusCode, 200);
    const b = res.json();
    assert.equal(b.slug, 'wireless-headphones-pro-max');
    assert.equal(b.collision, false);
  });

  it('collision → -2 suffix', async () => {
    const res = await app.inject({ method: 'POST', url: '/slug/generate', headers: H, payload: { title: 'Wireless Headphones Pro Max' } });
    const b = res.json();
    assert.equal(b.slug, 'wireless-headphones-pro-max-2');
    assert.equal(b.collision, true);
  });

  it('unicode title', async () => {
    const res = await app.inject({ method: 'POST', url: '/slug/generate', headers: H, payload: { title: 'Café Déjà Vu — N°1 Review' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().slug, 'cafe-deja-vu-n-1-review');
  });

  it('check taken + free', async () => {
    const taken = await app.inject({ method: 'GET', url: '/slug/check/wireless-headphones-pro-max', headers: H });
    assert.equal(taken.json().available, false);
    const free = await app.inject({ method: 'GET', url: '/slug/check/definitely-free-xyz-123', headers: H });
    assert.equal(free.json().available, true);
  });

  it('batch generate', async () => {
    const res = await app.inject({
      method: 'POST', url: '/slug/generate/batch', headers: H,
      payload: { items: ['Wireless Headphones', 'Bluetooth Speaker', 'Wired Earphones'] },
    });
    assert.equal(res.statusCode, 200);
    const b = res.json();
    assert.equal(b.total, 3);
    assert.equal(b.succeeded, 3);
  });

  it('reserve + conflict + release', async () => {
    const r1 = await app.inject({ method: 'POST', url: '/slug/reserve', headers: H, payload: { slug: 'summer-sale-2026', ttl_seconds: 1800 } });
    assert.equal(r1.statusCode, 200);
    const r2 = await app.inject({ method: 'POST', url: '/slug/reserve', headers: H, payload: { slug: 'summer-sale-2026' } });
    assert.equal(r2.statusCode, 409);
    const rel = await app.inject({ method: 'DELETE', url: '/slug/reserve/summer-sale-2026', headers: H });
    assert.equal(rel.statusCode, 200);
  });

  it('rename keeps alias + resolve redirect', async () => {
    const g = await app.inject({ method: 'POST', url: '/slug/generate', headers: H, payload: { title: 'Rename Me Original' } });
    const old = g.json().slug;
    const rn = await app.inject({ method: 'PUT', url: `/slug/${old}/rename`, headers: H, payload: { new_slug: 'premium-wireless-headphones' } });
    assert.equal(rn.statusCode, 200);
    const alias = await app.inject({ method: 'GET', url: `/slug/${old}`, headers: H });
    assert.equal(alias.json().is_canonical, false);
    assert.equal(alias.json().redirect_to, 'premium-wireless-headphones');
    const canon = await app.inject({ method: 'GET', url: '/slug/premium-wireless-headphones', headers: H });
    assert.equal(canon.json().is_canonical, true);
  });

  it('history + stats + strategies', async () => {
    const h = await app.inject({ method: 'GET', url: '/slug/history?limit=5', headers: H });
    assert.equal(h.json().success, true);
    assert.ok(h.json().pagination.total > 0);
    const s = await app.inject({ method: 'GET', url: '/slug/stats?days=30', headers: H });
    assert.equal(s.json().success, true);
    assert.ok(s.json().total_operations > 0);
    const st = await app.inject({ method: 'GET', url: '/slug/strategies', headers: H });
    assert.equal(st.json().strategies.length, 3);
  });

  it('multi-tenant isolation', async () => {
    const db = getDatabase();
    const now = Date.now();
    db.prepare(`INSERT OR IGNORE INTO projects (name, api_key, max_slug_length, collision_strategy, created_at, updated_at) VALUES (?,?,?,?,?,?)`)
      .run('Other', 'other-key-456', 80, 'suffix', now, now);
    const otherH = { 'x-api-key': 'other-key-456', 'content-type': 'application/json' };
    // same slug free in other namespace
    const c = await app.inject({ method: 'GET', url: '/slug/check/wireless-headphones-pro-max', headers: otherH });
    assert.equal(c.json().available, true);
  });
});
