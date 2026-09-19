import { Op } from "sequelize";

export class AuthRepository {
  constructor(models) {
    this.models = models;
  }
  findUserByEmail(normalizedEmail, transaction) {
    return this.models.User.findOne({
      where: { normalizedEmail },
      transaction,
    });
  }
  findUserById(id, transaction) {
    return this.models.User.findByPk(id, { transaction });
  }
  createUser(values, transaction) {
    return this.models.User.create(values, { transaction });
  }
  findIdentity(provider, providerSubject, transaction) {
    return this.models.AuthIdentity.findOne({
      where: { provider, providerSubject },
      transaction,
    });
  }
  findIdentityForUser(provider, userId, transaction) {
    return this.models.AuthIdentity.findOne({
      where: { provider, userId },
      transaction,
    });
  }
  findPasswordIdentity(userId, transaction) {
    return this.models.AuthIdentity.findOne({
      where: { userId, provider: "PASSWORD" },
      transaction,
    });
  }
  createIdentity(values, transaction) {
    return this.models.AuthIdentity.create(values, { transaction });
  }
  deleteIdentity(identity, transaction) {
    return identity.destroy({ transaction });
  }
  countIdentities(userId, transaction) {
    return this.models.AuthIdentity.count({ where: { userId }, transaction });
  }
  createSession(values, transaction) {
    return this.models.Session.create(values, { transaction });
  }
  async findActiveSession(tokenHash, now) {
    const session = await this.models.Session.findOne({
      where: { tokenHash, revokedAt: null, expiresAt: { [Op.gt]: now } },
    });
    if (!session) return null;
    const user = await this.models.User.findOne({
      where: { id: session.userId, status: "ACTIVE" },
    });
    return user ? { session, user } : null;
  }
  revokeSession(id, transaction) {
    return this.models.Session.update(
      { revokedAt: new Date() },
      { where: { id }, transaction },
    );
  }
  revokeAllSessions(userId, transaction) {
    return this.models.Session.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: null }, transaction },
    );
  }
  createResetToken(values, transaction) {
    return this.models.PasswordResetToken.create(values, { transaction });
  }
  findResetToken(tokenHash, now, transaction) {
    return this.models.PasswordResetToken.findOne({
      where: { tokenHash, usedAt: null, expiresAt: { [Op.gt]: now } },
      transaction,
    });
  }
  save(entity, transaction) {
    return entity.save({ transaction });
  }
}
