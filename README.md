<!-- prettier-ignore -->
<div align="center">

<img src="./public/icon.svg" alt="Ballad of the Unnamed" align="center" height="96" />

# Ballad of the Unnamed

**A server-authoritative fantasy choose-your-own-adventure RPG.** Every choice, roll, and outcome is resolved on the server — so nobody can cheat, daily runs are deterministic, and the leaderboard stays honest.

[Tech stack](#tech-stack) • [Why server-authoritative?](#why-server-authoritative) • [Getting started](#getting-started) • [Project structure](#project-structure) • [API](#api) • [Game content](#game-content) • [Documentation](#documentation)

</div>

Ballad of the Unnamed is a text-driven life sim set in a living fantasy world. You create a character, live out seasons of choices — from tavern brawls to clan intrigue, dungeon delves, courts and wars — and end up wherever your decisions take you, for better or worse. Runs are short, replayable, and comparable: the same daily seed means everyone alive that day shares the same destiny.

## Tech stack

- **Client:** React 19, TypeScript, Vite, [styled-components](https://styled-components.com/), Lucide icons, ogl (WebGL effects)
- **Server:** Express, TypeScript (run with `tsx` for dev, zero build step)
- **Database:** [Neon](https://neon.tech) serverless Postgres via `@neondatabase/serverless` HTTP driver
- **Content:** registry-driven JSON content with full English/Spanish locale support

## Why server-authoritative?

As a developer you probably know the classic problem with client-side games: the player can read the rules, poke the state, and cheat. Ballad of the Unnamed takes the opposite approach — the client is a **thin presentation layer**.

- **No cheating.** The entire game loop runs in the Express server; the browser only renders what it's told.
- **Deterministic daily runs.** Every random draw flows through a single seeded PRNG per run. Daily mode seeds from the UTC date, so _every player that day gets the same rolls_ — a fair, shared leaderboard.
- **Resumable anywhere.** A run's `rngState`, character snapshot, and pending event are persisted, so a page reload picks up exactly where you left off.

> [!NOTE]
> The run id (a server-generated UUID) is the ownership capability — routes trust possession of it. There's no cookie-based session, because the game is designed to run inside a cross-site iframe where `sameSite:lax` cookies would never be sent.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/)

### Run locally

```bash
pnpm install
pnpm dev
```

The dev server starts at `http://localhost:8080`. Vite runs in middleware mode inside Express, so the client, the API, and the HMR WebSocket all share a single port.

### Database (optional for local dev)

The game stores runs and the leaderboard in Neon Postgres. The server starts fine **without** a database — only the routes that read or write runs will throw. To enable persistence:

1. Create a [Neon](https://neon.tech) project and copy the connection string.
2. Set it as an environment variable (see `.env.example`):

   ```bash
   set DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

3. Run the schema migration:

   ```bash
   pnpm db:migrate
   ```

## Scripts

| Command            | Description                                                   |
| ------------------ | ------------------------------------------------------------- |
| `pnpm dev`         | Dev server on `http://localhost:8080` with HMR                |
| `pnpm build`       | Production client build → `dist/client`                       |
| `pnpm start`       | Production server (`NODE_ENV=production tsx server/index.ts`) |
| `pnpm db:migrate`  | Apply `server/db/schema.sql` to the database                  |
| `pnpm test`        | Run `test:src` + `test:server`                                |
| `pnpm test:src`    | Vitest — client/lib tests (`root: src`)                       |
| `pnpm test:server` | Vitest — server + shared tests (`vitest.server.config.ts`)    |
| `pnpm i18n:check`  | Enforce en/es parity across all game content                  |
| `pnpm lint`        | ESLint                                                        |
| `pnpm format`      | Prettier write                                                |

## Project structure

```
server/           Express API + game engine
  engine/         Core game logic (resolveChoice, resolveMinigame, createCharacter, generateRival)
  routes/         game.ts (run lifecycle), meta.ts (leaderboard, collection)
  store/          runStore.ts — Neon persistence layer
  db/             HTTP driver, schema.sql, migration
  content/        registry.ts — loads & validates all content JSON at startup
shared/           Code shared client/server (@shared/*): types, config, rng, i18n
src/              React client (Vite root)
  api.ts          All client↔server calls
  components/     Screens + themed UI primitives
  i18n/           Localized UI strings (en/es)
content/          Game data JSON: classes, archetypes, events/, minigames/, factions, shop, achievements, slots
docs/             Fantasy CYOA RPG build spec + design notes
scripts/          i18n parity check, dev smoke tests
```

## API

Base path `/api`. All endpoints are JSON; the run id is passed as `runId` in the body/query.

**Game** (`/api/game`)

- `POST /archetype-draw` — draw 3 archetypes for a class
- `POST /new` — start a new run (standard or daily)
- `GET  /state` — resume a run's current state + pending event
- `POST /choose` — resolve the pending event/minigame, get the next one
- `GET  /shop` — shop items available to the current run
- `POST /buy` — purchase a shop item

**Meta** (`/api/meta`)

- `GET /classes` — class list + today's daily seed
- `GET /leaderboard` / `GET /leaderboard/:category` — global & category rankings
- `GET /achievements` — achievement catalog
- `GET /career-totals`, `GET /player-runs` — stats
- `GET /collection` — cross-run completion (endings, factions, classes, achievements)

## Game content

Content lives as JSON in `content/` and is validated at server startup — a missing locale string or an event with no choices throws immediately. The engine serves content through the registry, so adding a new event is a JSON change, not a code change.

- **Events** (`content/events/*.json`) — narrative turns with choices; text supports `{slot:pool}` placeholder filling and `{rivalName}` substitution.
- **Minigames** (`content/minigames/*.json`) — card-pick moments with tiered outcomes.
- **Everything** is bilingual: every string has both `en` and `es` variants. Run `pnpm i18n:check` after editing content.

## Documentation

- [`docs/fantasy-cyoa-rpg-spec.md`](./docs/fantasy-cyoa-rpg-spec.md) — the authoritative game design spec.
- [`docs/improvement-plan.md`](./docs/improvement-plan.md) — shipped-work status & tuning notes.
- [`docs/roadmap.md`](./docs/roadmap.md) — remaining / open work and backlog.
