import "./setup-env";
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import request from "supertest";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createApp } from "../src/app";
import { tesseractAvailable } from "../src/lib/tesseract";

const app = createApp();

let token = "";
let textPdfId = "";
let formPdfId = "";

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

async function upload(name: string, bytes: Buffer): Promise<string> {
  const res = await request(app)
    .post("/api/files")
    .set(auth())
    .attach("files", bytes, { filename: name, contentType: "application/pdf" });
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
    .send({ name: "Ocr Forms", email: "ocrforms@example.com", password: "0crForms!" });
  token = reg.body.accessToken;

  // Clean, large text for reliable OCR.
  const textDoc = await PDFDocument.create();
  const font = await textDoc.embedFont(StandardFonts.Helvetica);
  const page = textDoc.addPage([500, 200]);
  page.drawText("HELLO WORLD", { x: 60, y: 100, size: 40, font, color: rgb(0, 0, 0) });
  textPdfId = await upload("scan.pdf", Buffer.from(await textDoc.save()));

  // A PDF with existing form fields.
  const formDoc = await PDFDocument.create();
  const fpage = formDoc.addPage([400, 300]);
  const form = formDoc.getForm();
  const nameField = form.createTextField("fullName");
  nameField.addToPage(fpage, { x: 50, y: 220, width: 200, height: 24 });
  const agree = form.createCheckBox("agree");
  agree.addToPage(fpage, { x: 50, y: 180, width: 18, height: 18 });
  const color = form.createDropdown("color");
  color.setOptions(["Red", "Green", "Blue"]);
  color.addToPage(fpage, { x: 50, y: 140, width: 120, height: 22 });
  formPdfId = await upload("form.pdf", Buffer.from(await formDoc.save()));
});

describe("GET /api/ocr/languages", () => {
  it("lists installed language packs", async () => {
    const res = await request(app).get("/api/ocr/languages").set(auth());
    assert.equal(res.status, 200);
    if (await tesseractAvailable()) {
      assert.ok(res.body.languages.includes("eng"));
      assert.ok(!res.body.languages.includes("osd"));
    }
  });
});

describe("POST /api/ocr/:id", () => {
  it("produces a searchable PDF and recognizes the text", { timeout: 120_000 }, async (t) => {
    if (!(await tesseractAvailable())) {
      t.skip("tesseract not installed");
      return;
    }
    const res = await request(app)
      .post(`/api/ocr/${textPdfId}`)
      .set(auth())
      .send({ languages: ["eng"], dpi: 300, mode: "new" });
    assert.equal(res.status, 201);
    assert.match(res.body.text, /HELLO WORLD/);
    const parsed = await PDFDocument.load(await downloadBytes(res.body.file.id));
    assert.equal(parsed.getPageCount(), 1);
  });

  it("rejects unavailable languages", async (t) => {
    if (!(await tesseractAvailable())) {
      t.skip("tesseract not installed");
      return;
    }
    const res = await request(app)
      .post(`/api/ocr/${textPdfId}`)
      .set(auth())
      .send({ languages: ["zzz"] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "LANGUAGE_UNAVAILABLE");
  });
});

describe("GET /api/forms/:id", () => {
  it("lists fields with types, options and positions", async () => {
    const res = await request(app).get(`/api/forms/${formPdfId}`).set(auth());
    assert.equal(res.status, 200);
    const byName = Object.fromEntries(res.body.fields.map((f: { name: string }) => [f.name, f]));
    assert.equal(byName.fullName.type, "text");
    assert.equal(byName.agree.type, "checkbox");
    assert.equal(byName.color.type, "dropdown");
    assert.deepEqual(byName.color.options, ["Red", "Green", "Blue"]);
    assert.equal(byName.fullName.page, 0);
    assert.ok(byName.fullName.rect.w > 0);
  });
});

describe("POST /api/forms/:id/fill", () => {
  it("fills text, checkbox and dropdown values", async () => {
    const res = await request(app)
      .post(`/api/forms/${formPdfId}/fill`)
      .set(auth())
      .send({ values: { fullName: "Mukesh Kumar", agree: true, color: "Green" }, mode: "new" });
    assert.equal(res.status, 201);

    const filled = await PDFDocument.load(await downloadBytes(res.body.file.id));
    const form = filled.getForm();
    assert.equal(form.getTextField("fullName").getText(), "Mukesh Kumar");
    assert.equal(form.getCheckBox("agree").isChecked(), true);
    assert.equal(form.getDropdown("color").getSelected()[0], "Green");
  });

  it("flatten removes the fields but keeps content", async () => {
    const res = await request(app)
      .post(`/api/forms/${formPdfId}/fill`)
      .set(auth())
      .send({ values: { fullName: "Flat" }, flatten: true, mode: "new" });
    assert.equal(res.status, 201);
    const flat = await PDFDocument.load(await downloadBytes(res.body.file.id));
    assert.equal(flat.getForm().getFields().length, 0);
  });

  it("rejects unknown field names", async () => {
    const res = await request(app)
      .post(`/api/forms/${formPdfId}/fill`)
      .set(auth())
      .send({ values: { ghost: "boo" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "UNKNOWN_FIELD");
  });
});

describe("POST /api/forms/:id/create", () => {
  it("creates text, checkbox, dropdown, radio and signature fields", async () => {
    const res = await request(app)
      .post(`/api/forms/${textPdfId}/create`)
      .set(auth())
      .send({
        fields: [
          { type: "text", name: "email", page: 0, x: 40, y: 40, w: 180, h: 22 },
          { type: "checkbox", name: "subscribe", page: 0, x: 240, y: 40, w: 16, h: 16 },
          { type: "dropdown", name: "country", page: 0, x: 40, y: 80, w: 140, h: 22, options: ["IN", "US"] },
          { type: "radio", name: "size", page: 0, x: 240, y: 70, w: 100, h: 40, options: ["S", "L"] },
          { type: "signature", name: "sig", page: 0, x: 320, y: 130, w: 140, h: 30 },
        ],
        mode: "new",
        name: "created-form",
      });
    assert.equal(res.status, 201);

    const created = await PDFDocument.load(await downloadBytes(res.body.file.id));
    const form = created.getForm();
    assert.equal(form.getTextField("email").getName(), "email");
    assert.equal(form.getCheckBox("subscribe").isChecked(), false);
    assert.deepEqual(form.getDropdown("country").getOptions(), ["IN", "US"]);
    assert.deepEqual(form.getRadioGroup("size").getOptions(), ["S", "L"]);
    assert.ok(form.getTextField("sig"));
  });

  it("rejects out-of-range pages", async () => {
    const res = await request(app)
      .post(`/api/forms/${textPdfId}/create`)
      .set(auth())
      .send({ fields: [{ type: "text", name: "x", page: 7, x: 0, y: 0, w: 50, h: 20 }] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "PAGE_OUT_OF_BOUNDS");
  });
});
