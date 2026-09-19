import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { createContainer } from "./container.js";
import { createApiRouter } from "../modules/api.routes.js";
import { LocalFileStorageAdapter } from "../infrastructure/storage/local-file-storage-adapter.js";
import {
  asyncHandler,
  errorHandler,
  notFound,
  requestContext,
  requestLogging,
  requireCsrf,
} from "../common/http/middleware.js";

export function createApiApp(overrides = {}) {
  const container = overrides.container || createContainer(overrides);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", container.config.get("app.trustProxy"));
  app.use(
    helmet({
      referrerPolicy: { policy: "no-referrer" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://accounts.google.com"],
          frameSrc: ["https://accounts.google.com"],
          connectSrc: [
            "'self'",
            "https://accounts.google.com",
            "https://storage.googleapis.com",
          ],
          imgSrc: [
            "'self'",
            "data:",
            "blob:",
            "https://*.googleusercontent.com",
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: container.config.get("app.webBaseUrl"),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token"],
      exposedHeaders: ["X-Request-ID"],
    }),
  );
  app.use(requestContext);
  app.use(requestLogging(container.logger));
  app.use(cookieParser());
  app.use(
    asyncHandler(async (req, _res, next) => {
      const authenticated = await container.services.authService.authenticate(
        req.cookies[container.config.get("session.cookieName")],
      );
      req.auth = authenticated || {};
      if (authenticated?.user?.id) req.context.userId = authenticated.user.id;
      next();
    }),
  );
  if (container.storage instanceof LocalFileStorageAdapter) {
    const raw = express.raw({
      type: "*/*",
      limit: `${container.config.get("storage.maxFileSizeMb")}mb`,
    });
    app.put(
      "/api/v1/local-storage/upload/:key",
      raw,
      asyncHandler(async (req, res) => {
        const objectKey = container.storage.verifyAuthorization(
          "upload",
          req.params.key,
          req.query.expires,
          req.query.signature,
        );
        await container.storage.acceptUpload(objectKey, req.body);
        res.status(201).end();
      }),
    );
    app.get(
      "/api/v1/local-storage/download/:key",
      asyncHandler(async (req, res) => {
        const objectKey = container.storage.verifyAuthorization(
          "download",
          req.params.key,
          req.query.expires,
          req.query.signature,
        );
        const bytes = await container.storage.readObject({ objectKey });
        res
          .set({
            "Content-Type": "application/octet-stream",
            "Cache-Control": "private, no-store",
          })
          .send(bytes);
      }),
    );
  }
  app.use(express.json({ limit: "1mb" }));
  app.use(requireCsrf);
  app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get(
    "/health/ready",
    asyncHandler(async (_req, res) => {
      await container.sequelize.authenticate();
      res.json({ status: "ready" });
    }),
  );
  app.use("/api/v1", createApiRouter(container));
  app.use(notFound);
  app.use(errorHandler(container.logger));
  return { app, container };
}
