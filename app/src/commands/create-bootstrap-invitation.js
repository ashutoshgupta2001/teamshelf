import { emailSchema } from "@teamshelf/contracts";
import { createContainer } from "../bootstrap/container.js";

const container = createContainer();
const emailArg = process.argv.find((value) => value.startsWith("--email="));
const emailIndex = process.argv.indexOf("--email");
const value =
  emailArg?.slice("--email=".length) ||
  (emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined);
if (!value)
  throw new Error(
    "Usage: npm run admin:create-bootstrap-invitation -- --email owner@example.com",
  );
const email = emailSchema.parse(value);
const { invitationRepository } = container.repositories;
const rawToken = container.tokens.generate();
let invitationId;
try {
  await container.sequelize.transaction(async (transaction) => {
    let invitation = await invitationRepository.findPendingBootstrap(
      email,
      transaction,
    );
    if (invitation) {
      invitation.tokenHash = container.tokens.hash(rawToken);
      invitation.expiresAt = container.clock.addDays(
        container.config.get("lifecycle.invitationExpiryDays"),
      );
      await invitationRepository.save(invitation, transaction);
    } else
      invitation = await invitationRepository.createBootstrap(
        {
          invitedEmail: email,
          normalizedEmail: email,
          tokenHash: container.tokens.hash(rawToken),
          expiresAt: container.clock.addDays(
            container.config.get("lifecycle.invitationExpiryDays"),
          ),
        },
        transaction,
      );
    invitationId = invitation.id;
    const message = await invitationRepository.createEmail(
      {
        messageType: "BOOTSTRAP_INVITATION",
        recipientEmail: email,
        subject: "Your TeamShelf invitation",
        templateName: "workspace-invitation",
        templateVersion: 1,
        templateData: {
          workspaceName: "TeamShelf",
          invitationUrl: `${container.config.get("app.webBaseUrl")}/invite?token=${encodeURIComponent(rawToken)}`,
        },
        relatedEntityType: "BOOTSTRAP_INVITATION",
        relatedEntityId: invitation.id,
        status: "PENDING",
      },
      transaction,
    );
    await invitationRepository.createJob(
      {
        jobType: "SEND_EMAIL",
        payload: { emailMessageId: message.id },
        status: "PENDING",
        attempts: 0,
        availableAt: container.clock.now(),
      },
      transaction,
    );
    await container.repositories.workspaceRepository.audit(
      {
        action: "BOOTSTRAP_INVITATION_CREATED",
        targetType: "BOOTSTRAP_INVITATION",
        targetId: invitation.id,
        metadata: { email },
        occurredAt: container.clock.now(),
      },
      transaction,
    );
  });
  container.logger.info(
    { event: "bootstrap_invitation.queued", invitationId },
    "bootstrap invitation queued",
  );
} catch (error) {
  container.logger.error(
    { event: "bootstrap_invitation.failed", err: error },
    "bootstrap invitation failed",
  );
  throw error;
} finally {
  await container.sequelize.close();
}
