import { AppError, errors } from "../../common/errors/app-error.js";

export class UserService {
  constructor({ sequelize, repository }) {
    Object.assign(this, { sequelize, repository });
  }

  requireAdmin(actor) {
    if (actor?.platformRole !== "ADMIN") throw errors.forbidden();
  }

  async list(actor) {
    this.requireAdmin(actor);
    return (await this.repository.list()).map((user) => this.serialize(user));
  }

  async updatePlatformRole(actor, userId, platformRole) {
    this.requireAdmin(actor);
    return this.sequelize.transaction(async (transaction) => {
      // Serialize role changes so two administrators cannot concurrently
      // demote each other and leave the platform without an administrator.
      const activeAdmins = await this.repository.lockActiveAdmins(transaction);
      const user = await this.repository.findById(userId, transaction);
      if (!user) throw errors.notFound("USER");
      if (user.platformRole === platformRole) return this.serialize(user);
      if (
        user.platformRole === "ADMIN" &&
        user.status === "ACTIVE" &&
        platformRole === "USER" &&
        activeAdmins.length <= 1
      )
        throw new AppError(
          "LAST_ADMIN",
          "At least one active platform administrator is required.",
          409,
        );
      user.platformRole = platformRole;
      await this.repository.save(user, transaction);
      return this.serialize(user);
    });
  }

  serialize(user) {
    return {
      id: user.id,
      email: user.primaryEmail,
      displayName: user.displayName,
      status: user.status,
      platformRole: user.platformRole,
      createdAt: user.createdAt,
    };
  }
}
