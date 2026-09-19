import { config } from "../config/config.js";
import { logger } from "../common/logging/logger.js";
import {
  CryptoTokenGenerator,
  SystemClock,
} from "../common/security/tokens.js";
import { sequelize } from "../infrastructure/database/sequelize.js";
import { defineModels } from "../infrastructure/database/models.js";
import { Argon2PasswordHasher } from "../infrastructure/security/password-hasher.js";
import { GoogleIdentityAdapter } from "../infrastructure/google/google-identity-adapter.js";
import { LocalFileStorageAdapter } from "../infrastructure/storage/local-file-storage-adapter.js";
import { GcsFileStorageAdapter } from "../infrastructure/storage/gcs-file-storage-adapter.js";
import { SmtpMailAdapter } from "../infrastructure/mail/smtp-mail-adapter.js";
import { ClamAvFileInspectionAdapter } from "../infrastructure/scanning/clamav-file-inspection-adapter.js";
import { AuthRepository } from "../modules/auth/auth.repository.js";
import { InvitationRepository } from "../modules/invitations/invitation.repository.js";
import { WorkspaceRepository } from "../modules/workspaces/workspace.repository.js";
import { ItemRepository } from "../modules/items/item.repository.js";
import { DocumentRepository } from "../modules/documents/document.repository.js";
import { JobRepository } from "../modules/jobs/job.repository.js";
import { UserRepository } from "../modules/users/user.repository.js";
import { WorkspacePolicy } from "../modules/workspaces/workspace.policy.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { WorkspaceService } from "../modules/workspaces/workspace.service.js";
import { InvitationService } from "../modules/invitations/invitation.service.js";
import { ItemService } from "../modules/items/item.service.js";
import { DocumentService } from "../modules/documents/document.service.js";
import { WorkerService } from "../modules/jobs/worker.service.js";
import { UserService } from "../modules/users/user.service.js";
import { BootstrapAdminService } from "../modules/bootstrap/bootstrap-admin.service.js";

export function createContainer(overrides = {}) {
  const models = overrides.models || defineModels(sequelize);
  const tokens =
    overrides.tokens || new CryptoTokenGenerator(config.get("session.secret"));
  const clock = overrides.clock || new SystemClock();
  const authRepository = new AuthRepository(models);
  const invitationRepository = new InvitationRepository(models);
  const workspaceRepository = new WorkspaceRepository(models);
  const itemRepository = new ItemRepository(models, sequelize);
  const documentRepository = new DocumentRepository(models);
  const jobRepository = new JobRepository(models, sequelize);
  const userRepository = new UserRepository(models);
  const workspacePolicy = new WorkspacePolicy();
  const storageSettings = {
    rootPath: config.get("storage.localPath"),
    baseUrl: config.get("app.baseUrl"),
    secret: config.get("session.secret"),
    uploadTtlSeconds: config.get("storage.uploadTtlSeconds"),
    downloadTtlSeconds: config.get("storage.downloadTtlSeconds"),
  };
  const storage =
    overrides.storage ||
    (config.get("storage.provider") === "gcs"
      ? new GcsFileStorageAdapter({
          projectId: config.get("storage.gcs.projectId"),
          bucket: config.get("storage.gcs.bucket"),
          keyFilename: config.get("storage.gcs.keyFile"),
          uploadTtlSeconds: config.get("storage.uploadTtlSeconds"),
          downloadTtlSeconds: config.get("storage.downloadTtlSeconds"),
        })
      : new LocalFileStorageAdapter(storageSettings));
  const mail =
    overrides.mail ||
    new SmtpMailAdapter({
      host: config.get("smtp.host"),
      port: config.get("smtp.port"),
      secure: config.get("smtp.secure"),
      username: config.get("smtp.username"),
      password: config.get("smtp.password"),
      fromAddress: config.get("smtp.fromAddress"),
      fromName: config.get("smtp.fromName"),
    });
  const passwordHasher = overrides.passwordHasher || new Argon2PasswordHasher();
  const googleIdentity =
    overrides.googleIdentity ||
    new GoogleIdentityAdapter(config.get("google.clientId"));
  const workspaceService = new WorkspaceService({
    sequelize,
    repository: workspaceRepository,
    itemRepository,
    policy: workspacePolicy,
    clock,
    tokens,
  });
  const authService = new AuthService({
    sequelize,
    authRepository,
    invitationRepository,
    workspaceRepository,
    passwordHasher,
    googleIdentity,
    tokens,
    clock,
    sessionTtlDays: config.get("session.ttlDays"),
    webBaseUrl: config.get("app.webBaseUrl"),
  });
  const invitationService = new InvitationService({
    sequelize,
    repository: invitationRepository,
    authRepository,
    workspaceRepository,
    workspaceService,
    policy: workspacePolicy,
    passwordHasher,
    tokens,
    clock,
    expiryDays: config.get("lifecycle.invitationExpiryDays"),
    webBaseUrl: config.get("app.webBaseUrl"),
  });
  const itemService = new ItemService({
    sequelize,
    repository: itemRepository,
    workspaceService,
    workspacePolicy,
    workspaceRepository,
    tokens,
    clock,
  });
  const documentService = new DocumentService({
    sequelize,
    repository: documentRepository,
    itemRepository,
    workspaceService,
    workspacePolicy,
    workspaceRepository,
    storage,
    tokens,
    clock,
    config: {
      provider: config.get("storage.provider"),
      maxFileSizeMb: config.get("storage.maxFileSizeMb"),
      workspaceLimitGb: config.get("storage.workspaceLimitGb"),
      allowedMimeTypes: config.get("storage.allowedMimeTypes"),
      uploadTtlSeconds: config.get("storage.uploadTtlSeconds"),
      shareDefaultExpiryDays: config.get("lifecycle.shareDefaultExpiryDays"),
      shareMaxExpiryDays: config.get("lifecycle.shareMaxExpiryDays"),
    },
  });
  const inspector =
    overrides.inspector ||
    new ClamAvFileInspectionAdapter({
      host: config.get("jobs.clamavHost"),
      port: config.get("jobs.clamavPort"),
      allowedMimeTypes: config.get("storage.allowedMimeTypes"),
    });
  const workerService = new WorkerService({
    repository: jobRepository,
    storage,
    inspector,
    mail,
    clock,
    logger,
    maxAttempts: config.get("jobs.maxAttempts"),
    lockTimeoutSeconds: config.get("jobs.lockTimeoutSeconds"),
    trashRetentionDays: config.get("lifecycle.trashRetentionDays"),
  });
  const userService = new UserService({
    sequelize,
    repository: userRepository,
  });
  const bootstrapAdminService = new BootstrapAdminService({
    sequelize,
    authRepository,
    workspaceService,
    passwordHasher,
  });
  return {
    config,
    logger,
    sequelize,
    models,
    tokens,
    clock,
    storage,
    mail,
    repositories: {
      authRepository,
      invitationRepository,
      workspaceRepository,
      itemRepository,
      documentRepository,
      jobRepository,
      userRepository,
    },
    services: {
      authService,
      workspaceService,
      invitationService,
      itemService,
      documentService,
      workerService,
      userService,
      bootstrapAdminService,
    },
  };
}
