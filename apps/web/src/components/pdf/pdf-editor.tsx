"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { FileDTO, RgbColor } from "@pdfforge/shared";
import {
  Baseline,
  Circle,
  Droplets,
  Eraser,
  Highlighter,
  Image as ImageIcon,
  Loader2,
  MousePointer2,
  PenLine,
  Pencil,
  Redo2,
  Signature,
  Square,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { fetchFileObjectUrl, getPageTextLines, type PageTextLine } from "@/lib/pdf-client";
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
} from "@/components/ui/dialog";
import { PdfPageCanvas } from "./pdf-page-canvas";
import { ImagePickerDialog, SignatureDialog, WatermarkDialog } from "./editor-dialogs";
import {
  elementBounds,
  hexToRgb,
  resizeElement,
  RESIZABLE_TYPES,
  rgbToCss,
  translateElement,
  type EditorElement,
  type Tool,
} from "./editor-model";
import { cn } from "@/lib/utils";

let nextKey = 1;

const TOOLS: Array<{ id: Tool; label: string; icon: typeof Type }> = [
  { id: "select", label: "Select / move", icon: MousePointer2 },
  { id: "text", label: "Text", icon: Type },
  { id: "edittext", label: "Edit existing text", icon: Pencil },
  { id: "highlight", label: "Highlight", icon: Highlighter },
  { id: "underline", label: "Underline", icon: Underline },
  { id: "strikeout", label: "Strikeout", icon: Strikethrough },
  { id: "whiteout", label: "Whiteout", icon: Eraser },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "draw", label: "Draw", icon: PenLine },
  { id: "signature", label: "Signature", icon: Signature },
  { id: "image", label: "Image", icon: ImageIcon },
];

interface Drag {
  kind: "create" | "move" | "resize" | "ink";
  page: number;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  targetKey?: number;
  inkPoints?: Array<{ x: number; y: number }>;
}

interface PendingPlacement {
  kind: "signature" | "image";
  paths?: Array<Array<{ x: number; y: number }>>;
  aspect?: number;
  imageFileId?: string;
}

export function PdfEditor({
  doc,
  fileId,
  fileName,
}: {
  doc: PDFDocumentProxy;
  fileId: string;
  fileName: string;
}) {
  const [pageSizes, setPageSizes] = useState<Array<{ w: number; h: number }> | null>(null);
  const [elements, setElements] = useState<EditorElement[]>([]);
  const [undoStack, setUndoStack] = useState<EditorElement[][]>([]);
  const [redoStack, setRedoStack] = useState<EditorElement[][]>([]);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [colorHex, setColorHex] = useState("#e11d48");
  const [fontSize, setFontSize] = useState(16);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<PendingPlacement | null>(null);
  const [textDialog, setTextDialog] = useState<{
    page: number;
    x: number;
    y: number;
    editKey?: number;
    initial: string;
  } | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const [wmOpen, setWmOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  // Existing-text runs per page index (0-based), for click-to-edit.
  const [textLines, setTextLines] = useState<Record<number, PageTextLine[]>>({});

  const color: RgbColor = hexToRgb(colorHex);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sizes: Array<{ w: number; h: number }> = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        sizes.push({ w: vp.width, h: vp.height });
      }
      if (!cancelled) setPageSizes(sizes);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  // Preload the existing-text layer of every page so click-to-edit is instant.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map: Record<number, PageTextLine[]> = {};
      for (let i = 1; i <= doc.numPages; i += 1) {
        const lines = await getPageTextLines(doc, i);
        if (cancelled) return;
        map[i - 1] = lines;
      }
      if (!cancelled) setTextLines(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  /** Commits a change with undo history. */
  const commit = useCallback(
    (next: EditorElement[] | ((prev: EditorElement[]) => EditorElement[])) => {
      setElements((prev) => {
        setUndoStack((u) => [...u.slice(-49), prev]);
        setRedoStack([]);
        return typeof next === "function" ? next(prev) : next;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const last = u[u.length - 1]!;
      setElements((cur) => {
        setRedoStack((r) => [...r, cur]);
        return last;
      });
      return u.slice(0, -1);
    });
    setSelectedKey(null);
  }, []);

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const last = r[r.length - 1]!;
      setElements((cur) => {
        setUndoStack((u) => [...u, cur]);
        return last;
      });
      return r.slice(0, -1);
    });
  }, []);

  const deleteSelected = useCallback(() => {
    if (selectedKey === null) return;
    commit((prev) => prev.filter((e) => e.key !== selectedKey));
    setSelectedKey(null);
  }, [selectedKey, commit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteSelected]);

  // Resolve object URLs for placed images.
  useEffect(() => {
    for (const el of elements) {
      if (el.type === "image" && !imageUrls[el.imageFileId]) {
        void fetchFileObjectUrl(el.imageFileId).then((url) =>
          setImageUrls((m) => ({ ...m, [el.imageFileId]: url })),
        );
      }
    }
  }, [elements, imageUrls]);

  const pointFromEvent = (e: React.PointerEvent, overlay: HTMLElement) => {
    const rect = overlay.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitTest = (page: number, x: number, y: number): EditorElement | null => {
    for (let i = elements.length - 1; i >= 0; i -= 1) {
      const el = elements[i]!;
      if (el.page !== page) continue;
      const b = elementBounds(el);
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return el;
    }
    return null;
  };

  // Finds the existing-text run under a point (topmost first).
  const textLineAt = (page: number, x: number, y: number): PageTextLine | null => {
    const lines = textLines[page] ?? [];
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const l = lines[i]!;
      const m = Math.max(2, l.h * 0.25); // small vertical margin for easier clicking
      if (x >= l.x && x <= l.x + l.w && y >= l.y - m && y <= l.y + l.h + m) return l;
    }
    return null;
  };

  /**
   * Click-to-edit existing text: cover the original run with a whiteout box and
   * drop an editable text element pre-filled with the same words, then open the
   * text dialog. Saving bakes it in via the normal whiteout + text pipeline.
   */
  /**
   * Samples the dominant glyph color of a text run from the rendered page
   * canvas. Visual ground truth: works regardless of how exotic the PDF's
   * drawing commands are. Ignores near-white pixels (background) and picks the
   * most frequent quantized color among the rest. Returns null when sampling
   * isn't possible (canvas not rendered yet, or run box is empty/white).
   */
  const sampleRunColor = (
    overlay: HTMLElement,
    line: PageTextLine,
  ): { r: number; g: number; b: number } | null => {
    const canvas = overlay.parentElement?.querySelector("canvas");
    if (!canvas || canvas.width === 0) return null;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    // Overlay coords are page points (scale 1); canvas is devicePixelRatio-scaled.
    const ratio = canvas.width / overlay.clientWidth;
    const sx = Math.max(0, Math.floor(line.x * ratio));
    const sy = Math.max(0, Math.floor(line.y * ratio));
    const sw = Math.min(canvas.width - sx, Math.ceil(line.w * ratio));
    const sh = Math.min(canvas.height - sy, Math.ceil(line.h * ratio));
    if (sw <= 0 || sh <= 0) return null;
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(sx, sy, sw, sh).data;
    } catch {
      return null;
    }
    // Histogram of non-background pixels, quantized to 32-levels per channel so
    // antialiased edge blends collapse onto the core glyph color.
    const counts = new Map<number, number>();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      if (r > 235 && g > 235 && b > 235) continue; // background / whiteout
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let best = -1, bestKey = 0;
    for (const [key, count] of counts) {
      if (count > best) { best = count; bestKey = key; }
    }
    if (best < 4) return null; // too few ink pixels to trust
    return {
      r: (((bestKey >> 10) & 31) * 8 + 4) / 255,
      g: (((bestKey >> 5) & 31) * 8 + 4) / 255,
      b: ((bestKey & 31) * 8 + 4) / 255,
    };
  };

  const editExistingText = (
    page: number,
    line: PageTextLine,
    sampledColor?: { r: number; g: number; b: number } | null,
  ) => {
    const size = Math.min(144, Math.max(4, line.fontSize));
    // line.y is the run's top; its baseline sits one font-size below.
    const baseline = line.y + line.fontSize;
    const padX = Math.max(2, size * 0.1);
    // Cover a full line box around the baseline: enough for caps/ascenders above
    // and descenders below, but not so tall it eats the neighbouring rows.
    const topCover = size * 0.92;
    const botCover = size * 0.3;
    const whiteout: EditorElement = {
      key: (nextKey += 1),
      type: "whiteout",
      page,
      x: line.x - padX,
      y: baseline - topCover,
      w: line.w + padX * 2,
      h: topCover + botCover,
    };
    const textKey = (nextKey += 1);
    const textEl: EditorElement = {
      key: textKey,
      type: "text",
      page,
      x: line.x,
      // Placed so the rendered baseline lands on the original's baseline.
      y: baseline - size,
      text: line.text,
      // Match the original run's exact size, closest font family, and color.
      // Prefer the pixel-sampled color (ground truth from the rendered page);
      // fall back to the color recovered from the PDF's drawing commands.
      fontSize: size,
      color: sampledColor ?? line.color,
      font: line.font,
    };
    commit((prev) => [...prev, whiteout, textEl]);
    setSelectedKey(textKey);
    setTool("select");
    setTextDialog({ page, x: line.x, y: line.y, editKey: textKey, initial: line.text });
  };

  const onPointerDown = (page: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    const overlay = e.currentTarget;
    const { x, y } = pointFromEvent(e, overlay);
    overlay.setPointerCapture(e.pointerId);

    if (pending) {
      placePending(page, x, y);
      return;
    }

    switch (tool) {
      case "select": {
        // A grab on the selected element's bottom-right handle starts a resize
        // (checked before hit-testing so the handle wins over overlapping elements).
        if (selectedKey !== null) {
          const sel = elements.find((el) => el.key === selectedKey && el.page === page);
          if (sel && RESIZABLE_TYPES.has(sel.type)) {
            const b = elementBounds(sel);
            if (Math.abs(x - (b.x + b.w)) <= 8 && Math.abs(y - (b.y + b.h)) <= 8) {
              setDrag({ kind: "resize", page, startX: x, startY: y, curX: x, curY: y, targetKey: selectedKey });
              break;
            }
          }
        }
        const hit = hitTest(page, x, y);
        setSelectedKey(hit?.key ?? null);
        if (hit) {
          setDrag({ kind: "move", page, startX: x, startY: y, curX: x, curY: y, targetKey: hit.key });
        }
        break;
      }
      case "text":
        setTextDialog({ page, x, y, initial: "" });
        break;
      case "edittext": {
        const line = textLineAt(page, x, y);
        if (line) {
          // Sample the true glyph color from the rendered canvas BEFORE the
          // whiteout element covers it.
          editExistingText(page, line, sampleRunColor(overlay, line));
        } else {
          toast.info("No selectable text there — this works on digital PDFs, not scans.");
        }
        break;
      }
      case "draw":
        setDrag({ kind: "ink", page, startX: x, startY: y, curX: x, curY: y, inkPoints: [{ x, y }] });
        break;
      case "signature":
        setSigOpen(true);
        break;
      case "image":
        setImgOpen(true);
        break;
      default:
        setDrag({ kind: "create", page, startX: x, startY: y, curX: x, curY: y });
    }
  };

  const onPointerMove = (page: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.page !== page) return;
    const { x, y } = pointFromEvent(e, e.currentTarget);
    if (drag.kind === "ink") {
      setDrag({ ...drag, curX: x, curY: y, inkPoints: [...drag.inkPoints!, { x, y }] });
    } else {
      setDrag({ ...drag, curX: x, curY: y });
    }
  };

  const onPointerUp = (page: number) => () => {
    if (!drag || drag.page !== page) return;
    const d = drag;
    setDrag(null);

    if (d.kind === "move" && d.targetKey !== undefined) {
      const dx = d.curX - d.startX;
      const dy = d.curY - d.startY;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        commit((prev) =>
          prev.map((el) => (el.key === d.targetKey ? translateElement(el, dx, dy) : el)),
        );
      }
      return;
    }

    if (d.kind === "resize" && d.targetKey !== undefined) {
      const dx = d.curX - d.startX;
      const dy = d.curY - d.startY;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        commit((prev) =>
          prev.map((el) => (el.key === d.targetKey ? resizeElement(el, dx, dy) : el)),
        );
      }
      return;
    }

    if (d.kind === "ink") {
      if (d.inkPoints && d.inkPoints.length >= 2) {
        commit((prev) => [
          ...prev,
          {
            key: (nextKey += 1),
            type: "ink",
            page,
            paths: [d.inkPoints!],
            color,
            width: strokeWidth,
          },
        ]);
      }
      return;
    }

    // create rectangle-ish element from rubber band
    const x = Math.min(d.startX, d.curX);
    const y = Math.min(d.startY, d.curY);
    const w = Math.abs(d.curX - d.startX);
    const h = Math.abs(d.curY - d.startY);
    if (w < 3 && h < 3) return;

    let el: EditorElement | null = null;
    switch (tool) {
      case "highlight":
        el = { key: (nextKey += 1), type: "highlight", page, x, y, w, h: Math.max(h, 8), color, opacity: 0.35 };
        break;
      case "whiteout":
        el = { key: (nextKey += 1), type: "whiteout", page, x, y, w, h: Math.max(h, 8) };
        break;
      case "rect":
        el = { key: (nextKey += 1), type: "rect", page, x, y, w, h, stroke: color, strokeWidth, fill: null };
        break;
      case "ellipse":
        el = { key: (nextKey += 1), type: "ellipse", page, x, y, w, h, stroke: color, strokeWidth, fill: null };
        break;
      case "underline":
        el = { key: (nextKey += 1), type: "line", page, x1: x, y1: y + h, x2: x + w, y2: y + h, color, width: strokeWidth };
        break;
      case "strikeout":
        el = { key: (nextKey += 1), type: "line", page, x1: x, y1: y + h / 2, x2: x + w, y2: y + h / 2, color, width: strokeWidth };
        break;
      default:
        break;
    }
    if (el) {
      commit((prev) => [...prev, el]);
      setSelectedKey(el.key);
    }
  };

  const onDoubleClick = (page: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "select") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = hitTest(page, e.clientX - rect.left, e.clientY - rect.top);
    if (hit?.type === "text") {
      setTextDialog({ page, x: hit.x, y: hit.y, editKey: hit.key, initial: hit.text });
    }
  };

  const placePending = (page: number, x: number, y: number) => {
    if (!pending) return;
    if (pending.kind === "signature" && pending.paths) {
      const targetW = 160;
      const targetH = targetW * (pending.aspect ?? 0.4);
      const paths = pending.paths.map((path) =>
        path.map((p) => ({ x: x + p.x * targetW, y: y + p.y * targetH })),
      );
      commit((prev) => [
        ...prev,
        { key: (nextKey += 1), type: "ink", page, paths, color: { r: 0.12, g: 0.23, b: 0.54 }, width: 2 },
      ]);
    }
    if (pending.kind === "image" && pending.imageFileId) {
      const w = 150;
      const h = 150 / (pending.aspect ?? 1);
      commit((prev) => [
        ...prev,
        { key: (nextKey += 1), type: "image", page, x, y, w, h, imageFileId: pending.imageFileId! },
      ]);
    }
    setPending(null);
    setTool("select");
  };

  const onPickImage = async (file: FileDTO) => {
    try {
      const url = await fetchFileObjectUrl(file.id);
      setImageUrls((m) => ({ ...m, [file.id]: url }));
      const aspect = await new Promise<number>((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight));
        img.onerror = () => resolve(1);
        img.src = url;
      });
      setPending({ kind: "image", imageFileId: file.id, aspect });
      toast.info("Click on a page to place the image");
    } catch {
      toast.error("Could not load the image");
    }
  };

  if (!pageSizes) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="sticky top-16 z-30 flex flex-wrap items-center gap-1 rounded-lg border bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={tool === id ? "secondary" : "ghost"}
            size="icon"
            aria-label={label}
            title={label}
            onClick={() => {
              setTool(id);
              setPending(null);
              if (id === "signature") setSigOpen(true);
              if (id === "image") setImgOpen(true);
            }}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
        <Button variant="ghost" size="icon" aria-label="Watermark" title="Watermark (all pages)" onClick={() => setWmOpen(true)}>
          <Droplets className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-6 w-px bg-border" />
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
          <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: colorHex }} />
          <input
            type="color"
            value={colorHex}
            onChange={(e) => setColorHex(e.target.value)}
            className="sr-only"
          />
          Color
        </label>
        <label className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
          <Baseline className="h-3.5 w-3.5" />
          <input
            type="number"
            min={6}
            max={96}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value) || 16)}
            className="w-12 rounded border bg-transparent px-1 py-0.5"
            aria-label="Font size"
          />
        </label>
        <label className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
          <PenLine className="h-3.5 w-3.5" />
          <input
            type="number"
            min={1}
            max={20}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value) || 2)}
            className="w-12 rounded border bg-transparent px-1 py-0.5"
            aria-label="Stroke width"
          />
        </label>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Undo" disabled={undoStack.length === 0} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Redo" disabled={redoStack.length === 0} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete selected" disabled={selectedKey === null} onClick={deleteSelected}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button size="sm" disabled={elements.length === 0} onClick={() => setSaveOpen(true)}>
            Save changes
          </Button>
        </div>
      </div>

      {pending ? (
        <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          Click anywhere on a page to place the {pending.kind}.
        </p>
      ) : null}

      {tool === "edittext" && !pending ? (
        <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          Click a line of existing text to edit it. It gets covered and replaced with an editable
          box. Works on digital PDFs (selectable text, plain background), not scans.
        </p>
      ) : null}

      {/* Pages with overlays */}
      <div className="space-y-6">
        {pageSizes.map((size, pageIdx) => (
          <div key={pageIdx} className="flex justify-center">
            <div className="relative" style={{ width: size.w, height: size.h }}>
              <PdfPageCanvas doc={doc} pageNumber={pageIdx + 1} scale={1} eager={pageIdx < 2} />
              <div
                className={cn(
                  "absolute inset-0 touch-none",
                  tool === "select" && !pending ? "cursor-default" : "cursor-crosshair",
                )}
                onPointerDown={onPointerDown(pageIdx)}
                onPointerMove={onPointerMove(pageIdx)}
                onPointerUp={onPointerUp(pageIdx)}
                onDoubleClick={onDoubleClick(pageIdx)}
              >
                <ElementsLayer
                  elements={elements.filter((el) => el.page === pageIdx)}
                  selectedKey={selectedKey}
                  drag={drag?.page === pageIdx ? drag : null}
                  tool={tool}
                  color={colorHex}
                  imageUrls={imageUrls}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <SignatureDialog
        open={sigOpen}
        onClose={() => setSigOpen(false)}
        onDone={(paths, box) => {
          setPending({ kind: "signature", paths, aspect: box.h / box.w });
          toast.info("Click on a page to place your signature");
        }}
      />
      <ImagePickerDialog open={imgOpen} onClose={() => setImgOpen(false)} onPick={(f) => void onPickImage(f)} />
      <WatermarkDialog open={wmOpen} onClose={() => setWmOpen(false)} fileId={fileId} fileName={fileName} />
      <TextDialog
        state={textDialog}
        fontSize={fontSize}
        onClose={() => setTextDialog(null)}
        onSubmit={(text) => {
          const t = textDialog!;
          if (t.editKey !== undefined) {
            commit((prev) =>
              prev.map((el) => (el.key === t.editKey && el.type === "text" ? { ...el, text } : el)),
            );
          } else {
            commit((prev) => [
              ...prev,
              { key: (nextKey += 1), type: "text", page: t.page, x: t.x, y: t.y, text, fontSize, color, font: "helvetica" },
            ]);
          }
          setTextDialog(null);
        }}
      />
      <SaveEditsDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        fileId={fileId}
        fileName={fileName}
        elements={elements}
        onSaved={() => {
          setElements([]);
          setUndoStack([]);
          setRedoStack([]);
        }}
      />
    </div>
  );
}

/** Maps a text element's font to a matching CSS family + weight/style. */
function fontCss(font: string): {
  fontFamily: string;
  fontWeight: number;
  fontStyle?: "italic";
} {
  const sans = "Helvetica, Arial, sans-serif";
  const serif = '"Times New Roman", Times, serif';
  // Inter is loaded app-wide via next/font (--font-inter); browsers without it
  // fall back to Helvetica, mirroring the server's fallback.
  const inter = "var(--font-inter), Inter, Helvetica, sans-serif";
  switch (font) {
    case "times":
      return { fontFamily: serif, fontWeight: 400 };
    case "times-bold":
      return { fontFamily: serif, fontWeight: 700 };
    case "times-italic":
      return { fontFamily: serif, fontWeight: 400, fontStyle: "italic" };
    case "courier":
      return { fontFamily: '"Courier New", Courier, monospace', fontWeight: 400 };
    case "helvetica-bold":
      return { fontFamily: sans, fontWeight: 700 };
    case "helvetica-oblique":
      return { fontFamily: sans, fontWeight: 400, fontStyle: "italic" };
    case "inter":
      return { fontFamily: inter, fontWeight: 400 };
    case "inter-medium":
      return { fontFamily: inter, fontWeight: 500 };
    case "inter-semibold":
      return { fontFamily: inter, fontWeight: 600 };
    case "inter-bold":
      return { fontFamily: inter, fontWeight: 700 };
    case "inter-extrabold":
      return { fontFamily: inter, fontWeight: 800 };
    case "inter-black":
      return { fontFamily: inter, fontWeight: 900 };
    default:
      return { fontFamily: sans, fontWeight: 400 };
  }
}

function ElementsLayer({
  elements,
  selectedKey,
  drag,
  tool,
  color,
  imageUrls,
}: {
  elements: EditorElement[];
  selectedKey: number | null;
  drag: Drag | null;
  tool: Tool;
  color: string;
  imageUrls: Record<string, string>;
}) {
  const moveDelta =
    drag?.kind === "move"
      ? { key: drag.targetKey, dx: drag.curX - drag.startX, dy: drag.curY - drag.startY }
      : null;
  const resizeDelta =
    drag?.kind === "resize"
      ? { key: drag.targetKey, dx: drag.curX - drag.startX, dy: drag.curY - drag.startY }
      : null;

  const shift = (el: EditorElement): EditorElement => {
    if (moveDelta && el.key === moveDelta.key)
      return translateElement(el, moveDelta.dx, moveDelta.dy);
    if (resizeDelta && el.key === resizeDelta.key)
      return resizeElement(el, resizeDelta.dx, resizeDelta.dy);
    return el;
  };

  // Bottom-right resize handle for the selected element (tracks live resizes).
  const selectedShifted = elements.filter((el) => el.key === selectedKey).map(shift)[0];
  const handleBounds =
    selectedShifted && RESIZABLE_TYPES.has(selectedShifted.type)
      ? elementBounds(selectedShifted)
      : null;

  return (
    <>
      {/* SVG layer: lines + ink */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {elements.map(shift).map((el) => {
          if (el.type === "line") {
            return (
              <line
                key={el.key}
                x1={el.x1}
                y1={el.y1}
                x2={el.x2}
                y2={el.y2}
                stroke={rgbToCss(el.color)}
                strokeWidth={el.width}
                strokeLinecap="round"
              />
            );
          }
          if (el.type === "ink") {
            return el.paths.map((path, i) => (
              <polyline
                key={`${el.key}-${i}`}
                points={path.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={rgbToCss(el.color)}
                strokeWidth={el.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ));
          }
          return null;
        })}
        {/* live ink preview */}
        {drag?.kind === "ink" && drag.inkPoints ? (
          <polyline
            points={drag.inkPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ) : null}
      </svg>

      {/* DOM layer: boxes, text, images */}
      {elements.map(shift).map((el) => {
        const b = elementBounds(el);
        const selected = el.key === selectedKey;
        const boxStyle: React.CSSProperties = {
          left: b.x,
          top: b.y,
          width: b.w,
          height: b.h,
        };
        const ring = selected ? "ring-2 ring-primary ring-offset-1" : "";
        switch (el.type) {
          case "text": {
            const f = fontCss(el.font);
            return (
              <div
                key={el.key}
                style={{
                  ...boxStyle,
                  fontSize: el.fontSize,
                  lineHeight: 1.15,
                  color: rgbToCss(el.color),
                  fontFamily: f.fontFamily,
                  fontWeight: f.fontWeight,
                  fontStyle: f.fontStyle,
                }}
                className={cn("pointer-events-none absolute whitespace-pre", ring)}
              >
                {el.text}
              </div>
            );
          }
          case "highlight":
            return (
              <div
                key={el.key}
                style={{ ...boxStyle, backgroundColor: rgbToCss(el.color), opacity: el.opacity, mixBlendMode: "multiply" }}
                className={cn("pointer-events-none absolute", ring)}
              />
            );
          case "whiteout":
            return (
              <div
                key={el.key}
                style={boxStyle}
                className={cn("pointer-events-none absolute bg-white", selected ? "ring-2 ring-primary" : "")}
              />
            );
          case "rect":
            return (
              <div
                key={el.key}
                style={{ ...boxStyle, borderColor: rgbToCss(el.stroke), borderWidth: el.strokeWidth, backgroundColor: el.fill ? rgbToCss(el.fill) : undefined }}
                className={cn("pointer-events-none absolute border-solid", ring)}
              />
            );
          case "ellipse":
            return (
              <div
                key={el.key}
                style={{ ...boxStyle, borderColor: rgbToCss(el.stroke), borderWidth: el.strokeWidth, backgroundColor: el.fill ? rgbToCss(el.fill) : undefined }}
                className={cn("pointer-events-none absolute rounded-full border-solid", ring)}
              />
            );
          case "image": {
            const url = imageUrls[el.imageFileId];
            return url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={el.key}
                src={url}
                alt=""
                style={boxStyle}
                className={cn("pointer-events-none absolute object-fill", ring)}
              />
            ) : (
              <div key={el.key} style={boxStyle} className="pointer-events-none absolute animate-pulse bg-muted" />
            );
          }
          default:
            if (selected) {
              return <div key={el.key} style={boxStyle} className="pointer-events-none absolute ring-2 ring-primary" />;
            }
            return null;
        }
      })}

      {/* resize handle on the selected element */}
      {handleBounds ? (
        <div
          className="pointer-events-none absolute h-3 w-3 rounded-sm border-2 border-primary bg-background"
          style={{ left: handleBounds.x + handleBounds.w - 6, top: handleBounds.y + handleBounds.h - 6 }}
          aria-hidden
        />
      ) : null}

      {/* rubber band preview */}
      {drag?.kind === "create" ? (
        <div
          className="pointer-events-none absolute border border-dashed border-primary bg-primary/10"
          style={{
            left: Math.min(drag.startX, drag.curX),
            top: Math.min(drag.startY, drag.curY),
            width: Math.abs(drag.curX - drag.startX),
            height: Math.abs(drag.curY - drag.startY),
          }}
        />
      ) : null}
      {/* keep tool referenced to avoid unused param when tree-shaken */}
      <span className="hidden">{tool}</span>
    </>
  );
}

function TextDialog({
  state,
  fontSize,
  onClose,
  onSubmit,
}: {
  state: { initial: string } | null;
  fontSize: number;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (state) setText(state.initial);
  }, [state]);

  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.initial ? "Edit text" : "Add text"}</DialogTitle>
        </DialogHeader>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          autoFocus
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Type here…"
        />
        <p className="text-xs text-muted-foreground">Rendered at {fontSize}pt in the selected color.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!text.trim()} onClick={() => onSubmit(text)}>
            {state?.initial ? "Update" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaveEditsDialog({
  open,
  onClose,
  fileId,
  fileName,
  elements,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  elements: EditorElement[];
  onSaved: () => void;
}) {
  const annotate = useAnnotatePdf(fileId);
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [name, setName] = useState(`${fileName.replace(/\.pdf$/i, "")}-edited.pdf`);

  const save = async (mode: "new" | "replace") => {
    try {
      const payload = elements.map(({ key: _key, ...el }) => el);
      const result = await annotate.mutateAsync({
        elements: payload,
        mode,
        ...(mode === "new" ? { name } : {}),
      });
      toast.success(mode === "replace" ? "Edits applied" : `Saved as ${result.file.name}`);
      await refreshUser();
      onSaved();
      onClose();
      if (mode === "new") router.push(`/files/${result.file.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save edits</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="save-name">File name (for copy)</Label>
          <Input id="save-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={annotate.isPending} onClick={() => void save("replace")}>
            Overwrite original
          </Button>
          <Button disabled={annotate.isPending || !name.trim()} onClick={() => void save("new")}>
            {annotate.isPending ? <Loader2 className="animate-spin" /> : null}
            Save as copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
