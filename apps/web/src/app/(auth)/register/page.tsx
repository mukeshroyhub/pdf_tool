"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@pdfforge/shared";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/form-field";
import { GoogleButton } from "@/components/google-button";

export default function RegisterPage() {
  const { register: signUp } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await signUp(values);
      router.replace("/dashboard");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Free 1 GB of storage. No credit card required.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {serverError ? (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" placeholder="Jane Doe" autoComplete="name" {...field("name")} />
          </FormField>
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              {...field("email")}
            />
          </FormField>
          <FormField label="Password" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              {...field("password")}
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Create account
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
        <GoogleButton label="Sign up with Google" />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
