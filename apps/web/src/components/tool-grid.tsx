"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  FileArchive,
  FileType2,
  LayoutGrid,
  Loader2,
  PencilRuler,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { addFile } from "@/lib/local-store";
import { countPdfPages } from "@/lib/pdf-client";
import { cn } from "@/lib/utils";

interface Tool {
  label: string;
  description: string;
  icon: LucideIcon;
  /** Opens the file page in this mode (compress/convert live on the toolbar). */
  mode: "edit" | "organize" | "form" | "redact" | "view";
}

const TOOLS: Tool[] = [
  { label: "Edit", description: "Text, shapes & drawings", icon: PencilRuler, mode: "edit" },
  { label: "Organize", description: "Reorder, rotate, delete pages", icon: LayoutGrid, mode: "organize" },
  { label: "Fill form", description: "Complete form fields", icon: ClipboardList, mode: "form" },
  { label: "Redact", description: "Permanently hide content", icon: ShieldAlert, mode: "redact" },
  { label: "Compress", description: "Reduce file size", icon: FileArchive, mode: "view" },
  { label: "Convert", description: "PDF ↔ images", icon: FileType2, mode: "view" },
];

/**
 * Quick-access grid of PDF tools. With a PDF in the library, each tile opens
 * the most recent one directly in that tool. With an empty library, a tile
 * opens a file picker instead — pick a PDF and land straight in the tool, so
 * the cards are never dead ends.
 */
export function ToolGrid({ firstPdfId }: { firstPdfId: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingMode, setPendingMode] = useState<Tool["mode"] | null>(null);
  const [busy, setBusy] = useState(false);

  const pickFor = (mode: Tool["mode"]) => {
    setPendingMode(mode);
    inputRef.current?.click();
  };

  const onPicked = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || !pendingMode) return;
    setBusy(true);
    try {
      const pageCount = await countPdfPages(file);
      const meta = await addFile(file, {
        name: file.name,
        mimeType: file.type || "application/pdf",
        pageCount,
      });
      void qc.invalidateQueries({ queryKey: ["files"] });
      void qc.invalidateQueries({ queryKey: ["activity"] });
      router.push(`/files/${meta.id}?mode=${pendingMode}`);
    } catch {
      toast.error("Could not open that file. Try again.");
    } finally {
      setBusy(false);
      setPendingMode(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => void onPicked(e.target.files)}
      />
      {TOOLS.map(({ label, description, icon: Icon, mode }) => {
        const card = (
          <div
            className={cn(
              "flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition-colors",
              "hover:border-primary/50 hover:bg-accent/50",
              busy && "pointer-events-none opacity-60",
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {busy && pendingMode === mode ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Icon className="h-5 w-5" />
              )}
            </span>
            <div>
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
        );

        return firstPdfId ? (
          <Link key={label} href={`/files/${firstPdfId}?mode=${mode}`} className="block">
            {card}
          </Link>
        ) : (
          <button
            key={label}
            type="button"
            onClick={() => pickFor(mode)}
            className="block text-left"
            title="Choose a PDF to open in this tool"
          >
            {card}
          </button>
        );
      })}
    </div>
  );
}
