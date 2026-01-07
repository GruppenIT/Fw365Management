import { create } from "zustand";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
}

interface AuthState {
  user: User | null;
  login: (email: string) => void;
  logout: () => void;
}

// Simple mock auth store
export const useAuth = create<AuthState>((set) => ({
  user: null, // Start logged out
  login: (email: string) => set({ 
    user: { 
      id: "u1", 
      name: "Admin User", 
      email, 
      role: "admin" 
    } 
  }),
  logout: () => set({ user: null }),
}));
