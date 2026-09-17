# Full_Stack_App_Node Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a learning full-stack app (`Full_Stack_App_Node/client` + `Full_Stack_App_Node/server`) with a working Notes CRUD flow (React + shadcn/ui + axios → Express + Prisma → PostgreSQL) and a standalone Three.js "Product Viewer" page (`@react-three/fiber` + `@react-three/drei`) for job-skill practice.

**Architecture:** Two independent npm projects living as sibling folders under `Full_Stack_App_Node/` — `server/` (Express + TypeScript + Prisma/PostgreSQL REST API) and `client/` (Vite + React + TypeScript SPA). No workspaces, no shared package.json. The client talks to the server only over HTTP via axios; the Product Viewer page has no backend dependency at all.

**Tech Stack:** Express, TypeScript, Prisma, PostgreSQL, Vite, React, React Router, Tailwind CSS, shadcn/ui, axios, @react-three/fiber, @react-three/drei, three.

**Spec:** `docs/superpowers/specs/2026-09-17-full-stack-app-node-scaffold-design.md`

## Global Constraints

- Two sibling folders only: `client/` and `server/` — no npm/pnpm workspaces (per spec Structure).
- Each folder has its own `package.json`, run independently via `npm install && npm run dev` (per spec Structure).
- No authentication, no deployment config, no automated test suite in this pass (per spec Out of scope).
- Notes CRUD lives under `/api/notes`; Product Viewer page has zero calls to the backend (per spec Data flow).
- Package manager is npm throughout (per user's earlier choice).
- Testing in this plan is manual verification (curl / browser), not automated tests — the spec explicitly excludes an automated test suite for this pass.

---

### Task 1: Root skeleton and .gitignore

**Files:**
- Create: `Full_Stack_App_Node/.gitignore`
- Create: `Full_Stack_App_Node/client/` (empty dir, populated in Task 5)
- Create: `Full_Stack_App_Node/server/` (empty dir, populated in Task 2)

**Interfaces:**
- Produces: the two top-level folders every later task writes into.

- [ ] **Step 1: Create the folder skeleton**

```bash
mkdir -p Full_Stack_App_Node/client Full_Stack_App_Node/server
```

- [ ] **Step 2: Write the root .gitignore**

```
# Full_Stack_App_Node/.gitignore
node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 3: Verify**

Run: `ls Full_Stack_App_Node` — expect `client`, `server`, `.gitignore`.

- [ ] **Step 4: Commit**

```bash
cd Full_Stack_App_Node
git add .gitignore
git commit -m "chore: scaffold root folders for client/server"
```

---

### Task 2: Server skeleton (Express + TypeScript, health check)

**Files:**
- Create: `Full_Stack_App_Node/server/package.json`
- Create: `Full_Stack_App_Node/server/tsconfig.json`
- Create: `Full_Stack_App_Node/server/.env.example`
- Create: `Full_Stack_App_Node/server/src/app.ts`
- Create: `Full_Stack_App_Node/server/src/index.ts`

**Interfaces:**
- Produces: `app` (Express `Application`) exported from `src/app.ts`, imported by `src/index.ts` and by Task 4's route-mounting.
- Produces: `GET /health` returning `{ status: "ok" }`.

- [ ] **Step 1: Init the server package and install dependencies**

```bash
cd Full_Stack_App_Node/server
npm init -y
npm install express cors dotenv
npm install -D typescript tsx @types/node @types/express @types/cors
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write .env.example**

```
DATABASE_URL="postgresql://user:password@localhost:5432/full_stack_app_node?schema=public"
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
```

- [ ] **Step 4: Write src/app.ts**

```typescript
import express, { Application } from "express";
import cors from "cors";

export function createApp(): Application {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
```

- [ ] **Step 5: Write src/index.ts**

```typescript
import "dotenv/config";
import { createApp } from "./app";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const app = createApp();

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
```

- [ ] **Step 6: Add dev/build scripts to package.json**

Edit `package.json` `"scripts"` to:

```json
{
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}
```

- [ ] **Step 7: Verify**

```bash
cp .env.example .env
npm run dev
```

In another terminal: `curl http://localhost:4000/health` — expect `{"status":"ok"}`. Stop the dev server (Ctrl+C).

- [ ] **Step 8: Commit**

```bash
cd Full_Stack_App_Node
git add server/package.json server/package-lock.json server/tsconfig.json server/.env.example server/src
git commit -m "feat(server): scaffold Express + TypeScript with health check"
```

---

### Task 3: Prisma setup + Note model

**Files:**
- Create: `Full_Stack_App_Node/server/prisma/schema.prisma`
- Create: `Full_Stack_App_Node/server/src/prisma.ts`
- Modify: `Full_Stack_App_Node/server/.env.example` (already has `DATABASE_URL`, no change needed — confirm it's present)

**Interfaces:**
- Consumes: `DATABASE_URL` env var from Task 2's `.env`.
- Produces: `prisma` (singleton `PrismaClient` instance) exported from `src/prisma.ts`, imported by Task 4's routes.
- Produces: `Note` Prisma model with fields `id: Int`, `title: String`, `content: String`, `createdAt: DateTime`, `updatedAt: DateTime`.

- [ ] **Step 1: Install Prisma**

```bash
cd Full_Stack_App_Node/server
npm install @prisma/client
npm install -D prisma
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and appends `DATABASE_URL` to a generated `.env` — replace the generated `.env` contents with the values from `.env.example` (same `DATABASE_URL` var, edit in the actual `.env` to point at a real local Postgres instance the user has running).

- [ ] **Step 2: Write the Note model in prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Note {
  id        Int      @id @default(autoincrement())
  title     String
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 3: Write src/prisma.ts**

```typescript
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

- [ ] **Step 4: Run the migration**

```bash
npx prisma migrate dev --name init
```

Expected: migration succeeds and creates the `Note` table (requires a reachable PostgreSQL instance at `DATABASE_URL` — if none is running yet, start one first, e.g. `docker run --name fsan-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=full_stack_app_node -p 5432:5432 -d postgres:16`).

- [ ] **Step 5: Verify**

```bash
npx prisma studio
```

Confirm the `Note` table appears (empty). Close Prisma Studio.

- [ ] **Step 6: Commit**

```bash
cd Full_Stack_App_Node
git add server/prisma server/src/prisma.ts server/package.json server/package-lock.json
git commit -m "feat(server): add Prisma with Note model and initial migration"
```

---

### Task 4: Notes CRUD routes

**Files:**
- Create: `Full_Stack_App_Node/server/src/routes/notes.ts`
- Modify: `Full_Stack_App_Node/server/src/app.ts`

**Interfaces:**
- Consumes: `prisma` from `src/prisma.ts` (Task 3).
- Produces: Express router mounted at `/api/notes` with:
  - `GET /api/notes` → `Note[]`
  - `GET /api/notes/:id` → `Note` or 404
  - `POST /api/notes` (body: `{ title: string; content: string }`) → created `Note`
  - `PUT /api/notes/:id` (body: `{ title?: string; content?: string }`) → updated `Note` or 404
  - `DELETE /api/notes/:id` → 204 or 404

- [ ] **Step 1: Write src/routes/notes.ts**

```typescript
import { Router } from "express";
import { prisma } from "../prisma";

export const notesRouter = Router();

notesRouter.get("/", async (_req, res) => {
  const notes = await prisma.note.findMany({ orderBy: { createdAt: "desc" } });
  res.json(notes);
});

notesRouter.get("/:id", async (req, res) => {
  const note = await prisma.note.findUnique({ where: { id: Number(req.params.id) } });
  if (!note) return res.status(404).json({ error: "Note not found" });
  res.json(note);
});

notesRouter.post("/", async (req, res) => {
  const { title, content } = req.body;
  const note = await prisma.note.create({ data: { title, content } });
  res.status(201).json(note);
});

notesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Note not found" });

  const { title, content } = req.body;
  const note = await prisma.note.update({
    where: { id },
    data: { title, content },
  });
  res.json(note);
});

notesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Note not found" });

  await prisma.note.delete({ where: { id } });
  res.status(204).send();
});
```

- [ ] **Step 2: Mount the router in src/app.ts**

Add near the top: `import { notesRouter } from "./routes/notes";`

Add after the `/health` route: `app.use("/api/notes", notesRouter);`

- [ ] **Step 3: Verify manually**

```bash
npm run dev
```

In another terminal:

```bash
curl -X POST http://localhost:4000/api/notes -H "Content-Type: application/json" -d '{"title":"First","content":"Hello"}'
curl http://localhost:4000/api/notes
curl -X PUT http://localhost:4000/api/notes/1 -H "Content-Type: application/json" -d '{"title":"Updated","content":"Hello again"}'
curl -X DELETE http://localhost:4000/api/notes/1 -w '%{http_code}\n'
```

Expect: create returns 201 with the note, list returns an array containing it, update returns 200 with updated fields, delete returns 204. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
cd Full_Stack_App_Node
git add server/src/routes server/src/app.ts
git commit -m "feat(server): add Notes CRUD routes"
```

---

### Task 5: Client skeleton (Vite + React + TypeScript + Tailwind + shadcn/ui)

**Files:**
- Create: `Full_Stack_App_Node/client/` (Vite-generated project files)
- Modify: `Full_Stack_App_Node/client/tailwind.config.js`, `src/index.css` (Tailwind wiring)
- Create: shadcn/ui config + `src/lib/utils.ts` (generated by `shadcn init`)

**Interfaces:**
- Produces: a running Vite dev server on `http://localhost:5173` with Tailwind + shadcn/ui ready for component `add` commands.

- [ ] **Step 1: Scaffold the Vite project**

```bash
cd Full_Stack_App_Node
npm create vite@latest client -- --template react-ts
cd client
npm install
```

- [ ] **Step 2: Install Tailwind CSS**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3: Configure tailwind.config.js content paths**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 4: Replace src/index.css with Tailwind directives**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Init shadcn/ui**

```bash
npx shadcn@latest init
```

Accept the defaults (TypeScript, the Tailwind config just created, `src/` as the app directory). This generates `components.json` and `src/lib/utils.ts`.

- [ ] **Step 6: Add the components the Notes page needs**

```bash
npx shadcn@latest add button card input textarea
```

- [ ] **Step 7: Verify**

```bash
npm run dev
```

Open `http://localhost:5173` in a browser — expect the default Vite+React starter page with no console errors. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
cd Full_Stack_App_Node
git add client
git commit -m "feat(client): scaffold Vite + React + TypeScript + Tailwind + shadcn/ui"
```

---

### Task 6: axios instance + Notes page (list/create/edit/delete)

**Files:**
- Create: `Full_Stack_App_Node/client/.env`
- Create: `Full_Stack_App_Node/client/src/lib/api.ts`
- Create: `Full_Stack_App_Node/client/src/types/note.ts`
- Create: `Full_Stack_App_Node/client/src/pages/NotesPage.tsx`
- Modify: `Full_Stack_App_Node/client/src/App.tsx`

**Interfaces:**
- Consumes: server `/api/notes` endpoints from Task 4.
- Produces: `api` (configured `AxiosInstance`) exported from `src/lib/api.ts`, reused by Task 8 if it ever needs the backend (it won't, per spec, but the instance is the shared HTTP client for the app).
- Produces: `Note` type exported from `src/types/note.ts`: `{ id: number; title: string; content: string; createdAt: string; updatedAt: string }`.
- Produces: `NotesPage` component (default export) rendered at `/` by Task 7's router.

- [ ] **Step 1: Install axios**

```bash
cd Full_Stack_App_Node/client
npm install axios
```

- [ ] **Step 2: Write .env**

```
VITE_API_BASE_URL=http://localhost:4000
```

- [ ] **Step 3: Write src/lib/api.ts**

```typescript
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000",
});
```

- [ ] **Step 4: Write src/types/note.ts**

```typescript
export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 5: Write src/pages/NotesPage.tsx**

```tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Note } from "../types/note";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  async function loadNotes() {
    const { data } = await api.get<Note[]>("/api/notes");
    setNotes(data);
  }

  useEffect(() => {
    loadNotes();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId === null) {
      await api.post("/api/notes", { title, content });
    } else {
      await api.put(`/api/notes/${editingId}`, { title, content });
      setEditingId(null);
    }
    setTitle("");
    setContent("");
    await loadNotes();
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
  }

  async function handleDelete(id: number) {
    await api.delete(`/api/notes/${id}`);
    await loadNotes();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Notes</h1>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <Textarea
          placeholder="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
        <Button type="submit">{editingId === null ? "Add note" : "Save changes"}</Button>
      </form>

      <div className="space-y-3">
        {notes.map((note) => (
          <Card key={note.id}>
            <CardHeader>
              <CardTitle>{note.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p>{note.content}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => startEdit(note)}>
                  Edit
                </Button>
                <Button variant="destructive" onClick={() => handleDelete(note.id)}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Temporarily render NotesPage from App.tsx to verify (Task 7 replaces this with the router)**

Replace the contents of `src/App.tsx` with:

```tsx
import NotesPage from "./pages/NotesPage";

function App() {
  return <NotesPage />;
}

export default App;
```

- [ ] **Step 7: Verify end-to-end**

Start the server (Task 4's app, `npm run dev` in `server/`) and the client (`npm run dev` in `client/`). Open `http://localhost:5173`: add a note, confirm it appears; edit it, confirm the change persists after reload; delete it, confirm it disappears. Stop both dev servers.

- [ ] **Step 8: Commit**

```bash
cd Full_Stack_App_Node
git add client/src client/.env client/package.json client/package-lock.json
git commit -m "feat(client): add axios client and Notes CRUD page"
```

---

### Task 7: React Router + nav bar

**Files:**
- Create: `Full_Stack_App_Node/client/src/components/NavBar.tsx`
- Modify: `Full_Stack_App_Node/client/src/App.tsx`
- Modify: `Full_Stack_App_Node/client/src/main.tsx`

**Interfaces:**
- Consumes: `NotesPage` (Task 6, default export) and `ProductViewerPage` (Task 8, default export from `src/pages/ProductViewerPage.tsx` — this task references it by import path even though Task 8 creates the file; if executed before Task 8, the import will fail until Task 8 lands, so run Task 8 immediately after or stub the file first).
- Produces: routes `/` → `NotesPage`, `/product-viewer` → `ProductViewerPage`, both reachable from `NavBar`.

- [ ] **Step 1: Install React Router**

```bash
cd Full_Stack_App_Node/client
npm install react-router-dom
```

- [ ] **Step 2: Create a placeholder ProductViewerPage so this task's build succeeds standalone**

Write `src/pages/ProductViewerPage.tsx` (Task 8 will replace its contents):

```tsx
export default function ProductViewerPage() {
  return <div className="p-6">Product viewer coming in Task 8.</div>;
}
```

- [ ] **Step 3: Write src/components/NavBar.tsx**

```tsx
import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`;

export default function NavBar() {
  return (
    <nav className="flex gap-2 border-b p-3">
      <NavLink to="/" end className={linkClass}>
        Notes
      </NavLink>
      <NavLink to="/product-viewer" className={linkClass}>
        Product Viewer
      </NavLink>
    </nav>
  );
}
```

- [ ] **Step 4: Wire routes in src/App.tsx**

```tsx
import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import NotesPage from "./pages/NotesPage";
import ProductViewerPage from "./pages/ProductViewerPage";

function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<NotesPage />} />
        <Route path="/product-viewer" element={<ProductViewerPage />} />
      </Routes>
    </>
  );
}

export default App;
```

- [ ] **Step 5: Wrap the app in BrowserRouter in src/main.tsx**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 6: Verify**

```bash
npm run dev
```

Open `http://localhost:5173`: confirm the nav bar shows "Notes" and "Product Viewer", `/` renders the Notes page, clicking "Product Viewer" navigates to `/product-viewer` and shows the placeholder text. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
cd Full_Stack_App_Node
git add client/src client/package.json client/package-lock.json
git commit -m "feat(client): add React Router with Notes and Product Viewer routes"
```

---

### Task 8: Product Viewer page (react-three-fiber + drei + GLTF model)

**Files:**
- Create: `Full_Stack_App_Node/client/public/models/Duck.glb`
- Modify: `Full_Stack_App_Node/client/src/pages/ProductViewerPage.tsx`

**Interfaces:**
- Consumes: nothing from the backend (per spec, standalone page).
- Produces: the finished `ProductViewerPage` default export consumed by Task 7's router (already wired).

- [ ] **Step 1: Install react-three-fiber, drei, and three**

```bash
cd Full_Stack_App_Node/client
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

- [ ] **Step 2: Download the sample GLTF model**

```bash
mkdir -p public/models
curl -L -o public/models/Duck.glb https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb
```

This is the standard Khronos glTF sample model used across nearly every three.js/react-three-fiber tutorial — used here as a stand-in "product" asset.

- [ ] **Step 3: Write the finished ProductViewerPage**

```tsx
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, Center } from "@react-three/drei";

function Model() {
  const { scene } = useGLTF("/models/Duck.glb");
  return <primitive object={scene} scale={1.2} />;
}

function Loading() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="lightgray" wireframe />
    </mesh>
  );
}

export default function ProductViewerPage() {
  return (
    <div className="h-[calc(100vh-56px)] w-full">
      <Canvas camera={{ position: [0, 1, 4], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Suspense fallback={<Loading />}>
          <Center>
            <Model />
          </Center>
          <Environment preset="city" />
        </Suspense>
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  );
}

useGLTF.preload("/models/Duck.glb");
```

- [ ] **Step 4: Verify**

```bash
npm run dev
```

Open `http://localhost:5173/product-viewer`: confirm the duck model renders, is lit, and can be rotated/zoomed with the mouse (OrbitControls). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
cd Full_Stack_App_Node
git add client/src/pages/ProductViewerPage.tsx client/public/models/Duck.glb client/package.json client/package-lock.json
git commit -m "feat(client): add Three.js product viewer page with react-three-fiber"
```

---

### Task 9: Root CLAUDE.md documentation

**Files:**
- Create: `Full_Stack_App_Node/CLAUDE.md`

**Interfaces:**
- Produces: none (documentation only).

- [ ] **Step 1: Write CLAUDE.md**

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Server** (`server/`):
- `npm install` — install dependencies
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

## Architecture

Two independent projects, no workspaces:

- `server/` — Express + TypeScript REST API. `src/app.ts` builds the Express app and mounts routers; `src/index.ts` starts it. `src/prisma.ts` exports the shared `PrismaClient` singleton. Routes live under `src/routes/`, one file per resource (currently `notes.ts`, mounted at `/api/notes`). Data model is defined in `prisma/schema.prisma`.

- `client/` — Vite + React + TypeScript SPA. `src/lib/api.ts` exports the shared axios instance (base URL from `VITE_API_BASE_URL`). Pages live under `src/pages/`; routing is in `src/App.tsx` via `react-router-dom`. UI components come from shadcn/ui (`src/components/ui/`, generated — don't hand-edit, re-run `npx shadcn@latest add` instead).

- Notes flow: `NotesPage` → axios → `server/src/routes/notes.ts` → Prisma → PostgreSQL. Standard JSON REST, no auth.

- Product Viewer (`/product-viewer`): a standalone `@react-three/fiber` scene loading a bundled GLTF model (`client/public/models/Duck.glb`) — no backend calls. Exists purely to practice Three.js/react-three-fiber patterns (job-relevant 3D skills), not tied to app data.

## Environment

- `server/.env` needs `DATABASE_URL` (PostgreSQL connection string), `PORT`, `CLIENT_ORIGIN`. See `server/.env.example`.
- `client/.env` needs `VITE_API_BASE_URL` pointing at the running server.
```

- [ ] **Step 2: Commit**

```bash
cd Full_Stack_App_Node
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md for Full_Stack_App_Node"
```
