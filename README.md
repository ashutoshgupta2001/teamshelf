# TeamShelf

TeamShelf is an invite-only document workspace. It is a JavaScript modular monolith with an Express API and worker, a React client, PostgreSQL-backed sessions/jobs/outbox, private GCS support, and a local file adapter for development.

## Quick start

Requirements: Node.js 22+, npm 10+, Docker, and Docker Compose.

```bash
cp .env.example .env
npm install
docker compose up -d postgres mailpit
npm run migrate
npm run seed:admin
npm run dev
```

Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in `.env` before seeding, then sign in at <http://localhost:5173>. `npm run dev` starts the API, web client, and worker. For malware inspection, also start ClamAV:

```bash
docker compose --profile scanning up -d clamav
```

Scanning fails closed: if ClamAV is unavailable, a document stays unavailable with `SCAN_FAILED` while the worker retries.

`APP_HOST` defaults to `127.0.0.1`, which keeps a host-run development API local to the machine. Set it to `0.0.0.0` only when the API must listen on every interface, such as inside an application container whose port is published by Docker or Kubernetes. Network exposure is still controlled separately by container ports, firewalls, and load-balancer rules.

## Docker

The application uses separate images for the backend and frontend. The backend image is reused by the one-shot migration, API, and worker containers; the frontend is built as static assets and served by Nginx, which proxies `/api` and `/health` to the API container.

```bash
cp .env.example .env
docker compose up --build
```

The one-shot `seed` container runs after migrations and before the API and worker. It creates the configured initial user and an owned workspace, or safely skips the operation when that email already exists. Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in `.env`; the password must contain at least 12 characters. Existing credentials are never overwritten by subsequent starts.

Open TeamShelf at <http://localhost:8080> and Mailpit at <http://localhost:8025>.

To include malware scanning, start the stack with `docker compose --profile scanning up --build`. PostgreSQL and uploaded files use named volumes and survive `docker compose down`.

Docker host ports can be changed without editing Compose, for example `POSTGRES_PORT=5433 WEB_HOST_PORT=8081 PUBLIC_APP_URL=http://localhost:8081 docker compose up --build`.

## Commands

```text
npm run dev             API, web and worker
npm run dev:api         Express API on port 4000
npm run dev:web         Vite on port 5173
npm run dev:worker      PostgreSQL job worker
npm run migrate         Apply all Sequelize migrations
npm run migrate:undo    Revert the most recent migration
npm run seed:admin      Idempotently create the configured initial owner
npm test                Unit and component tests
npm run test:integration  PostgreSQL integration tests
npm run test:e2e        Playwright browser smoke tests
npm run lint            ESLint
npm run format:check    Prettier check
npm run build           Validate API modules and build the client
```

Integration tests use `DATABASE_URL`; point it at a dedicated, already-migrated test database. Tests truncate application tables and must never target a development or production database.

## Architecture

The repository is an npm-workspace monorepo:

- `app`: API and worker entry points, capability-oriented services/repositories, infrastructure adapters, and migrations.
- `web`: React Router UI with TanStack Query server state and feature-specific API clients.
- `packages/contracts`: shared Zod request schemas, constants, and normalization rules.

Controllers in `api.routes.js` validate input and call one application service. Services own business rules and use explicit managed transactions. Only repositories query Sequelize models. Technology-specific behavior is behind storage, mail, identity, password, inspection, clock, token, queue, and outbox adapters; dependency construction lives in `bootstrap/container.js`.

Asynchronous work is stored in PostgreSQL and claimed with `FOR UPDATE SKIP LOCKED`. SMTP attempts are recorded, temporary failures use exponential backoff, and sensitive email template data is removed after SMTP acceptance. Uploaded documents become available only after MIME/encryption and ClamAV checks pass.

## Storage

Local development defaults to `STORAGE_PROVIDER=local`. Upload/download authorizations are short-lived HMAC-signed local URLs. Shared and production environments should use `STORAGE_PROVIDER=gcs`, a private bucket, uniform bucket-level access, and workload identity. The application generates V4 signed URLs and never exposes a permanent bucket URL.

## Security notes

- Passwords use Argon2id; opaque session, invitation, reset, and share tokens are hashed in PostgreSQL.
- Cookies are HTTP-only, `SameSite=Lax`, and secure in production. Mutations require the session-bound CSRF header.
- Workspace access is verified on every private operation, and non-member lookups return `404` to avoid disclosing workspace existence.
- Public links resolve one document, expire within 30 days, use generic invalid responses, and send no-index/no-referrer headers.
- Request logs use matched route patterns, so invitation/share tokens, cookies, signed URLs, and credentials are not logged.
- Every HTTP request receives a server-generated UUID in `X-Request-ID`. Completion and failure logs carry the same request ID, along with the matched route, status, user, and workspace when available.
- Successful state changes emit structured application events with stable identifiers, while background work logs claim, retry, failure, completion, maintenance, and outbox events using job/entity IDs. Passwords, tokens, signed URLs, object keys, and invitation email addresses are excluded or redacted.
- Health-check completions and SQL timings are logged only at debug/trace levels to keep normal production logs useful. SQL text is never logged.
- All environment settings are declared in `.env.example` and read through Convict. Application modules never access `process.env`.
- The app never calls `sequelize.sync()`; schema changes are migration-only.

Before production use, replace all development secrets, configure Google Identity Services on both web and API, configure GCS and SMTP, set the CORS/web origins, terminate TLS at the load balancer, and apply edge rate limiting.
