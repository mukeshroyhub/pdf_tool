"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, setAccessToken, tryRefresh } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { AuthResponse, UserDTO } from "@pdfforge/shared";

/**
 * Landing page after the Google OAuth redirect. The API has already set the
 * refresh cookie; this page exchanges it for an access token and loads the user.
 */
export default function OAuthCallbackPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const code = new URLSearchParams(window.location.search).get("code");
      try {
        if (code) {
          // Exchange the one-time code from the Google callback for a session.
          const data = await api<AuthResponse>("/api/auth/oauth-exchange", {
            method: "POST",
            body: { code },
          });
          setAccessToken(data.accessToken);
          setUser(data.user);
          router.replace("/dashboard");
          return;
        }
        // No code: fall back to restoring an existing session cookie.
        const ok = await tryRefresh();
        if (!ok) throw new Error("no session");
        const data = await api<{ user: UserDTO }>("/api/users/me");
        setUser(data.user);
        router.replace("/dashboard");
      } catch {
        toast.error("Google sign-in failed. Please try again.");
        router.replace("/login");
      }
    })();
  }, [router, setUser]);

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center">
      <h1 className="sr-only">Completing sign-in</h1>
      <div role="status" aria-live="polite" className="flex items-center gap-2 text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
        Completing sign-in…
      </div>
    </main>
  );
}
