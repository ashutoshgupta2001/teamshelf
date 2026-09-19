import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";

function createSubject({
  existingUser = null,
  invitation = null,
  profileEmail = "person@example.com",
} = {}) {
  const authRepository = {
    findIdentity: vi.fn().mockResolvedValue(null),
    findUserByEmail: vi.fn().mockResolvedValue(existingUser),
    createUser: vi.fn(),
    createIdentity: vi.fn(),
    createSession: vi.fn().mockResolvedValue({
      expiresAt: new Date("2026-01-15T00:00:00Z"),
    }),
  };
  const invitationRepository = {
    findActiveByTokenHash: vi.fn().mockResolvedValue(invitation),
    findPlatformByTokenHash: vi.fn().mockResolvedValue(null),
    findBootstrapByTokenHash: vi.fn().mockResolvedValue(null),
  };
  const service = new AuthService({
    sequelize: {
      transaction: (callback) => callback({ LOCK: { UPDATE: "UPDATE" } }),
    },
    authRepository,
    invitationRepository,
    workspaceRepository: {},
    passwordHasher: {},
    googleIdentity: {
      verify: vi.fn().mockResolvedValue({
        subject: "google-subject",
        email: profileEmail,
        normalizedEmail: profileEmail,
        displayName: "Person",
      }),
    },
    tokens: {
      generate: vi
        .fn()
        .mockReturnValueOnce("session-token")
        .mockReturnValueOnce("csrf-token"),
      hash: (value) => `hash:${value}`,
      verifyInvitation: vi.fn().mockReturnValue(null),
    },
    clock: {
      now: () => new Date("2026-01-01T00:00:00Z"),
      addDays: (days, date) => new Date(date.getTime() + days * 86_400_000),
    },
    sessionTtlDays: 14,
    webBaseUrl: "https://app.example.test",
  });
  return { service, authRepository };
}

describe("Google authentication", () => {
  it("links Google and signs in when the verified email belongs to an existing user", async () => {
    const { service, authRepository } = createSubject({
      existingUser: {
        id: "user-1",
        primaryEmail: "person@example.com",
        displayName: "Person",
        status: "ACTIVE",
      },
    });
    await expect(
      service.loginGoogle({ credential: "valid-google-token" }),
    ).resolves.toMatchObject({ user: { id: "user-1" } });
    expect(authRepository.createIdentity).toHaveBeenCalledWith(
      {
        userId: "user-1",
        provider: "GOOGLE",
        providerSubject: "google-subject",
        providerEmail: "person@example.com",
      },
      expect.anything(),
    );
  });

  it("requires an invitation when the verified email is new", async () => {
    const { service, authRepository } = createSubject();
    await expect(
      service.loginGoogle({ credential: "valid-google-token" }),
    ).rejects.toMatchObject({ code: "INVITATION_REQUIRED" });
    expect(authRepository.createIdentity).not.toHaveBeenCalled();
  });

  it("rejects a Google identity whose email does not match the invitation", async () => {
    const { service, authRepository } = createSubject({
      invitation: {
        normalizedEmail: "invited@example.com",
        invitedEmail: "invited@example.com",
      },
      profileEmail: "different@example.com",
    });
    await expect(
      service.loginGoogle({
        credential: "valid-google-token",
        invitationToken: "invitation-token",
      }),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    expect(authRepository.createUser).not.toHaveBeenCalled();
  });

  it("does not create a platform account from a workspace invitation", async () => {
    const { service, authRepository } = createSubject({
      invitation: {
        normalizedEmail: "person@example.com",
        invitedEmail: "person@example.com",
        workspaceId: "workspace-1",
      },
    });

    await expect(
      service.loginGoogle({
        credential: "valid-google-token",
        invitationToken: "invitation-token",
      }),
    ).rejects.toMatchObject({ code: "INVITED_USER_UNAVAILABLE" });
    expect(authRepository.createUser).not.toHaveBeenCalled();
  });
});
