import { describe, expect, it, vi } from "vitest";
import { WorkerService } from "./worker.service.js";

const now = new Date("2026-01-01T00:00:00Z");

function subject(attempts, maxAttempts) {
  const job = {
    id: "job-1",
    jobType: "SEND_EMAIL",
    payload: { emailMessageId: "message-1" },
    attempts,
    status: "PROCESSING",
  };
  const message = {
    id: "message-1",
    recipientEmail: "member@example.com",
    subject: "Invitation",
    templateName: "workspace-invitation",
    templateData: {
      workspaceName: "Docs",
      invitationUrl: "https://example.test/i",
    },
    status: "PENDING",
  };
  const repository = {
    claim: vi.fn().mockResolvedValueOnce(job),
    findEmail: vi.fn().mockResolvedValue(message),
    createEmailAttempt: vi.fn(),
    save: vi.fn(),
    runMaintenance: vi.fn(),
    pendingOutbox: vi.fn().mockResolvedValue([]),
  };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const mail = {
    send: vi.fn().mockRejectedValue(new Error("temporary SMTP failure")),
  };
  const worker = new WorkerService({
    repository,
    storage: {},
    inspector: {},
    mail,
    clock: {
      now: () => new Date(now),
      addDays: (days, from) => new Date(from.getTime() + days * 86_400_000),
    },
    logger,
    maxAttempts,
    lockTimeoutSeconds: 120,
    trashRetentionDays: 30,
  });
  return { worker, job, message, repository, logger, mail };
}

describe("email job retry rules", () => {
  it("logs successful delivery and job completion without recipient data", async () => {
    const { worker, job, logger, mail } = subject(1, 3);
    mail.send.mockResolvedValue({ providerMessageId: "provider-1" });

    await worker.tick();

    expect(job.status).toBe("COMPLETED");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "email.accepted_by_smtp",
        emailMessageId: "message-1",
      }),
      "email accepted by SMTP provider",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "job.completed", jobId: job.id }),
      "job completed",
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
      "member@example.com",
    );
  });

  it("backs off a temporary failure", async () => {
    const { worker, job, message, repository, logger } = subject(1, 3);
    await worker.tick();
    expect(job.status).toBe("PENDING");
    expect(job.availableAt).toEqual(new Date("2026-01-01T00:00:20Z"));
    expect(message.status).toBe("PENDING");
    expect(repository.createEmailAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED", attemptNumber: 1 }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "job.retry_scheduled",
        jobId: job.id,
      }),
      "job retry scheduled",
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("stops after the configured attempt limit", async () => {
    const { worker, job, message, logger } = subject(3, 3);
    await worker.tick();
    expect(job.status).toBe("FAILED");
    expect(message.status).toBe("FAILED");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "job.failed",
        jobId: job.id,
        maxAttempts: 3,
      }),
      "job permanently failed",
    );
  });
});
