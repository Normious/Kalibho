# Deep Dive: API Routes (`src/routes/`, `src/server.js`, `src/middleware/`)

All `/slug/*` routes sit behind the `authenticate` preHandler (`X-API-Key` →
`request.project`, 401 otherwise). `/health` and `/` are public.

## Endpoints

| Method + path | Purpose | Notes |
|---|---|---|
| `POST /slug/generate` | title → unique slug | schema: `title` 1–500 chars; opts `target_type/id`, `max_length` 8–200, `strategy`, `metadata` |
| `POST /slug/generate/batch` | up to 100 at once | `items`: strings or per-item objects; global `strategy`/`max_length` |
| `GET /slug/check/:slug` | availability | always 200; `{available, existing?…}` |
| `POST /slug/reserve` | lock a slug | `slug` + `ttl_seconds` 60–86400 (clamped); 409 when taken |
| `DELETE /slug/reserve/:slug` | release | primary path; 404 when no reservation |
| `DELETE /slug/:slug/reserve` | release (compat) | spec-shaped alias, same handler |
| `PUT /slug/:slug/rename` | rename, keep alias | body `new_slug` slugified server-side; 400 same/not-canonical, 404 missing, 409 taken |
| `GET /slug/:slug` | resolve | canonical → `{target_type/id, metadata}`; alias → `{redirect_to, canonical}`; 404 missing |
| `GET /slug/history` | audit trail | filters `operation/status/search/from_date/to_date`, `limit` ≤ 100, `offset` |
| `GET /slug/stats` | analytics | `days` ≤ 365 |
| `GET /slug/strategies` | strategy catalog | static list of 3 |
| `GET /health`, `GET /` | ops / index | no auth |

## Examples

```bash
curl -X POST localhost:4010/slug/generate \
  -H "X-API-Key: shop-a-kalibho-key-2026" -H "Content-Type: application/json" \
  -d '{"title":"Wireless Headphones Pro Max"}'
# {"success":true,"slug":"wireless-headphones-pro-max","collision":false,"attempts":1,...}

curl -X POST localhost:4010/slug/reserve \
  -H "X-API-Key: shop-a-kalibho-key-2026" -H "Content-Type: application/json" \
  -d '{"slug":"summer-sale-2026","ttl_seconds":1800}'

curl -X PUT localhost:4010/slug/wireless-headphones-pro-max/rename \
  -H "X-API-Key: shop-a-kalibho-key-2026" -H "Content-Type: application/json" \
  -d '{"new_slug":"premium-wireless-headphones"}'
# old slug now resolves with {"is_canonical":false,"redirect_to":"premium-wireless-headphones"}
```

## Server Wiring (`server.js`)

cors → helmet → `getDatabase()` → public routes → authenticated plugin
(generate, check, reserve, rename, resolve, history). Resolve registers after the
other `/slug/*` modules so static paths (`check`, `history`, `stats`,
`strategies`) can never be shadowed. The server exports the Fastify instance and
only `listen()`s when run as `server.js`: tests `import` it and use `inject()`.
SIGINT/SIGTERM close cleanly.

## Auth (`middleware/auth.js`)

Missing header → `401 Missing X-API-Key header`; unknown/inactive key →
`401 Invalid or inactive API Key`. Per-project `max_slug_length` and
`collision_strategy` flow into generation from the attached row.
