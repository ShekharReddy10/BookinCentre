"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { UserOut } from "./types";

interface AuthContextValue {
  user: UserOut | null;
  permissions: string[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  markPasswordChanged: () => void;
  hasPermission: (key: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("bcc_user");
    const token = localStorage.getItem("bcc_token");
    const storedPerms = localStorage.getItem("bcc_permissions");
    if (stored && token) {
      setUser(JSON.parse(stored));
      if (storedPerms) setPermissions(JSON.parse(storedPerms));
    }
    setLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("bcc_token", res.data.access_token);
    localStorage.setItem("bcc_user", JSON.stringify(res.data.user));
    localStorage.setItem("bcc_permissions", JSON.stringify(res.data.permissions || []));
    setUser(res.data.user);
    setPermissions(res.data.permissions || []);
    router.push(res.data.user.must_change_password ? "/change-password" : "/dashboard");
  }

  function logout() {
    localStorage.removeItem("bcc_token");
    localStorage.removeItem("bcc_user");
    localStorage.removeItem("bcc_permissions");
    setUser(null);
    setPermissions([]);
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

  function hasPermission(key: string) {
    return user?.role === "admin" || permissions.includes(key);
  }

  async function refreshPermissions() {
    const res = await api.get("/auth/permissions");
    localStorage.setItem("bcc_permissions", JSON.stringify(res.data.permissions || []));
    setPermissions(res.data.permissions || []);
  }

  return (
    <AuthContext.Provider
      value={{ user, permissions, loading, login, logout, markPasswordChanged, hasPermission, refreshPermissions }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
