"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BookOpen, FileCog, LayoutDashboard, Loader2, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/** Site owner shown in the header — change this to rename the admin credit. */
const OWNER_NAME = "Mukesh Roy";

/** Authenticated layout shell: header nav + content. Redirects guests to login. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <main id="main-content" className="flex min-h-screen items-center justify-center">
        <div role="status" aria-live="polite">
          <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="sr-only">Loading your session…</span>
        </div>
      </main>
    );
  }

  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/help", label: "Help", icon: BookOpen },
    // Only the owner (email === ADMIN_EMAIL) sees the usage dashboard link.
    ...(user.isAdmin ? [{ href: "/admin", label: "Usage", icon: BarChart3 }] : []),
  ];

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" aria-label="PDF Tool — go to dashboard" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <FileCog aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="font-bold tracking-tight">PDF Tool</span>
            </Link>
            <nav aria-label="Main" className="flex items-center gap-1">
              {nav.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  aria-current={pathname === href ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    pathname === href
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {/* Ownership credit — plain text, shown to every visitor on all
                screen sizes (small text so it doesn't crowd on mobile). */}
            <span className="whitespace-nowrap text-xs text-muted-foreground sm:text-sm">
              Owned by {OWNER_NAME}
            </span>
            {/* Session identity, unchanged: guests get a chip, users their email. */}
            {user.email.endsWith("@guest.pdfforge.local") ? (
              <span className="hidden rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground md:inline">
                Guest
              </span>
            ) : (
              <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground md:inline">
                {user.name}
              </span>
            )}
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              aria-label="Sign out"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              <LogOut aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
