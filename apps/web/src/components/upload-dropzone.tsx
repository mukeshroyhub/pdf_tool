"use client";

import { useCallback, useRef, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUploadFiles } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,image/png,image/jpeg,image/webp";

export function UploadDropzone() {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { refreshUser } = useAuth();
  const upload = useUploadFiles(setProgress);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) return;
      setProgress(0);
      try {
        const result = await upload.mutateAsync(files);
        toast.success(
          result.files.length === 1
            ? `Uploaded ${result.files[0]?.name}`
            : `Uploaded ${result.files.length} files`,
        );
        await refreshUser(); // storage usage changed
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Upload failed. Try again.");
      } finally {
        setProgress(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [upload, refreshUser],
  );

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
      disabled={progress !== null}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-background p-8 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        progress !== null && "pointer-events-none opacity-80",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      {progress !== null ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Uploading… {progress}%</p>
          <Progress value={progress} className="max-w-xs" />
        </>
      ) : (
        <>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CloudUpload className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium">Drop files here or click to upload</p>
          <p className="text-xs text-muted-foreground">
            PDF, images and Office documents · up to 100 MB per file
          </p>
        </>
      )}
    </button>
  );
}
