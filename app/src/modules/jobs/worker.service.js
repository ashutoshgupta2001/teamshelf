import os from "node:os";
import crypto from "node:crypto";

function emailBody(message) {
  const data = message.templateData;
  if (message.templateName === "workspace-invitation")
    return {
      text: `You have been invited to ${data.workspaceName}. Accept the invitation: ${data.invitationUrl}`,
      html: `<p>You have been invited to <strong>${escapeHtml(data.workspaceName)}</strong>.</p><p><a href="${escapeHtml(data.invitationUrl)}">Accept invitation</a></p>`,
    };
  if (message.templateName === "platform-invitation")
    return {
      text: `You have been invited to TeamShelf. Accept the invitation: ${data.invitationUrl}`,
      html: `<p>You have been invited to TeamShelf.</p><p><a href="${escapeHtml(data.invitationUrl)}">Accept invitation</a></p>`,
    };
  if (message.templateName === "password-reset")
    return {
      text: `Reset your password: ${data.resetUrl}`,
      html: `<p><a href="${escapeHtml(data.resetUrl)}">Reset your password</a></p>`,
    };
  return {
    text: message.subject,
    html: `<p>${escapeHtml(message.subject)}</p>`,
  };
}
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

export class WorkerService {
  constructor({
    repository,
    storage,
    inspector,
    mail,
    clock,
    logger,
    maxAttempts,
    lockTimeoutSeconds,
    trashRetentionDays,
  }) {
    Object.assign(this, {
      repository,
      storage,
      inspector,
      mail,
      clock,
      logger,
      maxAttempts,
      lockTimeoutSeconds,
      trashRetentionDays,
    });
    this.workerId = `${os.hostname()}:${process.pid}`;
    this.lastMaintenanceAt = 0;
  }
  async tick() {
    const now = this.clock.now();
    const staleBefore = new Date(
      now.getTime() - this.lockTimeoutSeconds * 1000,
    );
    const job = await this.repository.claim(this.workerId, now, staleBefore);
    if (!job) {
      await this.runMaintenance();
      await this.processOutbox();
      return false;
    }
    this.logger.debug(
      {
        event: "job.claimed",
        jobId: job.id,
        jobType: job.jobType,
        attempt: job.attempts,
      },
      "job claimed",
    );
    let failure;
    try {
      await this.handle(job);
      job.status = "COMPLETED";
      job.completedAt = this.clock.now();
      job.lastError = null;
    } catch (error) {
      job.lastError = String(error.message).slice(0, 1000);
      if (job.attempts >= this.maxAttempts) {
        job.status = "FAILED";
        if (job.jobType === "SEND_EMAIL") {
          const message = await this.repository.findEmail(
            job.payload.emailMessageId,
          );
          if (message) {
            message.status = "FAILED";
            await this.repository.save(message);
          }
        }
        failure = { error, permanent: true };
      } else {
        job.status = "PENDING";
        job.availableAt = new Date(
          this.clock.now().getTime() +
            Math.min(3600, 2 ** job.attempts * 10) * 1000,
        );
        failure = { error, permanent: false };
      }
    }
    job.lockedAt = null;
    job.lockedBy = null;
    await this.repository.save(job);
    if (!failure) {
      this.logger.info(
        {
          event: "job.completed",
          jobId: job.id,
          jobType: job.jobType,
          attempt: job.attempts,
        },
        "job completed",
      );
    } else if (failure.permanent) {
      this.logger.error(
        {
          event: "job.failed",
          err: failure.error,
          jobId: job.id,
          jobType: job.jobType,
          attempt: job.attempts,
          maxAttempts: this.maxAttempts,
        },
        "job permanently failed",
      );
    } else {
      this.logger.warn(
        {
          event: "job.retry_scheduled",
          err: failure.error,
          jobId: job.id,
          jobType: job.jobType,
          attempt: job.attempts,
          nextAttemptAt: job.availableAt,
        },
        "job retry scheduled",
      );
    }
    return true;
  }
  async handle(job) {
    if (job.jobType === "SEND_EMAIL") return this.sendEmail(job);
    if (job.jobType === "INSPECT_FILE") return this.inspectFile(job);
    if (job.jobType === "DELETE_OBJECT") return this.deleteObject(job);
    throw new Error(`Unknown job type: ${job.jobType}`);
  }
  async inspectFile(job) {
    const document = await this.repository.findDocument(job.payload.documentId);
    if (!document || !["SCANNING", "SCAN_FAILED"].includes(document.status)) {
      this.logger.debug(
        {
          event: "document.inspection_skipped",
          jobId: job.id,
          documentId: job.payload.documentId,
          documentStatus: document?.status,
        },
        "document inspection skipped",
      );
      return;
    }
    try {
      const bytes = await this.storage.readObject({
        objectKey: document.objectKey,
      });
      if (
        document.checksumSha256 &&
        crypto.createHash("sha256").update(bytes).digest("hex") !==
          document.checksumSha256
      ) {
        document.status = "REJECTED";
        document.rejectionReason = "CHECKSUM_MISMATCH";
        await this.repository.save(document);
        this.logger.info(
          {
            event: "document.inspected",
            jobId: job.id,
            documentId: document.id,
            documentStatus: document.status,
            rejectionReason: document.rejectionReason,
          },
          "document inspection completed",
        );
        return;
      }
      const result = await this.inspector.inspect(bytes);
      document.detectedContentType = result.detectedContentType;
      document.status = result.accepted ? "AVAILABLE" : "REJECTED";
      document.rejectionReason = result.reason || null;
      await this.repository.save(document);
      this.logger.info(
        {
          event: "document.inspected",
          jobId: job.id,
          documentId: document.id,
          documentStatus: document.status,
          detectedContentType: document.detectedContentType,
          rejectionReason: document.rejectionReason,
        },
        "document inspection completed",
      );
    } catch (error) {
      document.status = "SCAN_FAILED";
      document.rejectionReason = "INSPECTION_UNAVAILABLE";
      await this.repository.save(document);
      throw error;
    }
  }
  async sendEmail(job) {
    const message = await this.repository.findEmail(job.payload.emailMessageId);
    if (!message || message.status === "SENT") return;
    message.status = "PROCESSING";
    await this.repository.save(message);
    try {
      const result = await this.mail.send({
        to: message.recipientEmail,
        subject: message.subject,
        ...emailBody(message),
      });
      await this.repository.createEmailAttempt({
        emailMessageId: message.id,
        attemptNumber: job.attempts,
        status: "SENT",
        attemptedAt: this.clock.now(),
      });
      message.status = "SENT";
      message.sentAt = this.clock.now();
      message.providerMessageId = result.providerMessageId;
      message.templateData = { sensitiveDataRemoved: true };
      await this.repository.save(message);
      this.logger.info(
        {
          event: "email.accepted_by_smtp",
          jobId: job.id,
          emailMessageId: message.id,
          attempt: job.attempts,
          providerMessageId: message.providerMessageId,
        },
        "email accepted by SMTP provider",
      );
    } catch (error) {
      await this.repository.createEmailAttempt({
        emailMessageId: message.id,
        attemptNumber: job.attempts,
        status: "FAILED",
        errorCode: error.code || "SMTP_ERROR",
        sanitizedErrorMessage: String(error.message).slice(0, 500),
        attemptedAt: this.clock.now(),
      });
      message.status = "PENDING";
      await this.repository.save(message);
      throw error;
    }
  }
  async deleteObject(job) {
    await this.storage.deleteObject(job.payload);
    await this.repository.markDocumentDeleted(job.payload.documentId);
    this.logger.info(
      {
        event: "document.object_deleted",
        jobId: job.id,
        documentId: job.payload.documentId,
      },
      "document object deleted",
    );
  }
  async runMaintenance() {
    const now = this.clock.now();
    if (now.getTime() - this.lastMaintenanceAt < 300_000) return;
    this.lastMaintenanceAt = now.getTime();
    const summary = await this.repository.runMaintenance(
      now,
      this.clock.addDays(-this.trashRetentionDays, now),
    );
    if (!summary) return;
    const changes = Object.values(summary).reduce(
      (total, value) => total + Number(value),
      0,
    );
    const fields = { event: "maintenance.completed", ...summary };
    if (changes > 0)
      this.logger.info(fields, "maintenance completed with changes");
    else this.logger.debug(fields, "maintenance completed");
  }
  async processOutbox() {
    const events = await this.repository.pendingOutbox();
    for (const event of events) {
      event.processedAt = this.clock.now();
      await this.repository.save(event);
      this.logger.debug(
        {
          event: "outbox.processed",
          outboxEventId: event.id,
          eventType: event.eventType,
        },
        "outbox event processed",
      );
    }
    if (events.length > 0)
      this.logger.info(
        { event: "outbox.batch_processed", count: events.length },
        "outbox batch processed",
      );
  }
}
