"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FileDTO } from "@pdfforge/shared";
import {
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  MoreVertical,
  Pencil,
  Presentation,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { downloadFile } from "@/lib/local-store";
import { useDeleteFile, useUpdateFile } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { formatBytes, formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function FileIcon({ mimeType }: { mimeType: string }) {
  const cls = "h-5 w-5";
  if (mimeType.startsWith("image/")) return <FileImage className={cls} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return <FileSpreadsheet className={cls} />;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return <Presentation className={cls} />;
  return <FileText className={cls} />;
}

/** Checkbox that supports the indeterminate (partial) visual state. */
function TriStateCheckbox({
  checked,
  indeterminate,
  onChange,
  ...rest
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked" | "type">) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
      {...rest}
    />
  );
}

export function FileList({
  files,
  isLoading,
  emptyMessage,
  selected,
  onToggleSelect,
  onToggleSelectAll,
}: {
  files: FileDTO[];
  isLoading: boolean;
  emptyMessage: string;
  /** When provided, rows render selection checkboxes. */
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  /** When provided (with onToggleSelect), a "Select all" header is shown. */
  onToggleSelectAll?: () => void;
}) {
  const [renameTarget, setRenameTarget] = useState<FileDTO | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (files.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const selectedCount = files.filter((f) => selected?.has(f.id)).length;
  const allSelected = selectedCount > 0 && selectedCount === files.length;
  const someSelected = selectedCount > 0;

  return (
    <>
      {onToggleSelect && onToggleSelectAll ? (
        <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 px-1 text-sm text-muted-foreground">
          <TriStateCheckbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={onToggleSelectAll}
            aria-label="Select all files"
          />
          {someSelected ? `${selectedCount} selected` : "Select all"}
        </label>
      ) : null}
      <ul className="divide-y rounded-xl border bg-background">
        {files.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            onRename={() => setRenameTarget(file)}
            isSelected={selected?.has(file.id) ?? false}
            onToggleSelect={onToggleSelect ? () => onToggleSelect(file.id) : undefined}
          />
        ))}
      </ul>
      <RenameDialog file={renameTarget} onClose={() => setRenameTarget(null)} />
    </>
  );
}

function FileRow({
  file,
  onRename,
  isSelected,
  onToggleSelect,
}: {
  file: FileDTO;
  onRename: () => void;
  isSelected: boolean;
  onToggleSelect?: () => void;
}) {
  const update = useUpdateFile();
  const del = useDeleteFile();
  const { refreshUser } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleFavorite = async () => {
    try {
      await update.mutateAsync({ id: file.id, input: { isFavorite: !file.isFavorite } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update file");
    }
  };

  const download = async () => {
    try {
      await downloadFile(file.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Download failed");
    }
  };

  const remove = async () => {
    try {
      await del.mutateAsync(file.id);
      toast.success(`Deleted ${file.name}`);
      await refreshUser();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete file");
    } finally {
      setConfirmDelete(false);
    }
  };

  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", isSelected && "bg-primary/5")}>
      {onToggleSelect ? (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select ${file.name}`}
          className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
        />
      ) : null}
      <Link
        href={`/files/${file.id}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <FileIcon mimeType={file.mimeType} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/files/${file.id}`} className="block truncate text-sm font-medium hover:underline">
          {file.name}
        </Link>
        <p className="text-xs text-muted-foreground">
          {formatBytes(file.sizeBytes)}
          {file.pageCount ? ` · ${file.pageCount} pages` : ""} ·{" "}
          {formatRelativeTime(file.createdAt)}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={file.isFavorite ? "Remove from favorites" : "Add to favorites"}
        onClick={() => void toggleFavorite()}
      >
        <Star
          className={cn(
            "h-4 w-4",
            file.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
          )}
        />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="File actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void download()}>
            <Download /> Download
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirmDelete(true)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{file.name}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the file and frees its storage. This can&apos;t be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={del.isPending} onClick={() => void remove()}>
              {del.isPending ? <Loader2 className="animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function RenameDialog({ file, onClose }: { file: FileDTO | null; onClose: () => void }) {
  const update = useUpdateFile();
  const [name, setName] = useState("");

  const submit = async () => {
    if (!file || !name.trim()) return;
    try {
      await update.mutateAsync({ id: file.id, input: { name: name.trim() } });
      toast.success("File renamed");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not rename file");
    }
  };

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
        else setName(file?.name ?? "");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename file</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={file?.name}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending || !name.trim()}>
              {update.isPending ? <Loader2 className="animate-spin" /> : null}
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
