export class AppError extends Error {
  constructor(code, message, status = 400, details = []) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const errors = {
  unauthorized: () =>
    new AppError("AUTHENTICATION_REQUIRED", "Authentication is required.", 401),
  forbidden: () =>
    new AppError(
      "FORBIDDEN",
      "You do not have permission to perform this action.",
      403,
    ),
  notFound: (entity = "RESOURCE") =>
    new AppError(
      `${entity}_NOT_FOUND`,
      "The requested resource is unavailable.",
      404,
    ),
  conflict: (
    message = "The resource changed or conflicts with an existing resource.",
  ) => new AppError("CONFLICT", message, 409),
};
