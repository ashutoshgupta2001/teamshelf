import { Op, QueryTypes } from "sequelize";

export class ItemRepository {
  constructor(models, sequelize) {
    this.models = models;
    this.sequelize = sequelize;
  }
  create(values, transaction) {
    return this.models.Item.create(values, { transaction });
  }
  find(workspaceId, id, transaction, includeDeleted = false) {
    return this.models.Item.findOne({
      where: {
        workspaceId,
        id,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      transaction,
    });
  }
  findForUpdate(workspaceId, id, transaction, includeDeleted = false) {
    return this.models.Item.findOne({
      where: {
        workspaceId,
        id,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }
  listChildren(workspaceId, parentItemId) {
    return this.models.Item.findAll({
      where: { workspaceId, parentItemId, deletedAt: null },
      include: [
        {
          model: this.models.Document,
          as: "document",
          required: false,
          attributes: [
            "id",
            "status",
            "sizeBytes",
            "clientContentType",
            "detectedContentType",
          ],
        },
      ],
      order: [
        ["itemType", "ASC"],
        ["displayName", "ASC"],
      ],
    });
  }
  listTrash(workspaceId) {
    return this.models.Item.findAll({
      where: { workspaceId, deletedAt: { [Op.ne]: null } },
      order: [["deletedAt", "DESC"]],
    });
  }
  save(item, transaction) {
    return item.save({ transaction });
  }
  async descendantIds(workspaceId, itemId, transaction) {
    const rows = await this.sequelize.query(
      `WITH RECURSIVE tree AS (
      SELECT id FROM workspace_items WHERE workspace_id = :workspaceId AND parent_item_id = :itemId
      UNION ALL SELECT i.id FROM workspace_items i JOIN tree t ON i.parent_item_id = t.id WHERE i.workspace_id = :workspaceId
    ) SELECT id FROM tree`,
      {
        replacements: { workspaceId, itemId },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    return rows.map((row) => row.id);
  }
  async softDeleteTree(workspaceId, itemId, userId, batchId, now, transaction) {
    await this.sequelize.query(
      `WITH RECURSIVE tree AS (
      SELECT id FROM workspace_items WHERE workspace_id = :workspaceId AND id = :itemId
      UNION ALL SELECT i.id FROM workspace_items i JOIN tree t ON i.parent_item_id = t.id WHERE i.workspace_id = :workspaceId
    ) UPDATE workspace_items SET deleted_at=:now, deleted_by=:userId, deletion_batch_id=:batchId, updated_at=:now
      WHERE id IN (SELECT id FROM tree) AND deleted_at IS NULL`,
      {
        replacements: { workspaceId, itemId, userId, batchId, now },
        transaction,
      },
    );
    await this.sequelize.query(
      `UPDATE share_links SET revoked_at=:now WHERE workspace_id=:workspaceId AND revoked_at IS NULL
      AND document_id IN (SELECT d.id FROM documents d JOIN workspace_items i ON i.id=d.item_id WHERE i.workspace_id=:workspaceId AND i.deletion_batch_id=:batchId)`,
      { replacements: { now, workspaceId, batchId }, transaction },
    );
  }
  async restoreBatch(workspaceId, batchId, transaction) {
    return this.models.Item.update(
      { deletedAt: null, deletedBy: null, deletionBatchId: null },
      { where: { workspaceId, deletionBatchId: batchId }, transaction },
    );
  }
  findSibling(
    workspaceId,
    parentItemId,
    normalizedName,
    transaction,
    excludeId,
  ) {
    return this.models.Item.findOne({
      where: {
        workspaceId,
        parentItemId,
        normalizedName,
        deletedAt: null,
        ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
      },
      transaction,
    });
  }
  documentsForDeletionBatch(workspaceId, batchId, transaction) {
    return this.models.Document.findAll({
      where: { workspaceId },
      include: [
        {
          model: this.models.Item,
          as: "item",
          required: true,
          where: { workspaceId, deletionBatchId: batchId },
        },
      ],
      transaction,
    });
  }
  createJob(values, transaction) {
    return this.models.Job.create(values, { transaction });
  }
}
