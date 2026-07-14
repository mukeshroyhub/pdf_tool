import { Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Tells users that uploaded files and activity are auto-deleted after 1 hour. */
export function RetentionBanner() {
  return (
    <Alert>
      <Clock className="h-4 w-4" />
      <AlertTitle>Files are deleted after 60 minutes</AlertTitle>
      <AlertDescription>
        For your privacy, uploaded files and activity are automatically removed 60 minutes after
        upload. Download anything you want to keep.
      </AlertDescription>
    </Alert>
  );
}
