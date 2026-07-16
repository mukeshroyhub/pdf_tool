"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const DISMISS_KEY = "pf-privacy-banner-dismissed";

/**
 * Explains that files are stored privately in this browser, not on the server.
 * Dismissible: once closed it stays hidden on this device (the message matters
 * most on first visit; regulars shouldn't lose screen space to it forever).
 */
export function RetentionBanner() {
  // Start hidden to avoid a flash for users who already dismissed it; reveal
  // after checking localStorage on mount (server render can't know).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      setVisible(true); // storage blocked — just show it
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore: banner simply reappears next visit if storage is unavailable.
    }
  };

  if (!visible) return null;

  return (
    <Alert className="relative pr-10">
      <ShieldCheck className="h-4 w-4" />
      <AlertTitle>Your files stay in this browser</AlertTitle>
      <AlertDescription>
        For your privacy, files are stored only on this device and are never kept on our
        servers. They remain until you delete them or clear your browser data, and are not
        synced across devices — download anything you want to keep elsewhere.
      </AlertDescription>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss privacy notice"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </Alert>
  );
}
