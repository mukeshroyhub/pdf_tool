"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthResponse, LoginInput, RegisterInput, UserDTO } from "@pdfforge/shared";
import { api, setAccessToken, tryRefresh } from "./api";

interface AuthContextValue {
  user: UserDTO | null;
  /** True while the initial silent session restore is in flight. */
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  /** Signs in to the shared local guest account (no credentials needed). */
  guest: () => Promise<void>;
  logout: () => Promise<void>;
  /** Replaces the cached user after profile mutations. */
  setUser: (user: UserDTO | null) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Non-secret flag set by the API next to the httpOnly refresh cookie. */
const SESSION_HINT_COOKIE = "pf_session";

/** True when the browser is carrying a session hint, i.e. a refresh is worth trying. */
function hasSessionHint(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith(`${SESSION_HINT_COOKIE}=`));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from the httpOnly refresh cookie on first load.
  //
  // The refresh call is skipped entirely when the readable `pf_session` hint
  // cookie is absent. Previously every anonymous visitor hitting /login fired a
  // POST /api/auth/refresh that could only ever return 401 — a guaranteed-to-
  // fail request sitting on the critical path of the most-loaded page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasSessionHint()) {
        setLoading(false);
        return;
      }
      const ok = await tryRefresh();
      if (ok) {
        try {
          const data = await api<{ user: UserDTO }>("/api/users/me");
          if (!cancelled) setUser(data.user);
        } catch {
          // Session restore failed; remain signed out.
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const data = await api<AuthResponse>("/api/auth/login", { method: "POST", body: input });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const data = await api<AuthResponse>("/api/auth/register", { method: "POST", body: input });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const guest = useCallback(async () => {
    const data = await api<AuthResponse>("/api/auth/guest", { method: "POST" });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await api<{ user: UserDTO }>("/api/users/me");
    setUser(data.user);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, guest, logout, setUser, refreshUser }),
    [user, loading, login, register, guest, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
