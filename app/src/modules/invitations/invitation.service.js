import { AppError, errors } from "../../common/errors/app-error.js";
import { resolveInvitationToken } from "./invitation-token.js";

export class InvitationService {
  constructor({
    sequelize,
    repository,
    authRepository,
    workspaceRepository,
    workspaceService,
    policy,
    passwordHasher,
    tokens,
    clock,
    expiryDays,
    webBaseUrl,
  }) {
    Object.assign(this, {
      sequelize,
      repository,
      authRepository,
      workspaceRepository,
      workspaceService,
      policy,
      passwordHasher,
      tokens,
      clock,
      expiryDays,
      webBaseUrl,
    });
  }
  async status(rawToken) {
    const { invitation, platform, bootstrap } = await resolveInvitationToken({
      repository: this.repository,
      tokens: this.tokens,
      rawToken,
      now: this.clock.now(),
    });
    const target = invitation || platform || bootstrap;
    if (!target)
      throw new AppError(
        "INVITATION_INVALID",
        "The invitation is invalid or expired.",
        404,
      );
    return {
      email: target.invitedEmail,
      expiresAt: target.expiresAt,
      kind: invitation ? "WORKSPACE" : platform ? "PLATFORM" : "BOOTSTRAP",
    };
  }
  requireAdmin(actor) {
    if (actor?.platformRole !== "ADMIN") throw errors.forbidden();
  }
  async createPlatform(actor, email) {
    this.requireAdmin(actor);
    const normalizedEmail = email.toLowerCase();
    if (await this.authRepository.findUserByEmail(normalizedEmail))
      throw new AppError(
        "USER_ALREADY_EXISTS",
        "This email already belongs to a TeamShelf user.",
        409,
      );
    if (await this.repository.findPendingPlatform(normalizedEmail))
      throw new AppError(
        "INVITATION_ALREADY_PENDING",
        "An invitation is already pending for this email.",
        409,
      );
    const invitationId = this.tokens.id();
    const rawToken = this.tokens.signInvitation("PLATFORM", invitationId);
    const invitation = await this.sequelize.transaction(async (transaction) => {
      const created = await this.repository.createPlatform(
        {
          id: invitationId,
          invitedEmail: email,
          normalizedEmail,
          tokenHash: this.tokens.hash(rawToken),
          platformRole: "USER",
          invitedBy: actor.id,
          expiresAt: this.clock.addDays(this.expiryDays),
        },
        transaction,
      );
      await this.queuePlatformInvitationEmail(created, rawToken, transaction);
      return created;
    });
    return this.serializePlatformWithUrl(invitation, rawToken);
  }
  async queuePlatformInvitationEmail(invitation, rawToken, transaction) {
    const email = await this.repository.createEmail(
      {
        messageType: "PLATFORM_INVITATION",
        recipientEmail: invitation.invitedEmail,
        subject: "You're invited to TeamShelf",
        templateName: "platform-invitation",
        templateVersion: 1,
        templateData: {
          invitationUrl: this.buildInvitationUrl(rawToken),
        },
        relatedEntityType: "PLATFORM_INVITATION",
        relatedEntityId: invitation.id,
        status: "PENDING",
      },
      transaction,
    );
    await this.repository.createJob(
      {
        jobType: "SEND_EMAIL",
        payload: { emailMessageId: email.id },
        status: "PENDING",
        attempts: 0,
        availableAt: this.clock.now(),
      },
      transaction,
    );
  }
  async listPlatform(actor) {
    this.requireAdmin(actor);
    return (await this.repository.listPlatform()).map((invitation) =>
      this.serializeActivePlatformWithUrl(invitation),
    );
  }
  async revokePlatform(actor, invitationId) {
    this.requireAdmin(actor);
    const invitation = await this.repository.findPlatformById(invitationId);
    if (!invitation) throw errors.notFound("INVITATION");
    invitation.revokedAt = this.clock.now();
    await this.repository.save(invitation);
  }
  async resendPlatform(actor, invitationId) {
    this.requireAdmin(actor);
    const invitation = await this.repository.findPlatformById(invitationId);
    if (!invitation || invitation.acceptedAt || invitation.revokedAt)
      throw errors.notFound("INVITATION");
    const rawToken = this.tokens.signInvitation("PLATFORM", invitation.id);
    invitation.tokenHash = this.tokens.hash(rawToken);
    invitation.expiresAt = this.clock.addDays(this.expiryDays);
    await this.sequelize.transaction(async (transaction) => {
      await this.repository.save(invitation, transaction);
      await this.queuePlatformInvitationEmail(
        invitation,
        rawToken,
        transaction,
      );
    });
    return this.serializePlatformWithUrl(invitation, rawToken);
  }
  async create(workspaceId, actorId, email) {
    const context = await this.workspaceService.getContext(
      workspaceId,
      actorId,
    );
    this.policy.requireOwner(context);
    const normalizedEmail = email.toLowerCase();
    const invitationId = this.tokens.id();
    const rawToken = this.tokens.signInvitation("WORKSPACE", invitationId);
    const invitation = await this.sequelize.transaction(async (transaction) => {
      const user = await this.authRepository.findUserByEmail(
        normalizedEmail,
        transaction,
      );
      if (!user || user.status !== "ACTIVE")
        throw new AppError(
          "USER_NOT_FOUND",
          "Only an existing active TeamShelf user can be invited.",
          400,
        );
      if (
        await this.workspaceRepository.findMembership(
          workspaceId,
          user.id,
          transaction,
        )
      )
        throw new AppError(
          "MEMBER_ALREADY_EXISTS",
          "This user is already a workspace member.",
          409,
        );
      const existing = await this.repository.findPending(
        workspaceId,
        normalizedEmail,
        transaction,
      );
      if (existing)
        throw new AppError(
          "INVITATION_ALREADY_PENDING",
          "An invitation is already pending for this email.",
          409,
        );
      const created = await this.repository.create(
        {
          id: invitationId,
          workspaceId,
          invitedEmail: email,
          normalizedEmail,
          tokenHash: this.tokens.hash(rawToken),
          invitedBy: actorId,
          expiresAt: this.clock.addDays(this.expiryDays),
        },
        transaction,
      );
      await this.queueInvitationEmail(
        created,
        context.workspace.name,
        rawToken,
        transaction,
      );
      return created;
    });
    return this.serializeWithUrl(invitation, rawToken);
  }
  async queueInvitationEmail(
    invitation,
    workspaceName,
    rawToken,
    transaction,
    type = "WORKSPACE_INVITATION",
  ) {
    const email = await this.repository.createEmail(
      {
        messageType: type,
        workspaceId: invitation.workspaceId,
        recipientEmail: invitation.invitedEmail,
        subject: `You're invited to ${workspaceName}`,
        templateName: "workspace-invitation",
        templateVersion: 1,
        templateData: {
          workspaceName,
          invitationUrl: this.buildInvitationUrl(rawToken),
        },
        relatedEntityType: "INVITATION",
        relatedEntityId: invitation.id,
        status: "PENDING",
      },
      transaction,
    );
    await this.repository.createJob(
      {
        jobType: "SEND_EMAIL",
        payload: { emailMessageId: email.id },
        status: "PENDING",
        attempts: 0,
        availableAt: this.clock.now(),
      },
      transaction,
    );
  }
  async list(workspaceId, actorId) {
    const context = await this.workspaceService.getContext(
      workspaceId,
      actorId,
    );
    this.policy.requireOwner(context);
    return (await this.repository.list(workspaceId)).map((i) =>
      this.serializeActiveWithUrl(i),
    );
  }
  async revoke(workspaceId, actorId, invitationId) {
    const context = await this.workspaceService.getContext(
      workspaceId,
      actorId,
    );
    this.policy.requireOwner(context);
    const invitation = await this.repository.findById(
      workspaceId,
      invitationId,
    );
    if (!invitation) throw errors.notFound("INVITATION");
    invitation.revokedAt = this.clock.now();
    await this.repository.save(invitation);
  }
  async resend(workspaceId, actorId, invitationId) {
    const context = await this.workspaceService.getContext(
      workspaceId,
      actorId,
    );
    this.policy.requireOwner(context);
    const invitation = await this.repository.findById(
      workspaceId,
      invitationId,
    );
    if (!invitation || invitation.acceptedAt || invitation.revokedAt)
      throw errors.notFound("INVITATION");
    const rawToken = this.tokens.signInvitation("WORKSPACE", invitation.id);
    invitation.tokenHash = this.tokens.hash(rawToken);
    invitation.expiresAt = this.clock.addDays(this.expiryDays);
    await this.sequelize.transaction(async (transaction) => {
      await this.repository.save(invitation, transaction);
      await this.queueInvitationEmail(
        invitation,
        context.workspace.name,
        rawToken,
        transaction,
        "INVITATION_RESEND",
      );
    });
    return this.serializeWithUrl(invitation, rawToken);
  }
  async acceptPassword(rawToken, { displayName, password }, authenticatedUser) {
    return this.sequelize.transaction(async (transaction) => {
      const now = this.clock.now();
      const { invitation, platform, bootstrap } = await resolveInvitationToken({
        repository: this.repository,
        tokens: this.tokens,
        rawToken,
        now,
        transaction,
      });
      const target = invitation || platform || bootstrap;
      if (!target)
        throw new AppError(
          "INVITATION_INVALID",
          "The invitation is invalid or expired.",
          400,
        );
      let user = await this.authRepository.findUserByEmail(
        target.normalizedEmail,
        transaction,
      );
      if (authenticatedUser && user?.id !== authenticatedUser.id)
        throw new AppError(
          "INVITATION_EMAIL_MISMATCH",
          "This invitation belongs to a different account.",
          403,
        );
      if (invitation && !user)
        throw new AppError(
          "INVITED_USER_UNAVAILABLE",
          "The invited TeamShelf account is no longer available.",
          409,
        );
      if (user && user.status !== "ACTIVE")
        throw new AppError(
          "INVITED_USER_UNAVAILABLE",
          "The invited TeamShelf account is no longer available.",
          409,
        );
      if (user) {
        const identity = await this.authRepository.findPasswordIdentity(
          user.id,
          transaction,
        );
        if (
          !authenticatedUser &&
          (!identity ||
            !(await this.passwordHasher.verify(
              identity.passwordHash,
              password,
            )))
        )
          throw new AppError(
            "INVALID_CREDENTIALS",
            "The email or password is invalid.",
            401,
          );
      } else {
        user = await this.authRepository.createUser(
          {
            primaryEmail: target.invitedEmail,
            normalizedEmail: target.normalizedEmail,
            displayName,
            status: "ACTIVE",
            platformRole: bootstrap ? "ADMIN" : "USER",
          },
          transaction,
        );
        await this.authRepository.createIdentity(
          {
            userId: user.id,
            provider: "PASSWORD",
            providerSubject: target.normalizedEmail,
            providerEmail: target.invitedEmail,
            passwordHash: await this.passwordHasher.hash(password),
          },
          transaction,
        );
      }
      if (user && bootstrap) {
        if (user.platformRole !== "ADMIN") {
          user.platformRole = "ADMIN";
          await this.authRepository.save(user, transaction);
        }
      }
      if (
        invitation &&
        !(await this.workspaceRepository.findMembership(
          invitation.workspaceId,
          user.id,
          transaction,
        ))
      )
        await this.workspaceRepository.createMembership(
          {
            workspaceId: invitation.workspaceId,
            userId: user.id,
            joinedAt: now,
          },
          transaction,
        );
      target.acceptedAt = now;
      await this.repository.save(target, transaction);
      await this.workspaceRepository.outbox(
        {
          eventType: "InvitationAccepted",
          aggregateType: invitation ? "WORKSPACE" : "PLATFORM",
          aggregateId: invitation?.workspaceId || user.id,
          payload: { userId: user.id },
          occurredAt: now,
        },
        transaction,
      );
      return user;
    });
  }
  serialize(i) {
    return {
      id: i.id,
      email: i.invitedEmail,
      expiresAt: i.expiresAt,
      acceptedAt: i.acceptedAt,
      revokedAt: i.revokedAt,
      createdAt: i.createdAt,
    };
  }
  serializeWithUrl(invitation, rawToken) {
    return {
      ...this.serialize(invitation),
      url: this.buildInvitationUrl(rawToken),
    };
  }
  serializeActiveWithUrl(invitation) {
    return this.isActive(invitation)
      ? this.serializeWithUrl(
          invitation,
          this.tokens.signInvitation("WORKSPACE", invitation.id),
        )
      : this.serialize(invitation);
  }
  serializePlatform(invitation) {
    return {
      id: invitation.id,
      email: invitation.invitedEmail,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
    };
  }
  serializePlatformWithUrl(invitation, rawToken) {
    return {
      ...this.serializePlatform(invitation),
      url: this.buildInvitationUrl(rawToken),
    };
  }
  serializeActivePlatformWithUrl(invitation) {
    return this.isActive(invitation)
      ? this.serializePlatformWithUrl(
          invitation,
          this.tokens.signInvitation("PLATFORM", invitation.id),
        )
      : this.serializePlatform(invitation);
  }
  isActive(invitation) {
    return (
      !invitation.acceptedAt &&
      !invitation.revokedAt &&
      new Date(invitation.expiresAt) > this.clock.now()
    );
  }
  buildInvitationUrl(rawToken) {
    return `${this.webBaseUrl}/invite?token=${encodeURIComponent(rawToken)}`;
  }
}
