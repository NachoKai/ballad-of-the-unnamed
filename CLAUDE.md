# CLAUDE.md

## Project Overview

Ballad of the Unnamed — a **server-authoritative fantasy CYOA RPG**. All game logic runs on
the Express server; the React client is a thin presentation layer. Daily runs share a per-day
UTC seed so every player gets the same rolls that day.

## Commands

```bash
pnpm install          # install deps
pnpm dev              # dev server on http://localhost:8080 (Vite HMR via Express middleware)
pnpm build            # production client build → dist/client
pnpm start            # production server (NODE_ENV=production tsx server/index.ts)
pnpm db:migrate       # run schema (server/db/schema.sql) against DATABASE_URL
pnpm test             # test:src + test:server
pnpm test:src         # vitest run (root: src)
pnpm test:server      # vitest run --config vitest.server.config.ts (server + shared tests)
pnpm i18n:check       # locale parity check across en/es content
pnpm lint             # eslint .
pnpm format           # prettier --write .
```

## Architecture

- `server/` — Express API + game engine
  - `app.ts` — mounts `/api/game`, `/api/meta`, `/api/health`
  - `index.ts` — dev: Vite middleware mode (client + API share port 8080, one HMR WS); prod: serves `dist/client`
  - `engine/` — core logic: `engine.ts` (`createCharacter`, `buildServedEvent`, `resolveChoice`, `resolveMinigame`, `generateRival`), `helpers.ts` (`fillSlots`, `localize`, `serveEvent`), `achievements.ts`, `epilogue.ts`, `finale.ts`
  - `routes/game.ts` — run lifecycle: `/new`, `/state`, `/choose`, `/shop`, `/buy`, `/archetype-draw`
  - `routes/meta.ts` — leaderboard, career totals, collection
  - `store/runStore.ts` — Neon persistence (runs, leaderboard, character snapshots, personality_log)
  - `db/` — Neon HTTP driver (`query`/`queryOne`), migration, schema.sql
  - `content/registry.ts` — loads + validates all content JSON at startup (throws on bad data)
- `shared/` — imported via `@shared/*`: `types.ts` (all shared types), `config.ts` (GAME_CONFIG balance knobs + `computeScore`), `rng.ts` (deterministic Rng), `i18n.ts` (`t`/`interpolate`), `genderize.ts`
- `src/` — React 19 client (Vite root): `api.ts` (all client↔server calls), `components/` (screens + `ui/` primitives), `i18n/strings.ts`
- `content/` — game data JSON: classes, archetypes, `events/`, `minigames/`, factions, regions, shop, achievements, slots
- `docs/` — `fantasy-cyoa-rpg-spec.md` is the authoritative spec; code comments cite `§N` sections

## Key Conventions

- **Determinism:** every random draw goes through one per-run `Rng` (mulberry32). NEVER use `Math.random()` in game logic. Persist `rngState`; resume with `new Rng(state)`. Daily seeds = `todayDailySeed()` (UTC date).
- **i18n:** every `LocaleMap` needs non-empty `en` AND `es` — `registry.ts` throws otherwise. Use `t()`/`interpolate()`; Spanish uses `genderize()` for gender inflection. Run `pnpm i18n:check` after content edits.
- **Run ownership:** the run id (server UUID) IS the auth capability — routes trust possession of it. No cookie gating (cross-site iframe never sends `sameSite:lax` cookies).
- **DB:** only the parameterized `query()`/`queryOne()` helpers; NEVER interpolate user input into SQL. Server runs without `DATABASE_URL`; only DB routes throw.
- **Content:** `events/*.json` + `minigames/*.json` are arrays of `EventContent`. Narrative uses `{slot:pool}` / `{poolName}` placeholders via `fillSlots`; `{rivalName}` substitutes the run's rival.
- **Special events:** reserved ids `__retirement_offer__`, `__season_summary__` are handled specially in `/state`.
- **Aliases:** `@/*` → `src/*`, `@shared/*` → `shared/*` (vite.config.ts + tsconfig.json).

## Gotchas

- README says "Tailwind CSS" — **wrong**. The client uses **styled-components** (styled.ts, theme.ts, GlobalStyle.ts). No Tailwind config exists.
- Balance tuning lives in `shared/config.ts` (`GAME_CONFIG`), not in engine logic.
- Vite `root` is `src/`, `publicDir` is `../public`, build output is `dist/client` (vercel.json rewrites SPA → index.html).
- Two test suites: `src/**` (vitest root) and `server/**` + `shared/**` (vitest.server.config.ts). `engine.test.ts` is the large one.
