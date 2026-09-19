import { AppError, errors } from "../../common/errors/app-error.js";
import { prepareItemName } from "../items/item-rules.js";

export class WorkspaceService {
  constructor({
    sequelize,
    repository,
    itemRepository,
    policy,
    clock,
    tokens,
  }) {
    Object.assign(this, {
      sequelize,
      repository,
      itemRepository,
      policy,
      clock,
      tokens,
    });
  }
  async create(userId, name, audit = {}) {
    return this.sequelize.transaction((transaction) =>
      this.createWithinTransaction(userId, name, audit, transaction),
    );
  }
  async createWithinTransaction(userId, name, audit, transaction) {
    const prepared = prepareItemName(name);
    const workspace = await this.repository.create(
      {
        name: prepared.displayName,
        ownerUserId: userId,
        status: "ACTIVE",
        storageUsedBytes: 0,
      },
      transaction,
    );
    const root = await this.itemRepository.create(
      {
        workspaceId: workspace.id,
        parentItemId: null,
        itemType: "ROOT",
        displayName: prepared.displayName,
        normalizedName: prepared.normalizedName,
        createdBy: userId,
      },
      transaction,
    );
    workspace.rootItemId = root.id;
    await this.repository.save(workspace, transaction);
    await this.repository.createMembership(
      { workspaceId: workspace.id, userId, joinedAt: this.clock.now() },
      transaction,
    );
    await this.repository.audit(
      {
        workspaceId: workspace.id,
        actorUserId: userId,
        action: "WORKSPACE_CREATED",
        targetType: "WORKSPACE",
        targetId: workspace.id,
        metadata: {},
        occurredAt: this.clock.now(),
        ...audit,
      },
      transaction,
    );
    return this.serialize(workspace);
  }
  async list(userId) {
    const rows = await this.repository.listForUser(userId);
    return rows.map((row) => this.serialize(row.Workspace));
  }
  async getContext(workspaceId, userId, transaction) {
    const context = await this.repository.context(
      workspaceId,
      userId,
      transaction,
    );
    if (!context?.membership) throw errors.notFound("WORKSPACE");
    this.policy.requireMember(context);
    return context;
  }
  async get(workspaceId, userId) {
    return this.serialize(
      (await this.getContext(workspaceId, userId)).workspace,
    );
  }
  async rename(workspaceId, userId, name) {
    const context = await this.getContext(workspaceId, userId);
    this.policy.requireOwner(context);
    context.workspace.name = prepareItemName(name).displayName;
    await this.repository.save(context.workspace);
    return this.serialize(context.workspace);
  }
  async members(workspaceId, userId) {
    const context = await this.getContext(workspaceId, userId);
    this.policy.requireMember(context);
    return this.repository.listMembers(workspaceId);
  }
  async removeMember(workspaceId, actorId, userId) {
    await this.sequelize.transaction(async (transaction) => {
      const context = await this.getContext(workspaceId, actorId, transaction);
      this.policy.requireOwner(context);
      if (context.workspace.ownerUserId === userId)
        throw new AppError(
          "OWNER_CANNOT_BE_REMOVED",
          "Transfer ownership before removing the owner.",
          409,
        );
      const membership = await this.repository.findMembership(
        workspaceId,
        userId,
        transaction,
      );
      if (!membership) throw errors.notFound("MEMBER");
      await this.repository.deleteMembership(membership, transaction);
      await this.repository.revokeUserSessions(userId, transaction);
      await this.repository.revokeLinksByCreator(
        workspaceId,
        userId,
        transaction,
      );
      await this.repository.outbox(
        {
          eventType: "MemberRemoved",
          aggregateType: "WORKSPACE",
          aggregateId: workspaceId,
          payload: { userId },
          occurredAt: this.clock.now(),
        },
        transaction,
      );
    });
  }
  async transfer(workspaceId, actorId, newOwnerId) {
    await this.sequelize.transaction(async (transaction) => {
      const context = await this.getContext(workspaceId, actorId, transaction);
      this.policy.requireOwner(context);
      const membership = await this.repository.findMembership(
        workspaceId,
        newOwnerId,
        transaction,
      );
      if (!membership)
        throw new AppError(
          "NEW_OWNER_NOT_MEMBER",
          "The new owner must already be a member.",
          400,
        );
      context.workspace.ownerUserId = newOwnerId;
      await this.repository.save(context.workspace, transaction);
      await this.repository.outbox(
        {
          eventType: "OwnershipTransferred",
          aggregateType: "WORKSPACE",
          aggregateId: workspaceId,
          payload: { previousOwnerId: actorId, newOwnerId },
          occurredAt: this.clock.now(),
        },
        transaction,
      );
    });
  }
  async scheduleDeletion(workspaceId, userId) {
    const context = await this.getContext(workspaceId, userId);
    this.policy.requireOwner(context);
    context.workspace.status = "PENDING_DELETION";
    context.workspace.deletionScheduledAt = this.clock.addDays(30);
    await this.repository.save(context.workspace);
    return this.serialize(context.workspace);
  }
  async cancelDeletion(workspaceId, userId) {
    const context = await this.getContext(workspaceId, userId);
    this.policy.requireOwner(context);
    context.workspace.status = "ACTIVE";
    context.workspace.deletionScheduledAt = null;
    await this.repository.save(context.workspace);
    return this.serialize(context.workspace);
  }
  serialize(w) {
    return {
      id: w.id,
      name: w.name,
      ownerUserId: w.ownerUserId,
      rootItemId: w.rootItemId,
      status: w.status,
      storageUsedBytes: Number(w.storageUsedBytes),
      deletionScheduledAt: w.deletionScheduledAt,
    };
  }
}
