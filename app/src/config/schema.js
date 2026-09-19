export const configSchema = {
  env: {
    format: ["development", "test", "production"],
    default: "development",
    env: "NODE_ENV",
  },
  app: {
    host: { format: String, default: "127.0.0.1", env: "APP_HOST" },
    port: { format: "port", default: 4000, env: "APP_PORT" },
    baseUrl: {
      format: "url",
      default: "http://localhost:4000",
      env: "APP_BASE_URL",
    },
    webBaseUrl: {
      format: "url",
      default: "http://localhost:5173",
      env: "WEB_BASE_URL",
    },
    trustProxy: { format: "trust-proxy", default: 0, env: "TRUST_PROXY" },
    logLevel: {
      format: ["fatal", "error", "warn", "info", "debug", "trace", "silent"],
      default: "info",
      env: "LOG_LEVEL",
    },
  },
  database: {
    url: {
      format: "database-url",
      default: "postgres://teamshelf:teamshelf@localhost:5432/teamshelf",
      env: "DATABASE_URL",
      sensitive: true,
    },
    ssl: { format: Boolean, default: false, env: "DATABASE_SSL" },
    poolMin: { format: "nat", default: 0, env: "DATABASE_POOL_MIN" },
    poolMax: { format: "nat", default: 10, env: "DATABASE_POOL_MAX" },
  },
  session: {
    cookieName: {
      format: String,
      default: "teamshelf_session",
      env: "SESSION_COOKIE_NAME",
    },
    secret: {
      format: String,
      default: "development-only-session-secret-32",
      env: "SESSION_SECRET",
      sensitive: true,
    },
    ttlDays: { format: "nat", default: 14, env: "SESSION_TTL_DAYS" },
    csrfSecret: {
      format: String,
      default: "development-only-csrf-secret-32xxx",
      env: "CSRF_SECRET",
      sensitive: true,
    },
  },
  initialAdmin: {
    email: { format: String, default: "", env: "INITIAL_ADMIN_EMAIL" },
    password: {
      format: String,
      default: "",
      env: "INITIAL_ADMIN_PASSWORD",
      sensitive: true,
    },
    displayName: {
      format: String,
      default: "TeamShelf Admin",
      env: "INITIAL_ADMIN_DISPLAY_NAME",
    },
    workspaceName: {
      format: String,
      default: "TeamShelf",
      env: "INITIAL_ADMIN_WORKSPACE_NAME",
    },
  },
  google: {
    clientId: { format: String, default: "", env: "GOOGLE_CLIENT_ID" },
    clientSecret: {
      format: String,
      default: "",
      env: "GOOGLE_CLIENT_SECRET",
      sensitive: true,
    },
    redirectUri: { format: String, default: "", env: "GOOGLE_REDIRECT_URI" },
  },
  smtp: {
    host: { format: String, default: "localhost", env: "SMTP_HOST" },
    port: { format: "port", default: 1025, env: "SMTP_PORT" },
    secure: { format: Boolean, default: false, env: "SMTP_SECURE" },
    username: { format: String, default: "", env: "SMTP_USERNAME" },
    password: {
      format: String,
      default: "",
      env: "SMTP_PASSWORD",
      sensitive: true,
    },
    fromAddress: {
      format: "email",
      default: "no-reply@teamshelf.local",
      env: "SMTP_FROM_ADDRESS",
    },
    fromName: { format: String, default: "TeamShelf", env: "SMTP_FROM_NAME" },
  },
  storage: {
    provider: {
      format: ["local", "gcs"],
      default: "local",
      env: "STORAGE_PROVIDER",
    },
    localPath: {
      format: String,
      default: "./storage",
      env: "LOCAL_STORAGE_PATH",
    },
    gcs: {
      projectId: { format: String, default: "", env: "GCP_PROJECT_ID" },
      bucket: { format: String, default: "", env: "GCP_STORAGE_BUCKET" },
      keyFile: {
        format: String,
        default: "",
        env: "GCP_KEY_FILE",
        sensitive: true,
      },
    },
    uploadTtlSeconds: {
      format: "nat",
      default: 600,
      env: "SIGNED_UPLOAD_URL_TTL_SECONDS",
    },
    downloadTtlSeconds: {
      format: "nat",
      default: 300,
      env: "SIGNED_DOWNLOAD_URL_TTL_SECONDS",
    },
    maxFileSizeMb: { format: "nat", default: 250, env: "MAX_FILE_SIZE_MB" },
    workspaceLimitGb: {
      format: "nat",
      default: 20,
      env: "WORKSPACE_STORAGE_LIMIT_GB",
    },
    allowedMimeTypes: {
      format: String,
      default:
        "application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv",
      env: "ALLOWED_MIME_TYPES",
    },
  },
  lifecycle: {
    invitationExpiryDays: {
      format: "nat",
      default: 7,
      env: "INVITATION_EXPIRY_DAYS",
    },
    shareDefaultExpiryDays: {
      format: "nat",
      default: 7,
      env: "SHARE_LINK_DEFAULT_EXPIRY_DAYS",
    },
    shareMaxExpiryDays: {
      format: "nat",
      default: 30,
      env: "SHARE_LINK_MAX_EXPIRY_DAYS",
    },
    trashRetentionDays: {
      format: "nat",
      default: 30,
      env: "TRASH_RETENTION_DAYS",
    },
  },
  jobs: {
    pollIntervalMs: {
      format: "nat",
      default: 3000,
      env: "JOB_POLL_INTERVAL_MS",
    },
    maxAttempts: { format: "nat", default: 5, env: "JOB_MAX_ATTEMPTS" },
    lockTimeoutSeconds: {
      format: "nat",
      default: 120,
      env: "JOB_LOCK_TIMEOUT_SECONDS",
    },
    clamavHost: { format: String, default: "localhost", env: "CLAMAV_HOST" },
    clamavPort: { format: "port", default: 3310, env: "CLAMAV_PORT" },
  },
};
