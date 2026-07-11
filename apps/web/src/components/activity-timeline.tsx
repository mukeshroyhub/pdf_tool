"use client";

import { useEffect, useRef, useState } from "react";
import type { ActivityDTO } from "@pdfforge/shared";
import {
  ClipboardCheck,
  ClipboardList,
  CloudUpload,
  Combine,
  Download,
  Droplets,
  Eraser,
  FileArchive,
  LayoutGrid,
  Loader2,
  Pencil,
  Pencil as PencilIcon,
  RefreshCcw,
  Replace,
  ScanText,
  ShieldAlert,
  Scissors,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useActivity, useDeleteActivities } from "@/lib/queries";
import { formatRelativeTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ACTION_META: Record<ActivityDTO["action"], { icon: typeof Download; label: string }> = {
  UPLOAD: { icon: CloudUpload, label: "Uploaded" },
  RENAME: { icon: Pencil, label: "Renamed" },
  FAVORITE: { icon: Star, label: "Favorited" },
  UNFAVORITE: { icon: StarOff, label: "Unfavorited" },
  DELETE: { icon: Trash2, label: "Deleted" },
  DOWNLOAD: { icon: Download, label: "Downloaded" },
  MERGE: { icon: Combine, label: "Merged" },
  SPLIT: { icon: Scissors, label: "Split" },
  ORGANIZE: { icon: LayoutGrid, label: "Organized" },
  REPLACE_PAGES: { icon: Replace, label: "Replaced pages in" },
  EDIT: { icon: PencilIcon, label: "Edited" },
  CONVERT: { icon: RefreshCcw, label: "Converted" },
  COMPRESS: { icon: FileArchive, label: "Compressed" },
  OCR: { icon: ScanText, label: "OCR'd" },
  FORM_FILL: { icon: ClipboardCheck, label: "Filled form" },
  FORM_CREATE: { icon: ClipboardList, label: "Created form in" },
  REDACT: { icon: ShieldAlert, label: "Redacted" },
  REMOVE_TEXT: { icon: Eraser, label: "Removed text from" },
  WATERMARK: { icon: Droplets, label: "Watermarked" },
};

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

export function ActivityTimeline() {
  const { data, isLoading } = useActivity();
  const del = useDeleteActivities();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);

  const activities = data?.activities ?? [];
  const selectedCount = activities.filter((a) => selected.has(a.id)).length;
  const allSelected = selectedCount > 0 && selectedCount === activities.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const all = activities.length > 0 && activities.every((a) => prev.has(a.id));
      return all ? new Set() : new Set(activities.map((a) => a.id));
    });

  const remove = async () => {
    try {
      const ids = activities.filter((a) => selected.has(a.id)).map((a) => a.id);
      const res = await del.mutateAsync(ids);
      toast.success(`Deleted ${res.deleted} ${res.deleted === 1 ? "entry" : "entries"}`);
      setSelected(new Set());
      setConfirm(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete activity");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Recent activity</CardTitle>
        {selectedCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={del.isPending}
            onClick={() => setConfirm(true)}
          >
            {del.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete ({selectedCount})
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : activities.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No activity yet. Upload a file to get started.
          </p>
        ) : (
          <>
            <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <TriStateCheckbox
                checked={allSelected}
                indeterminate={selectedCount > 0}
                onChange={toggleAll}
                aria-label="Select all activity"
              />
              {selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
            </label>
            <ul className="space-y-4">
              {activities.map((a) => {
                const meta = ACTION_META[a.action];
                const Icon = meta.icon;
                const isSelected = selected.has(a.id);
                return (
                  <li
                    key={a.id}
                    className={`flex items-start gap-3 rounded-md ${isSelected ? "bg-primary/5" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(a.id)}
                      aria-label="Select activity entry"
                      className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                    />
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium">{meta.label}</span>{" "}
                        <span className="text-muted-foreground">{a.detail ?? a.fileName ?? ""}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeTime(a.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedCount} activity {selectedCount === 1 ? "entry" : "entries"}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the selected entries from your activity history. Your files are not
            affected. This can&apos;t be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={del.isPending} onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={del.isPending} onClick={() => void remove()}>
              {del.isPending ? <Loader2 className="animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
