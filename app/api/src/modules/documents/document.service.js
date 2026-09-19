import { AppError, errors } from "../../common/errors/app-error.js";
import { prepareItemName } from "../items/item-rules.js";

export class DocumentService {
  constructor({
    sequelize,
    repository,
    itemRepository,
    workspaceService,
    workspacePolicy,
    workspaceRepository,
    storage,
    tokens,
    clock,
    config,
  }) {
    Object.assign(this, {
      sequelize,
      repository,
      itemRepository,
      workspaceService,
      workspacePolicy,
      workspaceRepository,
      storage,
      tokens,
      clock,
      config,
    });
    this.allowedTypes = new Set(
      config.allowedMimeTypes
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
  }
  async startUpload(workspaceId, userId, input) {
    const maxBytes = this.config.maxFileSizeMb * 1024 * 1024;
    if (input.sizeBytes > maxBytes)
      throw new AppError(
        "FILE_TOO_LARGE",
        `Files must be ${this.config.maxFileSizeMb} MB or smaller.`,
        413,
      );
    if (!this.allowedTypes.has(input.contentType))
      throw new AppError(
        "FILE_TYPE_NOT_ALLOWED",
        "This file type is not supported.",
        415,
      );
    const prepared = prepareItemName(input.filename);
    const documentId = this.tokens.id();
    const objectKey = `workspaces/${workspaceId}/documents/${documentId}/${this.tokens.generate(18)}`;
    const result = await this.sequelize.transaction(async (transaction) => {
      const context = await this.workspaceService.getContext(
        workspaceId,
        userId,
        transaction,
      );
      const projected =
        Number(context.workspace.storageUsedBytes) + input.sizeBytes;
      if (projected > this.config.workspaceLimitGb * 1024 ** 3)
        throw new AppError(
          "WORKSPACE_QUOTA_EXCEEDED",
          "The workspace storage limit would be exceeded.",
          409,
        );
      const parent = await this.itemRepository.find(
        workspaceId,
        input.parentItemId,
        transaction,
      );
      if (!parent || !["ROOT", "FOLDER"].includes(parent.itemType))
        throw errors.notFound("FOLDER");
      if (
        await this.itemRepository.findSibling(
          workspaceId,
          parent.id,
          prepared.normalizedName,
          transaction,
        )
      )
        throw new AppError(
          "NAME_CONFLICT",
          "An item with this name already exists here.",
          409,
        );
      const item = await this.itemRepository.create(
        {
          workspaceId,
          parentItemId: parent.id,
          itemType: "DOCUMENT",
          ...prepared,
          createdBy: userId,
        },
        transaction,
      );
      const document = await this.repository.create(
        {
          id: documentId,
          itemId: item.id,
          workspaceId,
          originalFilename: input.filename,
          storageProvider: this.config.provider,
          storageContainer: this.storage.container,
          objectKey,
          clientContentType: input.contentType,
          sizeBytes: input.sizeBytes,
          checksumSha256: input.checksumSha256 || null,
          status: "PENDING_UPLOAD",
        },
        transaction,
      );
      const upload = await this.repository.createUpload(
        {
          documentId: document.id,
          workspaceId,
          expectedSizeBytes: input.sizeBytes,
          expectedContentType: input.contentType,
          expectedChecksum: input.checksumSha256 || null,
          status: "CREATED",
          expiresAt: new Date(
            this.clock.now().getTime() + this.config.uploadTtlSeconds * 1000,
          ),
          createdBy: userId,
        },
        transaction,
      );
      return { document, upload, item };
    });
    const authorization = await this.storage.createUploadAuthorization({
      objectKey,
      contentType: input.contentType,
    });
    return {
      upload: this.serializeUpload(result.upload),
      document: this.serializeDocument(result.document, result.item),
      authorization,
    };
  }
  async completeUpload(workspaceId, userId, uploadId) {
    await this.workspaceService.getContext(workspaceId, userId);
    return this.sequelize.transaction(async (transaction) => {
      const upload = await this.repository.findUpload(
        workspaceId,
        uploadId,
        transaction,
        true,
      );
      if (!upload) throw errors.notFound("UPLOAD");
      const document = await this.repository.findById(
        upload.documentId,
        transaction,
      );
      if (!document) throw errors.notFound("DOCUMENT");
      if (upload.status === "COMPLETED")
        return {
          upload: this.serializeUpload(upload),
          document: this.serializeDocument(document),
        };
      if (upload.expiresAt < this.clock.now())
        throw new AppError(
          "UPLOAD_EXPIRED",
          "The upload authorization has expired.",
          410,
        );
      const verification = await this.storage.verifyUpload({
        objectKey: document.objectKey,
        expectedSizeBytes: upload.expectedSizeBytes,
        expectedContentType: upload.expectedContentType,
      });
      if (!verification.valid)
        throw new AppError(
          "UPLOAD_VERIFICATION_FAILED",
          "The uploaded object does not match the request.",
          400,
        );
      upload.status = "COMPLETED";
      upload.completedAt = this.clock.now();
      document.status = "SCANNING";
      document.sizeBytes = verification.sizeBytes;
      await upload.save({ transaction });
      await this.repository.save(document, transaction);
      const context = await this.workspaceService.getContext(
        workspaceId,
        userId,
        transaction,
      );
      context.workspace.storageUsedBytes =
        Number(context.workspace.storageUsedBytes) +
        Number(verification.sizeBytes);
      await this.workspaceRepository.save(context.workspace, transaction);
      await this.repository.createJob(
        {
          jobType: "INSPECT_FILE",
          payload: { documentId: document.id },
          status: "PENDING",
          attempts: 0,
          availableAt: this.clock.now(),
        },
        transaction,
      );
      return {
        upload: this.serializeUpload(upload),
        document: this.serializeDocument(document),
      };
    });
  }
  async getUpload(workspaceId, userId, uploadId) {
    await this.workspaceService.getContext(workspaceId, userId);
    const upload = await this.repository.findUpload(workspaceId, uploadId);
    if (!upload) throw errors.notFound("UPLOAD");
    return this.serializeUpload(upload);
  }
  async get(workspaceId, userId, documentId) {
    await this.workspaceService.getContext(workspaceId, userId);
    const document = await this.repository.findAccessible(
      workspaceId,
      documentId,
    );
    if (!document) throw errors.notFound("DOCUMENT");
    return this.serializeDocument(document, document.item);
  }
  async download(workspaceId, userId, documentId) {
    await this.workspaceService.getContext(workspaceId, userId);
    const document = await this.repository.findAccessible(
      workspaceId,
      documentId,
    );
    if (!document || document.status !== "AVAILABLE")
      throw errors.notFound("DOCUMENT");
    return this.storage.createDownloadAuthorization({
      objectKey: document.objectKey,
      filename: document.item.displayName,
      contentType: document.detectedContentType,
    });
  }
  async createShare(workspaceId, userId, documentId, input) {
    const context = await this.workspaceService.getContext(workspaceId, userId);
    const document = await this.repository.findAccessible(
      workspaceId,
      documentId,
    );
    if (!document || document.status !== "AVAILABLE")
      throw errors.notFound("DOCUMENT");
    this.workspacePolicy.requireShareManager(context, document.item);
    const days = Math.min(
      input.expiresInDays || this.config.shareDefaultExpiryDays,
      this.config.shareMaxExpiryDays,
    );
    const token = this.tokens.generate();
    const share = await this.repository.createShare({
      documentId,
      workspaceId,
      tokenHash: this.tokens.hash(token),
      allowDownload: input.allowDownload,
      expiresAt: this.clock.addDays(days),
      createdBy: userId,
    });
    return { share: this.serializeShare(share), token };
  }
  async listShares(workspaceId, userId, documentId) {
    const context = await this.workspaceService.getContext(workspaceId, userId);
    const document = await this.repository.findAccessible(
      workspaceId,
      documentId,
    );
    if (!document) throw errors.notFound("DOCUMENT");
    this.workspacePolicy.requireShareManager(context, document.item);
    return (await this.repository.listShares(workspaceId, documentId)).map(
      this.serializeShare,
    );
  }
  async revokeShare(workspaceId, userId, shareId) {
    const context = await this.workspaceService.getContext(workspaceId, userId);
    const share = await this.repository.findShare(workspaceId, shareId);
    if (!share) throw errors.notFound("SHARE_LINK");
    const document = await this.repository.findAccessible(
      workspaceId,
      share.documentId,
    );
    if (!document) throw errors.notFound("DOCUMENT");
    this.workspacePolicy.requireShareManager(context, document.item);
    share.revokedAt = this.clock.now();
    await this.repository.saveShare(share);
  }
  async publicMetadata(rawToken) {
    const share = await this.repository.findActiveShare(
      this.tokens.hash(rawToken),
      this.clock.now(),
    );
    if (!share) throw errors.notFound("SHARE");
    const document = await this.repository.findDocumentForShare(
      share.documentId,
      share.workspaceId,
    );
    if (!document || document.status !== "AVAILABLE")
      throw errors.notFound("SHARE");
    await this.repository.recordShareAccess(share, this.clock.now());
    return {
      name: document.item.displayName,
      contentType: document.detectedContentType || document.clientContentType,
      sizeBytes: Number(document.sizeBytes),
      allowDownload: share.allowDownload,
      expiresAt: share.expiresAt,
    };
  }
  async publicContent(rawToken) {
    const share = await this.repository.findActiveShare(
      this.tokens.hash(rawToken),
      this.clock.now(),
    );
    if (!share) throw errors.notFound("SHARE");
    const document = await this.repository.findDocumentForShare(
      share.documentId,
      share.workspaceId,
    );
    if (!document || document.status !== "AVAILABLE")
      throw errors.notFound("SHARE");
    const previewable = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ].includes(document.detectedContentType || document.clientContentType);
    if (!share.allowDownload && !previewable) throw errors.notFound("SHARE");
    return this.storage.createDownloadAuthorization({
      objectKey: document.objectKey,
      filename: document.item.displayName,
      contentType: document.detectedContentType,
    });
  }
  serializeDocument(document, item) {
    return {
      id: document.id,
      itemId: document.itemId,
      name: item?.displayName,
      status: document.status,
      contentType: document.detectedContentType || document.clientContentType,
      sizeBytes: Number(document.sizeBytes || 0),
      rejectionReason: document.rejectionReason,
    };
  }
  serializeUpload(upload) {
    return {
      id: upload.id,
      documentId: upload.documentId,
      status: upload.status,
      expiresAt: upload.expiresAt,
      completedAt: upload.completedAt,
    };
  }
  serializeShare(share) {
    return {
      id: share.id,
      documentId: share.documentId,
      allowDownload: share.allowDownload,
      expiresAt: share.expiresAt,
      revokedAt: share.revokedAt,
      accessCount: share.accessCount,
      lastAccessedAt: share.lastAccessedAt,
      createdAt: share.createdAt,
    };
  }
}
