import { describe, expect, it, vi } from "vitest";
import { AppError } from "../errors/app-error.js";
import {
  errorHandler,
  requestContext,
  requestLogging,
  requireAdmin,
  requireAuth,
} from "./middleware.js";

function response() {
  const listeners = {};
  return {
    statusCode: 200,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    on(event, callback) {
      listeners[event] = callback;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json: vi.fn(),
    listeners,
  };
}

describe("HTTP request context", () => {
  it("always generates a server UUID and returns it to the caller", () => {
    const req = {};
    const res = response();
    const next = vi.fn();
    requestContext(req, res, next);
    expect(req.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(req.context).toEqual({ requestId: req.id });
    expect(res.headers["x-request-id"]).toBe(req.id);
    expect(next).toHaveBeenCalledOnce();
  });

  it("uses a request-scoped logger for completion and rejection logs", () => {
    const scopedLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const logger = { child: vi.fn(() => scopedLogger) };
    const req = {
      id: "a74fe5d8-d9c7-43c4-adf2-977f11a6c57a",
      context: { requestId: "a74fe5d8-d9c7-43c4-adf2-977f11a6c57a" },
      method: "POST",
      baseUrl: "/api/v1",
      route: { path: "/workspaces/:workspaceId/folders" },
      params: { workspaceId: "workspace-1" },
      auth: { user: { id: "user-1" } },
    };
    const res = response();
    requestLogging(logger)(req, res, vi.fn());
    requireAuth(req, res, vi.fn());
    req.baseUrl = "";
    errorHandler(logger)(
      new AppError("FORBIDDEN", "No access", 403),
      req,
      res,
      vi.fn(),
    );
    res.listeners.finish();

    expect(logger.child).toHaveBeenCalledWith({ requestId: req.id });
    expect(scopedLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "FORBIDDEN",
        route: "/api/v1/workspaces/:workspaceId/folders",
        workspaceId: "workspace-1",
      }),
      "request rejected",
    );
    expect(scopedLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/api/v1/workspaces/:workspaceId/folders",
        status: 403,
        errorCode: "FORBIDDEN",
      }),
      "request completed",
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ requestId: req.id }),
      }),
    );
  });
});

describe("platform administrator authorization", () => {
  it("allows administrators and rejects regular users", () => {
    const nextAdmin = vi.fn();
    requireAdmin(
      { auth: { user: { platformRole: "ADMIN" } } },
      response(),
      nextAdmin,
    );
    expect(nextAdmin).toHaveBeenCalledWith();

    const nextUser = vi.fn();
    requireAdmin(
      { auth: { user: { platformRole: "USER" } } },
      response(),
      nextUser,
    );
    expect(nextUser).toHaveBeenCalledWith(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
});
