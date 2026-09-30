import { create } from "zustand";
import { api } from "../lib/api";
import type { User } from "@/types/user";



const API_ERROR = "Could not reach the API — is the server running?";

interface UsersState {
  users: User[];
  error: string | null;
  loadUsers: () => Promise<void>;
}

export const useUsersStore = create<UsersState>((set) => ({
  users: [],
  error: null,

  loadUsers: async () => {
    try {
      set({ error: null });
      const response = await api.get<User[]>("/api/users");
      set({ users: response.data });
    } catch {
        set({ error: API_ERROR });
    }
  },
}));