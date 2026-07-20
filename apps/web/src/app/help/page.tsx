import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardList,
  CloudUpload,
  Combine,
  Download,
  Droplets,
  FileArchive,
  FileCog,
  FileType2,
  Hash,
  LayoutGrid,
  Lock,
  PencilRuler,
  PenLine,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How to use PDF Tool — free online PDF editor guide",
  description:
    "Step-by-step guide to editing, organizing, signing, merging, compressing, converting and protecting PDF files with PDF Tool. Your files stay in your browser.",
};

interface Guide {
  id: string;
  icon: LucideIcon;
  title: string;
  intro: string;
  steps: string[];
  tip?: string;
}

/**
 * Each guide mirrors the real UI flow. When a feature's UX changes, update the
 * matching steps here — this page is text-based on purpose so it never ships
 * stale screenshots.
 */
const GUIDES: Guide[] = [
  {
    id: "upload",
    icon: CloudUpload,
    title: "Upload a file",
    intro: "Everything starts on the Dashboard.",
    steps: [
      "Open the Dashboard and drag your file onto the upload box — or click it to browse.",
      "PDF, PNG, JPG and WebP files are supported, up to 100 MB each.",
      "A single PDF opens automatically in the viewer, ready to work on.",
    ],
    tip: "Your file is stored only in this browser. It never leaves your device until you run a tool on it, and our servers keep nothing.",
  },
  {
    id: "edit",
    icon: PencilRuler,
    title: "Edit a PDF",
    intro: "Add text, shapes, drawings and images, or change existing text.",
    steps: [
      "Open the file and switch to the Edit tab.",
      "Use the toolbar to add text boxes, shapes, freehand drawings, or images anywhere on the page.",
      "Click existing text to replace it — the editor matches the original font size automatically.",
      "Save your changes as a new copy, or overwrite the original.",
    ],
  },
  {
    id: "organize",
    icon: LayoutGrid,
    title: "Organize pages",
    intro: "Reorder, rotate, delete, or add pages.",
    steps: [
      "Open the file and switch to the Organize tab to see every page as a thumbnail.",
      "Drag pages to reorder, rotate them, delete the ones you don't need, or insert blank pages.",
      "Apply as a new file or replace the original. You can also split ranges into separate PDFs here.",
    ],
  },
  {
    id: "sign",
    icon: PenLine,
    title: "Sign a PDF",
    intro: "Three ways to create your signature.",
    steps: [
      "Open the file, click Tools, then Sign.",
      "Draw your signature with the mouse or finger, type it in a script font, or upload an image of it.",
      "Choose the page, corner and size, then apply — the signed copy is saved to your library.",
    ],
  },
  {
    id: "form",
    icon: ClipboardList,
    title: "Fill a form",
    intro: "Complete interactive PDF forms without printing.",
    steps: [
      "Open the form and switch to the Form tab — every field is listed and highlighted.",
      "Type values, tick checkboxes and pick dropdown options.",
      "Optionally flatten the form so the answers can't be edited, then save.",
    ],
  },
  {
    id: "merge",
    icon: Combine,
    title: "Merge PDFs",
    intro: "Combine several files into one.",
    steps: [
      "On the Dashboard, click Merge PDFs.",
      "Select the files to combine and arrange them in the order you want.",
      "Merge — the combined PDF appears in your library.",
    ],
  },
  {
    id: "compress",
    icon: FileArchive,
    title: "Compress a PDF",
    intro: "Shrink big files for email and uploads.",
    steps: [
      "Open the file, click Tools, then Compress.",
      "Pick a level — low, medium, high, or custom DPI and quality.",
      "Apply and compare the before/after size, then keep it as a new file or replace the original.",
    ],
  },
  {
    id: "convert",
    icon: FileType2,
    title: "Convert PDF ↔ images",
    intro: "Turn pages into images, or images into a PDF.",
    steps: [
      "Open a PDF, click Tools, then Convert to export pages as PNG or JPG images.",
      "Converted images preview right in the viewer and can be downloaded individually.",
      "Going the other way? Select images on the Dashboard and combine them into a single PDF.",
    ],
  },
  {
    id: "page-numbers",
    icon: Hash,
    title: "Add page numbers",
    intro: "Number pages in one click.",
    steps: [
      "Open the file, click Tools, then Page numbers.",
      "Choose the position (six placements), the format (1, 2, 3 · 1 of N · Page 1) and the starting number.",
      "Apply as a new copy or overwrite the original.",
    ],
  },
  {
    id: "protect",
    icon: Lock,
    title: "Password protect & unlock",
    intro: "Encrypt a PDF, or remove a password you know.",
    steps: [
      "Open the file, click Tools, then Password to set a password — the PDF is encrypted with it.",
      "Opening a locked PDF asks for the password right in the viewer.",
      "To remove protection permanently, use Tools → Password → Unlock with the current password.",
    ],
    tip: "Unlock a protected file before using editing tools on it — encrypted files can be viewed with the password, but not modified.",
  },
  {
    id: "redact",
    icon: ShieldAlert,
    title: "Redact sensitive content",
    intro: "Permanently black out private information.",
    steps: [
      "Open the file and switch to the Redact tab.",
      "Draw boxes over everything that must be hidden — names, numbers, signatures.",
      "Apply. Redaction is permanent: the content underneath is destroyed, not just covered.",
    ],
  },
  {
    id: "watermark",
    icon: Droplets,
    title: "Watermarks & removing text",
    intro: "Stamp a watermark, or strip repeated text.",
    steps: [
      "To add: open the Edit tab tools and apply a text watermark with your size, angle and opacity.",
      "To remove: click Tools, then Remove watermark, and type the exact text to strip from every page.",
      "Save as a new copy or replace the original.",
    ],
  },
  {
    id: "download",
    icon: Download,
    title: "Download your files",
    intro: "Single files or everything at once.",
    steps: [
      "In the viewer, click Download to save the open file.",
      "On the Dashboard, tick several files and choose Download ZIP to get them all in one archive.",
      "Remember: files live only in this browser — download anything you want to keep elsewhere.",
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileCog className="h-4 w-4" />
            </span>
            <span className="font-bold tracking-tight">PDF Tool</span>
          </Link>
          <Button asChild size="sm">
            <Link href="/dashboard">Open PDF Tool</Link>
          </Button>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-4xl space-y-10 px-4 py-10">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight">How to use PDF Tool</h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Edit, organize, sign, merge, compress, convert and protect PDF files — free, with
            no watermarks. Step-by-step guides for every tool.
          </p>
          <div className="mx-auto flex max-w-2xl items-start gap-2 rounded-lg border bg-card p-3 text-left text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Private by design:</span> your
              files are stored only in your browser. Tools process them for a moment and keep
              nothing on our servers.
            </p>
          </div>
        </div>

        {/* Table of contents */}
        <nav aria-label="Guides" className="flex flex-wrap justify-center gap-2">
          {GUIDES.map(({ id, title }) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {title}
            </a>
          ))}
        </nav>

        <div className="space-y-6">
          {GUIDES.map(({ id, icon: Icon, title, intro, steps, tip }) => (
            <section
              key={id}
              id={id}
              className="scroll-mt-20 rounded-xl border bg-card p-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">{title}</h2>
                  <p className="text-sm text-muted-foreground">{intro}</p>
                </div>
              </div>
              <ol className="mt-4 space-y-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
              {tip ? (
                <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Tip: </span>
                  {tip}
                </p>
              ) : null}
            </section>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border bg-card p-8 text-center">
          <h2 className="text-xl font-semibold">Ready to try it?</h2>
          <p className="text-sm text-muted-foreground">
            No account needed — continue as a guest and start working with your PDFs.
          </p>
          <Button asChild>
            <Link href="/dashboard">Open PDF Tool</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
