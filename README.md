# Ballad of the Unnamed

A **server-authoritative fantasy choose-your-own-adventure RPG**. Every choice, event, and outcome is resolved on the server — the client is a thin presentation layer. This means no cheating, deterministic daily runs, and a shared leaderboard.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide icons
- **Backend:** Express, TypeScript (`tsx` for dev)
- **Database:** Neon (serverless Postgres via `@neondatabase/serverless`)
- **Content:** A registry-driven event/class/achievement system with locale support (en/es)

## Getting Started

```bash
pnpm install
pnpm dev
```

The dev server starts on `http://localhost:8080` with Vite HMR.

### Database (optional for dev)

The app uses Neon for persisting runs and the leaderboard. The server starts without a database — only routes that read/write runs will throw. When you're ready:

1. Create a Neon project and grab the connection string.
2. Set it as an environment variable:

```bash
set DATABASE_URL=postgres://...
```

3. Run the schema migration:

```bash
pnpm db:migrate
```

## Scripts

| Command           | Description                      |
| ----------------- | -------------------------------- |
| `pnpm dev`        | Start dev server with HMR        |
| `pnpm build`      | Production build                 |
| `pnpm start`      | Start production server          |
| `pnpm db:migrate` | Run database schema migration    |
| `pnpm i18n:check` | Check i18n parity across locales |

## Project Structure

```
server/          Express API + game engine
  content/       Event/class/achievement registry
  engine/        Core game logic (resolveChoice, resolveMinigame, etc.)
  routes/        API route handlers
  store/         Database access layer
  db/            DB client + migration
shared/          Types and logic shared between client and server
src/             React client app
components/      Shared UI components
content/         Game content YAML/data files
public/          Static assets
```

## License

MIT
