"use client";

import { useEffect, useRef, useState } from "react";
import type { FileDTO } from "@pdfforge/shared";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useFiles, useWatermarkPdf } from "@/lib/queries";
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
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Freehand signature pad; returns normalized stroke paths (0..1 space). */
export function SignatureDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (paths: Array<Array<{ x: number; y: number }>>, box: { w: number; h: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathsRef = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!open) {
      pathsRef.current = [];
      setHasInk(false);
    }
  }, [open]);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  const pos = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    drawingRef.current = true;
    pathsRef.current.push([pos(e)]);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const p = pos(e);
    const path = pathsRef.current[pathsRef.current.length - 1]!;
    const prev = path[path.length - 1]!;
    path.push(p);
    const c = ctx();
    if (c) {
      c.strokeStyle = "#1e3a8a";
      c.lineWidth = 2.5;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(prev.x, prev.y);
      c.lineTo(p.x, p.y);
      c.stroke();
    }
    setHasInk(true);
  };

  const end = () => {
    drawingRef.current = false;
  };

  const clear = () => {
    const c = ctx();
    if (c && canvasRef.current) c.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    pathsRef.current = [];
    setHasInk(false);
  };

  const done = () => {
    const canvas = canvasRef.current!;
    const paths = pathsRef.current
      .filter((p) => p.length >= 2)
      .map((p) => p.map(({ x, y }) => ({ x: x / canvas.width, y: y / canvas.height })));
    if (paths.length === 0) return;
    onDone(paths, { w: canvas.width, h: canvas.height });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Draw your signature</DialogTitle>
          <DialogDescription>Sign in the box below, then place it on the page.</DialogDescription>
        </DialogHeader>
        <canvas
          ref={canvasRef}
          width={440}
          height={180}
          className="w-full touch-none rounded-md border bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        <DialogFooter>
          <Button variant="outline" onClick={clear}>
            Clear
          </Button>
          <Button disabled={!hasInk} onClick={done}>
            Use signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WatermarkDialog({
  open,
  onClose,
  fileId,
  fileName,
}: {
  open: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
}) {
  const watermark = useWatermarkPdf(fileId);
  const { refreshUser } = useAuth();
  const [text, setText] = useState("CONFIDENTIAL");
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(25);

  const apply = async (mode: "new" | "replace") => {
    try {
      const result = await watermark.mutateAsync({
        text,
        fontSize,
        opacity: opacity / 100,
        rotation: -45,
        mode,
        ...(mode === "new"
          ? { name: `${fileName.replace(/\.pdf$/i, "")}-watermarked.pdf` }
          : {}),
      });
      toast.success(mode === "replace" ? "Watermark applied" : `Saved as ${result.file.name}`);
      await refreshUser();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Watermark failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add watermark</DialogTitle>
          <DialogDescription>Stamped diagonally across every page.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wm-text">Text</Label>
            <Input id="wm-text" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="wm-size">Font size ({fontSize})</Label>
              <input
                id="wm-size"
                type="range"
                min={12}
                max={120}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wm-opacity">Opacity ({opacity}%)</Label>
              <input
                id="wm-opacity"
                type="range"
                min={5}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!text.trim() || watermark.isPending}
            onClick={() => void apply("replace")}
          >
            Overwrite original
          </Button>
          <Button disabled={!text.trim() || watermark.isPending} onClick={() => void apply("new")}>
            {watermark.isPending ? <Loader2 className="animate-spin" /> : null}
            Save as copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pick one of the user's uploaded PNG/JPEG images (for logos, stamps). */
export function ImagePickerDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (file: FileDTO) => void;
}) {
  const { data } = useFiles({});
  const images = (data?.files ?? []).filter(
    (f) => f.mimeType === "image/png" || f.mimeType === "image/jpeg",
  );
  const [selected, setSelected] = useState<FileDTO | null>(null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insert image</DialogTitle>
          <DialogDescription>
            Choose an uploaded PNG or JPEG. Upload images from the dashboard first.
          </DialogDescription>
        </DialogHeader>
        {images.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No images uploaded yet.
          </p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {images.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setSelected(f)}
                  className={cn(
                    "w-full truncate rounded-md border px-3 py-2 text-left text-sm",
                    selected?.id === f.id ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  {f.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onPick(selected);
                onClose();
              }
            }}
          >
            Place image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
