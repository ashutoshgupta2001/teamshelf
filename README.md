# TeamShelf

TeamShelf is an invite-only document workspace. It is a JavaScript modular monolith with an Express API and worker, a React client, PostgreSQL-backed sessions/jobs/outbox, private GCS support, and a local file adapter for development.

## Run locally in five minutes with Docker

The application runs entirely in containers, so Node.js and npm do not need to be installed on the host. These steps work with any Docker-compatible runtime that supports Docker Compose. This guide assumes Docker is already installed and running. The first run may take longer on a slow connection while container images are downloaded.

### 1. Verify Docker

From a terminal, verify that the Docker engine and Compose are available:

```bash
docker info
docker compose version
```

Do not continue until both commands succeed.

### 2. Create the local configuration

From the repository root:

```bash
test -f .env || cp .env.example .env
```

The example file contains these local-only initial credentials:

```text
Email:    admin@example.com
Password: replace-with-a-strong-admin-password
```

They allow a first login without any manual database work. Change `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in `.env` before using the application on a shared machine. The password must contain at least 12 characters.

The `.env` file is ignored by Git. Never commit SMTP passwords, Google credentials, session secrets, or other real credentials.

### 3. Build and start the complete stack

```bash
docker compose --profile scanning up --build -d
```

Compose performs the startup in order: PostgreSQL becomes healthy, migrations run, the initial platform administrator and owned workspace are seeded, and then the API, worker, and web application start. The migration and seed containers are one-shot tasks and should exit successfully.

### 4. Verify the application

```bash
docker compose ps -a
curl --fail http://localhost:8080/health/ready
```

The health request should return:

```json
{ "status": "ready" }
```

Open the following URLs:

| Purpose             | URL                                  |
| ------------------- | ------------------------------------ |
| TeamShelf           | <http://localhost:8080>              |
| Mailpit email inbox | <http://localhost:8025>              |
| API readiness       | <http://localhost:8080/health/ready> |

Sign in to TeamShelf with the initial credentials from `.env`.

### Containers started locally

| Container  | Purpose                                       | Expected state                      |
| ---------- | --------------------------------------------- | ----------------------------------- |
| `web`      | Nginx frontend and API proxy                  | Running                             |
| `backend`  | HTTP API                                      | Running                             |
| `worker`   | Email, scanning, outbox, and maintenance jobs | Running                             |
| `postgres` | Application database                          | Running                             |
| `mailpit`  | Captures local emails                         | Running                             |
| `clamav`   | Scans uploaded documents                      | Running with the `scanning` profile |
| `migrate`  | Applies database migrations                   | Exited with code 0                  |
| `seed`     | Creates the initial admin and owned workspace | Exited with code 0                  |

The API and worker reuse the same backend image. Migrations and seeding also use that image but run as temporary containers. The frontend uses a separate Nginx image.

### Everyday commands

Follow logs:

```bash
docker compose logs -f backend worker web
```

Stop the application while preserving the database and uploaded files:

```bash
docker compose down
```

Start it again without rebuilding:

```bash
docker compose --profile scanning up -d
```

Rebuild after changing application code or dependencies:

```bash
docker compose --profile scanning up --build -d
```

The seed is idempotent. Restarting the stack does not recreate the initial user or overwrite its password.

### Send real email while using Docker

Mailpit is the default local SMTP server. It captures messages at <http://localhost:8025> and never delivers them externally. To deliver real email instead, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS`, and `SMTP_FROM_NAME` in `.env`. Compose passes these settings to the worker. The Mailpit container may remain running, but it is unused when `SMTP_HOST` points elsewhere.

For Gmail or Google Workspace using an App Password:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USERNAME=your-account@example.com
SMTP_PASSWORD=your-16-character-app-password
SMTP_FROM_ADDRESS=your-account@example.com
SMTP_FROM_NAME=TeamShelf
```

Port `587` uses STARTTLS with `SMTP_SECURE=false`; port `465` uses implicit TLS with `SMTP_SECURE=true`. Do not use the account's normal password. Google requires 2-Step Verification for App Passwords, and a Workspace administrator may disable them. The current mail adapter supports SMTP username/password authentication, not Gmail OAuth2. See [Google's application SMTP instructions](https://support.google.com/a/answer/176600) and [App Password help](https://support.google.com/mail/answer/185833).

Set `PUBLIC_APP_URL` to the public HTTPS URL that should appear in invitation and password-reset links. For example, after running `ngrok http 8080`:

```env
PUBLIC_APP_URL=https://your-subdomain.ngrok-free.app
```

Run ngrok in a separate terminal and access TeamShelf through that HTTPS URL. Free ngrok URLs can change between sessions; update `PUBLIC_APP_URL` whenever the URL changes. Restart the application after changing these values. Recreating `web` ensures Nginx resolves the recreated backend container:

```bash
docker compose --profile scanning up -d --force-recreate backend worker web
```

Create a platform invitation and follow worker delivery logs:

```bash
docker compose logs -f worker
```

The worker retries failed mail jobs. Before switching an existing database from Mailpit to real SMTP, check that you do not have test invitations waiting to be delivered.

### Troubleshooting

If Docker is unavailable, start your Docker runtime and inspect the available contexts:

```bash
docker context ls
docker info
```

If the wrong context is selected, activate the appropriate one with `docker context use <context-name>`.

If the API or worker does not start, inspect the startup tasks first:

```bash
docker compose logs migrate seed
docker compose logs backend worker
```

If a local port is already in use, choose different host ports in `.env`. `PUBLIC_APP_URL` must use the selected web port:

```env
POSTGRES_PORT=5433
API_HOST_PORT=4001
WEB_HOST_PORT=8081
MAILPIT_SMTP_PORT=1026
MAILPIT_UI_PORT=8026
CLAMAV_HOST_PORT=3311
PUBLIC_APP_URL=http://localhost:8081
```

Then recreate the stack:

```bash
docker compose --profile scanning up --build -d
```

Then open <http://localhost:8081>.

If image downloads fail with an error such as `missing or empty Content-Length header`, restart the Docker-compatible runtime, verify the active context with `docker context ls`, and retry the pulls before starting the stack:

```bash
docker compose pull postgres mailpit clamav
docker compose --profile scanning up --build -d
```

To run without the larger ClamAV container:

```bash
docker compose up --build -d
```

The rest of the application will work, but uploaded documents will remain unavailable with `SCAN_FAILED` because malware scanning fails closed.

To completely reset local data, run the following command. **This permanently deletes the local PostgreSQL database and uploaded files:**

```bash
docker compose down -v
```

## Run services directly on the host

Use this workflow when developing the Node.js application outside containers. It requires Node.js 22+ and npm 10+; Docker still provides PostgreSQL, Mailpit, and ClamAV.

```bash
test -f .env || cp .env.example .env
npm install
docker compose --profile scanning up -d postgres mailpit clamav
npm run dev
```

Open TeamShelf at <http://localhost:5173> and Mailpit at <http://localhost:8025>.

`npm run dev` applies pending migrations and runs the idempotent initial-admin seed before starting the application, web client, and worker. You can still run `npm run migrate` or `npm run seed:admin` separately when needed.

When using local Mailpit and ClamAV with this host-run workflow, set these values in `.env` because the Node.js processes connect through published host ports rather than Docker service names:

```env
SMTP_HOST=localhost
CLAMAV_HOST=localhost
APP_BASE_URL=http://localhost:4000
WEB_BASE_URL=http://localhost:5173
```

`APP_HOST` defaults to `127.0.0.1`, which keeps a host-run API local to the machine. Compose overrides it with `0.0.0.0` inside containers so Docker can forward traffic to the API.

`TRUST_PROXY` is the number of trusted reverse-proxy hops. Keep it at `0` when running the API directly; Compose sets it to `1` because Nginx is the single proxy in front of the backend. Set this to the exact proxy count in other deployments so client IP checks and rate limits cannot be bypassed.

## Commands

```text
npm run dev             API, web and worker
npm run dev:app         Express application on port 4000
npm run dev:web         Vite on port 5173
npm run dev:worker      PostgreSQL job worker
npm run migrate         Apply all Sequelize migrations
npm run migrate:undo    Revert the most recent migration
npm run seed:admin      Idempotently create the configured initial admin
npm run admin:create-bootstrap-invitation -- --email user@example.com
                        Queue a break-glass administrator invitation
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

## Administration and workspace ownership

Platform administration and workspace ownership are separate permissions:

- A platform `ADMIN` can open **Administration** from the workspace selector and invite new TeamShelf accounts. Invitees always start as regular users. An administrator can promote them later with **Make admin** on the Users tab, or demote administrators when needed. The final active administrator cannot be demoted.
- A workspace owner manages only that workspace from **People**. The owner can invite existing active TeamShelf users, remove members, and transfer ownership to an existing member. Workspace invitations never create new platform accounts. After a transfer, only the new owner can manage workspace access.
- A platform administrator does not automatically receive access to every workspace. A workspace owner must add them like any other member.
- A workspace owner does not automatically receive platform administration access.

The account configured by `INITIAL_ADMIN_EMAIL` is seeded as both the first platform administrator and the owner of the initial workspace. The seed is idempotent and also promotes an existing configured account to platform administrator after upgrading an older database.

The expected onboarding sequence is:

1. A platform administrator creates an invitation from **Administration → Invitations**. The invitation always creates a regular platform user.
2. The invitee accepts the link and creates the TeamShelf account. The administrator can then use **Make admin** from **Administration → Users** if needed.
3. A workspace owner invites that existing active account from **Workspace → People → Invitations**.
4. The user accepts the workspace invitation and becomes a member. Already-added members and unknown, disabled, or not-yet-registered email addresses are rejected.

Every active pending invitation displays its complete invitation URL and a **Copy** button. The link remains available after a page refresh. **Resend** extends the expiry and emails the same signed link again; revoking or accepting the invitation makes the link unusable and removes it from the pending list.

### Emergency administrator recovery

Routine invitations must use the Administration UI and always create regular users. If administrator access is lost because of manual database changes or account disabling, an operator with application-shell and database access can create a break-glass invitation that grants `ADMIN` directly:

```bash
docker compose run --rm backend \
  node app/src/commands/create-bootstrap-invitation.js --email admin@example.com
```

The command queues an email through the configured SMTP server. Use it only for recovery, protect shell/database access, and review the resulting audit event.

## Storage

Local development defaults to `STORAGE_PROVIDER=local`. Upload/download authorizations are short-lived HMAC-signed local URLs. Shared and production environments should use `STORAGE_PROVIDER=gcs`, a private bucket, uniform bucket-level access, and workload identity. The application generates V4 signed URLs and never exposes a permanent bucket URL.

## Security notes

- Passwords use Argon2id. Opaque session, reset, share, and recovery-invitation tokens are hashed in PostgreSQL. Workspace and platform invitation URLs are HMAC-signed, resolve only active database records, and become unusable after acceptance, revocation, or expiry.
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
