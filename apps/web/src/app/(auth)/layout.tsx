import { FileCog } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Auth shell. Deliberately a *server* component with no framer-motion: the
 * login page is the first thing an unauthenticated visitor loads, and pulling
 * the whole animation runtime in just to fade a card in cost more JS than the
 * effect was worth. The same entrance is now a pure CSS animation
 * (`animate-in` from tailwindcss-animate), which ships zero JavaScript and
 * respects prefers-reduced-motion.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      className="relative flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-10"
    >
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md duration-300 animate-in fade-in slide-in-from-bottom-3">
        <Link
          href="/"
          aria-label="PDF Tool — home"
          className="mb-6 flex items-center justify-center gap-2"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileCog aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="text-2xl font-bold tracking-tight">PDF Tool</span>
        </Link>
        {children}
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Edit, convert, organize and sign PDF files online.
      </p>
    </main>
  );
}
