# Deep Dive: Slug Engine (`src/slug/`)

## What the slug engine does

Pure slug math with one DB-backed entry point. `slugify` has no HTTP, no config,
and no I/O, so you can test it with `node --test` alone.

## Responsibilities

- `slugify.js`: `title → base slug` (deterministic, no I/O).
- `strategies.js`: the three collision strategies as data.
- `generator.js`: binds project policy (`max_slug_length`, `collision_strategy`)
  to `claimSlugAtomic()`.

## Pipeline (`slugify`)

1. `trim` + collapse whitespace.
2. `normalize('NFKD')`, strip combining marks `[\u0300-\u036f]`.
3. Lowercase (unless `preserveCase`).
4. Replace `[^\p{L}\p{N}]+` with `-`, collapse repeats, trim edge dashes.
5. Truncate to `maxLength`; if a `-` sits past 60% of the cut, back off to it.
6. Empty result → `item-<base36 timestamp>` (never returns `""`).

```javascript
slugify('Café Déjà Vu — N°1 Review'); // cafe-deja-vu-n-1-review
slugify('  --Hello   ---   World-- '); // hello-world
```

`validateSlug()` checks length, charset, edge dashes, `--`: used by convention,
not enforced on write paths (generation output is always valid by construction).

## Strategies

| Name | Candidate sequence | Example |
|---|---|---|
| `suffix` (default) | base, base-2, base-3… | `hello-world-2` |
| `timestamp` | base, base-`<base36 now>`… | `hello-world-1a2b3c4d` |
| `uuid` | base, base-`<6 random>`… | `hello-world-k8j3f9` |

Suffixes are truncated to fit `maxLength`. After `collisionMaxAttempts` (default 100),
`claimSlugAtomic` falls back to `-<ts36>-<rand>`. It always terminates.

## `generateUniqueSlug(project, title, opts)`

Resolves `maxLength`/`strategy` from per-call opts → project row →
global defaults, slugifies, then delegates to `claimSlugAtomic`. Returns
`{slug, base_slug, collision, attempts, id}`.

`generateBatch(project, items, opts)` maps over items (string or
`{title, target_type, target_id, …}`), never throws per item: failures become
`{success: false, error}` entries.

## Testing

`test/slugify.test.js` (11 assertions): basic, Unicode, `N°1`, dash collapsing,
empty fallback, word-boundary truncation, non-string throw, `validateSlug` reasons.
