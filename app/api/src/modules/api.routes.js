import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  createFolderSchema,
  createInvitationSchema,
  createShareLinkSchema,
  createUploadSchema,
  createWorkspaceSchema,
  forgotPasswordSchema,
  googleCredentialSchema,
  invitationPasswordSchema,
  loginSchema,
  moveItemSchema,
  patchItemSchema,
  resetPasswordSchema,
  transferOwnershipSchema,
  uuidSchema,
} from "@teamshelf/contracts";
import {
  asyncHandler,
  requireAuth,
  validate,
} from "../common/http/middleware.js";

const id = z.object({ workspaceId: uuidSchema });
const itemId = id.extend({ itemId: uuidSchema });
const documentId = id.extend({ documentId: uuidSchema });
const uploadId = id.extend({ uploadId: uuidSchema });
const invitationId = id.extend({ invitationId: uuidSchema });
const userId = id.extend({ userId: uuidSchema });
const shareLinkId = id.extend({ shareLinkId: uuidSchema });
const tokenParam = z.object({ token: z.string().min(32).max(2048) });
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.context.errorCode = "RATE_LIMITED";
    req.log?.warn(
      { code: "RATE_LIMITED", status: 429, method: req.method },
      "request rejected",
    );
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
        details: [],
        requestId: req.id,
      },
    });
  },
});

function send(res, data, status = 200, meta = {}) {
  res.status(status).json({ data, meta });
}

function logEvent(req, event, fields = {}) {
  if (fields.workspaceId) req.context.workspaceId = fields.workspaceId;
  req.log.info(
    {
      event,
      userId: req.context.userId || req.auth?.user?.id,
      workspaceId: req.context.workspaceId,
      ...fields,
    },
    "application event",
  );
}

export function createApiRouter(container) {
  const router = express.Router();
  const {
    authService,
    workspaceService,
    invitationService,
    itemService,
    documentService,
  } = container.services;
  const cookieName = container.config.get("session.cookieName");
  const cookieOptions = {
    httpOnly: true,
    secure: container.config.get("env") === "production",
    sameSite: "lax",
    path: "/",
    maxAge: container.config.get("session.ttlDays") * 86_400_000,
  };
  const setSession = (res, session) =>
    res.cookie(cookieName, session.rawToken, cookieOptions);

  router.post(
    "/auth/password/login",
    sensitiveLimiter,
    validate({ body: loginSchema }),
    asyncHandler(async (req, res) => {
      const result = await authService.loginPassword(req.body);
      req.context.userId = result.user.id;
      setSession(res, result.session);
      logEvent(req, "auth.password_login_succeeded", {
        userId: result.user.id,
      });
      send(res, { user: result.user, csrfToken: result.session.csrfToken });
    }),
  );
  router.post(
    "/auth/google",
    sensitiveLimiter,
    validate({ body: googleCredentialSchema }),
    asyncHandler(async (req, res) => {
      const result = await authService.loginGoogle(req.body);
      req.context.userId = result.user.id;
      setSession(res, result.session);
      logEvent(req, "auth.google_login_succeeded", {
        userId: result.user.id,
      });
      send(res, { user: result.user, csrfToken: result.session.csrfToken });
    }),
  );
  router.post(
    "/auth/identities/google/link",
    requireAuth,
    validate({ body: googleCredentialSchema }),
    asyncHandler(async (req, res) => {
      const identity = await authService.linkGoogle(
        req.auth.user.id,
        req.body.credential,
      );
      logEvent(req, "auth.google_identity_linked", {
        userId: req.auth.user.id,
      });
      send(res, identity);
    }),
  );
  router.delete(
    "/auth/identities/google",
    requireAuth,
    asyncHandler(async (req, res) => {
      await authService.unlinkGoogle(req.auth.user.id);
      logEvent(req, "auth.google_identity_unlinked", {
        userId: req.auth.user.id,
      });
      res.status(204).end();
    }),
  );
  router.post(
    "/auth/logout",
    requireAuth,
    asyncHandler(async (req, res) => {
      await authService.logout(req.auth.session.id);
      res.clearCookie(cookieName, cookieOptions);
      logEvent(req, "auth.logout_succeeded", { userId: req.auth.user.id });
      send(res, {});
    }),
  );
  router.get("/auth/session", requireAuth, (req, res) =>
    send(res, {
      user: authService.publicUser(req.auth.user),
      csrfToken: req.auth.session.csrfToken,
    }),
  );
  router.post(
    "/auth/password/forgot",
    sensitiveLimiter,
    validate({ body: forgotPasswordSchema }),
    asyncHandler(async (req, res) => {
      await authService.forgotPassword(req.body.email);
      logEvent(req, "auth.password_reset_requested");
      send(
        res,
        { message: "If the account exists, a reset email will be sent." },
        202,
      );
    }),
  );
  router.post(
    "/auth/password/reset",
    sensitiveLimiter,
    validate({ body: resetPasswordSchema }),
    asyncHandler(async (req, res) => {
      await authService.resetPassword(req.body.token, req.body.password);
      logEvent(req, "auth.password_reset_completed");
      send(res, {});
    }),
  );

  router.get(
    "/invitations/:token/status",
    sensitiveLimiter,
    validate({ params: tokenParam }),
    asyncHandler(async (req, res) =>
      send(res, await invitationService.status(req.params.token)),
    ),
  );
  router.post(
    "/invitations/:token/accept/password",
    sensitiveLimiter,
    validate({ params: tokenParam, body: invitationPasswordSchema }),
    asyncHandler(async (req, res) => {
      const user = await invitationService.acceptPassword(
        req.params.token,
        req.body,
        req.auth?.user,
      );
      const session = await authService.createSession(user.id);
      req.context.userId = user.id;
      setSession(res, session);
      logEvent(req, "invitation.accepted_with_password", { userId: user.id });
      send(
        res,
        { user: authService.publicUser(user), csrfToken: session.csrfToken },
        201,
      );
    }),
  );
  router.post(
    "/invitations/:token/accept/google",
    sensitiveLimiter,
    validate({ params: tokenParam, body: googleCredentialSchema }),
    asyncHandler(async (req, res) => {
      const result = await authService.loginGoogle({
        credential: req.body.credential,
        invitationToken: req.params.token,
      });
      req.context.userId = result.user.id;
      setSession(res, result.session);
      logEvent(req, "invitation.accepted_with_google", {
        userId: result.user.id,
      });
      send(
        res,
        { user: result.user, csrfToken: result.session.csrfToken },
        201,
      );
    }),
  );

  router.post(
    "/workspaces",
    requireAuth,
    validate({ body: createWorkspaceSchema }),
    asyncHandler(async (req, res) => {
      const workspace = await workspaceService.create(
        req.auth.user.id,
        req.body.name,
        {
          requestId: req.id,
          sourceIp: req.ip,
          userAgent: req.get("user-agent"),
        },
      );
      logEvent(req, "workspace.created", { workspaceId: workspace.id });
      send(res, workspace, 201);
    }),
  );
  router.get(
    "/workspaces",
    requireAuth,
    asyncHandler(async (req, res) =>
      send(res, await workspaceService.list(req.auth.user.id)),
    ),
  );
  router.get(
    "/workspaces/:workspaceId",
    requireAuth,
    validate({ params: id }),
    asyncHandler(async (req, res) =>
      send(
        res,
        await workspaceService.get(req.params.workspaceId, req.auth.user.id),
      ),
    ),
  );
  router.patch(
    "/workspaces/:workspaceId",
    requireAuth,
    validate({ params: id, body: createWorkspaceSchema }),
    asyncHandler(async (req, res) => {
      const workspace = await workspaceService.rename(
        req.params.workspaceId,
        req.auth.user.id,
        req.body.name,
      );
      logEvent(req, "workspace.renamed", {
        workspaceId: req.params.workspaceId,
      });
      send(res, workspace);
    }),
  );
  router.get(
    "/workspaces/:workspaceId/members",
    requireAuth,
    validate({ params: id }),
    asyncHandler(async (req, res) =>
      send(
        res,
        await workspaceService.members(
          req.params.workspaceId,
          req.auth.user.id,
        ),
      ),
    ),
  );
  router.delete(
    "/workspaces/:workspaceId/members/:userId",
    requireAuth,
    validate({ params: userId }),
    asyncHandler(async (req, res) => {
      await workspaceService.removeMember(
        req.params.workspaceId,
        req.auth.user.id,
        req.params.userId,
      );
      logEvent(req, "workspace.member_removed", {
        workspaceId: req.params.workspaceId,
        targetUserId: req.params.userId,
      });
      res.status(204).end();
    }),
  );
  router.post(
    "/workspaces/:workspaceId/transfer-ownership",
    requireAuth,
    validate({ params: id, body: transferOwnershipSchema }),
    asyncHandler(async (req, res) => {
      await workspaceService.transfer(
        req.params.workspaceId,
        req.auth.user.id,
        req.body.userId,
      );
      logEvent(req, "workspace.ownership_transferred", {
        workspaceId: req.params.workspaceId,
        newOwnerId: req.body.userId,
      });
      send(res, {});
    }),
  );
  router.post(
    "/workspaces/:workspaceId/schedule-deletion",
    requireAuth,
    validate({ params: id }),
    asyncHandler(async (req, res) => {
      const workspace = await workspaceService.scheduleDeletion(
        req.params.workspaceId,
        req.auth.user.id,
      );
      logEvent(req, "workspace.deletion_scheduled", {
        workspaceId: req.params.workspaceId,
      });
      send(res, workspace);
    }),
  );
  router.post(
    "/workspaces/:workspaceId/cancel-deletion",
    requireAuth,
    validate({ params: id }),
    asyncHandler(async (req, res) => {
      const workspace = await workspaceService.cancelDeletion(
        req.params.workspaceId,
        req.auth.user.id,
      );
      logEvent(req, "workspace.deletion_cancelled", {
        workspaceId: req.params.workspaceId,
      });
      send(res, workspace);
    }),
  );

  router.post(
    "/workspaces/:workspaceId/invitations",
    requireAuth,
    validate({ params: id, body: createInvitationSchema }),
    asyncHandler(async (req, res) => {
      const invitation = await invitationService.create(
        req.params.workspaceId,
        req.auth.user.id,
        req.body.email,
      );
      logEvent(req, "invitation.created", {
        workspaceId: req.params.workspaceId,
        invitationId: invitation.id,
      });
      send(res, invitation, 201);
    }),
  );
  router.get(
    "/workspaces/:workspaceId/invitations",
    requireAuth,
    validate({ params: id }),
    asyncHandler(async (req, res) =>
      send(
        res,
        await invitationService.list(req.params.workspaceId, req.auth.user.id),
      ),
    ),
  );
  router.post(
    "/workspaces/:workspaceId/invitations/:invitationId/resend",
    requireAuth,
    validate({ params: invitationId }),
    asyncHandler(async (req, res) => {
      const invitation = await invitationService.resend(
        req.params.workspaceId,
        req.auth.user.id,
        req.params.invitationId,
      );
      logEvent(req, "invitation.resent", {
        workspaceId: req.params.workspaceId,
        invitationId: req.params.invitationId,
      });
      send(res, invitation);
    }),
  );
  router.delete(
    "/workspaces/:workspaceId/invitations/:invitationId",
    requireAuth,
    validate({ params: invitationId }),
    asyncHandler(async (req, res) => {
      await invitationService.revoke(
        req.params.workspaceId,
        req.auth.user.id,
        req.params.invitationId,
      );
      logEvent(req, "invitation.revoked", {
        workspaceId: req.params.workspaceId,
        invitationId: req.params.invitationId,
      });
      res.status(204).end();
    }),
  );

  router.get(
    "/workspaces/:workspaceId/items/:itemId",
    requireAuth,
    validate({ params: itemId }),
    asyncHandler(async (req, res) =>
      send(
        res,
        await itemService.list(
          req.params.workspaceId,
          req.auth.user.id,
          req.params.itemId,
        ),
      ),
    ),
  );
  router.post(
    "/workspaces/:workspaceId/folders",
    requireAuth,
    validate({ params: id, body: createFolderSchema }),
    asyncHandler(async (req, res) => {
      const item = await itemService.createFolder(
        req.params.workspaceId,
        req.auth.user.id,
        req.body.parentItemId,
        req.body.name,
      );
      logEvent(req, "item.folder_created", {
        workspaceId: req.params.workspaceId,
        itemId: item.id,
        parentItemId: req.body.parentItemId,
      });
      send(res, item, 201);
    }),
  );
  router.patch(
    "/workspaces/:workspaceId/items/:itemId",
    requireAuth,
    validate({ params: itemId, body: patchItemSchema }),
    asyncHandler(async (req, res) => {
      const item = await itemService.rename(
        req.params.workspaceId,
        req.auth.user.id,
        req.params.itemId,
        req.body.name,
        req.body.lockVersion,
      );
      logEvent(req, "item.renamed", {
        workspaceId: req.params.workspaceId,
        itemId: req.params.itemId,
      });
      send(res, item);
    }),
  );
  router.post(
    "/workspaces/:workspaceId/items/:itemId/move",
    requireAuth,
    validate({ params: itemId, body: moveItemSchema }),
    asyncHandler(async (req, res) => {
      const item = await itemService.move(
        req.params.workspaceId,
        req.auth.user.id,
        req.params.itemId,
        req.body.parentItemId,
        req.body.lockVersion,
      );
      logEvent(req, "item.moved", {
        workspaceId: req.params.workspaceId,
        itemId: req.params.itemId,
        parentItemId: req.body.parentItemId,
      });
      send(res, item);
    }),
  );
  router.delete(
    "/workspaces/:workspaceId/items/:itemId",
    requireAuth,
    validate({ params: itemId }),
    asyncHandler(async (req, res) => {
      await itemService.remove(
        req.params.workspaceId,
        req.auth.user.id,
        req.params.itemId,
      );
      logEvent(req, "item.trashed", {
        workspaceId: req.params.workspaceId,
        itemId: req.params.itemId,
      });
      res.status(204).end();
    }),
  );

  router.post(
    "/workspaces/:workspaceId/uploads",
    requireAuth,
    validate({ params: id, body: createUploadSchema }),
    asyncHandler(async (req, res) => {
      const result = await documentService.startUpload(
        req.params.workspaceId,
        req.auth.user.id,
        req.body,
      );
      logEvent(req, "upload.started", {
        workspaceId: req.params.workspaceId,
        uploadId: result.upload.id,
        documentId: result.document.id,
        sizeBytes: req.body.sizeBytes,
        contentType: req.body.contentType,
      });
      send(res, result, 201);
    }),
  );
  router.post(
    "/workspaces/:workspaceId/uploads/:uploadId/complete",
    requireAuth,
    validate({ params: uploadId }),
    asyncHandler(async (req, res) => {
      const result = await documentService.completeUpload(
        req.params.workspaceId,
        req.auth.user.id,
        req.params.uploadId,
      );
      logEvent(req, "upload.completed", {
        workspaceId: req.params.workspaceId,
        uploadId: req.params.uploadId,
        documentId: result.document.id,
        documentStatus: result.document.status,
      });
      send(res, result);
    }),
  );
  router.get(
    "/workspaces/:workspaceId/uploads/:uploadId",
    requireAuth,
    validate({ params: uploadId }),
    asyncHandler(async (req, res) =>
      send(
        res,
        await documentService.getUpload(
          req.params.workspaceId,
          req.auth.user.id,
          req.params.uploadId,
        ),
      ),
    ),
  );
  router.get(
    "/workspaces/:workspaceId/documents/:documentId",
    requireAuth,
    validate({ params: documentId }),
    asyncHandler(async (req, res) =>
      send(
        res,
        await documentService.get(
          req.params.workspaceId,
          req.auth.user.id,
          req.params.documentId,
        ),
      ),
    ),
  );
  router.get(
    "/workspaces/:workspaceId/documents/:documentId/download",
    requireAuth,
    validate({ params: documentId }),
    asyncHandler(async (req, res) =>
      send(
        res,
        await documentService.download(
          req.params.workspaceId,
          req.auth.user.id,
          req.params.documentId,
        ),
      ),
    ),
  );

  router.post(
    "/workspaces/:workspaceId/documents/:documentId/share-links",
    requireAuth,
    validate({ params: documentId, body: createShareLinkSchema }),
    asyncHandler(async (req, res) => {
      const result = await documentService.createShare(
        req.params.workspaceId,
        req.auth.user.id,
        req.params.documentId,
        req.body,
      );
      logEvent(req, "share_link.created", {
        workspaceId: req.params.workspaceId,
        documentId: req.params.documentId,
        shareLinkId: result.share.id,
      });
      send(
        res,
        {
          ...result.share,
          url: `${container.config.get("app.webBaseUrl")}/s/${result.token}`,
        },
        201,
      );
    }),
  );
  router.get(
    "/workspaces/:workspaceId/documents/:documentId/share-links",
    requireAuth,
    validate({ params: documentId }),
    asyncHandler(async (req, res) =>
      send(
        res,
        await documentService.listShares(
          req.params.workspaceId,
          req.auth.user.id,
          req.params.documentId,
        ),
      ),
    ),
  );
  router.delete(
    "/workspaces/:workspaceId/share-links/:shareLinkId",
    requireAuth,
    validate({ params: shareLinkId }),
    asyncHandler(async (req, res) => {
      await documentService.revokeShare(
        req.params.workspaceId,
        req.auth.user.id,
        req.params.shareLinkId,
      );
      logEvent(req, "share_link.revoked", {
        workspaceId: req.params.workspaceId,
        shareLinkId: req.params.shareLinkId,
      });
      res.status(204).end();
    }),
  );
  router.get(
    "/public/shares/:token",
    sensitiveLimiter,
    validate({ params: tokenParam }),
    asyncHandler(async (req, res) => {
      res.set({
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      });
      send(res, await documentService.publicMetadata(req.params.token));
    }),
  );
  router.get(
    "/public/shares/:token/content",
    sensitiveLimiter,
    validate({ params: tokenParam }),
    asyncHandler(async (req, res) => {
      res.set({
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      });
      send(res, await documentService.publicContent(req.params.token));
    }),
  );

  router.get(
    "/workspaces/:workspaceId/trash",
    requireAuth,
    validate({ params: id }),
    asyncHandler(async (req, res) =>
      send(
        res,
        await itemService.trash(req.params.workspaceId, req.auth.user.id),
      ),
    ),
  );
  router.post(
    "/workspaces/:workspaceId/trash/:itemId/restore",
    requireAuth,
    validate({ params: itemId }),
    asyncHandler(async (req, res) => {
      const item = await itemService.restore(
        req.params.workspaceId,
        req.auth.user.id,
        req.params.itemId,
      );
      logEvent(req, "item.restored", {
        workspaceId: req.params.workspaceId,
        itemId: req.params.itemId,
      });
      send(res, item);
    }),
  );
  router.delete(
    "/workspaces/:workspaceId/trash/:itemId",
    requireAuth,
    validate({ params: itemId }),
    asyncHandler(async (req, res) => {
      await itemService.permanentlyDelete(
        req.params.workspaceId,
        req.auth.user.id,
        req.params.itemId,
      );
      logEvent(req, "item.purge_queued", {
        workspaceId: req.params.workspaceId,
        itemId: req.params.itemId,
      });
      res.status(202).json({ data: { status: "PURGE_QUEUED" }, meta: {} });
    }),
  );

  return router;
}
