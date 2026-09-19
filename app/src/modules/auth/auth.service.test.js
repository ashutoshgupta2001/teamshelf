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
  };
  const invitationRepository = {
    findActiveByTokenHash: vi.fn().mockResolvedValue(invitation),
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
    tokens: { hash: (value) => `hash:${value}` },
    clock: { now: () => new Date("2026-01-01T00:00:00Z") },
    sessionTtlDays: 14,
    webBaseUrl: "https://app.example.test",
  });
  return { service, authRepository };
}

describe("Google invite-only authentication", () => {
  it("does not silently link Google to an existing password account", async () => {
    const { service, authRepository } = createSubject({
      existingUser: { id: "user-1", status: "ACTIVE" },
    });
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
});
