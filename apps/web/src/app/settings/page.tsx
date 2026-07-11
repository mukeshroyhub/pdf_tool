"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
  type UserDTO,
} from "@pdfforge/shared";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsContent />
    </AppShell>
  );
}

function SettingsContent() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account.</p>
      </div>

      {!user.emailVerified ? <VerifyEmailBanner /> : null}

      <div className="grid gap-6 md:grid-cols-2">
        <ProfileCard user={user} />
        {user.hasPassword ? <PasswordCard /> : <GoogleOnlyCard />}
        <ActivityLogCard user={user} />
      </div>
    </div>
  );
}

function ActivityLogCard({ user }: { user: UserDTO }) {
  const { setUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const enabled = user.activityLogging;

  const toggle = async () => {
    setSaving(true);
    try {
      const data = await api<{ user: UserDTO }>("/api/users/me", {
        method: "PATCH",
        body: { activityLogging: !enabled },
      });
      setUser(data.user);
      toast.success(enabled ? "Activity logging turned off" : "Activity logging turned on");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update setting");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity log</CardTitle>
        <CardDescription>Record actions like uploads, edits and downloads</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {enabled
              ? "Logging is on — your recent activity shows on the dashboard."
              : "Logging is off — new actions won't be recorded."}
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle activity logging"
            disabled={saving}
            onClick={() => void toggle()}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              enabled ? "bg-primary" : "bg-muted",
              saving && "opacity-60",
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                enabled ? "translate-x-5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileCard({ user }: { user: UserDTO }) {
  const { setUser } = useAuth();
  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: user.name },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const data = await api<{ user: UserDTO }>("/api/users/me", {
        method: "PATCH",
        body: values,
      });
      setUser(data.user);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update profile");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your account details</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Name" htmlFor="profile-name" error={errors.name?.message}>
            <Input id="profile-name" {...field("name")} />
          </FormField>
          <div className="space-y-2">
            <p className="text-sm font-medium">Email</p>
            <Input value={user.email} disabled />
          </div>
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Save changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const {
    register: field,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api("/api/users/me/password", { method: "POST", body: values });
      reset();
      toast.success("Password changed. Other sessions were signed out.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not change password");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Change your account password</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField
            label="Current password"
            htmlFor="current-password"
            error={errors.currentPassword?.message}
          >
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              {...field("currentPassword")}
            />
          </FormField>
          <FormField
            label="New password"
            htmlFor="new-password"
            error={errors.newPassword?.message}
          >
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              {...field("newPassword")}
            />
          </FormField>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function GoogleOnlyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          You signed up with Google, so this account has no password. Use “Continue with Google”
          to sign in.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
