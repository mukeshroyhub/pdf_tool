import Link from "next/link";
import { FileCog, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Branded 404 page shown for any unknown route. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 px-4 text-center">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <FileCog className="h-5 w-5" />
        </span>
        <span className="text-lg font-bold tracking-tight">PDF Tool</span>
      </Link>

      <div className="space-y-2">
        <p className="text-6xl font-bold tracking-tight text-primary">404</p>
        <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
      </div>

      <Button asChild>
        <Link href="/dashboard">
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </Button>
    </main>
  );
}
