import "./setup-env";
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import request from "supertest";
import { PDFDocument } from "pdf-lib";
import { createApp } from "../src/app";

const app = createApp();

let token = "";
let pdfId = "";
let pngId = "";

// Minimal valid 1x1 red PNG.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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

before(async () => {
  execSync("node scripts/dev-migrate.mjs --reset", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Editor", email: "editor@example.com", password: "Ed1torPass!" });
  token = reg.body.accessToken;

  const doc = await PDFDocument.create();
  doc.addPage([400, 400]);
  doc.addPage([400, 400]);
  const up = await request(app)
    .post("/api/files")
    .set(auth())
    .attach("files", Buffer.from(await doc.save()), {
      filename: "canvas.pdf",
      contentType: "application/pdf",
    });
  pdfId = up.body.files[0].id;

  const img = await request(app)
    .post("/api/files")
    .set(auth())
    .attach("files", PNG_1PX, { filename: "logo.png", contentType: "image/png" });
  pngId = img.body.files[0].id;
});

describe("POST /api/pdf/:id/annotate", () => {
  it("applies every element type and produces a valid PDF", async () => {
    const res = await request(app)
      .post(`/api/pdf/${pdfId}/annotate`)
      .set(auth())
      .send({
        elements: [
          { type: "text", page: 0, x: 40, y: 40, text: "Hello\nWorld", fontSize: 18, color: { r: 0, g: 0, b: 0 }, font: "helvetica-bold" },
          { type: "highlight", page: 0, x: 30, y: 30, w: 120, h: 24, color: { r: 1, g: 1, b: 0 }, opacity: 0.35 },
          { type: "whiteout", page: 0, x: 200, y: 200, w: 50, h: 20 },
          { type: "rect", page: 0, x: 10, y: 300, w: 80, h: 40, stroke: { r: 1, g: 0, b: 0 }, strokeWidth: 2, fill: null },
          { type: "ellipse", page: 1, x: 100, y: 100, w: 60, h: 40, stroke: { r: 0, g: 0, b: 1 }, strokeWidth: 2, fill: { r: 0.9, g: 0.9, b: 1 } },
          { type: "line", page: 1, x1: 20, y1: 350, x2: 200, y2: 350, color: { r: 0, g: 0.5, b: 0 }, width: 3 },
          { type: "ink", page: 1, paths: [[{ x: 50, y: 50 }, { x: 80, y: 70 }, { x: 120, y: 40 }]], color: { r: 0.2, g: 0.2, b: 0.8 }, width: 2 },
          { type: "image", page: 0, x: 300, y: 60, w: 40, h: 40, imageFileId: pngId },
        ],
        mode: "new",
        name: "annotated",
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.file.name, "annotated.pdf");
    const bytes = await downloadBytes(res.body.file.id);
    const parsed = await PDFDocument.load(bytes);
    assert.equal(parsed.getPageCount(), 2);
    assert.ok(bytes.length > 600, "annotated PDF should have grown");
  });

  it("rejects elements on out-of-range pages", async () => {
    const res = await request(app)
      .post(`/api/pdf/${pdfId}/annotate`)
      .set(auth())
      .send({
        elements: [
          { type: "text", page: 9, x: 0, y: 0, text: "x", fontSize: 12, color: { r: 0, g: 0, b: 0 }, font: "helvetica" },
        ],
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "PAGE_OUT_OF_BOUNDS");
  });

  it("rejects a non-image file used as an image element", async () => {
    const res = await request(app)
      .post(`/api/pdf/${pdfId}/annotate`)
      .set(auth())
      .send({
        elements: [{ type: "image", page: 0, x: 0, y: 0, w: 10, h: 10, imageFileId: pdfId }],
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "UNSUPPORTED_IMAGE");
  });

  it("replace mode overwrites in place", async () => {
    const before = await request(app).get(`/api/files/${pdfId}`).set(auth());
    const res = await request(app)
      .post(`/api/pdf/${pdfId}/annotate`)
      .set(auth())
      .send({
        elements: [
          { type: "text", page: 0, x: 10, y: 10, text: "stamped", fontSize: 10, color: { r: 0, g: 0, b: 0 }, font: "courier" },
        ],
        mode: "replace",
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.file.id, pdfId);
    assert.notEqual(res.body.file.sizeBytes, before.body.file.sizeBytes);
  });
});

describe("POST /api/pdf/:id/watermark", () => {
  it("stamps every page", async () => {
    const res = await request(app)
      .post(`/api/pdf/${pdfId}/watermark`)
      .set(auth())
      .send({ text: "CONFIDENTIAL", mode: "new", name: "stamped" });
    assert.equal(res.status, 201);
    assert.equal(res.body.file.pageCount, 2);
    const parsed = await PDFDocument.load(await downloadBytes(res.body.file.id));
    assert.equal(parsed.getPageCount(), 2);
  });

  it("validates input", async () => {
    const res = await request(app)
      .post(`/api/pdf/${pdfId}/watermark`)
      .set(auth())
      .send({ text: "" });
    assert.equal(res.status, 422);
  });
});

describe("activity", () => {
  it("records nothing server-side (privacy by design)", async () => {
    // Edit/watermark operations must leave no server-side trace; the browser
    // keeps a private activity log locally instead.
    const res = await request(app).get("/api/activity?limit=50").set(auth());
    assert.equal(res.status, 200);
    assert.equal(res.body.activities.length, 0);
  });
});
