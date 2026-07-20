"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, CircleX, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Status = "verifying" | "success" | "error";

function VerifyEmailInner() {
  const token = useSearchParams().get("token") ?? "";
  const { user, setUser } = useAuth();
  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  const [message, setMessage] = useState("This link is missing its token.");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // strict-mode double-invoke guard
    (async () => {
      try {
        const data = await api<{ message: string; user: typeof user }>("/api/auth/verify-email", {
          method: "POST",
          body: { token },
        });
        setStatus("success");
        if (user && data.user) setUser(data.user);
      } catch (err) {
        setStatus("error");
        setMessage(
          err instanceof ApiError ? err.message : "Verification failed. Please try again.",
        );
      }
    })();
  }, [token, user, setUser]);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <h1 className="sr-only">Email verification</h1>
        {status === "verifying" ? (
          <>
            <Loader2 aria-hidden="true" className="h-10 w-10 animate-spin text-muted-foreground" />
            <p role="status" aria-live="polite" className="font-medium">
              Verifying your email…
            </p>
          </>
        ) : status === "success" ? (
          <>
            <BadgeCheck aria-hidden="true" className="h-10 w-10 text-green-600" />
            <p role="status" aria-live="polite" className="font-medium">
              Email verified
            </p>
            <p className="text-sm text-muted-foreground">Your email address is now confirmed.</p>
            <Button asChild className="mt-2">
              <Link href={user ? "/dashboard" : "/login"}>
                {user ? "Go to dashboard" : "Sign in"}
              </Link>
            </Button>
          </>
        ) : (
          <>
            <CircleX aria-hidden="true" className="h-10 w-10 text-destructive" />
            <p role="alert" className="font-medium">
              Verification failed
            </p>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button asChild variant="outline" className="mt-2">
              <Link href="/login" prefetch={false}>Back to sign in</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
