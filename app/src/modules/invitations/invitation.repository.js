import { Op } from "sequelize";

export class InvitationRepository {
  constructor(models) {
    this.models = models;
  }
  findActiveByTokenHash(tokenHash, now, transaction) {
    return this.models.Invitation.findOne({
      where: {
        tokenHash,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { [Op.gt]: now },
      },
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });
  }
  findActiveById(id, now, transaction) {
    return this.models.Invitation.findOne({
      where: {
        id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { [Op.gt]: now },
      },
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });
  }
  findBootstrapByTokenHash(tokenHash, now, transaction) {
    return this.models.BootstrapInvitation.findOne({
      where: {
        tokenHash,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { [Op.gt]: now },
      },
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });
  }
  findPlatformByTokenHash(tokenHash, now, transaction) {
    return this.models.PlatformInvitation.findOne({
      where: {
        tokenHash,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { [Op.gt]: now },
      },
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });
  }
  findActivePlatformById(id, now, transaction) {
    return this.models.PlatformInvitation.findOne({
      where: {
        id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { [Op.gt]: now },
      },
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });
  }
  findPending(workspaceId, normalizedEmail, transaction) {
    return this.models.Invitation.findOne({
      where: {
        workspaceId,
        normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
      },
      transaction,
    });
  }
  create(values, transaction) {
    return this.models.Invitation.create(values, { transaction });
  }
  createBootstrap(values, transaction) {
    return this.models.BootstrapInvitation.create(values, { transaction });
  }
  createPlatform(values, transaction) {
    return this.models.PlatformInvitation.create(values, { transaction });
  }
  findPendingPlatform(normalizedEmail, transaction) {
    return this.models.PlatformInvitation.findOne({
      where: { normalizedEmail, acceptedAt: null, revokedAt: null },
      transaction,
    });
  }
  listPlatform() {
    return this.models.PlatformInvitation.findAll({
      order: [["createdAt", "DESC"]],
    });
  }
  findPlatformById(id, transaction) {
    return this.models.PlatformInvitation.findByPk(id, { transaction });
  }
  findPendingBootstrap(normalizedEmail, transaction) {
    return this.models.BootstrapInvitation.findOne({
      where: { normalizedEmail, acceptedAt: null, revokedAt: null },
      transaction,
    });
  }
  list(workspaceId) {
    return this.models.Invitation.findAll({
      where: { workspaceId },
      order: [["createdAt", "DESC"]],
    });
  }
  findById(workspaceId, id, transaction) {
    return this.models.Invitation.findOne({
      where: { workspaceId, id },
      transaction,
    });
  }
  save(entity, transaction) {
    return entity.save({ transaction });
  }
  createEmail(values, transaction) {
    return this.models.EmailMessage.create(values, { transaction });
  }
  createJob(values, transaction) {
    return this.models.Job.create(values, { transaction });
  }
}
