import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.isAbsolute(config.databasePath)
  ? config.databasePath
  : path.join(__dirname, '..', config.databasePath);
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db = null;

export function getDatabase() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(db) {
  const migrationPath = path.join(__dirname, '../migrations/0001_init.sql');
  if (fs.existsSync(migrationPath)) {
    db.exec(fs.readFileSync(migrationPath, 'utf8'));
  }
}

// ─── Projects ──────────────────────────────────────────────

export function getProjectByApiKey(apiKey) {
  return getDatabase()
    .prepare('SELECT * FROM projects WHERE api_key = ? AND is_active = 1')
    .get(apiKey);
}

// ─── Slug Lookups ─────────────────────────────────────────

export function getSlug(projectId, slug) {
  return getDatabase()
    .prepare('SELECT * FROM slugs WHERE project_id = ? AND slug = ? AND is_active = 1')
    .get(projectId, slug);
}

export function slugExists(projectId, slug) {
  const row = getDatabase()
    .prepare('SELECT 1 FROM slugs WHERE project_id = ? AND slug = ? AND is_active = 1 LIMIT 1')
    .get(projectId, slug);
  return !!row;
}

export function getCanonicalForAlias(projectId, aliasSlug) {
  const row = getSlug(projectId, aliasSlug);
  if (!row) return null;
  if (row.is_canonical) return row.slug;
  return row.canonical_slug;
}

export function getSlugByTarget(projectId, targetType, targetId) {
  return getDatabase()
    .prepare(`
      SELECT * FROM slugs
      WHERE project_id = ? AND target_type = ? AND target_id = ?
        AND is_canonical = 1 AND is_active = 1
      LIMIT 1
    `)
    .get(projectId, targetType, targetId);
}

// ─── Slug Creation ─────────────────────────────────────────

export function insertSlug(entry) {
  const now = Date.now();
  const result = getDatabase()
    .prepare(`
      INSERT INTO slugs
      (project_id, slug, is_canonical, canonical_slug, target_type, target_id,
       metadata, reserved, reserved_until, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `)
    .run(
      entry.project_id,
      entry.slug,
      entry.is_canonical !== undefined ? (entry.is_canonical ? 1 : 0) : 1,
      entry.canonical_slug || null,
      entry.target_type || null,
      entry.target_id || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.reserved ? 1 : 0,
      entry.reserved_until || null,
      now,
      now
    );
  return result.lastInsertRowid;
}

/**
 * Atomically generate a unique slug. Uses INSERT to race-safely
 * claim a slot. Returns { slug, collision, attempts } on success.
 */
export function claimSlugAtomic(projectId, baseSlug, options = {}) {
  const maxLength = options.maxLength || config.defaults.maxSlugLength;
  const strategy = options.strategy || config.defaults.collisionStrategy;
  const maxAttempts = options.maxAttempts || config.defaults.collisionMaxAttempts;
  const targetType = options.targetType || null;
  const targetId = options.targetId || null;
  const metadata = options.metadata || null;

  const db = getDatabase();

  let attempt = 0;
  let collision = false;

  while (attempt < maxAttempts) {
    let candidate;

    if (attempt === 0) {
      candidate = baseSlug.slice(0, maxLength);
    } else if (strategy === 'suffix') {
      const suffix = `-${attempt + 1}`;
      const truncated = baseSlug.slice(0, maxLength - suffix.length);
      candidate = `${truncated}${suffix}`;
    } else if (strategy === 'timestamp') {
      const suffix = `-${Date.now().toString(36)}`;
      const truncated = baseSlug.slice(0, maxLength - suffix.length);
      candidate = `${truncated}${suffix}`;
    } else if (strategy === 'uuid') {
      const suffix = `-${Math.random().toString(36).slice(2, 8)}`;
      const truncated = baseSlug.slice(0, maxLength - suffix.length);
      candidate = `${truncated}${suffix}`;
    } else {
      throw new Error(`Unknown collision strategy: ${strategy}`);
    }

    const now = Date.now();
    try {
      const result = db
        .prepare(`
          INSERT INTO slugs
          (project_id, slug, is_canonical, canonical_slug, target_type, target_id,
           metadata, reserved, reserved_until, is_active, created_at, updated_at)
          VALUES (?, ?, 1, NULL, ?, ?, ?, 0, NULL, 1, ?, ?)
        `)
        .run(
          projectId,
          candidate,
          targetType,
          targetId,
          metadata ? JSON.stringify(metadata) : null,
          now,
          now
        );

      if (result.changes > 0) {
        return { slug: candidate, collision, attempts: attempt + 1, id: result.lastInsertRowid };
      }
    } catch (error) {
      if (!error.message.includes('UNIQUE')) throw error;
    }

    collision = true;
    attempt++;
  }

  const suffix = `-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const candidate = `${baseSlug.slice(0, maxLength - suffix.length)}${suffix}`;
  const now = Date.now();
  const result = db
    .prepare(`
      INSERT INTO slugs
      (project_id, slug, is_canonical, canonical_slug, target_type, target_id,
       metadata, reserved, reserved_until, is_active, created_at, updated_at)
      VALUES (?, ?, 1, NULL, ?, ?, ?, 0, NULL, 1, ?, ?)
    `)
    .run(
      projectId,
      candidate,
      targetType,
      targetId,
      metadata ? JSON.stringify(metadata) : null,
      now,
      now
    );

  return { slug: candidate, collision: true, attempts: attempt + 1, id: result.lastInsertRowid };
}

// ─── Reserve / Release ─────────────────────────────────────

export function reserveSlug(projectId, slug, ttlSeconds, metadata = null) {
  const db = getDatabase();
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  try {
    const result = db
      .prepare(`
        INSERT INTO slugs
        (project_id, slug, is_canonical, canonical_slug, target_type, target_id,
         metadata, reserved, reserved_until, is_active, created_at, updated_at)
        VALUES (?, ?, 1, NULL, NULL, NULL, ?, 1, ?, 1, ?, ?)
      `)
      .run(
        projectId,
        slug,
        metadata ? JSON.stringify(metadata) : null,
        expiresAt,
        now,
        now
      );
    return { success: true, id: result.lastInsertRowid, expires_at: expiresAt };
  } catch (error) {
    if (!error.message.includes('UNIQUE')) throw error;

    const existing = getSlug(projectId, slug);
    if (existing && existing.reserved && existing.reserved_until < now) {
      db.prepare(`
        UPDATE slugs
        SET reserved_until = ?, metadata = ?, updated_at = ?
        WHERE id = ?
      `).run(expiresAt, metadata ? JSON.stringify(metadata) : null, now, existing.id);
      return { success: true, id: existing.id, expires_at: expiresAt, reclaimed: true };
    }

    return { success: false, reason: 'slug_taken' };
  }
}

export function releaseSlug(projectId, slug) {
  const result = getDatabase()
    .prepare('DELETE FROM slugs WHERE project_id = ? AND slug = ? AND reserved = 1')
    .run(projectId, slug);
  return result.changes > 0;
}

export function purgeExpiredReservations() {
  const result = getDatabase()
    .prepare('DELETE FROM slugs WHERE reserved = 1 AND reserved_until < ?')
    .run(Date.now());
  return result.changes;
}

// ─── Rename (alias system) ─────────────────────────────────

export function renameSlug(projectId, oldSlug, newSlug, metadata = null) {
  const db = getDatabase();
  const now = Date.now();

  const existing = getSlug(projectId, oldSlug);
  if (!existing) return { success: false, reason: 'slug_not_found' };
  if (!existing.is_canonical) return { success: false, reason: 'not_canonical' };

  if (slugExists(projectId, newSlug)) {
    return { success: false, reason: 'new_slug_taken' };
  }

  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO slugs
      (project_id, slug, is_canonical, canonical_slug, target_type, target_id,
       metadata, reserved, reserved_until, is_active, created_at, updated_at)
      VALUES (?, ?, 1, NULL, ?, ?, ?, 0, NULL, 1, ?, ?)
    `).run(
      projectId,
      newSlug,
      existing.target_type,
      existing.target_id,
      metadata ? JSON.stringify(metadata) : null,
      now,
      now
    );

    db.prepare(`
      UPDATE slugs
      SET is_canonical = 0, canonical_slug = ?, updated_at = ?
      WHERE id = ?
    `).run(newSlug, now, existing.id);
  });

  txn();
  return { success: true, old_slug: oldSlug, new_slug: newSlug };
}

// ─── History ───────────────────────────────────────────────

export function logHistory(projectId, entry) {
  getDatabase()
    .prepare(`
      INSERT INTO slug_history
      (project_id, operation, input_title, output_slug, collision, attempts,
       duration_ms, status, error_message, client_ip, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      projectId,
      entry.operation,
      entry.input_title || null,
      entry.output_slug || null,
      entry.collision ? 1 : 0,
      entry.attempts || 1,
      entry.duration_ms || null,
      entry.status,
      entry.error_message || null,
      entry.client_ip || null,
      entry.user_agent || null,
      Date.now()
    );
}

export function listHistory(projectId, filters) {
  const conditions = ['project_id = ?'];
  const params = [projectId];

  if (filters.operation) { conditions.push('operation = ?'); params.push(filters.operation); }
  if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
  if (filters.search) {
    conditions.push('(input_title LIKE ? OR output_slug LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.from_date) { conditions.push('created_at >= ?'); params.push(filters.from_date); }
  if (filters.to_date) { conditions.push('created_at <= ?'); params.push(filters.to_date); }

  const where = conditions.join(' AND ');

  const total = getDatabase()
    .prepare(`SELECT COUNT(*) as c FROM slug_history WHERE ${where}`)
    .get(...params).c;

  const rows = getDatabase()
    .prepare(`SELECT * FROM slug_history WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, filters.limit, filters.offset);

  return { entries: rows, total };
}

export function getStats(projectId, days = 30) {
  const fromDate = Date.now() - days * 24 * 60 * 60 * 1000;

  const total = getDatabase()
    .prepare('SELECT COUNT(*) as c FROM slug_history WHERE project_id = ? AND created_at >= ?')
    .get(projectId, fromDate).c;

  const collisions = getDatabase()
    .prepare('SELECT COUNT(*) as c FROM slug_history WHERE project_id = ? AND created_at >= ? AND collision = 1')
    .get(projectId, fromDate).c;

  const byOperation = getDatabase()
    .prepare(`
      SELECT operation, COUNT(*) as c FROM slug_history
      WHERE project_id = ? AND created_at >= ?
      GROUP BY operation
    `)
    .all(projectId, fromDate);

  const avgDuration = getDatabase()
    .prepare(`
      SELECT AVG(duration_ms) as avg FROM slug_history
      WHERE project_id = ? AND created_at >= ? AND duration_ms IS NOT NULL
    `)
    .get(projectId, fromDate).avg;

  const activeSlugs = getDatabase()
    .prepare('SELECT COUNT(*) as c FROM slugs WHERE project_id = ? AND is_active = 1 AND is_canonical = 1')
    .get(projectId).c;

  const aliasCount = getDatabase()
    .prepare('SELECT COUNT(*) as c FROM slugs WHERE project_id = ? AND is_active = 1 AND is_canonical = 0')
    .get(projectId).c;

  const toMap = (rows, key) => {
    const m = {};
    for (const r of rows) m[r[key]] = r.c;
    return m;
  };

  return {
    days,
    total_operations: total,
    collisions,
    collision_rate_percent: total > 0 ? parseFloat(((collisions / total) * 100).toFixed(2)) : 0,
    avg_duration_ms: avgDuration ? parseFloat(avgDuration.toFixed(2)) : 0,
    by_operation: toMap(byOperation, 'operation'),
    active_slugs: activeSlugs,
    alias_count: aliasCount,
  };
}
