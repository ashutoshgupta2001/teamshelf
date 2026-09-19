import { z } from "zod";

export const itemNameSchema = z
  .string()
  .trim()
  .min(1, "A name is required")
  .max(255)
  .refine(
    (name) =>
      !name.includes("/") &&
      [...name].every((char) => {
        const code = char.charCodeAt(0);
        return code > 31 && code !== 127;
      }),
    "Names cannot contain slashes or control characters",
  );

export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((email) => email.toLowerCase());
export const passwordSchema = z.string().min(12).max(1024);
export const uuidSchema = z.string().uuid();
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(1024),
});
export const invitationPasswordSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  password: passwordSchema,
});
export const createWorkspaceSchema = z.object({ name: itemNameSchema });
export const createInvitationSchema = z.object({ email: emailSchema });
export const createFolderSchema = z.object({
  parentItemId: uuidSchema,
  name: itemNameSchema,
});
export const patchItemSchema = z.object({
  name: itemNameSchema,
  lockVersion: z.number().int().nonnegative(),
});
export const moveItemSchema = z.object({
  parentItemId: uuidSchema,
  lockVersion: z.number().int().nonnegative(),
});
export const createUploadSchema = z.object({
  parentItemId: uuidSchema,
  filename: itemNameSchema,
  sizeBytes: z.number().int().positive(),
  contentType: z.string().min(1).max(255),
  checksumSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
});
export const createShareLinkSchema = z.object({
  allowDownload: z.boolean().default(true),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: passwordSchema,
});
export const googleCredentialSchema = z.object({
  credential: z.string().min(20),
  invitationToken: z.string().optional(),
});
export const transferOwnershipSchema = z.object({ userId: uuidSchema });

export const ITEM_TYPES = Object.freeze({
  ROOT: "ROOT",
  FOLDER: "FOLDER",
  DOCUMENT: "DOCUMENT",
});
export const DOCUMENT_STATUSES = Object.freeze({
  PENDING_UPLOAD: "PENDING_UPLOAD",
  UPLOADED: "UPLOADED",
  SCANNING: "SCANNING",
  AVAILABLE: "AVAILABLE",
  REJECTED: "REJECTED",
  SCAN_FAILED: "SCAN_FAILED",
  DELETED: "DELETED",
});

export function normalizeName(value) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}
