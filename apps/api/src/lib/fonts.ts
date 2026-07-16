import { readFile } from "node:fs/promises";

/**
 * Custom (non standard-14) fonts for pdf-lib text drawing.
 *
 * PDFs embed only glyph subsets of their original fonts, so replacement text
 * can never use the document's own font. The standard 14 (Helvetica, Times,
 * Courier) look dated next to modern geometric brand fonts, so we embed the
 * open-source Inter family — in the full weight range, because a Black
 * headline replaced with plain Bold still reads as "wrong".
 *
 * Inter ships a companion "Display" family drawn for large sizes (tighter
 * spacing, punchier forms). Callers pass `display: true` for headline-sized
 * text and we prefer it when installed.
 *
 * Fonts are read from the OS font directories (the `fonts-inter` package in
 * the Docker image). On machines without them (e.g. local Windows dev),
 * lookups return null and the caller falls back to a standard font — the
 * feature degrades gracefully instead of erroring.
 */

const INTER_DIRS = ["/usr/share/fonts/opentype/inter", "/usr/share/fonts/truetype/inter"];

/** Weight file-name stem per supported font key. */
const INTER_STEMS: Record<string, string> = {
  inter: "Regular",
  "inter-medium": "Medium",
  "inter-semibold": "SemiBold",
  "inter-bold": "Bold",
  "inter-extrabold": "ExtraBold",
  "inter-black": "Black",
};

const cache = new Map<string, Buffer | null>();

/**
 * Returns font file bytes for a custom font, or null when not installed.
 * `display` prefers the InterDisplay optical variant (for large text).
 */
export async function getCustomFontBytes(
  name: string,
  opts: { display?: boolean } = {},
): Promise<Buffer | null> {
  const stem = INTER_STEMS[name];
  if (!stem) return null;
  const cacheKey = `${name}${opts.display ? ":display" : ""}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const families = opts.display ? ["InterDisplay", "Inter"] : ["Inter"];
  let bytes: Buffer | null = null;
  outer: for (const family of families) {
    for (const dir of INTER_DIRS) {
      for (const ext of ["otf", "ttf"]) {
        try {
          bytes = await readFile(`${dir}/${family}-${stem}.${ext}`);
          break outer;
        } catch {
          // try the next candidate
        }
      }
    }
  }
  if (bytes === null) {
    console.warn(`Custom font "${cacheKey}" not found — falling back to a standard font`);
  }
  cache.set(cacheKey, bytes);
  return bytes;
}
