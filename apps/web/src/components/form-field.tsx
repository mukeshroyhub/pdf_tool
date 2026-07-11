"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/** Label + control + validation message, wired for react-hook-form errors. */
export function FormField({
  label,
  htmlFor,
  error,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint}
      </div>
      {children}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
