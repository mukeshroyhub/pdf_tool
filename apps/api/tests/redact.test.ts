import "./setup-env";
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import request from "supertest";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createApp } from "../src/app";

const app = createApp();

let token = "";
let pdfId = "";

const auth = () => ({ Authorization: `Bearer ${token}` });

async function downloadBytes(id: string): Promise<Buffer> {
  const res = await request(app)
    .get(`/api/files/${id}/download`)
    .set(auth())
    .buffer(true)
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
  assert.equal(res.status, 200);
  return res.body as Buffer;
}

async function extractText(bytes: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const item of content.items) if ("str" in item) text += item.str + " ";
  }
  await doc.destroy();
  return text;
}

before(async () => {
  execSync("node scripts/dev-migrate.mjs --reset", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Redactor", email: "redact@example.com", password: "Redact123!" });
  token = reg.body.accessToken;

  // Page 1: SECRET at a known spot + PUBLIC elsewhere. Page 2: untouched.
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([400, 300]);
  p1.drawText("SECRET-CODE-9", { x: 50, y: 240, size: 18, font, color: rgb(0, 0, 0) });
  p1.drawText("PUBLIC-INFO", { x: 50, y: 60, size: 18, font, color: rgb(0, 0, 0) });
  const p2 = doc.addPage([400, 300]);
  p2.drawText("PAGE-TWO-TEXT", { x: 50, y: 150, size: 18, font, color: rgb(0, 0, 0) });

  const up = await request(app)
    .post("/api/files")
    .set(auth())
    .attach("files", Buffer.from(await doc.save()), {
      filename: "secrets.pdf",
      contentType: "application/pdf",
    });
  pdfId = up.body.files[0].id;
});

describe("POST /api/pdf/:id/redact", () => {
  it("destroys text on redacted pages and keeps other pages vector", async () => {
    // Area over SECRET-CODE-9 (top-left origin: y = 300 - 240 - 18 ≈ 42).
    const res = await request(app)
      .post(`/api/pdf/${pdfId}/redact`)
      .set(auth())
      .send({ areas: [{ page: 0, x: 40, y: 30, w: 200, h: 40 }], dpi: 120, mode: "new" });
    assert.equal(res.status, 201);
    assert.equal(res.body.file.pageCount, 2);

    const bytes = await downloadBytes(res.body.file.id);
    const text = await extractText(bytes);
    // Page 1 was rasterized: no text at all survives there — including PUBLIC-INFO
    // becoming an image. Page 2 keeps its selectable text.
    assert.ok(!text.includes("SECRET-CODE-9"), "secret must be unrecoverable");
    assert.ok(!text.includes("PUBLIC-INFO"), "affected page becomes an image");
    assert.ok(text.includes("PAGE-TWO-TEXT"), "untouched pages stay selectable");
  });

  it("rejects out-of-bounds pages", async () => {
    const res = await request(app)
      .post(`/api/pdf/${pdfId}/redact`)
      .set(auth())
      .send({ areas: [{ page: 5, x: 0, y: 0, w: 10, h: 10 }] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "PAGE_OUT_OF_BOUNDS");
  });
});

describe("POST /api/pdf/:id/remove-text", () => {
  it("removes a watermark added by the watermark endpoint", async () => {
    const wm = await request(app)
      .post(`/api/pdf/${pdfId}/watermark`)
      .set(auth())
      .send({ text: "TOPSECRET-WM", mode: "new" });
    assert.equal(wm.status, 201);
    const wmId = wm.body.file.id;
    assert.match(await extractText(await downloadBytes(wmId)), /TOPSECRET-WM/);

    const res = await request(app)
      .post(`/api/pdf/${wmId}/remove-text`)
      .set(auth())
      .send({ text: "TOPSECRET-WM", mode: "new" });
    assert.equal(res.status, 201);
    assert.equal(res.body.removed, 2); // one block per page

    const cleaned = await extractText(await downloadBytes(res.body.file.id));
    assert.ok(!cleaned.includes("TOPSECRET-WM"), "watermark text must be gone");
    assert.ok(cleaned.includes("PUBLIC-INFO"), "other text survives");
  });

  it("reports zero removals when nothing matches", async () => {
    const res = await request(app)
      .post(`/api/pdf/${pdfId}/remove-text`)
      .set(auth())
      .send({ text: "does-not-exist-anywhere", mode: "new" });
    assert.equal(res.status, 201);
    assert.equal(res.body.removed, 0);
  });

  it("respects the pages filter", async () => {
    const res = await request(app)
      .post(`/api/pdf/${pdfId}/remove-text`)
      .set(auth())
      .send({ text: "PAGE-TWO-TEXT", pages: [0], mode: "new" });
    assert.equal(res.status, 201);
    assert.equal(res.body.removed, 0); // text lives on page 1, filter says page 0
    const text = await extractText(await downloadBytes(res.body.file.id));
    assert.ok(text.includes("PAGE-TWO-TEXT"));
  });
});
