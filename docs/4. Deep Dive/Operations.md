# Deep Dive: Operations

## Local development

```bash
npm install
npm run migrate   # node src/migrate.js: idempotent schema
npm run seed      # Shop A (suffix, 80) + Gig4Gig (timestamp, 60)
npm start         # node src/server.js → :4010
npm run dev       # --watch variant
npm test          # node --test → test/slugify.test.js + test/api.test.js (21 tests)
```

Seed keys: `shop-a-kalibho-key-2026`, `gig4gig-kalibho-key-2026`.

## Configuration

All via `.env` (see `.env.example`); `src/config.js` parses with the defaults in
`Storage.md`. `PORT` (4010), `NODE_ENV` (pretty logs when ≠ production),
`LOG_LEVEL`, `DATABASE_PATH`.

## Docker

```bash
docker compose up -d --build
docker compose exec kalibho node src/seed.js   # volume starts empty: required once
curl http://localhost:4010/health
```

Image: `node:20-slim` + `python3/make/g++` (required: `better-sqlite3@12` has no
Node 20.20 prebuilt, so it compiles from source). `npm ci --omit=dev`. Data persists
in the `kalibho_data` volume at `/app/data/kalibho.db`. `.dockerignore` keeps
`node_modules`, `data`, and `*.db*` out of the build context.

## PM2

`ecosystem.config.js` defines the `kalibho` app (`fork`, 1 instance, production env).

## Testing

- `test/slugify.test.js`: pure-function unit tests (no DB).
- `test/api.test.js`: full API via `app.inject()` against an isolated
  `data/kalibho.test.db`; `before()` wipes test-tenant rows (idempotent reruns),
  `after()` closes Fastify. Covers auth, generate, collision, Unicode, check, batch,
  reserve/conflict/release, rename+alias, history/stats/strategies, tenant isolation.
- The purge `setInterval` is `unref()`d so the runner exits cleanly.

## Performance (per spec)

Single generate 1–3 ms (3–6 ms on collision), batch of 100 in 80–150 ms,
canonical resolve <1 ms, rename 2–5 ms.
