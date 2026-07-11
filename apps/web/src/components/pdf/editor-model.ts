import type { EditElement, RgbColor } from "@pdfforge/shared";

/** Client-side element: server shape plus a stable key for React/undo. */
export type EditorElement = EditElement & { key: number };

export type Tool =
  | "select"
  | "text"
  | "edittext"
  | "highlight"
  | "underline"
  | "strikeout"
  | "whiteout"
  | "rect"
  | "ellipse"
  | "draw"
  | "signature"
  | "image";

export function hexToRgb(hex: string): RgbColor {
  const m = hex.replace("#", "");
  return {
    r: parseInt(m.slice(0, 2), 16) / 255,
    g: parseInt(m.slice(2, 4), 16) / 255,
    b: parseInt(m.slice(4, 6), 16) / 255,
  };
}

export function rgbToCss(c: RgbColor): string {
  const to = (v: number) => Math.round(v * 255);
  return `rgb(${to(c.r)}, ${to(c.g)}, ${to(c.b)})`;
}

/** Moves an element by a delta in PDF points (top-left origin). */
export function translateElement(el: EditorElement, dx: number, dy: number): EditorElement {
  switch (el.type) {
    case "line":
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case "ink":
      return {
        ...el,
        paths: el.paths.map((path) => path.map((p) => ({ x: p.x + dx, y: p.y + dy }))),
      };
    default:
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
}

/** Bounding box (PDF points, top-left origin) used for hit areas. */
export function elementBounds(el: EditorElement): { x: number; y: number; w: number; h: number } {
  switch (el.type) {
    case "text": {
      const lines = el.text.split("\n");
      const widest = Math.max(...lines.map((l) => l.length));
      return {
        x: el.x,
        y: el.y,
        w: Math.max(20, widest * el.fontSize * 0.55),
        h: lines.length * el.fontSize * 1.25 + 4,
      };
    }
    case "line": {
      const x = Math.min(el.x1, el.x2);
      const y = Math.min(el.y1, el.y2) - el.width;
      return {
        x,
        y,
        w: Math.max(4, Math.abs(el.x2 - el.x1)),
        h: Math.max(4, Math.abs(el.y2 - el.y1)) + el.width * 2,
      };
    }
    case "ink": {
      const xs = el.paths.flat().map((p) => p.x);
      const ys = el.paths.flat().map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return {
        x: minX - 2,
        y: minY - 2,
        w: Math.max(...xs) - minX + 4,
        h: Math.max(...ys) - minY + 4,
      };
    }
    default:
      return { x: el.x, y: el.y, w: el.w, h: el.h };
  }
}
