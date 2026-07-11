"use client";

import { useState } from "react";
import { Loader2, ScanText } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useOcrLanguages, useOcrPdf } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

/** Human names for common Tesseract language codes. */
const LANG_NAMES: Record<string, string> = {
  eng: "English",
  deu: "German",
  fra: "French",
  spa: "Spanish",
  ita: "Italian",
  por: "Portuguese",
  nld: "Dutch",
  hin: "Hindi",
  ara: "Arabic",
  rus: "Russian",
  jpn: "Japanese",
  kor: "Korean",
  chi_sim: "Chinese (Simplified)",
  chi_tra: "Chinese (Traditional)",
};

export function OcrDialog({ fileId }: { fileId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(["eng"]);
  const [dpi, setDpi] = useState(300);
  const [resultText, setResultText] = useState<string | null>(null);
  const { data } = useOcrLanguages();
  const ocr = useOcrPdf(fileId);
  const { refreshUser } = useAuth();

  const languages = data?.languages ?? [];

  const toggle = (lang: string) =>
    setSelected((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang].slice(0, 5),
    );

  const run = async () => {
    try {
      const result = await ocr.mutateAsync({ languages: selected, dpi, mode: "new" });
      setResultText(result.text || "(no text recognized)");
      toast.success(`Searchable PDF saved as ${result.file.name}`);
      await refreshUser();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "OCR failed");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setResultText(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ScanText /> OCR
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recognize text (OCR)</DialogTitle>
          <DialogDescription>
            Creates a copy with an invisible, searchable text layer over each page.
          </DialogDescription>
        </DialogHeader>
        {resultText !== null ? (
          <>
            <Label>Recognized text</Label>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs">
              {resultText}
            </pre>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Languages ({selected.length}/5)</Label>
              {languages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No OCR languages available on this server.
                </p>
              ) : (
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {languages.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => toggle(lang)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        selected.includes(lang)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:border-primary/50",
                      )}
                    >
                      {LANG_NAMES[lang] ?? lang}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Quality — {dpi} DPI</Label>
              <input
                type="range"
                min={150}
                max={600}
                step={50}
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-xs text-muted-foreground">
                Higher DPI recognizes more accurately but takes longer.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={selected.length === 0 || ocr.isPending} onClick={() => void run()}>
                {ocr.isPending ? <Loader2 className="animate-spin" /> : null}
                {ocr.isPending ? "Recognizing…" : "Run OCR"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
