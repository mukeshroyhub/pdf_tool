import "./setup-env";
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import request from "supertest";
import { PDFDocument, rgb } from "pdf-lib";
import { createApp } from "../src/app";

const app = createApp();

let token = "";
let docA = ""; // 4 pages
let docB = ""; // 2 pages

async function makePdf(pages: number, label: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([300, 300]);
    page.drawText(`${label}-${i + 1}`, { x: 20, y: 150, size: 20, color: rgb(0, 0, 0) });
  }
  return Buffer.from(await doc.save());
}

async function uploadPdf(name: string, bytes: Buffer): Promise<string> {
  const res = await request(app)
    .post("/api/files")
    .set({ Authorization: `Bearer ${token}` })
    .attach("files", bytes, { filename: name, contentType: "application/pdf" });
  assert.equal(res.status, 201);
  return res.body.files[0].id as string;
}

async function downloadPdf(id: string): Promise<PDFDocument> {
  const res = await request(app)
    .get(`/api/files/${id}/download`)
    .set({ Authorization: `Bearer ${token}` })
    .buffer(true)
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
  assert.equal(res.status, 200);
  return PDFDocument.load(res.body as Buffer);
}

const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  execSync("node scripts/dev-migrate.mjs --reset", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Pdf Ops", email: "pdfops@example.com", password: "PdfOps123!" });
  token = res.body.accessToken;
  docA = await uploadPdf("doc-a.pdf", await makePdf(4, "A"));
  docB = await uploadPdf("doc-b.pdf", await makePdf(2, "B"));
});

describe("POST /api/pdf/merge", () => {
  it("merges two PDFs into one", async () => {
    const res = await request(app)
      .post("/api/pdf/merge")
      .set(auth())
      .send({ fileIds: [docA, docB], name: "combined" });
    assert.equal(res.status, 201);
    assert.equal(res.body.file.name, "combined.pdf");
    assert.equal(res.body.file.pageCount, 6);
    const merged = await downloadPdf(res.body.file.id);
    assert.equal(merged.getPageCount(), 6);
  });

  it("requires at least two files", async () => {
    const res = await request(app).post("/api/pdf/merge").set(auth()).send({ fileIds: [docA] });
    assert.equal(res.status, 422);
  });

  it("rejects non-PDF inputs", async () => {
    // Full 8-byte PNG signature so the upload passes content sniffing;
    // merge must still reject it because it is not a PDF.
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(16),
    ]);
    const img = await request(app)
      .post("/api/files")
      .set(auth())
      .attach("files", png, {
        filename: "pic.png",
        contentType: "image/png",
      });
    assert.equal(img.status, 201);
    const res = await request(app)
      .post("/api/pdf/merge")
      .set(auth())
      .send({ fileIds: [docA, img.body.files[0].id] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "NOT_A_PDF");
  });

  it("rejects uploads whose bytes don't match the declared type", async () => {
    const res = await request(app)
      .post("/api/files")
      .set(auth())
      .attach("files", Buffer.from("this is not a pdf at all"), {
        filename: "fake.pdf",
        contentType: "application/pdf",
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "CONTENT_MISMATCH");
  });
});

describe("POST /api/pdf/:id/split", () => {
  it("splits into parts by ranges", async () => {
    const res = await request(app)
      .post(`/api/pdf/${docA}/split`)
      .set(auth())
      .send({ ranges: [{ from: 1, to: 2 }, { from: 3, to: 4 }] });
    assert.equal(res.status, 201);
    assert.equal(res.body.files.length, 2);
    assert.equal(res.body.files[0].pageCount, 2);
    assert.match(res.body.files[0].name, /doc-a-p1-2\.pdf/);
  });

  it("rejects out-of-bounds ranges", async () => {
    const res = await request(app)
      .post(`/api/pdf/${docA}/split`)
      .set(auth())
      .send({ ranges: [{ from: 1, to: 99 }] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "RANGE_OUT_OF_BOUNDS");
  });
});

describe("POST /api/pdf/:id/rebuild", () => {
  it("reorders, duplicates, rotates and inserts blanks in one pass", async () => {
    const res = await request(app)
      .post(`/api/pdf/${docA}/rebuild`)
      .set(auth())
      .send({
        pages: [
          { source: 3, rotate: 0 },
          { source: 0, rotate: 90 },
          { source: 0, rotate: 0 },
          { source: "blank", rotate: 0 },
        ],
        mode: "new",
        name: "rebuilt",
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.file.pageCount, 4);
    const doc = await downloadPdf(res.body.file.id);
    assert.equal(doc.getPageCount(), 4);
    assert.equal(doc.getPage(1).getRotation().angle, 90);
  });

  it("replace mode overwrites the original in place", async () => {
    const extra = await uploadPdf("victim.pdf", await makePdf(3, "V"));
    const res = await request(app)
      .post(`/api/pdf/${extra}/rebuild`)
      .set(auth())
      .send({ pages: [{ source: 2, rotate: 0 }], mode: "replace" });
    assert.equal(res.status, 201);
    assert.equal(res.body.file.id, extra);
    assert.equal(res.body.file.pageCount, 1);
  });

  it("rejects out-of-bounds page indices", async () => {
    const res = await request(app)
      .post(`/api/pdf/${docA}/rebuild`)
      .set(auth())
      .send({ pages: [{ source: 42, rotate: 0 }] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "PAGE_OUT_OF_BOUNDS");
  });

  it("404s for another user's file", async () => {
    const other = await request(app)
      .post("/api/auth/register")
      .send({ name: "Other", email: "other2@example.com", password: "0therPass!" });
    const res = await request(app)
      .post(`/api/pdf/${docA}/rebuild`)
      .set({ Authorization: `Bearer ${other.body.accessToken}` })
      .send({ pages: [{ source: 0, rotate: 0 }] });
    assert.equal(res.status, 404);
  });
});

describe("POST /api/pdf/:id/replace-pages", () => {
  it("replaces target pages with source pages", async () => {
    const res = await request(app)
      .post(`/api/pdf/${docA}/replace-pages`)
      .set(auth())
      .send({ sourceFileId: docB, targetPages: [2], sourcePages: [1], mode: "new" });
    assert.equal(res.status, 201);
    assert.equal(res.body.file.pageCount, 4);
  });

  it("rejects mismatched page lists", async () => {
    const res = await request(app)
      .post(`/api/pdf/${docA}/replace-pages`)
      .set(auth())
      .send({ sourceFileId: docB, targetPages: [1, 2], sourcePages: [1] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "LENGTH_MISMATCH");
  });
});

describe("POST /api/pdf/:id/page-numbers", () => {
  it("stamps page numbers and keeps the page count", async () => {
    const res = await request(app)
      .post(`/api/pdf/${docA}/page-numbers`)
      .set(auth())
      .send({ position: "bottom-right", format: "n-of-total", mode: "new" });
    assert.equal(res.status, 201);
    const doc = await downloadPdf(res.body.file.id);
    assert.equal(doc.getPageCount(), 4);
  });
});

describe("activity", () => {
  it("logs MERGE/SPLIT/ORGANIZE/REPLACE_PAGES", async () => {
    const res = await request(app).get("/api/activity?limit=50").set(auth());
    const actions = new Set(res.body.activities.map((a: { action: string }) => a.action));
    for (const expected of ["MERGE", "SPLIT", "ORGANIZE", "REPLACE_PAGES"]) {
      assert.ok(actions.has(expected), `expected ${expected} in activity log`);
    }
  });
});
