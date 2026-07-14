"use client";

import Link from "next/link";
import {
  ClipboardList,
  FileArchive,
  FileType2,
  LayoutGrid,
  PencilRuler,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
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
 * Quick-access grid of PDF tools. Each tile opens the user's most recent PDF
 * directly in that tool. Tiles are disabled until at least one PDF exists.
 */
export function ToolGrid({ firstPdfId }: { firstPdfId: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {TOOLS.map(({ label, description, icon: Icon, mode }) => {
        const card = (
          <div
            className={cn(
              "flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition-colors",
              firstPdfId
                ? "hover:border-primary/50 hover:bg-accent/50"
                : "cursor-not-allowed opacity-60",
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
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
          <div key={label} title="Upload a PDF to use this tool">
            {card}
          </div>
        );
      })}
    </div>
  );
}
