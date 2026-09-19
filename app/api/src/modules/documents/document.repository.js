import { Op } from "sequelize";

export class DocumentRepository {
  constructor(models) {
    this.models = models;
  }
  create(values, transaction) {
    return this.models.Document.create(values, { transaction });
  }
  findAccessible(workspaceId, documentId, transaction) {
    return this.models.Document.findOne({
      where: { workspaceId, id: documentId },
      include: [
        {
          model: this.models.Item,
          as: "item",
          required: true,
          where: { workspaceId, deletedAt: null },
        },
      ],
      transaction,
    });
  }
  findById(id, transaction) {
    return this.models.Document.findByPk(id, { transaction });
  }
  save(document, transaction) {
    return document.save({ transaction });
  }
  createUpload(values, transaction) {
    return this.models.UploadSession.create(values, { transaction });
  }
  findUpload(workspaceId, id, transaction, forUpdate = false) {
    return this.models.UploadSession.findOne({
      where: { workspaceId, id },
      transaction,
      ...(forUpdate ? { lock: transaction.LOCK.UPDATE } : {}),
    });
  }
  createJob(values, transaction) {
    return this.models.Job.create(values, { transaction });
  }
  createShare(values, transaction) {
    return this.models.ShareLink.create(values, { transaction });
  }
  listShares(workspaceId, documentId) {
    return this.models.ShareLink.findAll({
      where: { workspaceId, documentId },
      attributes: { exclude: ["tokenHash"] },
      order: [["createdAt", "DESC"]],
    });
  }
  findShare(workspaceId, id, transaction) {
    return this.models.ShareLink.findOne({
      where: { workspaceId, id },
      transaction,
    });
  }
  findActiveShare(tokenHash, now, transaction) {
    return this.models.ShareLink.findOne({
      where: { tokenHash, revokedAt: null, expiresAt: { [Op.gt]: now } },
      transaction,
    });
  }
  findDocumentForShare(documentId, workspaceId, transaction) {
    return this.findAccessible(workspaceId, documentId, transaction);
  }
  saveShare(share, transaction) {
    return share.save({ transaction });
  }
  async recordShareAccess(share, now, transaction) {
    await share.increment("accessCount", { by: 1, transaction });
    await share.update({ lastAccessedAt: now }, { transaction });
  }
  revokeDocumentShares(workspaceId, documentId, now, transaction) {
    return this.models.ShareLink.update(
      { revokedAt: now },
      { where: { workspaceId, documentId, revokedAt: null }, transaction },
    );
  }
}
