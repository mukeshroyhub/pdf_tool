import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { apiLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./routes/auth.routes";
import { userRouter } from "./routes/user.routes";
import { fileRouter } from "./routes/file.routes";
import { activityRouter } from "./routes/activity.routes";
import { pdfRouter } from "./routes/pdf.routes";
import { batchRouter, compressRouter, convertRouter } from "./routes/convert.routes";
import { formRouter } from "./routes/ocr-form.routes";

export function createApp(): express.Express {
  const app = express();

  app.set("trust proxy", 1); // behind Nginx in production
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.use(
    cors({
      origin: config.WEB_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/api", apiLimiter);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", userRouter);
  app.use("/api/files", fileRouter);
  app.use("/api/activity", activityRouter);
  app.use("/api/pdf", pdfRouter);
  app.use("/api/convert", convertRouter);
  app.use("/api/compress", compressRouter);
  app.use("/api/batch", batchRouter);
  app.use("/api/forms", formRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
