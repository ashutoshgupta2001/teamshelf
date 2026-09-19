import { describe, expect, it, vi } from "vitest";
import { InvitationService } from "./invitation.service.js";

function createSubject() {
  const transaction = { id: "transaction-1" };
  const existingUser = {
    id: "user-1",
    primaryEmail: "person@example.com",
    normalizedEmail: "person@example.com",
    status: "ACTIVE",
    platformRole: "USER",
  };
  const invitation = {
    id: "invitation-1",
    workspaceId: "workspace-1",
    invitedEmail: "person@example.com",
    normalizedEmail: "person@example.com",
    platformRole: "USER",
    expiresAt: new Date("2026-01-08T00:00:00Z"),
    acceptedAt: null,
    revokedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  const repository = {
    findPending: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(invitation),
    list: vi.fn().mockResolvedValue([invitation]),
    findById: vi.fn().mockResolvedValue(invitation),
    save: vi.fn().mockResolvedValue(invitation),
    createEmail: vi.fn().mockResolvedValue({ id: "email-1" }),
    createJob: vi.fn().mockResolvedValue({ id: "job-1" }),
    findPendingPlatform: vi.fn().mockResolvedValue(null),
    createPlatform: vi.fn().mockResolvedValue(invitation),
    listPlatform: vi.fn().mockResolvedValue([invitation]),
    findPlatformById: vi.fn().mockResolvedValue(invitation),
  };
  const service = new InvitationService({
    sequelize: { transaction: (callback) => callback(transaction) },
    repository,
    authRepository: {
      findUserByEmail: vi.fn().mockResolvedValue(existingUser),
    },
    workspaceRepository: {
      findMembership: vi.fn().mockResolvedValue(null),
    },
    workspaceService: {
      getContext: vi.fn().mockResolvedValue({
        workspace: { id: "workspace-1", name: "TeamShelf" },
      }),
    },
    policy: { requireOwner: vi.fn() },
    passwordHasher: {},
    tokens: {
      generate: vi.fn().mockReturnValue("raw invitation token"),
      hash: vi.fn().mockReturnValue("token-hash"),
      id: vi.fn().mockReturnValue("invitation-1"),
      signInvitation: vi.fn().mockReturnValue("raw invitation token"),
      verifyInvitation: vi.fn().mockReturnValue(null),
    },
    clock: {
      now: () => new Date("2026-01-01T00:00:00Z"),
      addDays: vi.fn().mockReturnValue(invitation.expiresAt),
    },
    expiryDays: 7,
    webBaseUrl: "https://app.example.test",
  });
  return { service, repository, transaction, existingUser, invitation };
}

describe("InvitationService", () => {
  it("returns the invitation URL once when an invitation is created", async () => {
    const { service, repository, transaction } = createSubject();

    await expect(
      service.create("workspace-1", "owner-1", "person@example.com"),
    ).resolves.toMatchObject({
      id: "invitation-1",
      email: "person@example.com",
      url: "https://app.example.test/invite?token=raw%20invitation%20token",
    });
    expect(repository.createEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateData: expect.objectContaining({
          invitationUrl:
            "https://app.example.test/invite?token=raw%20invitation%20token",
        }),
      }),
      transaction,
    );
  });

  it("rejects a workspace invitation when the platform user does not exist", async () => {
    const { service, repository } = createSubject();
    service.authRepository.findUserByEmail.mockResolvedValue(null);

    await expect(
      service.create("workspace-1", "owner-1", "unknown@example.com"),
    ).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects a workspace invitation for an existing member", async () => {
    const { service, repository } = createSubject();
    service.workspaceRepository.findMembership.mockResolvedValue({
      id: "membership-1",
    });

    await expect(
      service.create("workspace-1", "owner-1", "person@example.com"),
    ).rejects.toMatchObject({ code: "MEMBER_ALREADY_EXISTS" });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("keeps an active invitation URL available in list responses", async () => {
    const { service } = createSubject();

    const [invitation] = await service.list("workspace-1", "owner-1");

    expect(invitation).toMatchObject({
      id: "invitation-1",
      email: "person@example.com",
      url: "https://app.example.test/invite?token=raw%20invitation%20token",
    });
  });

  it("does not expose a URL for an accepted invitation", async () => {
    const { service, repository, invitation: pending } = createSubject();
    repository.list.mockResolvedValue([
      {
        ...pending,
        id: "accepted-invitation-1",
        acceptedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);

    const [invitation] = await service.list("workspace-1", "owner-1");

    expect(invitation).not.toHaveProperty("url");
  });

  it("returns the replacement URL when an invitation is resent", async () => {
    const { service } = createSubject();

    await expect(
      service.resend("workspace-1", "owner-1", "invitation-1"),
    ).resolves.toMatchObject({
      id: "invitation-1",
      url: "https://app.example.test/invite?token=raw%20invitation%20token",
    });
  });

  it("always creates platform invitations for regular users", async () => {
    const { service, repository } = createSubject();
    service.authRepository.findUserByEmail.mockResolvedValue(null);
    repository.createPlatform.mockImplementation(async (values) => ({
      ...values,
      acceptedAt: null,
      revokedAt: null,
    }));

    await expect(
      service.createPlatform(
        { id: "admin-1", platformRole: "ADMIN" },
        "new-user@example.com",
      ),
    ).resolves.toMatchObject({
      email: "new-user@example.com",
      url: "https://app.example.test/invite?token=raw%20invitation%20token",
    });
    expect(repository.createPlatform).toHaveBeenCalledWith(
      expect.objectContaining({ id: "invitation-1", platformRole: "USER" }),
      expect.anything(),
    );
  });

  it("keeps an active platform invitation URL available in list responses", async () => {
    const { service } = createSubject();

    const [invitation] = await service.listPlatform({
      id: "admin-1",
      platformRole: "ADMIN",
    });

    expect(invitation).toMatchObject({
      id: "invitation-1",
      email: "person@example.com",
      url: "https://app.example.test/invite?token=raw%20invitation%20token",
    });
    expect(service.tokens.signInvitation).toHaveBeenCalledWith(
      "PLATFORM",
      "invitation-1",
    );
  });

  it("creates a regular user even if an invitation record contains another role", async () => {
    const { service, repository, transaction } = createSubject();
    const platformInvitation = {
      id: "platform-invitation-1",
      invitedEmail: "new-admin@example.com",
      normalizedEmail: "new-admin@example.com",
      platformRole: "ADMIN",
      expiresAt: new Date("2026-01-08T00:00:00Z"),
      acceptedAt: null,
      revokedAt: null,
    };
    const createdUser = {
      id: "new-admin-1",
      primaryEmail: platformInvitation.invitedEmail,
      normalizedEmail: platformInvitation.normalizedEmail,
      displayName: "New Admin",
      status: "ACTIVE",
      platformRole: "USER",
    };
    repository.findActiveByTokenHash = vi.fn().mockResolvedValue(null);
    repository.findPlatformByTokenHash = vi
      .fn()
      .mockResolvedValue(platformInvitation);
    repository.findBootstrapByTokenHash = vi.fn().mockResolvedValue(null);
    service.authRepository.findUserByEmail.mockResolvedValue(null);
    service.authRepository.createUser = vi.fn().mockResolvedValue(createdUser);
    service.authRepository.createIdentity = vi.fn().mockResolvedValue({});
    service.authRepository.save = vi.fn().mockResolvedValue(createdUser);
    service.passwordHasher.hash = vi.fn().mockResolvedValue("password-hash");
    service.workspaceRepository.outbox = vi.fn().mockResolvedValue({});

    await expect(
      service.acceptPassword(
        "raw invitation token",
        { displayName: "New Admin", password: "strong-password" },
        null,
      ),
    ).resolves.toMatchObject({
      id: "new-admin-1",
      platformRole: "USER",
    });
    expect(service.authRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ platformRole: "USER" }),
      transaction,
    );
    expect(platformInvitation.acceptedAt).toEqual(
      new Date("2026-01-01T00:00:00Z"),
    );
  });
});
