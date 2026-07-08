"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { UserOut } from "./types";

interface AuthContextValue {
  user: UserOut | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  markPasswordChanged: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("bcc_user");
    const token = localStorage.getItem("bcc_token");
    if (stored && token) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("bcc_token", res.data.access_token);
    localStorage.setItem("bcc_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    router.push(res.data.user.must_change_password ? "/change-password" : "/dashboard");
  }

  function logout() {
    localStorage.removeItem("bcc_token");
    localStorage.removeItem("bcc_user");
    setUser(null);
    router.push("/login");
  }

  function markPasswordChanged() {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, must_change_password: false };
      localStorage.setItem("bcc_user", JSON.stringify(updated));
      return updated;
    });
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, markPasswordChanged }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
