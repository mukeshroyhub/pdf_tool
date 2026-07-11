"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useFiles } from "@/lib/queries";
import { AppShell } from "@/components/app-shell";
import { StorageMeter } from "@/components/storage-meter";
import { UploadDropzone } from "@/components/upload-dropzone";
import { FileList } from "@/components/file-list";
import { ActivityTimeline } from "@/components/activity-timeline";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { MergeDialog } from "@/components/merge-dialog";
import { BatchBar } from "@/components/batch-bar";
import { cn } from "@/lib/utils";

type Tab = "recent" | "favorites";

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("recent");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const files = useFiles({ favorite: tab === "favorites" || undefined, search: search || undefined });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome, {user?.name}</h1>
        <p className="text-sm text-muted-foreground">Manage your PDF files and documents.</p>
      </div>

      {user && !user.emailVerified ? <VerifyEmailBanner /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <UploadDropzone />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {(
                  [
                    ["recent", "Recent files"],
                    ["favorites", "Favorites"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      tab === value
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
              <MergeDialog />
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search files…"
                  className="w-56 pl-8"
                />
              </div>
              </div>
            </div>
            <FileList
              files={files.data?.files ?? []}
              isLoading={files.isLoading}
              selected={selected}
              onToggleSelect={(id) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onToggleSelectAll={() => {
                const visible = files.data?.files ?? [];
                setSelected((prev) => {
                  const allSelected =
                    visible.length > 0 && visible.every((f) => prev.has(f.id));
                  return allSelected ? new Set() : new Set(visible.map((f) => f.id));
                });
              }}
              emptyMessage={
                search
                  ? "No files match your search."
                  : tab === "favorites"
                    ? "No favorites yet. Star a file to pin it here."
                    : "No files yet. Upload your first document above."
              }
            />
          </div>
        </div>

        <div className="space-y-6">
          <StorageMeter />
          <ActivityTimeline />
        </div>
      </div>

      <BatchBar
        selection={(files.data?.files ?? []).filter((f) => selected.has(f.id))}
        onClear={() => setSelected(new Set())}
      />
    </div>
  );
}
