import { z } from "zod"

export const noteInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string(),
})

export const noteSchema = noteInputSchema.extend({
  id: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type NoteInput = z.infer<typeof noteInputSchema>
export type Note = z.infer<typeof noteSchema>
export type User = z.infer<typeof userSchema>
