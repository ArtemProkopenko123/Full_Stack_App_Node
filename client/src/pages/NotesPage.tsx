import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNotesStore } from "../stores/useNotesStore";
import type { Note } from "../types/note";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@artemprokopenko/ui";

import { useUsersStore } from "@/stores/useUsersStore";

export default function NotesPage() {
  const { notes, error } = useNotesStore(
    useShallow((s) => ({ notes: s.notes, error: s.error })),
  );
  const { users, user_error } = useUsersStore( useShallow((s) => ({ users: s.users, user_error: s.error })), )
  const loadNotes = useNotesStore((s) => s.loadNotes);
  const createNote = useNotesStore((s) => s.createNote);
  const updateNote = useNotesStore((s) => s.updateNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const loadUsers = useUsersStore((s) => s.loadUsers);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    loadNotes();
    loadUsers();
  }, [loadNotes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingId === null) {
        await createNote(title, content);
      } else {
        await updateNote(editingId, title, content);
        setEditingId(null);
      }
      setTitle("");
      setContent("");
    } catch {
      // error is already surfaced via the store's `error` state
    }
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
  }

  async function handleDelete(id: number) {
    try {
      await deleteNote(id);
    } catch {
      // error is already surfaced via the store's `error` state
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Notes</h1>
      {error && <p className="text-red-600">{error}</p>}
      {user_error && <p className="text-red-600">{user_error}</p>}

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
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select a user" />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id.toString()}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
