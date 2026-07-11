"use client";

import { useState } from "react";
import { Eraser, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useRemoveText } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Removes a repeated text string (e.g. a watermark) from the whole document. */
export function RemoveTextDialog({ fileId }: { fileId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const remove = useRemoveText(fileId);
  const { refreshUser } = useAuth();

  const run = async (mode: "new" | "replace") => {
    try {
      const result = await remove.mutateAsync({ text, mode });
      if (result.removed === 0) {
        toast.warning(
          "No matching text found. This works for standard-font text like watermarks, not scanned images or subset-encoded fonts.",
        );
      } else {
        toast.success(
          `Removed ${result.removed} occurrence${result.removed === 1 ? "" : "s"}${mode === "new" ? ` — saved as ${result.file.name}` : ""}`,
        );
        await refreshUser();
        setOpen(false);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Removal failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Eraser /> Remove watermark
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove watermark or text</DialogTitle>
          <DialogDescription>
            Enter the exact text to strip from every page. Best for watermarks and stamps drawn
            with standard fonts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rm-text">Text to remove</Label>
          <Input
            id="rm-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="CONFIDENTIAL"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={!text.trim() || remove.isPending} onClick={() => void run("replace")}>
            Overwrite original
          </Button>
          <Button disabled={!text.trim() || remove.isPending} onClick={() => void run("new")}>
            {remove.isPending ? <Loader2 className="animate-spin" /> : null}
            Save cleaned copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
