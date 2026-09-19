export class BootstrapAdminService {
  constructor({ sequelize, authRepository, workspaceService, passwordHasher }) {
    Object.assign(this, {
      sequelize,
      authRepository,
      workspaceService,
      passwordHasher,
    });
  }

  async seed({ email, password, displayName, workspaceName }) {
    return this.sequelize.transaction(async (transaction) => {
      const existingUser = await this.authRepository.findUserByEmail(
        email,
        transaction,
      );
      if (existingUser)
        return { created: false, userId: existingUser.id, workspaceId: null };

      const user = await this.authRepository.createUser(
        {
          primaryEmail: email,
          normalizedEmail: email,
          displayName,
          status: "ACTIVE",
        },
        transaction,
      );
      await this.authRepository.createIdentity(
        {
          userId: user.id,
          provider: "PASSWORD",
          providerSubject: email,
          providerEmail: email,
          passwordHash: await this.passwordHasher.hash(password),
        },
        transaction,
      );
      const workspace = await this.workspaceService.createWithinTransaction(
        user.id,
        workspaceName,
        { action: "INITIAL_ADMIN_WORKSPACE_CREATED" },
        transaction,
      );
      return {
        created: true,
        userId: user.id,
        workspaceId: workspace.id,
      };
    });
  }
}
