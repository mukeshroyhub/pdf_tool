"use client";

import { useState } from "react";
import { FileArchive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useCompressFile } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const LEVELS = [
  { id: "low", label: "Low", hint: "Lossless — keeps text selectable" },
  { id: "medium", label: "Medium", hint: "120 DPI, good balance" },
  { id: "high", label: "High", hint: "90 DPI, smallest files" },
  { id: "custom", label: "Custom", hint: "Pick DPI and quality" },
] as const;

export function CompressDialog({ fileId }: { fileId: string }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<(typeof LEVELS)[number]["id"]>("medium");
  const [dpi, setDpi] = useState(100);
  const [quality, setQuality] = useState(60);
  const compress = useCompressFile(fileId);
  const { refreshUser } = useAuth();

  const run = async (mode: "new" | "replace") => {
    try {
      const result = await compress.mutateAsync({ level, dpi, quality, mode });
      const saved = result.before - result.after;
      toast.success(
        saved > 0
          ? `Compressed: ${formatBytes(result.before)} → ${formatBytes(result.after)} (−${Math.round((saved / result.before) * 100)}%)`
          : "File was already optimally compressed",
      );
      await refreshUser();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Compression failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileArchive /> Compress
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compress PDF</DialogTitle>
          <DialogDescription>
            Medium and High re-render pages as images — much smaller, but text is no longer
            selectable.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLevel(l.id)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                level === l.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
              )}
            >
              <p className="text-sm font-medium">{l.label}</p>
              <p className="text-xs text-muted-foreground">{l.hint}</p>
            </button>
          ))}
        </div>
        {level === "custom" ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>DPI ({dpi})</Label>
              <input
                type="range"
                min={36}
                max={300}
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quality ({quality}%)</Label>
              <input
                type="range"
                min={10}
                max={95}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={compress.isPending} onClick={() => void run("replace")}>
            Overwrite original
          </Button>
          <Button disabled={compress.isPending} onClick={() => void run("new")}>
            {compress.isPending ? <Loader2 className="animate-spin" /> : null}
            Save as copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
