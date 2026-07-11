import "./setup-env";
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import request from "supertest";
import { PDFDocument } from "pdf-lib";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

let token = "";
let pdfBytes: Buffer;
let uploadedId = "";

async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

before(async () => {
  execSync("node scripts/dev-migrate.mjs --reset", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Filer", email: "filer@example.com", password: "F1lesRule!" });
  token = res.body.accessToken;
  pdfBytes = await makePdf(3);
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe("POST /api/files", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/api/files");
    assert.equal(res.status, 401);
  });

  it("uploads a PDF, counts pages, tracks storage", async () => {
    const res = await request(app)
      .post("/api/files")
      .set(auth())
      .attach("files", pdfBytes, { filename: "report.pdf", contentType: "application/pdf" });
    assert.equal(res.status, 201);
    assert.equal(res.body.files.length, 1);
    const file = res.body.files[0];
    assert.equal(file.name, "report.pdf");
    assert.equal(file.pageCount, 3);
    assert.equal(file.sizeBytes, pdfBytes.length);
    uploadedId = file.id;

    const me = await request(app).get("/api/users/me").set(auth());
    assert.equal(me.body.user.storageUsed, pdfBytes.length);
  });

  it("rejects unsupported file types", async () => {
    const res = await request(app)
      .post("/api/files")
      .set(auth())
      .attach("files", Buffer.from("#!/bin/sh"), {
        filename: "evil.sh",
        contentType: "application/x-sh",
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "UNSUPPORTED_TYPE");
  });

  it("rejects uploads over the storage quota", async () => {
    await prisma.user.update({
      where: { email: "filer@example.com" },
      data: { storageLimit: BigInt(pdfBytes.length + 10) },
    });
    const res = await request(app)
      .post("/api/files")
      .set(auth())
      .attach("files", pdfBytes, { filename: "too-big.pdf", contentType: "application/pdf" });
    assert.equal(res.status, 413);
    assert.equal(res.body.error.code, "QUOTA_EXCEEDED");
    await prisma.user.update({
      where: { email: "filer@example.com" },
      data: { storageLimit: BigInt(1073741824) },
    });
  });
});

describe("GET /api/files", () => {
  it("lists the user's files", async () => {
    const res = await request(app).get("/api/files").set(auth());
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.files[0].id, uploadedId);
  });

  it("filters by search term", async () => {
    const hit = await request(app).get("/api/files?search=repo").set(auth());
    assert.equal(hit.body.total, 1);
    const miss = await request(app).get("/api/files?search=nomatch").set(auth());
    assert.equal(miss.body.total, 0);
  });
});

describe("PATCH /api/files/:id", () => {
  it("renames and favorites a file", async () => {
    const res = await request(app)
      .patch(`/api/files/${uploadedId}`)
      .set(auth())
      .send({ name: "renamed.pdf", isFavorite: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.file.name, "renamed.pdf");
    assert.equal(res.body.file.isFavorite, true);

    const favs = await request(app).get("/api/files?favorite=true").set(auth());
    assert.equal(favs.body.total, 1);
  });

  it("404s for another user's file", async () => {
    const other = await request(app)
      .post("/api/auth/register")
      .send({ name: "Other", email: "other@example.com", password: "0therPass!" });
    const res = await request(app)
      .patch(`/api/files/${uploadedId}`)
      .set({ Authorization: `Bearer ${other.body.accessToken}` })
      .send({ isFavorite: true });
    assert.equal(res.status, 404);
  });
});

describe("GET /api/files/:id/download", () => {
  it("streams the file back with its display name", async () => {
    const res = await request(app)
      .get(`/api/files/${uploadedId}/download`)
      .set(auth())
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(res.status, 200);
    assert.match(String(res.headers["content-disposition"]), /renamed\.pdf/);
    assert.equal((res.body as Buffer).length, pdfBytes.length);
  });
});

describe("activity timeline", () => {
  it("records upload/rename/favorite/download in order", async () => {
    const res = await request(app).get("/api/activity").set(auth());
    assert.equal(res.status, 200);
    const actions = res.body.activities.map((a: { action: string }) => a.action);
    assert.deepEqual(actions.slice(0, 4), ["DOWNLOAD", "FAVORITE", "RENAME", "UPLOAD"]);
  });
});

describe("DELETE /api/files/:id", () => {
  it("deletes the file and releases storage", async () => {
    const res = await request(app).delete(`/api/files/${uploadedId}`).set(auth());
    assert.equal(res.status, 200);

    const list = await request(app).get("/api/files").set(auth());
    assert.equal(list.body.total, 0);

    const me = await request(app).get("/api/users/me").set(auth());
    assert.equal(me.body.user.storageUsed, 0);

    const dl = await request(app).get(`/api/files/${uploadedId}/download`).set(auth());
    assert.equal(dl.status, 404);
  });
});
