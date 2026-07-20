"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

/** Root route: forwards to the dashboard when signed in, else to login. */
export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [user, loading, router]);

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center">
      <h1 className="sr-only">PDF Tool — online PDF editor and converter</h1>
      <div role="status" aria-live="polite">
        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading…</span>
      </div>
    </main>
  );
}
