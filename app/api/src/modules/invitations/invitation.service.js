import { AppError, errors } from "../../common/errors/app-error.js";

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
    const now = this.clock.now(),
      hash = this.tokens.hash(rawToken);
    const invitation = await this.repository.findActiveByTokenHash(hash, now);
    const bootstrap = invitation
      ? null
      : await this.repository.findBootstrapByTokenHash(hash, now);
    const target = invitation || bootstrap;
    if (!target)
      throw new AppError(
        "INVITATION_INVALID",
        "The invitation is invalid or expired.",
        404,
      );
    return {
      email: target.invitedEmail,
      expiresAt: target.expiresAt,
      kind: invitation ? "WORKSPACE" : "BOOTSTRAP",
    };
  }
  async create(workspaceId, actorId, email) {
    const context = await this.workspaceService.getContext(
      workspaceId,
      actorId,
    );
    this.policy.requireOwner(context);
    const normalizedEmail = email.toLowerCase();
    const existing = await this.repository.findPending(
      workspaceId,
      normalizedEmail,
    );
    if (existing)
      throw new AppError(
        "INVITATION_ALREADY_PENDING",
        "An invitation is already pending for this email.",
        409,
      );
    const rawToken = this.tokens.generate();
    const invitation = await this.sequelize.transaction(async (transaction) => {
      const created = await this.repository.create(
        {
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
    return this.serialize(invitation);
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
          invitationUrl: `${this.webBaseUrl}/invite?token=${encodeURIComponent(rawToken)}`,
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
      this.serialize(i),
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
    const rawToken = this.tokens.generate();
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
    return this.serialize(invitation);
  }
  async acceptPassword(rawToken, { displayName, password }, authenticatedUser) {
    return this.sequelize.transaction(async (transaction) => {
      const now = this.clock.now(),
        hash = this.tokens.hash(rawToken);
      const invitation = await this.repository.findActiveByTokenHash(
        hash,
        now,
        transaction,
      );
      const bootstrap = invitation
        ? null
        : await this.repository.findBootstrapByTokenHash(
            hash,
            now,
            transaction,
          );
      const target = invitation || bootstrap;
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
}
