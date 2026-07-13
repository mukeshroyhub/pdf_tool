import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { listFilesQuerySchema, updateFileSchema } from "@pdfforge/shared";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { AppError, badRequest } from "../lib/errors";
import * as storage from "../lib/storage";
import { UPLOAD_TMP_DIR } from "../lib/storage";
import { signatureMatches } from "../lib/sniff";
import * as files from "../services/file.service";

export const fileRouter = Router();

fileRouter.use(requireAuth);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB per file
const MAX_FILES_PER_UPLOAD = 10;

const upload = multer({
  // Files are staged in a temp dir, then handed to the active storage driver
  // (local disk or S3/R2). The temp copy is always removed afterwards.
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_TMP_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10).replace(/[^.\w]/g, "");
      cb(null, `${randomBytes(16).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_UPLOAD },
  fileFilter: (_req, file, cb) => {
    if (!files.ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(badRequest(`Unsupported file type: ${file.mimetype}`, "UNSUPPORTED_TYPE"));
      return;
    }
    cb(null, true);
  },
});

function runUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.array("files", MAX_FILES_PER_UPLOAD)(req, res, (err: unknown) => {
      if (!err) return resolve();
      if (err instanceof multer.MulterError) {
        const code = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        return reject(new AppError(code, err.code, err.message));
      }
      reject(err);
    });
  });
}

fileRouter.post("/", async (req, res, next) => {
  const uploaded: Express.Multer.File[] = [];
  try {
    await runUpload(req, res);
    uploaded.push(...((req.files ?? []) as Express.Multer.File[]));
    if (uploaded.length === 0) throw badRequest("No files provided", "NO_FILES");

    // Content sniffing: the client-declared MIME type is only trusted after
    // the staged file's magic bytes agree with it. On mismatch the whole
    // batch is rejected before anything is stored.
    for (const f of uploaded) {
      if (!(await signatureMatches(f.path, f.mimetype))) {
        const name = Buffer.from(f.originalname, "latin1").toString("utf8");
        throw badRequest(`"${name}" does not match its declared file type`, "CONTENT_MISMATCH");
      }
    }

    // Move each staged file into the storage backend under <userId>/<random>.
    const incoming = [];
    for (const f of uploaded) {
      const storageKey = `${req.auth!.sub}/${path.basename(f.path)}`;
      await storage.saveUploadedFile(storageKey, f.path);
      incoming.push({
        originalName: Buffer.from(f.originalname, "latin1").toString("utf8"),
        mimeType: f.mimetype,
        sizeBytes: f.size,
        storageKey,
      });
    }

    const dtos = await files.registerUploads(req.auth!.sub, incoming);
    res.status(201).json({ files: dtos });
  } catch (err) {
    next(err);
  } finally {
    // Always clean up staged temp files (saveUploadedFile may have consumed
    // them already; rm with force ignores missing files).
    await Promise.all(uploaded.map((f) => rm(f.path, { force: true }).catch(() => undefined)));
  }
});

fileRouter.get("/", async (req, res, next) => {
  try {
    const query = listFilesQuerySchema.safeParse(req.query);
    if (!query.success) throw badRequest("Invalid query parameters", "INVALID_QUERY");
    res.json(await files.list(req.auth!.sub, query.data));
  } catch (err) {
    next(err);
  }
});

fileRouter.get("/:id", async (req, res, next) => {
  try {
    const file = await files.getOne(req.auth!.sub, req.params.id!);
    res.json({ file });
  } catch (err) {
    next(err);
  }
});

fileRouter.patch("/:id", validateBody(updateFileSchema), async (req, res, next) => {
  try {
    const file = await files.update(req.auth!.sub, req.params.id!, req.body);
    res.json({ file });
  } catch (err) {
    next(err);
  }
});

fileRouter.delete("/:id", async (req, res, next) => {
  try {
    await files.destroy(req.auth!.sub, req.params.id!);
    res.json({ message: "File deleted" });
  } catch (err) {
    next(err);
  }
});

fileRouter.get("/:id/download", async (req, res, next) => {
  try {
    const file = await files.forDownload(req.auth!.sub, req.params.id!);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    const stream = await storage.downloadStream(file.storageKey);
    stream.on("error", next);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});
