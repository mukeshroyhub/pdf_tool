"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Combine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useFiles, useMergePdfs } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function MergeDialog() {
  const [open, setOpen] = useState(false);
  const { data } = useFiles({});
  const merge = useMergePdfs();
  const { refreshUser } = useAuth();
  const [order, setOrder] = useState<string[]>([]);
  const [name, setName] = useState("merged.pdf");

  const pdfs = useMemo(
    () => (data?.files ?? []).filter((f) => f.mimeType === "application/pdf"),
    [data],
  );

  const toggle = (id: string) =>
    setOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const move = (id: string, delta: number) =>
    setOrder((prev) => {
      const idx = prev.indexOf(id);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      next.splice(target, 0, id);
      return next;
    });

  const submit = async () => {
    try {
      const result = await merge.mutateAsync({ fileIds: order, name });
      toast.success(`Merged into ${result.file.name}`);
      await refreshUser();
      setOpen(false);
      setOrder([]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Merge failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pdfs.length < 2}>
          <Combine /> Merge PDFs
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge PDFs</DialogTitle>
          <DialogDescription>
            Pick two or more PDFs. They are combined in the order shown.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {pdfs.map((f) => {
            const position = order.indexOf(f.id);
            const selected = position >= 0;
            return (
              <li
                key={f.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                  selected ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <button type="button" onClick={() => toggle(f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      selected ? "bg-primary text-primary-foreground" : "border text-transparent",
                    )}
                  >
                    {selected ? position + 1 : "·"}
                  </span>
                  <span className="truncate">{f.name}</span>
                </button>
                {selected ? (
                  <span className="flex shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Move up" onClick={() => move(f.id, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Move down" onClick={() => move(f.id, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="merged.pdf" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={order.length < 2 || merge.isPending || !name.trim()} onClick={() => void submit()}>
            {merge.isPending ? <Loader2 className="animate-spin" /> : null}
            Merge {order.length >= 2 ? `${order.length} files` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
