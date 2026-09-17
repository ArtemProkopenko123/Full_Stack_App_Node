# How Full_Stack_App_Node Works

## Overview

Full_Stack_App_Node is a learning scaffold: a working, end-to-end full-stack app built to practice a specific toolset rather than to ship a product. It has two independent halves that live as sibling folders in one git repo — no monorepo tooling, no shared package.json:

- **`server/`** — Express + TypeScript REST API, backed by PostgreSQL through Prisma. Exposes a Notes CRUD resource.
- **`client/`** — Vite + React + TypeScript single-page app, styled with Tailwind CSS v4 and shadcn/ui, using axios to talk to the API. It has two pages: a **Notes** page (the CRUD reference flow) and a **Product Viewer** page (a Three.js scene built with react-three-fiber, added specifically to practice 3D skills that show up in job listings).

The two halves only communicate over HTTP — the client never imports server code, and the server never renders anything. Nothing here has authentication, deployment configuration, or an automated test suite; those were explicit non-goals for this pass so the project could stay small enough to actually finish and understand end to end.

## Architecture

```
Browser
  │
  ▼  fetch/axios (JSON over HTTP, CORS-scoped to :5173)
client/  (Vite dev server :5173)
  │
  ▼  http://localhost:4000/api/notes
server/  (Express :4000)
  │
  ▼  Prisma Client
PostgreSQL (Docker container :5432)
```

The two folders never share code or configuration — each has its own `package.json`, its own `node_modules`, and is started independently with `npm install && npm run dev`. The only thing that ties them together at runtime is a URL: the client's axios instance points at `http://localhost:4000`, and the server's CORS middleware allows requests from `http://localhost:5173`. Change either port and you have to update both sides by hand — there's no shared config or service discovery, which is deliberate for a scaffold this small.

The **Product Viewer** page is the one part of the client that doesn't participate in this flow at all — it's a self-contained Three.js scene with a bundled 3D asset, with zero calls to the server. It exists purely to practice `react-three-fiber` in isolation from the CRUD plumbing.

There's no BFF layer, no service mesh, no API gateway — the client talks directly to the one Express server, which is the only backend service in this system. A BFF exists to shape responses for a specific frontend when there are multiple backends or multiple frontend consumers; neither applies here.

## Backend

**`server/src/app.ts`** builds the Express app in one function, `createApp()`:

```typescript
export function createApp(): Application {
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/notes", notesRouter);
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}
```

`src/index.ts` calls `createApp()` and starts listening on `PORT` (default 4000). Splitting app construction from server startup this way means the app object itself is testable without binding a real port — not exercised here since there's no test suite, but it's the idiomatic Express pattern.

**Data model** (`prisma/schema.prisma`): a single `Note` model — `id` (autoincrement int), `title`, `content` (both strings), `createdAt`/`updatedAt` (auto-managed timestamps). `src/prisma.ts` exports one `PrismaClient` singleton (`export const prisma = new PrismaClient()`), imported by every route file so the whole app shares one connection pool instead of opening a new client per request.

**Routes** (`src/routes/notes.ts`), mounted at `/api/notes`:

| Method | Path | Behavior |
|---|---|---|
| GET | `/` | list all notes, newest first |
| GET | `/:id` | one note, 404 if missing |
| POST | `/` | create from `{ title, content }`, 201 |
| PUT | `/:id` | update, 404 if missing |
| DELETE | `/:id` | delete, 404 if missing, 204 on success |

Every handler is `async` and lets Prisma errors propagate — Express 5 (installed here) automatically forwards a rejected promise from an async route handler to the error middleware, so there's no manual try/catch in the routes themselves. That's what turns a database failure into a clean `{"error":"Internal server error"}` JSON response instead of a raw stack trace.

## Frontend

Built with **Vite + React + TypeScript**. Styling is **Tailwind CSS v4**, which is CSS-first — there's no `tailwind.config.js`; the theme is defined with `@theme inline { ... }` directly in `client/src/index.css`, and wired into the build through the `@tailwindcss/vite` plugin in `vite.config.ts` (not the old PostCSS pipeline).

**shadcn/ui** components live in `src/components/ui/` (`button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`) — these are generated files, checked into the repo and meant to be extended by re-running `npx shadcn@latest add <component>`, not hand-edited. They import Radix UI primitives under the hood and a `cn()` helper (from the `cn` package, re-exported via `src/lib/utils.ts`) for merging Tailwind classes conditionally.

**Routing** (`react-router-dom`, wired in `src/main.tsx` with `<BrowserRouter>` and `src/App.tsx` with `<Routes>`):

| Path | Component |
|---|---|
| `/` | `NotesPage` |
| `/product-viewer` | `ProductViewerPage` |

A `NavBar` component (`src/components/NavBar.tsx`) renders above the routes with `NavLink`s to both, highlighting whichever is active.

**Talking to the API**: `src/lib/api.ts` exports one axios instance:

```typescript
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000",
});
```

Every component that needs the API imports this instance rather than calling `axios` directly — one place to change the base URL, add auth headers later, etc. `src/types/note.ts` defines the `Note` TypeScript interface, matching the Prisma model field-for-field (with dates as ISO strings, since that's what `JSON.stringify` turns a `Date` into over the wire).

## Notes: end-to-end walkthrough

What actually happens when someone fills in the form and clicks **Add note**:

1. **`NotesPage.tsx`**'s `handleSubmit` fires, calling `api.post("/api/notes", { title, content })`.
2. The request leaves the browser for `http://localhost:4000/api/notes`. The server's CORS middleware checks the `Origin` header against `CLIENT_ORIGIN` and allows it.
3. Express's JSON body parser turns the request body into `req.body`.
4. `notesRouter`'s `POST /` handler runs `prisma.note.create({ data: { title, content } })`.
5. Prisma translates that into a parameterized SQL `INSERT`, sent to PostgreSQL over the connection from `src/prisma.ts`'s singleton client.
6. Postgres assigns the auto-increment `id` and default timestamps, returns the row.
7. Prisma maps it back to a JS object; the route responds `res.status(201).json(note)`.
8. Back in `NotesPage.tsx`, the `try` block's `await` resolves, the form clears, and `loadNotes()` re-fetches the full list (`GET /api/notes`) to re-render it — there's no optimistic update, the UI always reflects what the server just confirmed.

If anything in steps 2–6 fails (server down, DB unreachable, bad input), the `catch` block in `NotesPage.tsx` sets an error message that renders under the page heading, and the form's contents are preserved rather than cleared — that ordering (clear only after success) was a deliberate fix; an earlier version cleared the form immediately, so a failed submit looked like it had silently worked.

## Product Viewer

`src/pages/ProductViewerPage.tsx` renders a `<Canvas>` from **`@react-three/fiber`** (the React renderer for Three.js) with helpers from **`@react-three/drei`**:

```tsx
<Canvas camera={{ position: [0, 1, 4], fov: 50 }}>
  <ambientLight intensity={0.6} />
  <directionalLight position={[5, 5, 5]} intensity={1} />
  <Suspense fallback={<Loading />}>
    <Center><Model /></Center>
    <Environment preset="city" />
  </Suspense>
  <OrbitControls enablePan={false} />
</Canvas>
```

`Model` calls `useGLTF("/models/Duck.glb")` to load a real, bundled glTF binary (the standard Khronos sample "Duck" model, ~120KB, served straight out of `client/public/models/`) and renders it as a `<primitive object={scene} />`. `Suspense` shows a spinning wireframe cube (`Loading`) while the model streams in; `Center` re-centers the loaded mesh on the origin regardless of its own pivot point; `Environment preset="city"` supplies an HDRI-based ambient reflection so the surface doesn't look flat; `OrbitControls` gives the mouse-drag-to-rotate / scroll-to-zoom interaction, confirmed working by hand.

This page has no imports from `lib/api` or `types/note` — it's entirely decoupled from the Notes half of the app, by design. It exists to practice the react-three-fiber patterns (declarative scene graph, `useGLTF`, `Suspense` for async assets, camera/lighting setup) that show up in 3D-adjacent frontend job postings, using a "product viewer" as the framing exercise rather than an actual product.

## Database setup

Verified working, start to finish:

```bash
docker run --name fsan-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=full_stack_app_node \
  -p 5432:5432 -d postgres:16

cd server
npx prisma migrate dev --name init   # first time only — creates the Note table
# or, if the migration already exists and you just need it applied:
npx prisma migrate deploy
```

One real gotcha found and fixed while setting this up: the official `postgres` Docker image's default user is `postgres`, not `user`. `server/.env.example` originally assumed `user:password`, which fails to authenticate. It's now corrected to `postgresql://postgres:password@localhost:5432/full_stack_app_node?schema=public`, matching the `docker run` command above exactly.

Once the container is running and the migration applied, `GET /health` confirms the server process is up (works even without a DB), and a real create-then-list round trip through the Notes UI confirms the whole chain — client → axios → Express → Prisma → Postgres → back — works end to end. The `prisma/migrations/` folder is committed to the repo, so `npx prisma migrate deploy` against a fresh database reproduces the schema exactly.

## Dependency pinning notes

Several packages are pinned below whatever `@latest` currently resolves to, because `@latest` broke things during the build. Documented in the repo's root `CLAUDE.md` so a future `npm update` doesn't silently reintroduce these:

| Package | Pinned to | Why |
|---|---|---|
| `typescript` (client + server) | `^5.9.3` | 6.x/7.x removed `moduleResolution: "node"`, which the tsconfigs use — `tsc` failed outright on the newer majors. |
| `prisma` / `@prisma/client` (server) | `^6.19.3` | `@latest` resolved to an `8.0.0` **pre-release**, with a different CLI and scaffolding behavior. |
| `react` / `react-dom` (client) | exact `19.2.8` | `@react-three/fiber` currently requires `react <19.3`; the caret range had resolved to `19.3.0`. |
| `tailwindcss` / `@tailwindcss/vite` (client) | `^4.x` | Not a downgrade — v4 is current stable and is what shadcn's own generated components assume (v3 + those components breaks the build with a `border-border` class error). |

The pattern behind all of these: don't assume a high major version number is automatically fine, and don't assume `@latest` means stable — check what actually resolves and whether it's a real release before building on top of it.

## Running it

```bash
# once, or whenever the container isn't running:
docker start fsan-postgres   # or the full `docker run ...` from Database setup, first time

# two terminals:
cd server && npm install && npm run dev   # http://localhost:4000
cd client && npm install && npm run dev   # http://localhost:5173

# smoke test, no browser needed:
curl http://localhost:4000/health
```

**Deliberately deferred, not forgotten** (called out in the final code review, safe to pick up later): the `NavBar`'s colors are hardcoded rather than using shadcn's theme tokens, so it won't follow dark mode; the Product Viewer's canvas height is a magic-number calculation against the nav bar's height instead of a flexbox layout; the write routes don't validate input before it reaches Prisma; and the Three.js bundle isn't code-split, so every visitor to the Notes page downloads the whole 3D stack. None of these block the scaffold's purpose — they're the natural next exercises.
