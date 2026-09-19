import { AppError } from "../../common/errors/app-error.js";
import { resolveInvitationToken } from "../invitations/invitation-token.js";

export class AuthService {
  constructor({
    sequelize,
    authRepository,
    invitationRepository,
    workspaceRepository,
    passwordHasher,
    googleIdentity,
    tokens,
    clock,
    sessionTtlDays,
    webBaseUrl,
  }) {
    Object.assign(this, {
      sequelize,
      authRepository,
      invitationRepository,
      workspaceRepository,
      passwordHasher,
      googleIdentity,
      tokens,
      clock,
      sessionTtlDays,
      webBaseUrl,
    });
  }
  async createSession(userId, transaction) {
    const rawToken = this.tokens.generate();
    const csrfToken = this.tokens.generate(24);
    const now = this.clock.now();
    const session = await this.authRepository.createSession(
      {
        userId,
        tokenHash: this.tokens.hash(rawToken),
        csrfToken,
        expiresAt: this.clock.addDays(this.sessionTtlDays, now),
        lastSeenAt: now,
      },
      transaction,
    );
    return { rawToken, csrfToken, expiresAt: session.expiresAt };
  }
  async loginPassword({ email, password }) {
    const user = await this.authRepository.findUserByEmail(email);
    const identity =
      user && (await this.authRepository.findPasswordIdentity(user.id));
    let valid = false;
    if (identity?.passwordHash)
      valid = await this.passwordHasher.verify(identity.passwordHash, password);
    else await this.passwordHasher.hash(password);
    if (!valid || user.status !== "ACTIVE")
      throw new AppError(
        "INVALID_CREDENTIALS",
        "The email or password is invalid.",
        401,
      );
    const session = await this.createSession(user.id);
    return { user: this.publicUser(user), session };
  }
  async loginGoogle({ credential, invitationToken }) {
    const profile = await this.googleIdentity.verify(credential);
    return this.sequelize.transaction(async (transaction) => {
      let identity = await this.authRepository.findIdentity(
        "GOOGLE",
        profile.subject,
        transaction,
      );
      let user =
        identity &&
        (await this.authRepository.findUserById(identity.userId, transaction));
      if (user && invitationToken)
        await this.acceptGoogleInvitation(
          profile,
          invitationToken,
          user,
          transaction,
        );
      if (!user) {
        user = await this.authRepository.findUserByEmail(
          profile.normalizedEmail,
          transaction,
        );
        if (!user && !invitationToken)
          throw new AppError(
            "INVITATION_REQUIRED",
            "A valid invitation is required.",
            403,
          );
        if (invitationToken)
          await this.acceptGoogleInvitation(
            profile,
            invitationToken,
            user,
            transaction,
          );
        user ||= await this.authRepository.findUserByEmail(
          profile.normalizedEmail,
          transaction,
        );
        identity = await this.authRepository.findIdentity(
          "GOOGLE",
          profile.subject,
          transaction,
        );
        if (!identity)
          await this.authRepository.createIdentity(
            {
              userId: user.id,
              provider: "GOOGLE",
              providerSubject: profile.subject,
              providerEmail: profile.email,
            },
            transaction,
          );
      }
      if (user.status !== "ACTIVE")
        throw new AppError(
          "INVALID_CREDENTIALS",
          "Google sign-in is unavailable.",
          401,
        );
      const session = await this.createSession(user.id, transaction);
      return { user: this.publicUser(user), session };
    });
  }
  async acceptGoogleInvitation(profile, rawToken, existingUser, transaction) {
    const now = this.clock.now();
    const { invitation, platform, bootstrap } = await resolveInvitationToken({
      repository: this.invitationRepository,
      tokens: this.tokens,
      rawToken,
      now,
      transaction,
    });
    const target = invitation || platform || bootstrap;
    if (!target || target.normalizedEmail !== profile.normalizedEmail)
      throw new AppError(
        "INVITATION_INVALID",
        "The invitation is invalid or expired.",
        400,
      );
    let user = existingUser;
    if (invitation && !user)
      throw new AppError(
        "INVITED_USER_UNAVAILABLE",
        "The invited TeamShelf account is no longer available.",
        409,
      );
    if (!user)
      user = await this.authRepository.createUser(
        {
          primaryEmail: profile.email,
          normalizedEmail: profile.normalizedEmail,
          displayName: profile.displayName,
          status: "ACTIVE",
          platformRole: bootstrap ? "ADMIN" : "USER",
        },
        transaction,
      );
    if (bootstrap) {
      if (user.platformRole !== "ADMIN") {
        user.platformRole = "ADMIN";
        await this.authRepository.save(user, transaction);
      }
    }
    if (invitation) {
      const membership = await this.workspaceRepository.findMembership(
        invitation.workspaceId,
        user.id,
        transaction,
      );
      if (!membership)
        await this.workspaceRepository.createMembership(
          {
            workspaceId: invitation.workspaceId,
            userId: user.id,
            joinedAt: now,
          },
          transaction,
        );
    }
    target.acceptedAt = now;
    await this.invitationRepository.save(target, transaction);
  }
  async authenticate(rawToken) {
    return rawToken
      ? this.authRepository.findActiveSession(
          this.tokens.hash(rawToken),
          this.clock.now(),
        )
      : null;
  }
  async logout(sessionId) {
    if (sessionId) await this.authRepository.revokeSession(sessionId);
  }
  async forgotPassword(email) {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) return;
    await this.sequelize.transaction(async (transaction) => {
      const token = this.tokens.generate();
      const reset = await this.authRepository.createResetToken(
        {
          userId: user.id,
          tokenHash: this.tokens.hash(token),
          expiresAt: new Date(this.clock.now().getTime() + 3_600_000),
        },
        transaction,
      );
      const emailMessage = await this.invitationRepository.createEmail(
        {
          messageType: "PASSWORD_RESET",
          recipientEmail: user.primaryEmail,
          subject: "Reset your TeamShelf password",
          templateName: "password-reset",
          templateVersion: 1,
          templateData: {
            resetUrl: `${this.webBaseUrl}/reset-password?token=${encodeURIComponent(token)}`,
          },
          relatedEntityType: "PASSWORD_RESET",
          relatedEntityId: reset.id,
          status: "PENDING",
        },
        transaction,
      );
      await this.invitationRepository.createJob(
        {
          jobType: "SEND_EMAIL",
          payload: { emailMessageId: emailMessage.id },
          status: "PENDING",
          attempts: 0,
          availableAt: this.clock.now(),
        },
        transaction,
      );
    });
  }
  async resetPassword(rawToken, password) {
    await this.sequelize.transaction(async (transaction) => {
      const reset = await this.authRepository.findResetToken(
        this.tokens.hash(rawToken),
        this.clock.now(),
        transaction,
      );
      if (!reset)
        throw new AppError(
          "RESET_TOKEN_INVALID",
          "The reset link is invalid or expired.",
          400,
        );
      let identity = await this.authRepository.findPasswordIdentity(
        reset.userId,
        transaction,
      );
      const passwordHash = await this.passwordHasher.hash(password);
      if (identity) {
        identity.passwordHash = passwordHash;
        await this.authRepository.save(identity, transaction);
      } else {
        const user = await this.authRepository.findUserById(
          reset.userId,
          transaction,
        );
        identity = await this.authRepository.createIdentity(
          {
            userId: user.id,
            provider: "PASSWORD",
            providerSubject: user.normalizedEmail,
            providerEmail: user.primaryEmail,
            passwordHash,
          },
          transaction,
        );
      }
      reset.usedAt = this.clock.now();
      await this.authRepository.save(reset, transaction);
      await this.authRepository.revokeAllSessions(reset.userId, transaction);
    });
  }
  async linkGoogle(userId, credential) {
    const profile = await this.googleIdentity.verify(credential);
    return this.sequelize.transaction(async (transaction) => {
      const existing = await this.authRepository.findIdentity(
        "GOOGLE",
        profile.subject,
        transaction,
      );
      if (existing && existing.userId !== userId)
        throw new AppError(
          "GOOGLE_IDENTITY_IN_USE",
          "This Google identity is linked to another account.",
          409,
        );
      if (!existing)
        await this.authRepository.createIdentity(
          {
            userId,
            provider: "GOOGLE",
            providerSubject: profile.subject,
            providerEmail: profile.email,
          },
          transaction,
        );
      return { provider: "GOOGLE", email: profile.email };
    });
  }
  async unlinkGoogle(userId) {
    return this.sequelize.transaction(async (transaction) => {
      if ((await this.authRepository.countIdentities(userId, transaction)) <= 1)
        throw new AppError(
          "LAST_IDENTITY",
          "Add a password before unlinking Google.",
          409,
        );
      const identity = await this.authRepository.findIdentityForUser(
        "GOOGLE",
        userId,
        transaction,
      );
      if (!identity)
        throw new AppError(
          "IDENTITY_NOT_FOUND",
          "The Google identity is not linked.",
          404,
        );
      await this.authRepository.deleteIdentity(identity, transaction);
    });
  }
  publicUser(user) {
    return {
      id: user.id,
      email: user.primaryEmail,
      displayName: user.displayName,
      platformRole: user.platformRole,
    };
  }
}
