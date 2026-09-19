import { describe, expect, it, vi } from "vitest";
import { BootstrapAdminService } from "./bootstrap-admin.service.js";

function createSubject(existingUser = null) {
  const transaction = { id: "transaction-1" };
  const authRepository = {
    findUserByEmail: vi.fn().mockResolvedValue(existingUser),
    createUser: vi.fn().mockResolvedValue({ id: "user-1" }),
    createIdentity: vi.fn().mockResolvedValue({ id: "identity-1" }),
  };
  const workspaceService = {
    createWithinTransaction: vi.fn().mockResolvedValue({ id: "workspace-1" }),
  };
  const passwordHasher = {
    hash: vi.fn().mockResolvedValue("password-hash"),
  };
  const service = new BootstrapAdminService({
    sequelize: { transaction: (callback) => callback(transaction) },
    authRepository,
    workspaceService,
    passwordHasher,
  });
  return {
    service,
    transaction,
    authRepository,
    workspaceService,
    passwordHasher,
  };
}

describe("BootstrapAdminService", () => {
  it("creates the initial password user and owned workspace atomically", async () => {
    const subject = createSubject();
    const result = await subject.service.seed({
      email: "admin@example.com",
      password: "a-secure-password",
      displayName: "TeamShelf Admin",
      workspaceName: "TeamShelf",
    });

    expect(result).toEqual({
      created: true,
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    expect(subject.passwordHasher.hash).toHaveBeenCalledWith(
      "a-secure-password",
    );
    expect(subject.authRepository.createIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        provider: "PASSWORD",
        providerSubject: "admin@example.com",
        passwordHash: "password-hash",
      }),
      subject.transaction,
    );
    expect(
      subject.workspaceService.createWithinTransaction,
    ).toHaveBeenCalledWith(
      "user-1",
      "TeamShelf",
      { action: "INITIAL_ADMIN_WORKSPACE_CREATED" },
      subject.transaction,
    );
  });

  it("does not change credentials when the configured user already exists", async () => {
    const subject = createSubject({ id: "existing-user" });
    const result = await subject.service.seed({
      email: "admin@example.com",
      password: "a-secure-password",
      displayName: "TeamShelf Admin",
      workspaceName: "TeamShelf",
    });

    expect(result).toEqual({
      created: false,
      userId: "existing-user",
      workspaceId: null,
    });
    expect(subject.passwordHasher.hash).not.toHaveBeenCalled();
    expect(subject.authRepository.createUser).not.toHaveBeenCalled();
    expect(subject.authRepository.createIdentity).not.toHaveBeenCalled();
    expect(
      subject.workspaceService.createWithinTransaction,
    ).not.toHaveBeenCalled();
  });
});
