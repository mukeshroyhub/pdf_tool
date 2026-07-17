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

import path from "node:path";

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

/**
 * Drop-in licensed fonts (NOT in git — see fonts-custom/ note in .gitignore).
 * Searched in: apps/api/fonts (Docker volume mount target), ../../fonts-custom
 * (repo root, local dev), and /usr/share/fonts/custom. Owners place font files
 * they are licensed to use here; missing files fall back gracefully, so the
 * feature is invisible on machines without them.
 */
const DROPIN_DIRS = [
  path.resolve(process.cwd(), "fonts"),
  path.resolve(process.cwd(), "../../fonts-custom"),
  "/usr/share/fonts/custom",
];

// Prefer .ttf: pdf-lib embeds TrueType-flavored fonts in a form every PDF
// renderer accepts. CFF-flavored .otf subsets are rejected by pdfium (Edge,
// Chrome) and poppler, which then substitute a wrong-looking fallback font —
// verified head-to-head across pdf.js/pdfium/poppler, July 2026. Convert OTFs
// with fontTools' otf2ttf (cu2qu) before dropping them in.
const DROPIN_FILES: Record<string, string[]> = {
  // Regular text weight (receipts set body/timestamps in UberMoveText-Regular).
  // Falls back to Medium until a Regular file is dropped in.
  ubermove: [
    "UberMoveTextRegular.ttf",
    "UberMoveRegular.ttf",
    "UberMoveMedium.ttf",
    "UberMoveMedium.otf",
  ],
  "ubermove-medium": ["UberMoveTextMedium.ttf", "UberMoveMedium.ttf", "UberMoveMedium.otf"],
  "ubermove-bold": ["UberMoveBold.ttf", "UberMoveTextBold.ttf", "UberMoveBold.otf"],
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
  const cacheKey = `${name}${opts.display ? ":display" : ""}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  let bytes: Buffer | null = null;

  // Drop-in licensed fonts take priority: they exist precisely because the
  // owner wants exact-match fidelity for specific documents.
  const dropinFiles = DROPIN_FILES[name];
  if (dropinFiles) {
    outer: for (const dir of DROPIN_DIRS) {
      for (const file of dropinFiles) {
        try {
          bytes = await readFile(path.join(dir, file));
          break outer;
        } catch {
          // try the next candidate
        }
      }
    }
  }

  // Inter family (installed via the fonts-inter system package).
  const stem = INTER_STEMS[name];
  if (!bytes && stem) {
    const families = opts.display ? ["InterDisplay", "Inter"] : ["Inter"];
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
  }

  if (bytes === null) {
    console.warn(`Custom font "${cacheKey}" not found — falling back to a standard font`);
  }
  cache.set(cacheKey, bytes);
  return bytes;
}
