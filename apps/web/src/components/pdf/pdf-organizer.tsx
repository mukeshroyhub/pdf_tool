"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  Copy,
  FilePlus2,
  Loader2,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useRebuildPdf, useSplitPdf } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfPageCanvas } from "./pdf-page-canvas";
import { cn } from "@/lib/utils";

interface PageSpec {
  key: number; // stable client key
  source: number | "blank";
  rotate: number;
}

let nextKey = 1_000_000;

export function PdfOrganizer({
  doc,
  fileId,
  fileName,
}: {
  doc: PDFDocumentProxy;
  fileId: string;
  fileName: string;
}) {
  const initial = useMemo<PageSpec[]>(
    () => Array.from({ length: doc.numPages }, (_, i) => ({ key: i, source: i, rotate: 0 })),
    [doc],
  );
  const [pages, setPages] = useState<PageSpec[]>(initial);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragKey, setDragKey] = useState<number | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);

  const dirty = useMemo(
    () =>
      pages.length !== initial.length ||
      pages.some((p, i) => p.source !== i || p.rotate !== 0),
    [pages, initial],
  );

  const mutate = (fn: (prev: PageSpec[]) => PageSpec[]) => setPages(fn);
  const selectedPages = pages.filter((p) => selected.has(p.key));

  const toggle = (key: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rotateSelected = (delta: number) =>
    mutate((prev) =>
      prev.map((p) =>
        selected.has(p.key) ? { ...p, rotate: (((p.rotate + delta) % 360) + 360) % 360 } : p,
      ),
    );

  const deleteSelected = () => {
    if (selectedPages.length === pages.length) {
      toast.error("The document must keep at least one page");
      return;
    }
    mutate((prev) => prev.filter((p) => !selected.has(p.key)));
    setSelected(new Set());
  };

  const duplicateSelected = () =>
    mutate((prev) =>
      prev.flatMap((p) =>
        selected.has(p.key) ? [p, { ...p, key: (nextKey += 1) }] : [p],
      ),
    );

  const insertBlankAfterSelection = () =>
    mutate((prev) => {
      const lastSelectedIdx = prev.reduce(
        (acc, p, i) => (selected.has(p.key) ? i : acc),
        prev.length - 1,
      );
      const blank: PageSpec = { key: (nextKey += 1), source: "blank", rotate: 0 };
      return [...prev.slice(0, lastSelectedIdx + 1), blank, ...prev.slice(lastSelectedIdx + 1)];
    });

  const onDrop = (targetKey: number) => {
    if (dragKey === null || dragKey === targetKey) return;
    mutate((prev) => {
      const from = prev.findIndex((p) => p.key === dragKey);
      const to = prev.findIndex((p) => p.key === targetKey);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
    setDragKey(null);
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-30 flex flex-wrap items-center gap-1 rounded-lg border bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur">
        <span className="px-2 text-sm text-muted-foreground">
          {selected.size > 0 ? `${selected.size} selected` : "Select pages to edit"}
        </span>
        <Button variant="ghost" size="sm" disabled={selected.size === 0} onClick={() => rotateSelected(-90)}>
          <RotateCcw /> Rotate left
        </Button>
        <Button variant="ghost" size="sm" disabled={selected.size === 0} onClick={() => rotateSelected(90)}>
          <RotateCw /> Rotate right
        </Button>
        <Button variant="ghost" size="sm" disabled={selected.size === 0} onClick={duplicateSelected}>
          <Copy /> Duplicate
        </Button>
        <Button variant="ghost" size="sm" onClick={insertBlankAfterSelection}>
          <FilePlus2 /> Insert blank
        </Button>
        <Button variant="ghost" size="sm" disabled={selected.size === 0} onClick={deleteSelected}>
          <Trash2 /> Delete
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSplitOpen(true)}>
          <Scissors /> Split
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty}
            onClick={() => {
              setPages(initial);
              setSelected(new Set());
            }}
          >
            <Undo2 /> Reset
          </Button>
          <ExtractButton fileId={fileId} fileName={fileName} selection={selectedPages} />
          <Button size="sm" disabled={!dirty} onClick={() => setSaveOpen(true)}>
            Save changes
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Click to select · drag to reorder. Changes apply when you save.
      </p>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {pages.map((p, idx) => (
          <li
            key={p.key}
            draggable
            onDragStart={() => setDragKey(p.key)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(p.key)}
            onClick={() => toggle(p.key)}
            className={cn(
              "cursor-pointer rounded-lg border-2 bg-background p-2 transition-colors",
              selected.has(p.key) ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40",
              dragKey === p.key && "opacity-50",
            )}
          >
            <div style={{ transform: `rotate(${p.rotate}deg)` }} className="transition-transform">
              {p.source === "blank" ? (
                <div className="flex aspect-[3/4] items-center justify-center rounded-sm border border-dashed text-xs text-muted-foreground">
                  Blank page
                </div>
              ) : (
                <PdfPageCanvas doc={doc} pageNumber={(p.source as number) + 1} scale={0.35} />
              )}
            </div>
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              {idx + 1}
              {p.rotate !== 0 ? ` · ${p.rotate}°` : ""}
            </p>
          </li>
        ))}
      </ul>

      <SaveDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        fileId={fileId}
        fileName={fileName}
        pages={pages}
      />
      <SplitDialog open={splitOpen} onClose={() => setSplitOpen(false)} fileId={fileId} totalPages={doc.numPages} />
    </div>
  );
}

function ExtractButton({
  fileId,
  fileName,
  selection,
}: {
  fileId: string;
  fileName: string;
  selection: PageSpec[];
}) {
  const rebuild = useRebuildPdf(fileId);
  const { refreshUser } = useAuth();

  const extract = async () => {
    try {
      const result = await rebuild.mutateAsync({
        pages: selection.map((p) => ({ source: p.source, rotate: p.rotate })),
        mode: "new",
        name: `${fileName.replace(/\.pdf$/i, "")}-extract.pdf`,
      });
      toast.success(`Extracted ${selection.length} pages to ${result.file.name}`);
      await refreshUser();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Extract failed");
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={selection.length === 0 || rebuild.isPending}
      onClick={() => void extract()}
    >
      {rebuild.isPending ? <Loader2 className="animate-spin" /> : null}
      Extract selected
    </Button>
  );
}

function SaveDialog({
  open,
  onClose,
  fileId,
  fileName,
  pages,
}: {
  open: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  pages: PageSpec[];
}) {
  const rebuild = useRebuildPdf(fileId);
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [name, setName] = useState(`${fileName.replace(/\.pdf$/i, "")}-organized.pdf`);

  const save = async (mode: "new" | "replace") => {
    try {
      const result = await rebuild.mutateAsync({
        pages: pages.map((p) => ({ source: p.source, rotate: p.rotate })),
        mode,
        ...(mode === "new" ? { name } : {}),
      });
      toast.success(mode === "replace" ? "Document updated" : `Saved as ${result.file.name}`);
      await refreshUser();
      onClose();
      if (mode === "replace") router.refresh();
      else router.push(`/files/${result.file.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save organized document</DialogTitle>
          <DialogDescription>
            Save as a copy, or overwrite “{fileName}” in place.
          </DialogDescription>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <DialogFooter>
          <Button
            variant="outline"
            disabled={rebuild.isPending}
            onClick={() => void save("replace")}
          >
            Overwrite original
          </Button>
          <Button disabled={rebuild.isPending || !name.trim()} onClick={() => void save("new")}>
            {rebuild.isPending ? <Loader2 className="animate-spin" /> : null}
            Save as copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseRanges(text: string, total: number): Array<{ from: number; to: number }> | null {
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const ranges: Array<{ from: number; to: number }> = [];
  for (const part of parts) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to < from || to > total) return null;
    ranges.push({ from, to });
  }
  return ranges;
}

function SplitDialog({
  open,
  onClose,
  fileId,
  totalPages,
}: {
  open: boolean;
  onClose: () => void;
  fileId: string;
  totalPages: number;
}) {
  const split = useSplitPdf(fileId);
  const { refreshUser } = useAuth();
  const [text, setText] = useState("");
  const ranges = parseRanges(text, totalPages);

  const submit = async () => {
    if (!ranges) return;
    try {
      const result = await split.mutateAsync({ ranges });
      toast.success(`Split into ${result.files.length} files`);
      await refreshUser();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Split failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split document</DialogTitle>
          <DialogDescription>
            Enter page ranges separated by commas, e.g. “1-3, 4, 5-{totalPages}”. Each range
            becomes its own PDF.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`1-${Math.max(1, Math.ceil(totalPages / 2))}, ${Math.min(totalPages, Math.ceil(totalPages / 2) + 1)}-${totalPages}`}
        />
        {text && !ranges ? (
          <p className="text-xs font-medium text-destructive">
            Invalid ranges. Use numbers between 1 and {totalPages}.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ranges || split.isPending} onClick={() => void submit()}>
            {split.isPending ? <Loader2 className="animate-spin" /> : null}
            Split
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
