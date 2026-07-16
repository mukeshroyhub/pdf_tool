import { ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Explains that files are stored privately in this browser, not on the server. */
export function RetentionBanner() {
  return (
    <Alert>
      <ShieldCheck className="h-4 w-4" />
      <AlertTitle>Your files stay in this browser</AlertTitle>
      <AlertDescription>
        For your privacy, files are stored only on this device and are never kept on our
        servers. They remain until you delete them or clear your browser data, and are not
        synced across devices — download anything you want to keep elsewhere.
      </AlertDescription>
    </Alert>
  );
}
