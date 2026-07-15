"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PenLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiUpload } from "@/lib/api";
import { useAnnotatePdf } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type Tab = "draw" | "type" | "upload";

const POSITIONS = [
  { id: "bottom-right", label: "Bottom right" },
  { id: "bottom-center", label: "Bottom center" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "top-right", label: "Top right" },
  { id: "top-center", label: "Top center" },
  { id: "top-left", label: "Top left" },
] as const;

const SIZES = [
  { id: "small", label: "Small", w: 120 },
  { id: "medium", label: "Medium", w: 180 },
  { id: "large", label: "Large", w: 260 },
] as const;

export function SignatureDialog({ fileId, doc }: { fileId: string; doc: PDFDocumentProxy | null }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("draw");
  const [typed, setTyped] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [page, setPage] = useState(1);
  const [position, setPosition] = useState<(typeof POSITIONS)[number]["id"]>("bottom-right");
  const [size, setSize] = useState<(typeof SIZES)[number]["id"]>("medium");
  const [pending, setPending] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const annotate = useAnnotatePdf(fileId);
  const { refreshUser } = useAuth();
  const router = useRouter();
  const total = doc?.numPages ?? 1;

  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    last.current = pointOf(e);
  };
  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pointOf(e);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasDrawing(true);
  };
  const endDraw = () => {
    drawing.current = false;
    last.current = null;
  };
  const clearCanvas = () => {
    const c = canvasRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasDrawing(false);
  };

  const buildBlob = async (): Promise<Blob | null> => {
    if (tab === "upload") return uploadFile;
    if (tab === "draw") {
      if (!hasDrawing || !canvasRef.current) return null;
      return await new Promise<Blob | null>((r) => canvasRef.current!.toBlob(r, "image/png"));
    }
    if (!typed.trim()) return null;
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 200;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#111";
    ctx.font = "italic 84px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(typed.trim(), 300, 100);
    return await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  };

  const canApply =
    tab === "draw" ? hasDrawing : tab === "type" ? typed.trim().length > 0 : uploadFile !== null;

  const apply = async () => {
    setPending(true);
    try {
      const blob = await buildBlob();
      if (!blob) {
        toast.error("Create your signature first");
        return;
      }
      const bitmap = await createImageBitmap(blob);
      const aspect = bitmap.height / bitmap.width;

      const up = await apiUpload<{ files: { id: string }[] }>("/api/files", [
        new File([blob], "signature.png", { type: "image/png" }),
      ]);
      const imageFileId = up.files[0]!.id;

      let pw = 612;
      let ph = 792;
      if (doc) {
        const vp = (await doc.getPage(page)).getViewport({ scale: 1 });
        pw = vp.width;
        ph = vp.height;
      }
      const w = SIZES.find((s) => s.id === size)!.w;
      const h = Math.max(20, w * aspect);
      const margin = 24;
      const y = position.startsWith("top") ? margin : ph - margin - h;
      const x = position.endsWith("center")
        ? (pw - w) / 2
        : position.endsWith("right")
          ? pw - margin - w
          : margin;

      const res = await annotate.mutateAsync({
        elements: [{ page: page - 1, type: "image", x, y, w, h, imageFileId }],
        mode: "new",
      });
      toast.success("Signature added");
      await refreshUser();
      setOpen(false);
      router.push(`/files/${res.file.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add signature");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setTyped("");
          setUploadFile(null);
          setHasDrawing(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PenLine /> Sign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add signature</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {(["draw", "type", "upload"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-lg border p-2 text-sm capitalize transition-colors",
                tab === t ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "draw" ? (
          <div className="space-y-2">
            <canvas
              ref={canvasRef}
              width={500}
              height={170}
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              className="w-full touch-none rounded-lg border bg-white"
              style={{ aspectRatio: "500 / 170" }}
            />
            <Button type="button" variant="ghost" size="sm" onClick={clearCanvas}>
              Clear
            </Button>
          </div>
        ) : tab === "type" ? (
          <div className="space-y-2">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type your name"
            />
            {typed.trim() ? (
              <p
                className="rounded-lg border bg-white p-4 text-center text-3xl italic text-black"
                style={{ fontFamily: "Georgia, serif" }}
              >
                {typed}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            {uploadFile ? (
              <p className="text-xs text-muted-foreground">{uploadFile.name}</p>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sigpage">Page</Label>
            <input
              id="sigpage"
              type="number"
              min={1}
              max={total}
              value={page}
              onChange={(e) => setPage(Math.min(total, Math.max(1, Number(e.target.value) || 1)))}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Size</Label>
            <div className="grid grid-cols-3 gap-1">
              {SIZES.map((sz) => (
                <button
                  key={sz.id}
                  type="button"
                  onClick={() => setSize(sz.id)}
                  className={cn(
                    "rounded-md border px-1 py-1.5 text-xs transition-colors",
                    size === sz.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  {sz.label}
                </button>
              ))}
            </div>
          </div>
        </div>

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

        <DialogFooter>
          <Button disabled={pending || !canApply} onClick={() => void apply()}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Add signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
