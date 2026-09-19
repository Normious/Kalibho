-- ─────────────────────────────────────────────
-- 1. Projects (Tenants)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    max_slug_length INTEGER DEFAULT 80,
    collision_strategy TEXT DEFAULT 'suffix',
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_api_key ON projects(api_key);

-- ─────────────────────────────────────────────
-- 2. Slugs (Canonical + Aliases)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slugs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    slug TEXT NOT NULL,
    is_canonical INTEGER DEFAULT 1,
    canonical_slug TEXT,
    target_type TEXT,
    target_id TEXT,
    metadata TEXT,
    reserved INTEGER DEFAULT 0,
    reserved_until INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_slugs_project_slug ON slugs(project_id, slug);
CREATE INDEX IF NOT EXISTS idx_slugs_canonical ON slugs(project_id, canonical_slug);
CREATE INDEX IF NOT EXISTS idx_slugs_target ON slugs(project_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_slugs_reserved ON slugs(reserved, reserved_until);

-- ─────────────────────────────────────────────
-- 3. Generation History (analytics)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slug_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    operation TEXT NOT NULL,
    input_title TEXT,
    output_slug TEXT,
    collision INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 1,
    duration_ms INTEGER,
    status TEXT NOT NULL,
    error_message TEXT,
    client_ip TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_history_project ON slug_history(project_id);
CREATE INDEX IF NOT EXISTS idx_history_operation ON slug_history(project_id, operation);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON slug_history(created_at);
