import { AppError, errors } from "../../common/errors/app-error.js";
import { assertMoveAllowed, prepareItemName } from "./item-rules.js";

export class ItemService {
  constructor({
    sequelize,
    repository,
    workspaceService,
    workspacePolicy,
    workspaceRepository,
    tokens,
    clock,
  }) {
    Object.assign(this, {
      sequelize,
      repository,
      workspaceService,
      workspacePolicy,
      workspaceRepository,
      tokens,
      clock,
    });
  }
  async list(workspaceId, userId, parentId) {
    await this.workspaceService.getContext(workspaceId, userId);
    const parent = await this.repository.find(workspaceId, parentId);
    if (!parent || !["ROOT", "FOLDER"].includes(parent.itemType))
      throw errors.notFound("FOLDER");
    return (await this.repository.listChildren(workspaceId, parentId)).map(
      this.serialize,
    );
  }
  async createFolder(workspaceId, userId, parentItemId, name) {
    await this.workspaceService.getContext(workspaceId, userId);
    const parent = await this.repository.find(workspaceId, parentItemId);
    assertMoveAllowed({ itemType: "FOLDER", id: "__new__" }, parent);
    const prepared = prepareItemName(name);
    try {
      const item = await this.repository.create({
        workspaceId,
        parentItemId,
        itemType: "FOLDER",
        ...prepared,
        createdBy: userId,
      });
      return this.serialize(item);
    } catch (error) {
      if (error.name === "SequelizeUniqueConstraintError")
        throw new AppError(
          "NAME_CONFLICT",
          "An item with this name already exists here.",
          409,
        );
      throw error;
    }
  }
  async rename(workspaceId, userId, itemId, name, lockVersion) {
    return this.sequelize.transaction(async (transaction) => {
      const context = await this.workspaceService.getContext(
        workspaceId,
        userId,
        transaction,
      );
      const item = await this.repository.findForUpdate(
        workspaceId,
        itemId,
        transaction,
      );
      if (!item) throw errors.notFound("ITEM");
      this.workspacePolicy.requireContentEditor(context, item);
      if (item.itemType === "ROOT")
        throw new AppError(
          "ROOT_IMMUTABLE",
          "The workspace root cannot be changed.",
          400,
        );
      if (item.lockVersion !== lockVersion)
        throw new AppError(
          "VERSION_CONFLICT",
          "The item was changed by someone else.",
          409,
        );
      const prepared = prepareItemName(name);
      if (
        await this.repository.findSibling(
          workspaceId,
          item.parentItemId,
          prepared.normalizedName,
          transaction,
          item.id,
        )
      )
        throw new AppError(
          "NAME_CONFLICT",
          "An item with this name already exists here.",
          409,
        );
      Object.assign(item, prepared, { lockVersion: item.lockVersion + 1 });
      await this.repository.save(item, transaction);
      return this.serialize(item);
    });
  }
  async move(workspaceId, userId, itemId, parentItemId, lockVersion) {
    return this.sequelize.transaction(async (transaction) => {
      const context = await this.workspaceService.getContext(
        workspaceId,
        userId,
        transaction,
      );
      const item = await this.repository.findForUpdate(
        workspaceId,
        itemId,
        transaction,
      );
      const parent = await this.repository.findForUpdate(
        workspaceId,
        parentItemId,
        transaction,
      );
      if (!item) throw errors.notFound("ITEM");
      this.workspacePolicy.requireContentEditor(context, item);
      const descendants =
        item.itemType === "FOLDER"
          ? await this.repository.descendantIds(
              workspaceId,
              item.id,
              transaction,
            )
          : [];
      assertMoveAllowed(item, parent, descendants);
      if (item.lockVersion !== lockVersion)
        throw new AppError(
          "VERSION_CONFLICT",
          "The item was changed by someone else.",
          409,
        );
      if (
        await this.repository.findSibling(
          workspaceId,
          parentItemId,
          item.normalizedName,
          transaction,
          item.id,
        )
      )
        throw new AppError(
          "NAME_CONFLICT",
          "An item with this name already exists there.",
          409,
        );
      item.parentItemId = parentItemId;
      item.lockVersion += 1;
      await this.repository.save(item, transaction);
      return this.serialize(item);
    });
  }
  async remove(workspaceId, userId, itemId) {
    await this.sequelize.transaction(async (transaction) => {
      const context = await this.workspaceService.getContext(
        workspaceId,
        userId,
        transaction,
      );
      const item = await this.repository.findForUpdate(
        workspaceId,
        itemId,
        transaction,
      );
      if (!item) throw errors.notFound("ITEM");
      this.workspacePolicy.requireContentEditor(context, item);
      if (item.itemType === "ROOT")
        throw new AppError(
          "ROOT_IMMUTABLE",
          "The workspace root cannot be changed.",
          400,
        );
      await this.repository.softDeleteTree(
        workspaceId,
        itemId,
        userId,
        this.tokens.id(),
        this.clock.now(),
        transaction,
      );
    });
  }
  async trash(workspaceId, userId) {
    await this.workspaceService.getContext(workspaceId, userId);
    return (await this.repository.listTrash(workspaceId)).map(this.serialize);
  }
  async restore(workspaceId, userId, itemId) {
    return this.sequelize.transaction(async (transaction) => {
      const context = await this.workspaceService.getContext(
        workspaceId,
        userId,
        transaction,
      );
      const item = await this.repository.findForUpdate(
        workspaceId,
        itemId,
        transaction,
        true,
      );
      if (!item?.deletedAt) throw errors.notFound("TRASH_ITEM");
      this.workspacePolicy.requireContentEditor(context, item);
      const parent = await this.repository.find(
        workspaceId,
        item.parentItemId,
        transaction,
        true,
      );
      if (
        !parent ||
        (parent.deletedAt && parent.deletionBatchId !== item.deletionBatchId)
      )
        throw new AppError(
          "RESTORE_PARENT_UNAVAILABLE",
          "Restore the parent folder first.",
          409,
        );
      if (
        await this.repository.findSibling(
          workspaceId,
          item.parentItemId,
          item.normalizedName,
          transaction,
          item.id,
        )
      )
        throw new AppError(
          "NAME_CONFLICT",
          "An active item already uses this name.",
          409,
        );
      await this.repository.restoreBatch(
        workspaceId,
        item.deletionBatchId,
        transaction,
      );
      item.deletedAt = null;
      item.deletedBy = null;
      item.deletionBatchId = null;
      return this.serialize(item);
    });
  }
  async permanentlyDelete(workspaceId, userId, itemId) {
    await this.sequelize.transaction(async (transaction) => {
      const context = await this.workspaceService.getContext(
        workspaceId,
        userId,
        transaction,
      );
      this.workspacePolicy.requireOwner(context);
      const item = await this.repository.findForUpdate(
        workspaceId,
        itemId,
        transaction,
        true,
      );
      if (!item?.deletedAt) throw errors.notFound("TRASH_ITEM");
      const documents = await this.repository.documentsForDeletionBatch(
        workspaceId,
        item.deletionBatchId,
        transaction,
      );
      for (const document of documents)
        await this.repository.createJob(
          {
            jobType: "DELETE_OBJECT",
            payload: { documentId: document.id, objectKey: document.objectKey },
            status: "PENDING",
            attempts: 0,
            availableAt: this.clock.now(),
          },
          transaction,
        );
    });
  }
  serialize(item) {
    const value = item.toJSON ? item.toJSON() : item;
    return {
      id: value.id,
      workspaceId: value.workspaceId,
      parentItemId: value.parentItemId,
      type: value.itemType,
      name: value.displayName,
      createdBy: value.createdBy,
      lockVersion: value.lockVersion,
      deletedAt: value.deletedAt,
      document: value.document
        ? {
            id: value.document.id,
            status: value.document.status,
            sizeBytes: Number(value.document.sizeBytes || 0),
            contentType:
              value.document.detectedContentType ||
              value.document.clientContentType,
          }
        : undefined,
    };
  }
}
