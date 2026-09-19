import { DataTypes } from "sequelize";

export function defineModels(sequelize) {
  const common = {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
  };
  const User = sequelize.define(
    "User",
    {
      ...common,
      primaryEmail: { type: DataTypes.STRING(320), allowNull: false },
      normalizedEmail: {
        type: DataTypes.STRING(320),
        allowNull: false,
        unique: true,
      },
      displayName: { type: DataTypes.STRING(120), allowNull: false },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "ACTIVE",
      },
      platformRole: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "USER",
      },
    },
    { tableName: "users" },
  );
  const AuthIdentity = sequelize.define(
    "AuthIdentity",
    {
      ...common,
      userId: { type: DataTypes.UUID, allowNull: false },
      provider: { type: DataTypes.STRING(20), allowNull: false },
      providerSubject: { type: DataTypes.STRING, allowNull: false },
      providerEmail: DataTypes.STRING(320),
      passwordHash: DataTypes.TEXT,
    },
    { tableName: "auth_identities" },
  );
  const Session = sequelize.define(
    "Session",
    {
      ...common,
      userId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      csrfToken: { type: DataTypes.STRING(128), allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      lastSeenAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: DataTypes.DATE,
    },
    { tableName: "sessions", updatedAt: false },
  );
  const PasswordResetToken = sequelize.define(
    "PasswordResetToken",
    {
      ...common,
      userId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      usedAt: DataTypes.DATE,
    },
    { tableName: "password_reset_tokens", updatedAt: false },
  );
  const BootstrapInvitation = sequelize.define(
    "BootstrapInvitation",
    {
      ...common,
      invitedEmail: { type: DataTypes.STRING(320), allowNull: false },
      normalizedEmail: { type: DataTypes.STRING(320), allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      acceptedAt: DataTypes.DATE,
      revokedAt: DataTypes.DATE,
    },
    { tableName: "bootstrap_invitations", updatedAt: false },
  );
  const PlatformInvitation = sequelize.define(
    "PlatformInvitation",
    {
      ...common,
      invitedEmail: { type: DataTypes.STRING(320), allowNull: false },
      normalizedEmail: { type: DataTypes.STRING(320), allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      platformRole: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "USER",
      },
      invitedBy: { type: DataTypes.UUID, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      acceptedAt: DataTypes.DATE,
      revokedAt: DataTypes.DATE,
    },
    { tableName: "platform_invitations", updatedAt: false },
  );
  const Workspace = sequelize.define(
    "Workspace",
    {
      ...common,
      name: { type: DataTypes.STRING(255), allowNull: false },
      ownerUserId: { type: DataTypes.UUID, allowNull: false },
      rootItemId: DataTypes.UUID,
      status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "ACTIVE",
      },
      storageUsedBytes: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      deletionScheduledAt: DataTypes.DATE,
    },
    { tableName: "workspaces" },
  );
  const Membership = sequelize.define(
    "Membership",
    {
      ...common,
      workspaceId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      joinedAt: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "workspace_memberships", timestamps: false },
  );
  const Invitation = sequelize.define(
    "Invitation",
    {
      ...common,
      workspaceId: { type: DataTypes.UUID, allowNull: false },
      invitedEmail: { type: DataTypes.STRING(320), allowNull: false },
      normalizedEmail: { type: DataTypes.STRING(320), allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      invitedBy: { type: DataTypes.UUID, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      acceptedAt: DataTypes.DATE,
      revokedAt: DataTypes.DATE,
    },
    { tableName: "workspace_invitations", updatedAt: false },
  );
  const Item = sequelize.define(
    "Item",
    {
      ...common,
      workspaceId: { type: DataTypes.UUID, allowNull: false },
      parentItemId: DataTypes.UUID,
      itemType: { type: DataTypes.STRING(20), allowNull: false },
      displayName: { type: DataTypes.STRING(255), allowNull: false },
      normalizedName: { type: DataTypes.STRING(255), allowNull: false },
      createdBy: { type: DataTypes.UUID, allowNull: false },
      lockVersion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      deletedAt: DataTypes.DATE,
      deletedBy: DataTypes.UUID,
      deletionBatchId: DataTypes.UUID,
    },
    { tableName: "workspace_items" },
  );
  const Document = sequelize.define(
    "Document",
    {
      ...common,
      itemId: { type: DataTypes.UUID, allowNull: false, unique: true },
      workspaceId: { type: DataTypes.UUID, allowNull: false },
      originalFilename: { type: DataTypes.STRING(255), allowNull: false },
      storageProvider: { type: DataTypes.STRING(20), allowNull: false },
      storageContainer: { type: DataTypes.STRING, allowNull: false },
      objectKey: { type: DataTypes.STRING, allowNull: false },
      clientContentType: { type: DataTypes.STRING(255), allowNull: false },
      detectedContentType: DataTypes.STRING(255),
      sizeBytes: DataTypes.BIGINT,
      checksumSha256: DataTypes.STRING(64),
      status: { type: DataTypes.STRING(30), allowNull: false },
      rejectionReason: DataTypes.STRING,
    },
    { tableName: "documents" },
  );
  const UploadSession = sequelize.define(
    "UploadSession",
    {
      ...common,
      documentId: { type: DataTypes.UUID, allowNull: false },
      workspaceId: { type: DataTypes.UUID, allowNull: false },
      expectedSizeBytes: { type: DataTypes.BIGINT, allowNull: false },
      expectedContentType: { type: DataTypes.STRING(255), allowNull: false },
      expectedChecksum: DataTypes.STRING(64),
      status: { type: DataTypes.STRING(20), allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      completedAt: DataTypes.DATE,
      createdBy: { type: DataTypes.UUID, allowNull: false },
    },
    { tableName: "upload_sessions", updatedAt: false },
  );
  const ShareLink = sequelize.define(
    "ShareLink",
    {
      ...common,
      documentId: { type: DataTypes.UUID, allowNull: false },
      workspaceId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      allowDownload: { type: DataTypes.BOOLEAN, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: DataTypes.DATE,
      lastAccessedAt: DataTypes.DATE,
      accessCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdBy: { type: DataTypes.UUID, allowNull: false },
    },
    { tableName: "share_links", updatedAt: false },
  );
  const EmailMessage = sequelize.define(
    "EmailMessage",
    {
      ...common,
      messageType: { type: DataTypes.STRING(50), allowNull: false },
      workspaceId: DataTypes.UUID,
      recipientEmail: { type: DataTypes.STRING(320), allowNull: false },
      subject: { type: DataTypes.STRING, allowNull: false },
      templateName: { type: DataTypes.STRING, allowNull: false },
      templateVersion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      templateData: { type: DataTypes.JSONB, allowNull: false },
      relatedEntityType: DataTypes.STRING,
      relatedEntityId: DataTypes.UUID,
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "PENDING",
      },
      providerMessageId: DataTypes.STRING,
      sentAt: DataTypes.DATE,
    },
    { tableName: "email_messages", updatedAt: false },
  );
  const EmailAttempt = sequelize.define(
    "EmailAttempt",
    {
      ...common,
      emailMessageId: { type: DataTypes.UUID, allowNull: false },
      attemptNumber: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false },
      errorCode: DataTypes.STRING,
      sanitizedErrorMessage: DataTypes.STRING,
      attemptedAt: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "email_delivery_attempts", timestamps: false },
  );
  const Job = sequelize.define(
    "Job",
    {
      ...common,
      jobType: { type: DataTypes.STRING(50), allowNull: false },
      payload: { type: DataTypes.JSONB, allowNull: false },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "PENDING",
      },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      availableAt: { type: DataTypes.DATE, allowNull: false },
      lockedAt: DataTypes.DATE,
      lockedBy: DataTypes.STRING,
      lastError: DataTypes.STRING,
      completedAt: DataTypes.DATE,
    },
    { tableName: "jobs", updatedAt: false },
  );
  const OutboxEvent = sequelize.define(
    "OutboxEvent",
    {
      ...common,
      eventType: { type: DataTypes.STRING(80), allowNull: false },
      aggregateType: { type: DataTypes.STRING(40), allowNull: false },
      aggregateId: { type: DataTypes.UUID, allowNull: false },
      payload: { type: DataTypes.JSONB, allowNull: false },
      occurredAt: { type: DataTypes.DATE, allowNull: false },
      processedAt: DataTypes.DATE,
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lastError: DataTypes.STRING,
    },
    { tableName: "outbox_events", timestamps: false },
  );
  const AuditEvent = sequelize.define(
    "AuditEvent",
    {
      ...common,
      workspaceId: DataTypes.UUID,
      actorUserId: DataTypes.UUID,
      action: { type: DataTypes.STRING(80), allowNull: false },
      targetType: { type: DataTypes.STRING(40), allowNull: false },
      targetId: DataTypes.UUID,
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      requestId: DataTypes.UUID,
      sourceIp: DataTypes.STRING,
      userAgent: DataTypes.STRING,
      occurredAt: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "audit_events", timestamps: false },
  );

  Workspace.belongsTo(User, { as: "owner", foreignKey: "ownerUserId" });
  Membership.belongsTo(User, { as: "user", foreignKey: "userId" });
  Membership.belongsTo(Workspace, { foreignKey: "workspaceId" });
  Item.hasOne(Document, { as: "document", foreignKey: "itemId" });
  Document.belongsTo(Item, { as: "item", foreignKey: "itemId" });
  Document.hasMany(ShareLink, { as: "shareLinks", foreignKey: "documentId" });

  return {
    User,
    AuthIdentity,
    Session,
    PasswordResetToken,
    BootstrapInvitation,
    PlatformInvitation,
    Workspace,
    Membership,
    Invitation,
    Item,
    Document,
    UploadSession,
    ShareLink,
    EmailMessage,
    EmailAttempt,
    Job,
    OutboxEvent,
    AuditEvent,
  };
}
