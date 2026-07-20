"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { passwordSchema } from "@pdfforge/shared";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/form-field";

const formSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type FormValues = z.infer<typeof formSchema>;

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: { token, password: values.password },
      });
      toast.success("Password reset. Please sign in with your new password.");
      router.replace("/login");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  });

  if (!token) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <p className="font-medium">Invalid reset link</p>
          <p className="text-sm text-muted-foreground">
            This link is missing its token. Request a new one below.
          </p>
          <Button asChild variant="outline">
            <Link href="/forgot-password" prefetch={false}>Request new link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-xl">Choose a new password</CardTitle>
        <CardDescription>Your new password must be at least 8 characters.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {serverError ? (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        {/* method="post" is deliberate: a form with no method defaults to GET, so an
            Enter keypress before React hydrates would put the field values into
            the URL, history and proxy logs. */}
        <form onSubmit={onSubmit} method="post" action="/reset-password" className="space-y-4" noValidate>
          <FormField label="New password" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-invalid={errors.password ? true : undefined}
              {...field("password")}
            />
          </FormField>
          <FormField
            label="Confirm password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-invalid={errors.confirmPassword ? true : undefined}
              {...field("confirmPassword")}
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Reset password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
