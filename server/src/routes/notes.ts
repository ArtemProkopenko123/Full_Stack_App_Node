import { Router } from "express";
import { noteInputSchema } from "@app/shared";
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
  const parsed = noteInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const note = await prisma.note.create({ data: parsed.data });
  res.status(201).json(note);
});

notesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Note not found" });

  const parsed = noteInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const note = await prisma.note.update({
    where: { id },
    data: parsed.data,
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
