import { describe, expect, it, vi } from "vitest";
import { UserService } from "./user.service.js";

function createSubject({ adminCount = 2 } = {}) {
  const user = {
    id: "user-1",
    primaryEmail: "person@example.com",
    displayName: "Person",
    status: "ACTIVE",
    platformRole: "USER",
  };
  const repository = {
    list: vi.fn().mockResolvedValue([user]),
    findById: vi.fn().mockResolvedValue(user),
    lockActiveAdmins: vi
      .fn()
      .mockResolvedValue(
        Array.from({ length: adminCount }, (_, index) => ({ id: index })),
      ),
    save: vi.fn().mockResolvedValue(user),
  };
  const service = new UserService({
    sequelize: { transaction: (callback) => callback({ LOCK: {} }) },
    repository,
  });
  return { service, repository, user };
}

const admin = { id: "admin-1", platformRole: "ADMIN" };

describe("UserService platform roles", () => {
  it("lets an administrator promote a user", async () => {
    const { service, repository, user } = createSubject();

    await expect(
      service.updatePlatformRole(admin, user.id, "ADMIN"),
    ).resolves.toMatchObject({ platformRole: "ADMIN" });
    expect(repository.save).toHaveBeenCalled();
  });

  it("rejects platform management by regular users", async () => {
    const { service } = createSubject();

    await expect(
      service.list({ id: "member-1", platformRole: "USER" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not allow the last active administrator to be demoted", async () => {
    const { service, user } = createSubject({ adminCount: 1 });
    user.platformRole = "ADMIN";

    await expect(
      service.updatePlatformRole(admin, user.id, "USER"),
    ).rejects.toMatchObject({ code: "LAST_ADMIN" });
  });
});
