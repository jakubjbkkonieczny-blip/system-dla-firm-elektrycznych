"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type User = {
  uid: string;
  email?: string | null;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("TODO AUTH");
    setUser(null);
    setLoading(false);
  }, []);

  const logout = async () => {
    console.log("LOGOUT TODO");
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
  };

  const value = useMemo<AuthCtx>(() => ({ user, loading, logout }), [user, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}