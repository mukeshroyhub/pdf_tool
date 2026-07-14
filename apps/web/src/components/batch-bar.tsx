"use client";

import { useState } from "react";
import type { FileDTO } from "@pdfforge/shared";
import { Combine, Droplets, FileArchive, FileUp, Images, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useBatch,
  useDeleteFile,
  useImagesToPdf,
  useMergePdfs,
  type BatchResult,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function reportResults(results: BatchResult[], verb: string) {
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  if (failed === 0) toast.success(`${verb} ${ok} file${ok === 1 ? "" : "s"}`);
  else {
    const firstError = results.find((r) => !r.ok)?.error;
    toast.warning(`${verb} ${ok} of ${results.length} files — ${firstError ?? "some failed"}`);
  }
}

export function BatchBar({
  selection,
  onClear,
}: {
  selection: FileDTO[];
  onClear: () => void;
}) {
  const batch = useBatch();
  const mergePdfs = useMergePdfs();
  const imagesToPdf = useImagesToPdf();
  const del = useDeleteFile();
  const { refreshUser } = useAuth();
  const [wmOpen, setWmOpen] = useState(false);
  const [wmText, setWmText] = useState("CONFIDENTIAL");
  const [delOpen, setDelOpen] = useState(false);

  const ids = selection.map((f) => f.id);
  const pdfs = selection.filter((f) => f.mimeType === "application/pdf");
  const images = selection.filter((f) => f.mimeType.startsWith("image/"));
  const busy = batch.isPending || mergePdfs.isPending || imagesToPdf.isPending || del.isPending;

  const deleteSelected = async () => {
    const results = await Promise.allSettled(ids.map((id) => del.mutateAsync(id)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;
    if (failed === 0) toast.success(`Deleted ${ok} file${ok === 1 ? "" : "s"}`);
    else toast.warning(`Deleted ${ok} of ${results.length} — ${failed} could not be deleted`);
    await refreshUser();
    setDelOpen(false);
    onClear();
  };

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await refreshUser();
      onClear();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Batch operation failed");
    }
  };

  if (selection.length === 0) return null;

  return (
    <div className="sticky bottom-4 z-40 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <span className="text-sm font-medium">
        {selection.length} selected
      </span>
      <span className="h-5 w-px bg-border" />
      <Button
        variant="ghost"
        size="sm"
        disabled={busy || pdfs.length === 0}
        onClick={() =>
          void run(async () => {
            const { results } = await batch.mutateAsync({
              operation: "compress",
              fileIds: pdfs.map((f) => f.id),
              params: { level: "medium" },
            });
            reportResults(results, "Compressed");
          })
        }
      >
        <FileArchive /> Compress
      </Button>
      <Button variant="ghost" size="sm" disabled={busy || pdfs.length === 0} onClick={() => setWmOpen(true)}>
        <Droplets /> Watermark
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy || selection.length === pdfs.length}
        onClick={() =>
          void run(async () => {
            const { results } = await batch.mutateAsync({
              operation: "convert",
              fileIds: ids.filter((id) => !pdfs.some((p) => p.id === id)),
              params: { target: "pdf" },
            });
            reportResults(results, "Converted");
          })
        }
      >
        <FileUp /> Convert to PDF
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy || images.length < 2}
        onClick={() =>
          void run(async () => {
            const result = await imagesToPdf.mutateAsync({ fileIds: images.map((f) => f.id) });
            toast.success(`Combined ${images.length} images into ${result.file.name}`);
          })
        }
      >
        <Images /> Images → one PDF
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy || pdfs.length < 2}
        onClick={() =>
          void run(async () => {
            const result = await mergePdfs.mutateAsync({ fileIds: pdfs.map((f) => f.id) });
            toast.success(`Merged into ${result.file.name}`);
          })
        }
      >
        <Combine /> Merge
      </Button>
      {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto text-destructive hover:text-destructive"
        disabled={busy}
        onClick={() => setDelOpen(true)}
      >
        <Trash2 /> Delete
      </Button>
      <Button variant="ghost" size="icon" aria-label="Clear selection" onClick={onClear}>
        <X className="h-4 w-4" />
      </Button>

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selection.length} file{selection.length === 1 ? "" : "s"}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the selected file{selection.length === 1 ? "" : "s"} and frees
            their storage. This can&apos;t be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={del.isPending} onClick={() => setDelOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={del.isPending} onClick={() => void deleteSelected()}>
              {del.isPending ? <Loader2 className="animate-spin" /> : null}
              Delete {selection.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wmOpen} onOpenChange={setWmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch watermark</DialogTitle>
          </DialogHeader>
          <Input value={wmText} onChange={(e) => setWmText(e.target.value)} placeholder="Watermark text" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setWmOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!wmText.trim() || busy}
              onClick={() => {
                setWmOpen(false);
                void run(async () => {
                  const { results } = await batch.mutateAsync({
                    operation: "watermark",
                    fileIds: pdfs.map((f) => f.id),
                    params: { text: wmText },
                  });
                  reportResults(results, "Watermarked");
                });
              }}
            >
              Apply to {pdfs.length} PDF{pdfs.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
