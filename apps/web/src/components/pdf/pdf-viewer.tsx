"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfPageCanvas } from "./pdf-page-canvas";
import { cn } from "@/lib/utils";

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

export function PdfViewer({ doc }: { doc: PDFDocumentProxy }) {
  const [zoomIdx, setZoomIdx] = useState(2); // 100%
  const [currentPage, setCurrentPage] = useState(1);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scale = ZOOM_LEVELS[zoomIdx] ?? 1;
  const pages = Array.from({ length: doc.numPages }, (_, i) => i + 1);

  // Track which page is centred in the viewport for the sidebar highlight.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const topmost = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (topmost) {
          const n = Number(topmost.target.getAttribute("data-page"));
          if (n) setCurrentPage(n);
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const el of pageRefs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [doc, scale]);

  return (
    <div className="flex gap-4">
      {/* Thumbnail sidebar */}
      <aside className="hidden w-36 shrink-0 md:block">
        <div className="sticky top-20 max-h-[80vh] space-y-3 overflow-y-auto pr-1">
          {pages.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() =>
                pageRefs.current[n - 1]?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className={cn(
                "block w-full rounded-md border-2 bg-background p-1 transition-colors",
                currentPage === n ? "border-primary" : "border-transparent hover:border-border",
              )}
            >
              <PdfPageCanvas doc={doc} pageNumber={n} scale={0.2} />
              <span className="mt-1 block text-center text-xs text-muted-foreground">{n}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main pages */}
      <div className="min-w-0 flex-1">
        <div className="sticky top-16 z-30 mb-3 flex items-center justify-center gap-2 rounded-lg border bg-background/95 px-3 py-1.5 shadow-sm backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            disabled={zoomIdx === 0}
            onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-14 text-center text-sm tabular-nums">
            {Math.round((scale ?? 1) * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            onClick={() => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <span className="ml-2 border-l pl-3 text-sm text-muted-foreground">
            Page {currentPage} / {doc.numPages}
          </span>
        </div>
        <div className="space-y-4 overflow-x-auto">
          {pages.map((n) => (
            <div
              key={n}
              data-page={n}
              ref={(el) => {
                pageRefs.current[n - 1] = el;
              }}
            >
              <PdfPageCanvas doc={doc} pageNumber={n} scale={scale ?? 1} eager={n <= 2} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
