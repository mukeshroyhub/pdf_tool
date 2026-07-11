"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, tryRefresh } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { UserDTO } from "@pdfforge/shared";

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
      const ok = await tryRefresh();
      if (!ok) {
        toast.error("Google sign-in failed. Please try again.");
        router.replace("/login");
        return;
      }
      try {
        const data = await api<{ user: UserDTO }>("/api/users/me");
        setUser(data.user);
        router.replace("/dashboard");
      } catch {
        toast.error("Could not load your profile. Please sign in again.");
        router.replace("/login");
      }
    })();
  }, [router, setUser]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Completing sign-in…
      </div>
    </main>
  );
}
