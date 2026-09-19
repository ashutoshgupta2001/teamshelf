export class WorkspaceRepository {
  constructor(models) {
    this.models = models;
  }
  create(values, transaction) {
    return this.models.Workspace.create(values, { transaction });
  }
  save(workspace, transaction) {
    return workspace.save({ transaction });
  }
  createMembership(values, transaction) {
    return this.models.Membership.create(values, { transaction });
  }
  findById(id, transaction) {
    return this.models.Workspace.findByPk(id, { transaction });
  }
  async context(workspaceId, userId, transaction) {
    const [workspace, membership] = await Promise.all([
      this.models.Workspace.findByPk(workspaceId, { transaction }),
      this.models.Membership.findOne({
        where: { workspaceId, userId },
        transaction,
      }),
    ]);
    return workspace ? { workspace, membership, userId } : null;
  }
  listForUser(userId) {
    return this.models.Membership.findAll({
      where: { userId },
      include: [{ model: this.models.Workspace, required: true }],
      order: [[this.models.Workspace, "updatedAt", "DESC"]],
    });
  }
  listMembers(workspaceId) {
    return this.models.Membership.findAll({
      where: { workspaceId },
      include: [
        {
          model: this.models.User,
          as: "user",
          attributes: ["id", "primaryEmail", "displayName"],
        },
      ],
      order: [["joinedAt", "ASC"]],
    });
  }
  findMembership(workspaceId, userId, transaction) {
    return this.models.Membership.findOne({
      where: { workspaceId, userId },
      transaction,
    });
  }
  deleteMembership(membership, transaction) {
    return membership.destroy({ transaction });
  }
  revokeUserSessions(userId, transaction) {
    return this.models.Session.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: null }, transaction },
    );
  }
  revokeLinksByCreator(workspaceId, userId, transaction) {
    return this.models.ShareLink.update(
      { revokedAt: new Date() },
      {
        where: { workspaceId, createdBy: userId, revokedAt: null },
        transaction,
      },
    );
  }
  outbox(values, transaction) {
    return this.models.OutboxEvent.create(values, { transaction });
  }
  audit(values, transaction) {
    return this.models.AuditEvent.create(values, { transaction });
  }
}
