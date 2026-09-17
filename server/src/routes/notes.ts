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
