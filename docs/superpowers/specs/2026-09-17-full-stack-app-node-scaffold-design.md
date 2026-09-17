# Full_Stack_App_Node — Scaffold Design

Date: 2026-09-17

## Purpose

A learning scaffold for a full-stack Node.js app, giving Artem a working
reference for React + Express + PostgreSQL with a modern component/HTTP
toolset (shadcn/ui, axios). No specific product — a clean, working
end-to-end CRUD example to build future experiments on top of.

## Structure

Plain sibling folders inside `Full_Stack_App_Node/` (not npm workspaces):

```
Full_Stack_App_Node/
  client/    # React + Vite + TS frontend
  server/    # Express + TS backend
  .gitignore
  CLAUDE.md
```

Each half has its own `package.json`, installed and run independently
(`npm install && npm run dev` in each folder).

## Backend (`/server`)

- Express + TypeScript
- Prisma ORM, PostgreSQL provider, `DATABASE_URL` via `.env`
- Single `Note` model: `id`, `title`, `content`, `createdAt`, `updatedAt`
- REST routes under `/api/notes`: GET (list), GET/:id, POST, PUT/:id, DELETE/:id
- CORS enabled for the Vite dev origin
- Basic centralized error-handling middleware
- `npm run dev` (ts-node-dev/tsx), `npm run build`, `npx prisma migrate dev`

## Frontend (`/client`)

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui configured (Card, Input, Button, and any
  components the Notes UI needs)
- A single axios instance (`src/lib/api.ts`) pointed at the backend base URL
- React Router with two pages, reachable via a simple nav bar:
  - **Notes** (`/`) — list, create, edit, delete notes using the API and
    shadcn components
  - **Product Viewer** (`/product-viewer`) — a 3D product viewer built to
    practice `@react-three/fiber` + `@react-three/drei` (Three.js job
    skills): loads a GLTF model (a small free sample model bundled under
    `client/public/models/`) inside a `<Canvas>`, with `OrbitControls`,
    basic lighting/`Environment`, and a `Suspense` loading fallback.
    Standalone — no backend/API involvement.
- `npm run dev`, `npm run build`

## Data flow

Browser → axios (`client/src/lib/api.ts`) → Express routes (`server/src/routes/notes.ts`)
→ Prisma Client → PostgreSQL. Standard JSON REST, no auth in this scaffold.
The Product Viewer page has no data flow to the backend — it renders a
static bundled 3D asset.

## Testing

No automated tests in this initial scaffold — it's a learning reference,
not production code. Manual verification: run both dev servers, exercise
create/list/edit/delete for a note through the UI, and confirm the
Product Viewer page loads and renders the model with working orbit
controls.

## Out of scope (for this pass)

- Authentication/authorization
- Deployment configuration
- Automated test suite
- npm/pnpm workspaces
- Connecting the 3D viewer to real product/backend data (static demo only)
