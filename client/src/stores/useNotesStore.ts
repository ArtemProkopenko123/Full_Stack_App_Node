import { create } from "zustand";
import { api } from "../lib/api";
import type { Note } from "../types/note";

const API_ERROR = "Could not reach the API — is the server running?";

interface NotesState {
  notes: Note[];
  error: string | null;
  loadNotes: () => Promise<void>;
  createNote: (title: string, content: string) => Promise<void>;
  updateNote: (id: number, title: string, content: string) => Promise<void>;
  deleteNote: (id: number) => Promise<void>;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  error: null,

  loadNotes: async () => {
    try {
      set({ error: null });
      const { data } = await api.get<Note[]>("/api/notes");
      set({ notes: data });
    } catch {
      set({ error: API_ERROR });
    }
  },

  createNote: async (title, content) => {
    try {
      set({ error: null });
      await api.post("/api/notes", { title, content });
      await get().loadNotes();
    } catch (e) {
      set({ error: API_ERROR });
      throw e;
    }
  },

  updateNote: async (id, title, content) => {
    try {
      set({ error: null });
      await api.put(`/api/notes/${id}`, { title, content });
      await get().loadNotes();
    } catch (e) {
      set({ error: API_ERROR });
      throw e;
    }
  },

  deleteNote: async (id) => {
    try {
      set({ error: null });
      await api.delete(`/api/notes/${id}`);
      await get().loadNotes();
    } catch (e) {
      set({ error: API_ERROR });
      throw e;
    }
  },
}));
