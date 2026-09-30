# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Monorepo root** (npm workspaces + Turborepo; single `package-lock.json` at the root):
- `npm install` — install all workspaces (run once at the root, not per package)
- `npm run dev` — `turbo run dev`: builds `@app/shared`, then runs shared watch + API + client in parallel
- `npm run build` / `typecheck` / `lint` — `turbo run ...`; results are cached in `.turbo/` (re-run = `FULL TURBO`)
- `npx turbo run build --filter=server` — run a task for one package (plus its dependencies)

**Server** (`server/`):
- `npm run dev` — run the API on http://localhost:4000 with hot reload
- `npm run build` — compile TypeScript to `dist/`
- `npx prisma migrate dev --name <name>` — create/apply a migration after editing `prisma/schema.prisma`
- `npx prisma studio` — browse the database in a GUI

**Client** (`client/`):
- `npm install` — install dependencies
- `npm run dev` — run the app on http://localhost:5173
- `npm run build` — production build
- `npx shadcn@latest add <component>` — add a new shadcn/ui component

Both servers must be running for the Notes page to work; the Product Viewer page needs only the client.

## First-time Setup

0. Run `npm install` in both `server/` and `client/` before anything else.

The Notes page needs a running PostgreSQL instance with the schema migrated in. Verified working with:

```bash
docker run --name fsan-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=full_stack_app_node -p 5432:5432 -d postgres:16
cd server && npx prisma migrate dev --name init
```

`server/.env.example` already matches this container's defaults (`postgresql://postgres:password@localhost:5432/full_stack_app_node?schema=public` — note the official `postgres` image's default user is `postgres`, not `user`). If the container already exists and was just stopped, restart it with `docker start fsan-postgres` and run `npx prisma migrate deploy` instead (the migration already exists, just needs applying).

`GET /health` works without a database — it's the fastest way to confirm the server process itself is up, independent of the Postgres/migration situation.

## Architecture

Monorepo with npm workspaces (`client`, `server`, `packages/*`) orchestrated by Turborepo (`turbo.json`):

- `packages/shared` (`@app/shared`) — Zod schemas + inferred types (`Note`, `User`, `noteInputSchema`), built with `tsup` to CJS+ESM in `dist/`. The server validates request bodies with it; the client re-exports its types. Consumers need it built first — Turbo's `dependsOn: ["^build"]` handles that.


- `server/` — Express + TypeScript REST API. `src/app.ts` builds the Express app and mounts routers; `src/index.ts` starts it. `src/prisma.ts` exports the shared `PrismaClient` singleton. Routes live under `src/routes/`, one file per resource (currently `notes.ts`, mounted at `/api/notes`). Data model is defined in `prisma/schema.prisma`.

- `client/` — Vite + React + TypeScript SPA. `src/lib/api.ts` exports the shared axios instance (base URL from `VITE_API_BASE_URL`). Pages live under `src/pages/`; routing is in `src/App.tsx` via `react-router-dom`. UI components come from shadcn/ui (`src/components/ui/`, generated — don't hand-edit, re-run `npx shadcn@latest add` instead).

- Notes flow: `NotesPage` → axios → `server/src/routes/notes.ts` → Prisma → PostgreSQL. Standard JSON REST, no auth.

- Product Viewer (`/product-viewer`): a standalone `@react-three/fiber` scene loading a bundled GLTF model (`client/public/models/Duck.glb`) — no backend calls. Exists purely to practice Three.js/react-three-fiber patterns (job-relevant 3D skills), not tied to app data.

## Environment

- `server/.env` needs `DATABASE_URL` (PostgreSQL connection string), `PORT`, `CLIENT_ORIGIN`. See `server/.env.example`.
- `client/.env` needs `VITE_API_BASE_URL` pointing at the running server.

## Dependency Pinning Notes

The following dependencies are pinned to specific versions to maintain stability:

- **TypeScript** (`typescript` in both `server/` and `client/`): pinned to `^5.9.3` (5.x). Avoid upgrading to 6.x or 7.x without testing, as breaking changes may occur.
- **Prisma** (`prisma` and `@prisma/client` in `server/`): pinned to `^6.19.3` (6.x). The 8.x pre-release has compatibility issues; do not auto-update.
- **React** (`react` and `react-dom` in `client/`): pinned to exact version `19.2.8` (not a caret range). This is required for `@react-three/fiber` compatibility, which does not yet support React 19.3+.
- **Tailwind** (`tailwindcss` and `@tailwindcss/vite` in `client/`): version 4.x. Configuration is CSS-first via `@theme inline` in `client/src/index.css` — there is no `tailwind.config.js` file. The plugin is wired through `@tailwindcss/vite` in `client/vite.config.ts`.

Do not run `npm update` blindly; always verify compatibility after updating these pinned dependencies.
