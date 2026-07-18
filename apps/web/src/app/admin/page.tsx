"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";

/**
 * Owner-only usage dashboard. Aggregate numbers only — nothing about
 * individual users or files (the server doesn't store that). Access is gated
 * by the admin key (set ADMIN_KEY in the API's .env); it's kept in this
 * browser's localStorage after first entry.
 */

interface Stats {
  totals: Record<string, number>;
  today: Record<string, number>;
  days: Array<{ date: string; metrics: Record<string, number> }>;
}

const METRICS: Array<{ key: string; label: string }> = [
  { key: "guest", label: "Guest sessions" },
  { key: "login", label: "Sign-ins" },
  { key: "signup", label: "New accounts" },
  { key: "pdf_op", label: "PDF operations" },
];

const KEY_STORE = "pf-admin-key";

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_STORE);
      if (saved) setAdminKey(saved);
    } catch {
      /* storage blocked */
    }
  }, []);

  const load = async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats", { headers: { "x-admin-key": key } });
      if (res.status === 401) throw new Error("Invalid admin key.");
      if (res.status === 404) throw new Error("Admin stats are not enabled on the server (set ADMIN_KEY).");
      if (!res.ok) throw new Error(`Request failed (${res.status}).`);
      setStats((await res.json()) as Stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load stats.");
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminKey) void load(adminKey);
  }, [adminKey]);

  const submitKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {
      /* ignore */
    }
    setAdminKey(k);
  };

  const maxDay = Math.max(
    1,
    ...(stats?.days ?? []).flatMap((d) => Object.values(d.metrics)),
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BarChart3 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usage</h1>
          <p className="text-sm text-muted-foreground">
            Aggregate numbers only — nothing about individual users or files.
          </p>
        </div>
      </div>

      {!adminKey ? (
        <form
          className="mx-auto max-w-sm space-y-3 rounded-xl border bg-card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            submitKey();
          }}
        >
          <label className="text-sm font-medium">Admin key</label>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Enter your ADMIN_KEY"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            autoFocus
          />
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            View stats
          </button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={() => void load(adminKey)}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
            <button
              onClick={() => {
                try {
                  localStorage.removeItem(KEY_STORE);
                } catch {
                  /* ignore */
                }
                setAdminKey("");
                setKeyInput("");
                setStats(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          </div>

          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

          {stats ? (
            <>
              {/* Totals + today */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {METRICS.map((m) => (
                  <div key={m.key} className="rounded-xl border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="mt-1 text-2xl font-bold">{stats.totals[m.key] ?? 0}</p>
                    <p className="text-xs text-muted-foreground">
                      +{stats.today[m.key] ?? 0} today
                    </p>
                  </div>
                ))}
              </div>

              {/* Per-day table with inline bars */}
              <div className="mt-8 rounded-xl border bg-card">
                <div className="border-b px-4 py-3 text-sm font-semibold">Last 30 days</div>
                <div className="divide-y">
                  {stats.days.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No activity recorded yet.
                    </p>
                  ) : (
                    stats.days.map((d) => (
                      <div key={d.date} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <span className="w-24 shrink-0 text-muted-foreground">{d.date}</span>
                        <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1">
                          {METRICS.map((m) => {
                            const v = d.metrics[m.key] ?? 0;
                            if (!v) return null;
                            return (
                              <span key={m.key} className="flex items-center gap-1.5">
                                <span
                                  className="inline-block h-2 rounded-full bg-primary"
                                  style={{ width: `${Math.max(6, (v / maxDay) * 80)}px` }}
                                />
                                <span className="tabular-nums">{v}</span>
                                <span className="text-xs text-muted-foreground">{m.label}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
