"use client";

import { useState } from "react";
import { MailWarning } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function VerifyEmailBanner() {
  const [sending, setSending] = useState(false);
  return (
    <Alert>
      <MailWarning className="h-4 w-4" />
      <AlertTitle>Verify your email</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>We sent a verification link to your inbox. Didn&apos;t get it?</span>
        <Button
          variant="outline"
          size="sm"
          disabled={sending}
          onClick={async () => {
            setSending(true);
            try {
              await api("/api/auth/resend-verification", { method: "POST" });
              toast.success("Verification email sent");
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : "Could not send email");
            } finally {
              setSending(false);
            }
          }}
        >
          Resend email
        </Button>
      </AlertDescription>
    </Alert>
  );
}
