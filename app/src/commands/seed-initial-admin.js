import {
  emailSchema,
  invitationPasswordSchema,
  itemNameSchema,
} from "@teamshelf/contracts";
import { createContainer } from "../bootstrap/container.js";

const container = createContainer();

try {
  const email = emailSchema.parse(container.config.get("initialAdmin.email"));
  const { displayName, password } = invitationPasswordSchema.parse({
    displayName: container.config.get("initialAdmin.displayName"),
    password: container.config.get("initialAdmin.password"),
  });
  const workspaceName = itemNameSchema.parse(
    container.config.get("initialAdmin.workspaceName"),
  );
  const result = await container.services.bootstrapAdminService.seed({
    email,
    password,
    displayName,
    workspaceName,
  });

  container.logger.info(
    {
      event: result.created
        ? "initial_admin.created"
        : "initial_admin.already_exists",
      userId: result.userId,
      workspaceId: result.workspaceId || undefined,
    },
    result.created
      ? "initial admin and workspace created"
      : "initial admin already exists; seed skipped",
  );
} catch (error) {
  container.logger.error(
    { event: "initial_admin.seed_failed", err: error },
    "initial admin seed failed; set valid INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD values",
  );
  process.exitCode = 1;
} finally {
  await container.sequelize.close();
}
