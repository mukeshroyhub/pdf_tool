/**
 * Shared E2E fixtures.
 *
 * The test PDF is generated with a REAL cross-reference table and trailer,
 * with byte offsets computed at build time. Lenient parsers (pdf.js, pdf-lib)
 * accept xref-less shortcuts, but qpdf — which powers password protect — is
 * strict and rejects them, which made the protect journey fail while the
 * others passed. ASCII-only content keeps string length == byte offset.
 */
export function minimalPdf(): Buffer {
  const header = "%PDF-1.4\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>\nendobj\n",
  ];

  let body = header;
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }

  const xrefPos = body.length;
  let xref = "xref\n0 4\n0000000000 65535 f \n";
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(body + xref + trailer, "ascii");
}
