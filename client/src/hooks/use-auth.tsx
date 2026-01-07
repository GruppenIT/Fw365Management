import { create } from "zustand";
import { api } from "@/lib/api";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  
  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await api.login(email, password);
      set({ user: response.user as User, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  
  logout: () => {
    api.clearToken();
    set({ user: null });
  },
  
  setUser: (user: User) => set({ user }),
}));
