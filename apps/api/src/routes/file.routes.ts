import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { listFilesQuerySchema, updateFileSchema } from "@pdfforge/shared";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { AppError, badRequest } from "../lib/errors";
import { ensureUserDir, UPLOADS_DIR } from "../lib/storage";
import * as files from "../services/file.service";

export const fileRouter = Router();

fileRouter.use(requireAuth);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB per file
const MAX_FILES_PER_UPLOAD = 10;

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      ensureUserDir(req.auth!.sub)
        .then((dir) => cb(null, dir))
        .catch((err) => cb(err as Error, ""));
    },
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
  try {
    await runUpload(req, res);
    const uploaded = (req.files ?? []) as Express.Multer.File[];
    if (uploaded.length === 0) throw badRequest("No files provided", "NO_FILES");

    const dtos = await files.registerUploads(
      req.auth!.sub,
      uploaded.map((f) => ({
        originalName: Buffer.from(f.originalname, "latin1").toString("utf8"),
        mimeType: f.mimetype,
        sizeBytes: f.size,
        // Store keys relative to the uploads root: <userId>/<random>.<ext>
        storageKey: path.relative(UPLOADS_DIR, f.path),
      })),
    );
    res.status(201).json({ files: dtos });
  } catch (err) {
    next(err);
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
    const { file, absolutePath } = await files.forDownload(req.auth!.sub, req.params.id!);
    res.download(absolutePath, file.name);
  } catch (err) {
    next(err);
  }
});
