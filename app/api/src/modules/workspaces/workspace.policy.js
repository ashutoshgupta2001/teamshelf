import { errors } from "../../common/errors/app-error.js";

export class WorkspacePolicy {
  requireMember(context) {
    if (!context?.membership || context.workspace.status === "DELETED")
      throw errors.forbidden();
  }
  requireOwner(context) {
    this.requireMember(context);
    if (context.workspace.ownerUserId !== context.userId)
      throw errors.forbidden();
  }
  requireContentEditor(context, item) {
    this.requireMember(context);
    if (
      context.workspace.ownerUserId !== context.userId &&
      item.createdBy !== context.userId
    )
      throw errors.forbidden();
  }
  requireShareManager(context, documentItem) {
    this.requireContentEditor(context, documentItem);
  }
}
