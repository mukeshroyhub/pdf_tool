"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Loader2 } from "lucide-react";
import { renderPage } from "@/lib/pdf-client";
import { cn } from "@/lib/utils";

/** Lazily renders a PDF page when it scrolls into view. */
export function PdfPageCanvas({
  doc,
  pageNumber,
  scale,
  className,
  eager = false,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  className?: string;
  eager?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(eager);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (eager) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let active = true;
    setRendered(false);
    const task = renderPage(doc, pageNumber, canvasRef.current, scale);
    task.promise
      .then(() => {
        if (active) setRendered(true);
      })
      .catch(() => {
        /* render was cancelled or failed; ignore */
      });
    return () => {
      active = false;
      task.cancel();
    };
  }, [doc, pageNumber, scale, visible]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {!rendered ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      <canvas ref={canvasRef} className="mx-auto rounded-sm shadow" />
    </div>
  );
}
