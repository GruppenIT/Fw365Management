import { create } from "zustand";
import { api } from "@/lib/api";
import { useEffect } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  
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

  checkAuth: async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      set({ isInitialized: true });
      return;
    }
    
    set({ isLoading: true });
    try {
      const user = await api.getMe();
      set({ user: user as User, isLoading: false, isInitialized: true });
    } catch (error) {
      api.clearToken();
      set({ user: null, isLoading: false, isInitialized: true });
    }
  },
}));

export function useAuthInit() {
  const { checkAuth, isInitialized } = useAuth();
  
  useEffect(() => {
    if (!isInitialized) {
      checkAuth();
    }
  }, [checkAuth, isInitialized]);
}
