"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  CheckSquare,
  ChevronDownSquare,
  CircleDot,
  Loader2,
  Signature,
  Trash2,
  TypeOutline,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useCreateForm,
  useFillForm,
  useFormFields,
  type FormFieldInfo,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfPageCanvas } from "./pdf-page-canvas";
import { cn } from "@/lib/utils";

type CreateFieldType = "text" | "checkbox" | "dropdown" | "radio" | "signature";

interface StagedField {
  key: number;
  type: CreateFieldType;
  name: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  options?: string[];
}

let stagedKey = 1;

export function FormPanel({
  doc,
  fileId,
  fileName,
}: {
  doc: PDFDocumentProxy;
  fileId: string;
  fileName: string;
}) {
  const { data, isLoading } = useFormFields(fileId);
  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const fields = (data?.fields ?? []).filter((f) => f.type !== "button");
  return fields.length > 0 ? (
    <FillForm doc={doc} fileId={fileId} fields={fields} />
  ) : (
    <CreateForm doc={doc} fileId={fileId} fileName={fileName} />
  );
}

// ── Fill existing form ────────────────────────────────────────────────

function FillForm({
  doc,
  fileId,
  fields,
}: {
  doc: PDFDocumentProxy;
  fileId: string;
  fields: FormFieldInfo[];
}) {
  const fill = useFillForm(fileId);
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [values, setValues] = useState<Record<string, string | boolean | string[]>>({});
  const [flatten, setFlatten] = useState(false);

  useEffect(() => {
    const initial: Record<string, string | boolean | string[]> = {};
    for (const f of fields) {
      if (f.value !== null) initial[f.name] = f.value;
    }
    setValues(initial);
  }, [fields]);

  const set = (name: string, value: string | boolean | string[]) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const save = async (mode: "new" | "replace") => {
    try {
      const result = await fill.mutateAsync({ values, flatten, mode });
      toast.success(mode === "replace" ? "Form saved" : `Saved as ${result.file.name}`);
      await refreshUser();
      if (mode === "new") router.push(`/files/${result.file.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the form");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        {Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPageCanvas key={i} doc={doc} pageNumber={i + 1} scale={0.9} eager={i < 2} />
        ))}
      </div>
      <div className="lg:col-span-2">
        <Card className="sticky top-20">
          <CardHeader>
            <CardTitle>Fill form ({fields.length} fields)</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[60vh] space-y-4 overflow-y-auto">
            {fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={`ff-${f.name}`}>
                  {f.name}
                  {f.required ? <span className="text-destructive"> *</span> : null}
                </Label>
                {f.type === "text" || f.type === "signature" ? (
                  <Input
                    id={`ff-${f.name}`}
                    disabled={f.readOnly}
                    value={String(values[f.name] ?? "")}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                ) : f.type === "checkbox" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      id={`ff-${f.name}`}
                      type="checkbox"
                      disabled={f.readOnly}
                      checked={values[f.name] === true}
                      onChange={(e) => set(f.name, e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    Checked
                  </label>
                ) : f.type === "radio" || f.type === "dropdown" ? (
                  <select
                    id={`ff-${f.name}`}
                    disabled={f.readOnly}
                    value={String(values[f.name] ?? "")}
                    onChange={(e) => set(f.name, e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="">— select —</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.type === "optionlist" ? (
                  <select
                    id={`ff-${f.name}`}
                    multiple
                    disabled={f.readOnly}
                    value={Array.isArray(values[f.name]) ? (values[f.name] as string[]) : []}
                    onChange={(e) =>
                      set(f.name, Array.from(e.target.selectedOptions).map((o) => o.value))
                    }
                    className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ))}
            <label className="flex items-center gap-2 border-t pt-3 text-sm">
              <input
                type="checkbox"
                checked={flatten}
                onChange={(e) => setFlatten(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Flatten (bake values in, remove fields)
            </label>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                disabled={fill.isPending}
                onClick={() => void save("replace")}
              >
                Overwrite
              </Button>
              <Button className="flex-1" disabled={fill.isPending} onClick={() => void save("new")}>
                {fill.isPending ? <Loader2 className="animate-spin" /> : null}
                Save copy
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Create form fields ────────────────────────────────────────────────

const FIELD_TOOLS: Array<{ id: CreateFieldType; label: string; icon: typeof TypeOutline }> = [
  { id: "text", label: "Text field", icon: TypeOutline },
  { id: "checkbox", label: "Checkbox", icon: CheckSquare },
  { id: "dropdown", label: "Dropdown", icon: ChevronDownSquare },
  { id: "radio", label: "Radio group", icon: CircleDot },
  { id: "signature", label: "Signature line", icon: Signature },
];

function CreateForm({
  doc,
  fileId,
  fileName,
}: {
  doc: PDFDocumentProxy;
  fileId: string;
  fileName: string;
}) {
  const create = useCreateForm(fileId);
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [tool, setTool] = useState<CreateFieldType>("text");
  const [staged, setStaged] = useState<StagedField[]>([]);
  const [pageSizes, setPageSizes] = useState<Array<{ w: number; h: number }> | null>(null);
  const [drag, setDrag] = useState<{ page: number; x0: number; y0: number; x: number; y: number } | null>(null);
  const [pendingBox, setPendingBox] = useState<Omit<StagedField, "key" | "name" | "options"> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sizes: Array<{ w: number; h: number }> = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
        sizes.push({ w: vp.width, h: vp.height });
      }
      if (!cancelled) setPageSizes(sizes);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const save = async (mode: "new" | "replace") => {
    try {
      const fields = staged.map(({ key: _k, ...f }) => f);
      const result = await create.mutateAsync({
        fields,
        mode,
        ...(mode === "new" ? { name: `${fileName.replace(/\.pdf$/i, "")}-form.pdf` } : {}),
      });
      toast.success(mode === "replace" ? "Form fields added" : `Saved as ${result.file.name}`);
      await refreshUser();
      setStaged([]);
      if (mode === "new") router.push(`/files/${result.file.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create the form");
    }
  };

  const defaultSize = useMemo(
    () =>
      tool === "checkbox"
        ? { w: 16, h: 16 }
        : tool === "radio"
          ? { w: 120, h: 44 }
          : { w: 160, h: 22 },
    [tool],
  );

  if (!pageSizes) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-30 flex flex-wrap items-center gap-1 rounded-lg border bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur">
        <span className="px-2 text-sm text-muted-foreground">
          This PDF has no form yet — drag on a page to place fields:
        </span>
        {FIELD_TOOLS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={tool === id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTool(id)}
          >
            <Icon /> {label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{staged.length} staged</span>
          <Button variant="outline" size="sm" disabled={staged.length === 0 || create.isPending} onClick={() => void save("replace")}>
            Add to original
          </Button>
          <Button size="sm" disabled={staged.length === 0 || create.isPending} onClick={() => void save("new")}>
            {create.isPending ? <Loader2 className="animate-spin" /> : null}
            Save as copy
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {pageSizes.map((size, pageIdx) => (
          <div key={pageIdx} className="flex justify-center">
            <div className="relative" style={{ width: size.w, height: size.h }}>
              <PdfPageCanvas doc={doc} pageNumber={pageIdx + 1} scale={1} eager={pageIdx < 2} />
              <div
                className="absolute inset-0 cursor-crosshair touch-none"
                onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDrag({ page: pageIdx, x0: x, y0: y, x, y });
                }}
                onPointerMove={(e) => {
                  if (!drag || drag.page !== pageIdx) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDrag({ ...drag, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onPointerUp={() => {
                  if (!drag || drag.page !== pageIdx) return;
                  const w = Math.abs(drag.x - drag.x0);
                  const h = Math.abs(drag.y - drag.y0);
                  const box = {
                    type: tool,
                    page: pageIdx,
                    x: Math.min(drag.x0, drag.x),
                    y: Math.min(drag.y0, drag.y),
                    w: w < 8 ? defaultSize.w : w,
                    h: h < 8 ? defaultSize.h : h,
                  };
                  setDrag(null);
                  setPendingBox(box);
                }}
              >
                {staged
                  .filter((f) => f.page === pageIdx)
                  .map((f) => (
                    <div
                      key={f.key}
                      className="absolute flex items-center justify-between gap-1 rounded-sm border-2 border-primary bg-primary/10 px-1"
                      style={{ left: f.x, top: f.y, width: f.w, height: Math.max(f.h, 16) }}
                    >
                      <span className="truncate text-[10px] font-medium text-primary">
                        {f.name}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setStaged((prev) => prev.filter((s) => s.key !== f.key));
                        }}
                        className="text-primary/70 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                {drag && drag.page === pageIdx ? (
                  <div
                    className="pointer-events-none absolute border border-dashed border-primary bg-primary/10"
                    style={{
                      left: Math.min(drag.x0, drag.x),
                      top: Math.min(drag.y0, drag.y),
                      width: Math.abs(drag.x - drag.x0),
                      height: Math.abs(drag.y - drag.y0),
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <FieldPropsDialog
        box={pendingBox}
        existingNames={staged.map((f) => f.name)}
        onClose={() => setPendingBox(null)}
        onDone={(name, options) => {
          setStaged((prev) => [
            ...prev,
            { ...pendingBox!, key: (stagedKey += 1), name, ...(options ? { options } : {}) },
          ]);
          setPendingBox(null);
        }}
      />
    </div>
  );
}

function FieldPropsDialog({
  box,
  existingNames,
  onClose,
  onDone,
}: {
  box: { type: CreateFieldType } | null;
  existingNames: string[];
  onClose: () => void;
  onDone: (name: string, options?: string[]) => void;
}) {
  const [name, setName] = useState("");
  const [optionsText, setOptionsText] = useState("");

  useEffect(() => {
    if (box) {
      setName("");
      setOptionsText("");
    }
  }, [box]);

  const needsOptions = box?.type === "dropdown" || box?.type === "radio";
  const options = optionsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const nameTaken = existingNames.includes(name.trim());
  const valid =
    name.trim().length > 0 && !nameTaken && (!needsOptions || options.length >= (box?.type === "radio" ? 2 : 1));

  return (
    <Dialog open={box !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {box?.type} field</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="field-name">Field name</Label>
            <Input
              id="field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. fullName"
              autoFocus
            />
            {nameTaken ? (
              <p className="text-xs font-medium text-destructive">Name already used</p>
            ) : null}
          </div>
          {needsOptions ? (
            <div className="space-y-1.5">
              <Label htmlFor="field-options">
                Options (comma-separated{box?.type === "radio" ? ", at least 2" : ""})
              </Label>
              <Input
                id="field-options"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="Red, Green, Blue"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={() => onDone(name.trim(), needsOptions ? options : undefined)}>
            Add field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

