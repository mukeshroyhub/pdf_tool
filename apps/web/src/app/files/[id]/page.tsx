"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ArrowLeft, ChevronDown, ClipboardList, Download, LayoutGrid, Loader2, PencilRuler, ScanEye, ShieldAlert, Wrench } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { downloadFile } from "@/lib/local-store";
import { useFile } from "@/lib/queries";
import { openPdfDocument } from "@/lib/pdf-client";
import { AppShell } from "@/components/app-shell";
import { PdfViewer } from "@/components/pdf/pdf-viewer";
import { PdfOrganizer } from "@/components/pdf/pdf-organizer";
import { PdfEditor } from "@/components/pdf/pdf-editor";
import { FormPanel } from "@/components/pdf/form-panel";
import { RedactTool } from "@/components/pdf/redact-tool";
import { RemoveTextDialog } from "@/components/pdf/remove-text-dialog";
import { Button } from "@/components/ui/button";
import { ConvertMenu } from "@/components/convert-menu";
import { CompressDialog } from "@/components/compress-dialog";
import { PageNumbersDialog } from "@/components/page-numbers-dialog";
import { ProtectDialog } from "@/components/protect-dialog";
import { SignatureDialog } from "@/components/signature-dialog";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

type Mode = "view" | "edit" | "organize" | "form" | "redact";

const MODES: Mode[] = ["view", "edit", "organize", "form", "redact"];

export default function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AppShell>
      <FileContent id={id} />
    </AppShell>
  );
}

function FileContent({ id }: { id: string }) {
  const { data, isLoading, error } = useFile(id);
  const requestedMode = useSearchParams().get("mode");
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(
    MODES.includes(requestedMode as Mode) ? (requestedMode as Mode) : "view",
  );

  const file = data?.file;
  const isPdf = file?.mimeType === "application/pdf";
  // Re-open the document when the file record changes (e.g. after overwrite).
  const version = file?.updatedAt;

  useEffect(() => {
    if (!file || !isPdf) return;
    let cancelled = false;
    setDoc(null);
    setDocError(null);
    openPdfDocument(file.id)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch((err) => {
        if (!cancelled) {
          setDocError(err instanceof ApiError ? err.message : "Could not open the PDF");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file, isPdf, version]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !file) {
    return (
      <div className="space-y-4 py-20 text-center">
        <p className="font-medium">File not found</p>
        <Button asChild variant="outline">
          <Link href="/dashboard">
            <ArrowLeft /> Back to dashboard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back to dashboard">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight">{file.name}</h1>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.sizeBytes)}
              {file.pageCount ? ` · ${file.pageCount} pages` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPdf ? (
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  ["view", "View", ScanEye],
                  ["edit", "Edit", PencilRuler],
                  ["organize", "Organize", LayoutGrid],
                  ["form", "Form", ClipboardList],
                  ["redact", "Redact", ShieldAlert],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    mode === value
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {/* Secondary actions live in a collapsible Tools panel to keep the
              toolbar readable (11 controls in a row overwhelmed small screens).
              The panel is hidden with CSS rather than unmounted so an open
              dialog inside it survives the panel closing. */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen((o) => !o)}
            >
              <Wrench /> Tools <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
            {toolsOpen ? (
              <button
                type="button"
                aria-label="Close tools menu"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setToolsOpen(false)}
              />
            ) : null}
            <div
              onClickCapture={() => setToolsOpen(false)}
              className={cn(
                "absolute right-0 top-full z-50 mt-2 w-56 flex-col gap-1 rounded-lg border bg-popover p-2 shadow-md",
                "[&>button]:w-full [&>button]:justify-start",
                toolsOpen ? "flex" : "hidden",
              )}
            >
              <ConvertMenu file={file} />
              {isPdf ? <SignatureDialog fileId={file.id} doc={doc} /> : null}
              {isPdf ? <RemoveTextDialog fileId={file.id} /> : null}
              {isPdf ? <PageNumbersDialog fileId={file.id} /> : null}
              {isPdf ? <ProtectDialog fileId={file.id} /> : null}
              {isPdf ? <CompressDialog fileId={file.id} /> : null}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void downloadFile(file.id).catch((err) =>
                toast.error(err instanceof ApiError ? err.message : "Download failed"),
              )
            }
          >
            <Download /> Download
          </Button>
        </div>
      </div>

      {!isPdf ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Preview is available for PDF files only. Use Download to open this file locally.
        </p>
      ) : docError ? (
        <p className="py-16 text-center text-sm text-destructive">{docError}</p>
      ) : !doc ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : mode === "view" ? (
        <PdfViewer doc={doc} />
      ) : mode === "edit" ? (
        <PdfEditor doc={doc} fileId={file.id} fileName={file.name} />
      ) : mode === "form" ? (
        <FormPanel doc={doc} fileId={file.id} fileName={file.name} />
      ) : mode === "redact" ? (
        <RedactTool doc={doc} fileId={file.id} fileName={file.name} />
      ) : (
        <PdfOrganizer doc={doc} fileId={file.id} fileName={file.name} />
      )}
    </div>
  );
}
