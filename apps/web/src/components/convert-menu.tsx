"use client";

import { useState } from "react";
import type { FileDTO } from "@pdfforge/shared";
import {
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Loader2,
  Presentation,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useConvertFile } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PDF_TARGETS = [
  { target: "png", label: "PNG images", icon: FileImage },
  { target: "jpg", label: "JPG images", icon: FileImage },
  { target: "docx", label: "Word (.docx)", icon: FileText },
  { target: "xlsx", label: "Excel (.xlsx)", icon: FileSpreadsheet },
  { target: "pptx", label: "PowerPoint (.pptx)", icon: Presentation },
] as const;

export function ConvertMenu({ file }: { file: FileDTO }) {
  const convert = useConvertFile(file.id);
  const { refreshUser } = useAuth();
  const [running, setRunning] = useState(false);

  const isPdf = file.mimeType === "application/pdf";

  const run = async (target: string) => {
    setRunning(true);
    try {
      const result = await convert.mutateAsync({ target });
      toast.success(
        result.files.length === 1
          ? `Created ${result.files[0]?.name}`
          : `Created ${result.files.length} files`,
      );
      await refreshUser();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Conversion failed");
    } finally {
      setRunning(false);
    }
  };

  if (!isPdf) {
    // Images and Office documents convert to PDF directly.
    return (
      <Button variant="outline" size="sm" disabled={running} onClick={() => void run("pdf")}>
        {running ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
        Convert to PDF
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={running}>
          {running ? <Loader2 className="animate-spin" /> : <FileType2 />}
          Convert
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PDF_TARGETS.map(({ target, label, icon: Icon }) => (
          <DropdownMenuItem key={target} onSelect={() => void run(target)}>
            <Icon /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
