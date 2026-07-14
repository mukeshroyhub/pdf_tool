import "./setup-env";
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import request from "supertest";
import sharp from "sharp";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createApp } from "../src/app";

const app = createApp();

let token = "";
let pdfId = "";
let imgId = "";

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

async function upload(name: string, bytes: Buffer, type: string): Promise<string> {
  const res = await request(app)
    .post("/api/files")
    .set(auth())
    .attach("files", bytes, { filename: name, contentType: type });
  assert.equal(res.status, 201);
  return res.body.files[0].id as string;
}

before(async () => {
  execSync("node scripts/dev-migrate.mjs --reset", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Converter", email: "convert@example.com", password: "C0nvertMe!" });
  token = reg.body.accessToken;

  // A text-bearing 2-page PDF with a large photo-like image (compressible).
  const noise = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 40 } },
  })
    .png()
    .toBuffer();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const img = await doc.embedPng(noise);
  const p1 = doc.addPage([600, 500]);
  p1.drawText("Quarterly Report 2026", { x: 40, y: 450, size: 24, font, color: rgb(0, 0, 0) });
  p1.drawText("Revenue  100  200", { x: 40, y: 400, size: 14, font });
  p1.drawImage(img, { x: 40, y: 40, width: 500, height: 320 });
  doc.addPage([600, 500]).drawText("Page two", { x: 40, y: 450, size: 18, font });
  pdfId = await upload("report.pdf", Buffer.from(await doc.save()), "application/pdf");

  const jpeg = await sharp({ create: { width: 320, height: 200, channels: 3, background: "#3366cc" } })
    .jpeg()
    .toBuffer();
  imgId = await upload("photo.jpg", jpeg, "image/jpeg");
});

describe("POST /api/convert/:id", () => {
  it("pdf → png produces one image per page", async () => {
    const res = await request(app)
      .post(`/api/convert/${pdfId}`)
      .set(auth())
      .send({ target: "png", dpi: 72 });
    assert.equal(res.status, 201);
    assert.equal(res.body.files.length, 2);
    const bytes = await downloadBytes(res.body.files[0].id);
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.width, 600); // 600pt @ 72dpi = 600px
  });

  it("pdf → jpg respects dpi", async () => {
    const res = await request(app)
      .post(`/api/convert/${pdfId}`)
      .set(auth())
      .send({ target: "jpg", dpi: 144, quality: 80 });
    assert.equal(res.status, 201);
    const meta = await sharp(await downloadBytes(res.body.files[0].id)).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, 1200); // 600pt @ 144dpi
  });

  it("image → pdf wraps the image in a page", async () => {
    const res = await request(app)
      .post(`/api/convert/${imgId}`)
      .set(auth())
      .send({ target: "pdf" });
    assert.equal(res.status, 201);
    const parsed = await PDFDocument.load(await downloadBytes(res.body.files[0].id));
    assert.equal(parsed.getPageCount(), 1);
  });

  it("rejects unsupported conversions", async () => {
    const res = await request(app)
      .post(`/api/convert/${imgId}`)
      .set(auth())
      .send({ target: "png" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "UNSUPPORTED_CONVERSION");
  });
});

describe("POST /api/compress/:id", () => {
  it("low level is lossless and keeps page count", async () => {
    const res = await request(app)
      .post(`/api/compress/${pdfId}`)
      .set(auth())
      .send({ level: "low", mode: "new" });
    assert.equal(res.status, 201);
    assert.equal(res.body.file.pageCount, 2);
    assert.ok(res.body.after <= res.body.before);
  });

  it("high level shrinks an image-heavy PDF substantially", async () => {
    const res = await request(app)
      .post(`/api/compress/${pdfId}`)
      .set(auth())
      .send({ level: "high", mode: "new" });
    assert.equal(res.status, 201);
    assert.ok(
      res.body.after < res.body.before * 0.8,
      `expected >20% reduction, got ${res.body.before} → ${res.body.after}`,
    );
    const parsed = await PDFDocument.load(await downloadBytes(res.body.file.id));
    assert.equal(parsed.getPageCount(), 2);
  });

  it("custom level honours dpi/quality", async () => {
    const res = await request(app)
      .post(`/api/compress/${pdfId}`)
      .set(auth())
      .send({ level: "custom", dpi: 60, quality: 30, mode: "new" });
    assert.equal(res.status, 201);
    assert.ok(res.body.after < res.body.before);
  });
});

describe("POST /api/batch", () => {
  it("compresses several files reporting per-file results", async () => {
    const res = await request(app)
      .post("/api/batch")
      .set(auth())
      .send({
        operation: "compress",
        fileIds: [pdfId, imgId], // second one fails: not a PDF
        params: { level: "low" },
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.results.length, 2);
    assert.equal(res.body.results[0].ok, true);
    assert.equal(res.body.results[1].ok, false);
  });

  it("batch watermark works on PDFs", async () => {
    const res = await request(app)
      .post("/api/batch")
      .set(auth())
      .send({ operation: "watermark", fileIds: [pdfId], params: { text: "BATCH" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.results[0].ok, true);
  });
});

describe("POST /api/convert/images-to-pdf", () => {
  it("combines images into one PDF", async () => {
    const png = await sharp({ create: { width: 100, height: 80, channels: 3, background: "#22aa55" } })
      .png()
      .toBuffer();
    const img2 = await upload("second.png", png, "image/png");
    const res = await request(app)
      .post("/api/convert/images-to-pdf")
      .set(auth())
      .send({ fileIds: [imgId, img2], name: "album" });
    assert.equal(res.status, 201);
    assert.equal(res.body.file.pageCount, 2);
  });
});
