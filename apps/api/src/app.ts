import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
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
import { adminRouter } from "./routes/admin.routes";
import { bump, type Metric } from "./services/analytics.service";

export function createApp(): express.Express {
  const app = express();

  app.set("trust proxy", 1); // behind the web proxy in production
  app.disable("x-powered-by");

  // Lightweight request log (method, path, status, duration). Health-check
  // pings and the test suite are skipped to keep logs clean.
  if (!config.isTest) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        if (req.path === "/api/health") return;
        console.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
      });
      next();
    });
  }

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
  app.use(compression()); // gzip JSON responses and downloads
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // Health check sits above the rate limiter so pings don't consume the budget.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.use("/api", apiLimiter);

  // Privacy-preserving usage counting: on a successful response, bump one
  // aggregate counter based on the endpoint. No identity, no payload — just a
  // tally of "an operation of this kind happened". Runs after the response so
  // it never slows a request.
  app.use((req, res, next) => {
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      const metric = metricFor(req.method, req.path);
      if (metric) bump(metric);
    });
    next();
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
  app.use("/api/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Maps a request to an aggregate metric, or null to ignore it. Only meaningful
 * user actions are counted; staging uploads, downloads, reads and polling are
 * ignored so the numbers reflect real usage, not internal round-trips.
 */
function metricFor(method: string, path: string): Metric | null {
  if (method !== "POST") return null;
  if (path === "/api/auth/guest") return "guest";
  if (path === "/api/auth/register") return "signup";
  if (path === "/api/auth/login") return "login";
  // A PDF tool actually ran (merge/split/edit/compress/convert/protect/form/…).
  if (/^\/api\/(pdf|convert|compress|batch|forms)\//.test(path)) return "pdf_op";
  return null;
}
