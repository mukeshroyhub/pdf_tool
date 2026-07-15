"use client";

import { useState } from "react";
import { Hash, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAddPageNumbers } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const POSITIONS = [
  { id: "bottom-center", label: "Bottom center" },
  { id: "bottom-right", label: "Bottom right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "top-center", label: "Top center" },
  { id: "top-right", label: "Top right" },
  { id: "top-left", label: "Top left" },
] as const;

const FORMATS = [
  { id: "n", label: "1, 2, 3" },
  { id: "n-of-total", label: "1 of N" },
  { id: "page-n", label: "Page 1" },
] as const;

export function PageNumbersDialog({ fileId }: { fileId: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<(typeof POSITIONS)[number]["id"]>("bottom-center");
  const [format, setFormat] = useState<(typeof FORMATS)[number]["id"]>("n");
  const [startAt, setStartAt] = useState(1);
  const addNumbers = useAddPageNumbers(fileId);
  const { refreshUser } = useAuth();

  const run = async (mode: "new" | "replace") => {
    try {
      await addNumbers.mutateAsync({ position, format, startAt, mode });
      toast.success("Page numbers added");
      await refreshUser();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add page numbers");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Hash /> Page numbers
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add page numbers</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Position</Label>
          <div className="grid grid-cols-3 gap-2">
            {POSITIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPosition(p.id)}
                className={cn(
                  "rounded-lg border p-2 text-xs transition-colors",
                  position === p.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Format</Label>
            <div className="flex flex-col gap-1">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-sm transition-colors",
                    format === f.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startAt">Start at</Label>
            <input
              id="startAt"
              type="number"
              min={1}
              value={startAt}
              onChange={(e) => setStartAt(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={addNumbers.isPending} onClick={() => void run("replace")}>
            Overwrite original
          </Button>
          <Button disabled={addNumbers.isPending} onClick={() => void run("new")}>
            {addNumbers.isPending ? <Loader2 className="animate-spin" /> : null}
            Save as copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
