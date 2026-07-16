import { readFile } from "node:fs/promises";

/**
 * Custom (non standard-14) fonts for pdf-lib text drawing.
 *
 * PDFs embed only glyph subsets of their original fonts, so replacement text
 * can never use the document's own font. The standard 14 (Helvetica, Times,
 * Courier) look dated next to modern geometric brand fonts, so we embed the
 * open-source Inter family when a closer match is wanted.
 *
 * Fonts are read from the OS font directories (installed via the `fonts-inter`
 * package in the Docker image). On machines without them (e.g. local Windows
 * dev), lookups return null and the caller falls back to Helvetica — the
 * feature degrades gracefully instead of erroring.
 */

const FONT_CANDIDATES: Record<string, string[]> = {
  inter: [
    "/usr/share/fonts/opentype/inter/Inter-Regular.otf",
    "/usr/share/fonts/truetype/inter/Inter-Regular.ttf",
    "/usr/share/fonts/opentype/inter/InterVariable.ttf",
  ],
  "inter-bold": [
    "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
    "/usr/share/fonts/truetype/inter/Inter-Bold.ttf",
  ],
};

const cache = new Map<string, Buffer | null>();

/** Returns the font file bytes for a custom font name, or null if not installed. */
export async function getCustomFontBytes(name: string): Promise<Buffer | null> {
  if (cache.has(name)) return cache.get(name) ?? null;
  let bytes: Buffer | null = null;
  for (const path of FONT_CANDIDATES[name] ?? []) {
    try {
      bytes = await readFile(path);
      break;
    } catch {
      // try the next candidate path
    }
  }
  if (bytes === null && FONT_CANDIDATES[name]) {
    console.warn(`Custom font "${name}" not found on this system — falling back to Helvetica`);
  }
  cache.set(name, bytes);
  return bytes;
}
