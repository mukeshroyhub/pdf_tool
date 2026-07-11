"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@pdfforge/shared";
import { Loader2, MailCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/form-field";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: values });
      setSent(true);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  });

  if (sent) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <MailCheck className="h-10 w-10 text-primary" />
          <p className="font-medium">Check your inbox</p>
          <p className="text-sm text-muted-foreground">
            If that email is registered, we sent a link to reset your password. The link expires
            in 1 hour.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a link to reset your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {serverError ? (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              {...field("email")}
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Send reset link
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
