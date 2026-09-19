import crypto from "node:crypto";
import { ZodError } from "zod";
import { AppError, errors } from "../errors/app-error.js";

export const asyncHandler = (handler) => (req, res, next) => {
  captureRouteContext(req);
  return Promise.resolve(handler(req, res, next)).catch(next);
};

export function requestContext(req, res, next) {
  req.id = crypto.randomUUID();
  req.context = { requestId: req.id };
  res.set("x-request-id", req.id);
  next();
}

export function requestLogging(logger) {
  return (req, res, next) => {
    const startedAt = performance.now();
    let finished = false;
    req.log = logger.child({ requestId: req.id });
    req.log.debug({ method: req.method }, "request started");
    res.on("finish", () => {
      finished = true;
      captureRouteContext(req);
      const fields = requestFields(req, res, startedAt);
      if (fields.route.startsWith("/health/"))
        req.log.debug(fields, "health check completed");
      else req.log.info(fields, "request completed");
    });
    res.on("close", () => {
      if (finished) return;
      captureRouteContext(req);
      req.log.warn(
        requestFields(req, res, startedAt),
        "request connection closed before completion",
      );
    });
    next();
  };
}

function requestFields(req, res, startedAt) {
  return {
    method: req.method,
    route: req.context.routePattern || "unmatched",
    status: res.statusCode,
    durationMs: Math.round(performance.now() - startedAt),
    userId: req.context.userId || req.auth?.user?.id,
    workspaceId: req.context.workspaceId,
    errorCode: req.context.errorCode,
  };
}

function captureRouteContext(req) {
  req.context ||= { requestId: req.id };
  if (req.route?.path) {
    const baseUrl = req.baseUrl || "";
    if (baseUrl || !req.context.routePattern)
      req.context.routePattern = `${baseUrl}${req.route.path}`;
  }
  if (req.params?.workspaceId) req.context.workspaceId = req.params.workspaceId;
}

export function validate(schemas = {}) {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      captureRouteContext(req);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuth(req, _res, next) {
  captureRouteContext(req);
  if (!req.auth?.user) return next(errors.unauthorized());
  next();
}

export function requireAdmin(req, _res, next) {
  captureRouteContext(req);
  if (req.auth?.user?.platformRole !== "ADMIN") return next(errors.forbidden());
  next();
}

export function requireCsrf(req, _res, next) {
  captureRouteContext(req);
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!req.auth?.session) return next();
  const supplied = req.get("x-csrf-token");
  if (
    !supplied ||
    supplied.length !== req.auth.session.csrfToken.length ||
    !crypto.timingSafeEqual(
      Buffer.from(supplied),
      Buffer.from(req.auth.session.csrfToken),
    )
  ) {
    return next(
      new AppError("CSRF_INVALID", "The security token is invalid.", 403),
    );
  }
  next();
}

export function notFound(req, _res, next) {
  captureRouteContext(req);
  next(errors.notFound("ROUTE"));
}

export function errorHandler(logger) {
  return (error, req, res, _next) => {
    const normalized =
      error instanceof ZodError
        ? new AppError(
            "VALIDATION_FAILED",
            "The request is invalid.",
            400,
            error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          )
        : error;
    const status = normalized instanceof AppError ? normalized.status : 500;
    const code = normalized.code || "INTERNAL_ERROR";
    captureRouteContext(req);
    req.context.errorCode = code;
    const requestLog = req.log || logger.child({ requestId: req.id });
    const logContext = {
      code,
      status,
      method: req.method,
      route: req.context.routePattern || "unmatched",
      userId: req.context.userId || req.auth?.user?.id,
      workspaceId: req.context.workspaceId,
    };
    if (status >= 500)
      requestLog.error({ ...logContext, err: error }, "request failed");
    else if ([401, 403, 429].includes(status))
      requestLog.warn(logContext, "request rejected");
    else requestLog.debug(logContext, "request rejected");
    res.status(status).json({
      error: {
        code,
        message:
          status >= 500 ? "An unexpected error occurred." : normalized.message,
        details: normalized.details || [],
        requestId: req.id,
      },
    });
  };
}
