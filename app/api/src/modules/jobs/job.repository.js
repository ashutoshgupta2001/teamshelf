import { Op, QueryTypes } from "sequelize";

export class JobRepository {
  constructor(models, sequelize) {
    this.models = models;
    this.sequelize = sequelize;
  }
  async claim(workerId, now, staleBefore) {
    return this.sequelize.transaction(async (transaction) => {
      const [row] = await this.sequelize.query(
        `SELECT * FROM jobs
        WHERE (status='PENDING' AND available_at <= :now) OR (status='PROCESSING' AND locked_at < :staleBefore)
        ORDER BY available_at ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
        {
          replacements: { now, staleBefore },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      if (!row) return null;
      await this.models.Job.update(
        {
          status: "PROCESSING",
          lockedAt: now,
          lockedBy: workerId,
          attempts: row.attempts + 1,
        },
        { where: { id: row.id }, transaction },
      );
      return this.models.Job.findByPk(row.id, { transaction });
    });
  }
  save(job) {
    return job.save();
  }
  findDocument(id) {
    return this.models.Document.findByPk(id);
  }
  findEmail(id) {
    return this.models.EmailMessage.findByPk(id);
  }
  createEmailAttempt(values) {
    return this.models.EmailAttempt.create(values);
  }
  async pendingOutbox(limit = 25) {
    return this.models.OutboxEvent.findAll({
      where: { processedAt: null },
      order: [["occurredAt", "ASC"]],
      limit,
    });
  }
  async runMaintenance(now, trashCutoff) {
    const [invitationsExpired] = await this.models.Invitation.update(
      { revokedAt: now },
      {
        where: {
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { [Op.lte]: now },
        },
      },
    );
    const [bootstrapInvitationsExpired] =
      await this.models.BootstrapInvitation.update(
        { revokedAt: now },
        {
          where: {
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { [Op.lte]: now },
          },
        },
      );
    const [shareLinksExpired] = await this.models.ShareLink.update(
      { revokedAt: now },
      { where: { revokedAt: null, expiresAt: { [Op.lte]: now } } },
    );

    let uploadSessionsExpired = 0;
    let workspacesDeleted = 0;
    let deletionJobsQueued = 0;

    const expiredUploads = await this.models.UploadSession.findAll({
      where: { status: "CREATED", expiresAt: { [Op.lte]: now } },
      limit: 100,
    });
    for (const candidate of expiredUploads) {
      await this.sequelize.transaction(async (transaction) => {
        const upload = await this.models.UploadSession.findByPk(candidate.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!upload || upload.status !== "CREATED") return;
        const document = await this.models.Document.findByPk(
          upload.documentId,
          { transaction },
        );
        upload.status = "EXPIRED";
        document.status = "REJECTED";
        document.rejectionReason = "UPLOAD_EXPIRED";
        await upload.save({ transaction });
        await document.save({ transaction });
        if (await this.ensureDeletionJob(document, now, transaction))
          deletionJobsQueued += 1;
        uploadSessionsExpired += 1;
      });
    }

    const dueWorkspaces = await this.models.Workspace.findAll({
      where: {
        status: "PENDING_DELETION",
        deletionScheduledAt: { [Op.lte]: now },
      },
      limit: 20,
    });
    for (const candidate of dueWorkspaces) {
      await this.sequelize.transaction(async (transaction) => {
        const workspace = await this.models.Workspace.findByPk(candidate.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!workspace || workspace.status !== "PENDING_DELETION") return;
        await this.models.Item.update(
          {
            deletedAt: now,
            deletedBy: workspace.ownerUserId,
            deletionBatchId: workspace.id,
          },
          {
            where: { workspaceId: workspace.id, deletedAt: null },
            transaction,
          },
        );
        await this.models.ShareLink.update(
          { revokedAt: now },
          {
            where: { workspaceId: workspace.id, revokedAt: null },
            transaction,
          },
        );
        const documents = await this.models.Document.findAll({
          where: { workspaceId: workspace.id, status: { [Op.ne]: "DELETED" } },
          transaction,
        });
        for (const document of documents)
          if (await this.ensureDeletionJob(document, now, transaction))
            deletionJobsQueued += 1;
        workspace.status = "DELETED";
        await workspace.save({ transaction });
        workspacesDeleted += 1;
      });
    }

    const trashedDocuments = await this.models.Document.findAll({
      where: { status: { [Op.ne]: "DELETED" } },
      include: [
        {
          model: this.models.Item,
          as: "item",
          required: true,
          where: { deletedAt: { [Op.lte]: trashCutoff } },
        },
      ],
      limit: 100,
    });
    for (const document of trashedDocuments)
      if (await this.ensureDeletionJob(document, now)) deletionJobsQueued += 1;

    return {
      invitationsExpired,
      bootstrapInvitationsExpired,
      shareLinksExpired,
      uploadSessionsExpired,
      workspacesDeleted,
      deletionJobsQueued,
    };
  }
  async ensureDeletionJob(document, now, transaction) {
    const existing = await this.models.Job.findOne({
      where: {
        jobType: "DELETE_OBJECT",
        status: { [Op.in]: ["PENDING", "PROCESSING", "COMPLETED"] },
        payload: { [Op.contains]: { documentId: document.id } },
      },
      transaction,
    });
    if (existing) return false;
    await this.models.Job.create(
      {
        jobType: "DELETE_OBJECT",
        payload: { documentId: document.id, objectKey: document.objectKey },
        status: "PENDING",
        attempts: 0,
        availableAt: now,
      },
      { transaction },
    );
    return true;
  }
  async markDocumentDeleted(documentId) {
    await this.sequelize.transaction(async (transaction) => {
      const document = await this.models.Document.findByPk(documentId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!document || document.status === "DELETED") return;
      const workspace = await this.models.Workspace.findByPk(
        document.workspaceId,
        { transaction, lock: transaction.LOCK.UPDATE },
      );
      workspace.storageUsedBytes = Math.max(
        0,
        Number(workspace.storageUsedBytes) - Number(document.sizeBytes || 0),
      );
      document.status = "DELETED";
      await document.save({ transaction });
      await workspace.save({ transaction });
    });
  }
}
