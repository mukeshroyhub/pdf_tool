"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@pdfforge/shared";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/form-field";
import { GoogleButton } from "@/components/google-button";

export default function LoginPage() {
  const { login, guest } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);

  const continueAsGuest = async () => {
    setServerError(null);
    setGuestLoading(true);
    try {
      await guest();
      router.replace("/dashboard");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Could not start a guest session.");
      setGuestLoading(false);
    }
  };

  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values);
      router.replace("/dashboard");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your account to continue</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {serverError ? (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        {/* method="post" is deliberate. The submit is handled in JS, but a form
            with no method defaults to GET — so an Enter keypress before React
            hydrates would navigate to /login?email=…&password=… and leak the
            credentials into the URL, browser history, and proxy logs. */}
        <form onSubmit={onSubmit} method="post" action="/login" className="space-y-4" noValidate>
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              aria-invalid={errors.email ? true : undefined}
              {...field("email")}
            />
          </FormField>
          <FormField
            label="Password"
            htmlFor="password"
            error={errors.password?.message}
            hint={
              <Link
                href="/forgot-password"
                prefetch={false}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                Forgot password?
              </Link>
            }
          >
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              aria-invalid={errors.password ? true : undefined}
              {...field("password")}
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Sign in
          </Button>
        </form>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <GoogleButton label="Continue with Google" />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={guestLoading}
          onClick={() => void continueAsGuest()}
        >
          {guestLoading ? <Loader2 className="animate-spin" /> : null}
          Continue as guest
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" prefetch={false} className="font-medium text-primary underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
