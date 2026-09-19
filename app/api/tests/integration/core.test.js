import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp } from "../../src/bootstrap/create-api-app.js";

const { app, container } = createApiApp();
const api = request(app);

async function acceptBootstrap(email, suffix) {
  const token = `${suffix}${"x".repeat(42)}`;
  await container.repositories.invitationRepository.createBootstrap({
    invitedEmail: email,
    normalizedEmail: email,
    tokenHash: container.tokens.hash(token),
    expiresAt: container.clock.addDays(1),
  });
  const accepted = await api
    .post(`/api/v1/invitations/${token}/accept/password`)
    .send({
      displayName: email.split("@")[0],
      password: "a secure password 123",
    })
    .expect(201);
  return {
    cookie: accepted.headers["set-cookie"][0].split(";")[0],
    csrf: accepted.body.data.csrfToken,
    user: accepted.body.data.user,
  };
}

const authenticated = (method, path, auth) =>
  api[method](path).set("Cookie", auth.cookie).set("X-CSRF-Token", auth.csrf);

beforeAll(async () => {
  await container.sequelize.authenticate();
  await container.sequelize
    .query(`TRUNCATE audit_events, outbox_events, jobs, email_delivery_attempts, email_messages, share_links,
    upload_sessions, documents, workspace_invitations, workspace_memberships, sessions, password_reset_tokens,
    auth_identities, bootstrap_invitations, workspace_items, workspaces, users RESTART IDENTITY CASCADE`);
});
afterAll(() => container.sequelize.close());

describe("critical PostgreSQL workflows", () => {
  it("keeps invitation acceptance, workspace isolation, uploads and sharing consistent", async () => {
    const owner = await acceptBootstrap("owner@example.com", "o");
    const second = await acceptBootstrap("second@example.com", "s");

    const created = await authenticated("post", "/api/v1/workspaces", owner)
      .send({ name: "Product" })
      .expect(201);
    const workspace = created.body.data;
    const otherCreated = await authenticated(
      "post",
      "/api/v1/workspaces",
      second,
    )
      .send({ name: "Private" })
      .expect(201);
    await authenticated(
      "get",
      `/api/v1/workspaces/${otherCreated.body.data.id}`,
      owner,
    ).expect(404);

    const plans = await authenticated(
      "post",
      `/api/v1/workspaces/${workspace.id}/folders`,
      owner,
    )
      .send({ parentItemId: workspace.rootItemId, name: "Plans" })
      .expect(201);
    const child = await authenticated(
      "post",
      `/api/v1/workspaces/${workspace.id}/folders`,
      owner,
    )
      .send({ parentItemId: plans.body.data.id, name: "Child" })
      .expect(201);
    await authenticated(
      "post",
      `/api/v1/workspaces/${workspace.id}/items/${plans.body.data.id}/move`,
      owner,
    )
      .send({
        parentItemId: child.body.data.id,
        lockVersion: plans.body.data.lockVersion,
      })
      .expect(409);
    const conflict = await authenticated(
      "post",
      `/api/v1/workspaces/${workspace.id}/folders`,
      owner,
    )
      .send({ parentItemId: workspace.rootItemId, name: "plans" })
      .expect(409);
    expect(conflict.body.error.code).toBe("NAME_CONFLICT");

    const bytes = Buffer.from("hello,team\n");
    const start = await authenticated(
      "post",
      `/api/v1/workspaces/${workspace.id}/uploads`,
      owner,
    )
      .send({
        parentItemId: workspace.rootItemId,
        filename: "notes.csv",
        sizeBytes: bytes.length,
        contentType: "text/csv",
      })
      .expect(201);
    const uploadUrl = new URL(start.body.data.authorization.url);
    await api
      .put(`${uploadUrl.pathname}${uploadUrl.search}`)
      .set("Content-Type", "text/csv")
      .send(bytes)
      .expect(201);
    const completed = await authenticated(
      "post",
      `/api/v1/workspaces/${workspace.id}/uploads/${start.body.data.upload.id}/complete`,
      owner,
    ).expect(200);
    await authenticated(
      "post",
      `/api/v1/workspaces/${workspace.id}/uploads/${start.body.data.upload.id}/complete`,
      owner,
    ).expect(200);
    const refreshedWorkspace = await authenticated(
      "get",
      `/api/v1/workspaces/${workspace.id}`,
      owner,
    ).expect(200);
    expect(refreshedWorkspace.body.data.storageUsedBytes).toBe(bytes.length);

    const document = await container.repositories.documentRepository.findById(
      completed.body.data.document.id,
    );
    document.status = "AVAILABLE";
    document.detectedContentType = "text/csv";
    await container.repositories.documentRepository.save(document);
    const share = await authenticated(
      "post",
      `/api/v1/workspaces/${workspace.id}/documents/${document.id}/share-links`,
      owner,
    )
      .send({ allowDownload: true, expiresInDays: 2 })
      .expect(201);
    const shareToken = share.body.data.url.split("/").at(-1);
    await api.get(`/api/v1/public/shares/${shareToken}`).expect(200);

    const items = await authenticated(
      "get",
      `/api/v1/workspaces/${workspace.id}/items/${workspace.rootItemId}`,
      owner,
    ).expect(200);
    const documentItem = items.body.data.find(
      (item) => item.document?.id === document.id,
    );
    await authenticated(
      "patch",
      `/api/v1/workspaces/${workspace.id}/items/${documentItem.id}`,
      owner,
    )
      .send({ name: "team-notes.csv", lockVersion: documentItem.lockVersion })
      .expect(200);
    await api.get(`/api/v1/public/shares/${shareToken}`).expect(200);
    await authenticated(
      "delete",
      `/api/v1/workspaces/${workspace.id}/items/${documentItem.id}`,
      owner,
    ).expect(204);
    await api.get(`/api/v1/public/shares/${shareToken}`).expect(404);
    await authenticated(
      "post",
      `/api/v1/workspaces/${workspace.id}/trash/${documentItem.id}/restore`,
      owner,
    ).expect(200);
    await api.get(`/api/v1/public/shares/${shareToken}`).expect(404);

    await authenticated(
      "delete",
      `/api/v1/workspaces/${workspace.id}/items/${documentItem.id}`,
      owner,
    ).expect(204);
    const agedTrashItem = await container.repositories.itemRepository.find(
      workspace.id,
      documentItem.id,
      undefined,
      true,
    );
    agedTrashItem.deletedAt = container.clock.addDays(-31);
    await container.repositories.itemRepository.save(agedTrashItem);
    await container.repositories.jobRepository.runMaintenance(
      container.clock.now(),
      container.clock.addDays(-30),
    );
    const deletionJob = await container.models.Job.findOne({
      where: { jobType: "DELETE_OBJECT" },
    });
    expect(deletionJob.payload.documentId).toBe(document.id);

    const events = await container.models.OutboxEvent.findAll({
      where: { eventType: "InvitationAccepted" },
    });
    expect(events).toHaveLength(2);
  });
});
