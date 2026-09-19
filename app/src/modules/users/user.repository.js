export class UserRepository {
  constructor(models) {
    this.models = models;
  }

  list() {
    return this.models.User.findAll({
      order: [
        ["displayName", "ASC"],
        ["primaryEmail", "ASC"],
      ],
    });
  }

  findById(id, transaction) {
    return this.models.User.findByPk(id, {
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });
  }

  lockActiveAdmins(transaction) {
    return this.models.User.findAll({
      attributes: ["id"],
      where: { platformRole: "ADMIN", status: "ACTIVE" },
      order: [["id", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  save(user, transaction) {
    return user.save({ transaction });
  }
}
