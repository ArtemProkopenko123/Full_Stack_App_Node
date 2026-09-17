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
  const [error, setError] = useState<string | null>(null);

  async function loadNotes() {
    try {
      setError(null);
      const { data } = await api.get<Note[]>("/api/notes");
      setNotes(data);
    } catch {
      setError("Could not reach the API — is the server running?");
    }
  }

  useEffect(() => {
    loadNotes();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(null);
      if (editingId === null) {
        await api.post("/api/notes", { title, content });
      } else {
        await api.put(`/api/notes/${editingId}`, { title, content });
        setEditingId(null);
      }
      await loadNotes();
      setTitle("");
      setContent("");
    } catch {
      setError("Could not reach the API — is the server running?");
    }
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
  }

  async function handleDelete(id: number) {
    try {
      setError(null);
      await api.delete(`/api/notes/${id}`);
      await loadNotes();
    } catch {
      setError("Could not reach the API — is the server running?");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Notes</h1>
      {error && <p className="text-red-600">{error}</p>}

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
