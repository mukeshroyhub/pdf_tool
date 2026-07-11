"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useRedactPdf } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfPageCanvas } from "./pdf-page-canvas";

interface Area {
  key: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

let areaKey = 1;

/** Draw black boxes over regions; the server destroys the underlying content. */
export function RedactTool({
  doc,
  fileId,
  fileName,
}: {
  doc: PDFDocumentProxy;
  fileId: string;
  fileName: string;
}) {
  const [pageSizes, setPageSizes] = useState<Array<{ w: number; h: number }> | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [drag, setDrag] = useState<{ page: number; x0: number; y0: number; x: number; y: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const redact = useRedactPdf(fileId);
  const router = useRouter();
  const { refreshUser } = useAuth();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sizes: Array<{ w: number; h: number }> = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
        sizes.push({ w: vp.width, h: vp.height });
      }
      if (!cancelled) setPageSizes(sizes);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const apply = async (mode: "new" | "replace") => {
    try {
      const result = await redact.mutateAsync({
        areas: areas.map(({ key: _k, ...a }) => a),
        dpi: 150,
        mode,
      });
      toast.success(mode === "replace" ? "Redaction applied" : `Saved as ${result.file.name}`);
      await refreshUser();
      setAreas([]);
      setConfirmOpen(false);
      if (mode === "new") router.push(`/files/${result.file.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Redaction failed");
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
      <div className="sticky top-16 z-30 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 px-3 py-1.5 shadow-sm backdrop-blur">
        <ShieldAlert className="h-4 w-4 text-destructive" />
        <span className="text-sm text-muted-foreground">
          Drag over anything to hide it. Affected pages are flattened to images so the content
          can&apos;t be recovered.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{areas.length} area(s)</span>
          <Button variant="outline" size="sm" disabled={areas.length === 0} onClick={() => setAreas([])}>
            Clear
          </Button>
          <Button size="sm" variant="destructive" disabled={areas.length === 0} onClick={() => setConfirmOpen(true)}>
            Apply redaction
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {pageSizes.map((size, pageIdx) => (
          <div key={pageIdx} className="flex justify-center">
            <div className="relative" style={{ width: size.w, height: size.h }}>
              <PdfPageCanvas doc={doc} pageNumber={pageIdx + 1} scale={1} eager={pageIdx < 2} />
              <div
                className="absolute inset-0 cursor-crosshair touch-none"
                onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDrag({ page: pageIdx, x0: x, y0: y, x, y });
                }}
                onPointerMove={(e) => {
                  if (!drag || drag.page !== pageIdx) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDrag({ ...drag, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onPointerUp={() => {
                  if (!drag || drag.page !== pageIdx) return;
                  const w = Math.abs(drag.x - drag.x0);
                  const h = Math.abs(drag.y - drag.y0);
                  if (w >= 4 && h >= 4) {
                    setAreas((prev) => [
                      ...prev,
                      { key: (areaKey += 1), page: pageIdx, x: Math.min(drag.x0, drag.x), y: Math.min(drag.y0, drag.y), w, h },
                    ]);
                  }
                  setDrag(null);
                }}
              >
                {areas
                  .filter((a) => a.page === pageIdx)
                  .map((a) => (
                    <div
                      key={a.key}
                      className="group absolute bg-black"
                      style={{ left: a.x, top: a.y, width: a.w, height: a.h }}
                    >
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setAreas((prev) => prev.filter((x) => x.key !== a.key));
                        }}
                        className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground group-hover:flex"
                        aria-label="Remove area"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                {drag && drag.page === pageIdx ? (
                  <div
                    className="pointer-events-none absolute bg-black/70"
                    style={{
                      left: Math.min(drag.x0, drag.x),
                      top: Math.min(drag.y0, drag.y),
                      width: Math.abs(drag.x - drag.x0),
                      height: Math.abs(drag.y - drag.y0),
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply redaction to “{fileName}”?</DialogTitle>
            <DialogDescription>
              Pages containing a redaction are converted to images, permanently destroying the
              hidden text and any other selectable content on those pages. This can&apos;t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={redact.isPending} onClick={() => void apply("replace")}>
              Overwrite original
            </Button>
            <Button variant="destructive" disabled={redact.isPending} onClick={() => void apply("new")}>
              {redact.isPending ? <Loader2 className="animate-spin" /> : null}
              Save redacted copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
