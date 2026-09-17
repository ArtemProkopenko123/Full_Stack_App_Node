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
