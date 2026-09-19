export async function up({ context: queryInterface }) {
  await queryInterface.sequelize.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), primary_email VARCHAR(320) NOT NULL,
      normalized_email VARCHAR(320) NOT NULL UNIQUE, display_name VARCHAR(120) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE auth_identities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider VARCHAR(20) NOT NULL CHECK (provider IN ('PASSWORD','GOOGLE')), provider_subject VARCHAR(320) NOT NULL,
      provider_email VARCHAR(320), password_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(provider, provider_subject)
    );
    CREATE TABLE sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE, csrf_token VARCHAR(128) NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ
    );
    CREATE INDEX sessions_user_active_idx ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;
    CREATE TABLE password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE bootstrap_invitations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), invited_email VARCHAR(320) NOT NULL, normalized_email VARCHAR(320) NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, accepted_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX bootstrap_invitation_pending_email_idx ON bootstrap_invitations(normalized_email)
      WHERE accepted_at IS NULL AND revoked_at IS NULL;
    CREATE TABLE workspaces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL,
      owner_user_id UUID NOT NULL REFERENCES users(id), root_item_id UUID,
      status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PENDING_DELETION','DELETED')),
      storage_used_bytes BIGINT NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deletion_scheduled_at TIMESTAMPTZ
    );
    CREATE TABLE workspace_memberships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, joined_at TIMESTAMPTZ NOT NULL,
      UNIQUE(workspace_id, user_id)
    );
    CREATE TABLE workspace_invitations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      invited_email VARCHAR(320) NOT NULL, normalized_email VARCHAR(320) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
      invited_by UUID NOT NULL REFERENCES users(id), expires_at TIMESTAMPTZ NOT NULL, accepted_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX workspace_invitation_pending_email_idx ON workspace_invitations(workspace_id, normalized_email)
      WHERE accepted_at IS NULL AND revoked_at IS NULL;
    CREATE TABLE workspace_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      parent_item_id UUID REFERENCES workspace_items(id), item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('ROOT','FOLDER','DOCUMENT')),
      display_name VARCHAR(255) NOT NULL, normalized_name VARCHAR(255) NOT NULL, created_by UUID NOT NULL REFERENCES users(id),
      lock_version INTEGER NOT NULL DEFAULT 0, deleted_at TIMESTAMPTZ, deleted_by UUID REFERENCES users(id), deletion_batch_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK ((item_type = 'ROOT' AND parent_item_id IS NULL) OR (item_type <> 'ROOT' AND parent_item_id IS NOT NULL))
    );
    CREATE UNIQUE INDEX workspace_root_idx ON workspace_items(workspace_id) WHERE item_type = 'ROOT';
    CREATE UNIQUE INDEX workspace_active_sibling_name_idx ON workspace_items(workspace_id, parent_item_id, normalized_name)
      WHERE deleted_at IS NULL;
    CREATE INDEX workspace_items_parent_idx ON workspace_items(workspace_id, parent_item_id) WHERE deleted_at IS NULL;
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_root_item_fk FOREIGN KEY(root_item_id) REFERENCES workspace_items(id);
    CREATE TABLE documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), item_id UUID NOT NULL UNIQUE REFERENCES workspace_items(id),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, original_filename VARCHAR(255) NOT NULL,
      storage_provider VARCHAR(20) NOT NULL, storage_container VARCHAR(255) NOT NULL, object_key VARCHAR(1024) NOT NULL,
      client_content_type VARCHAR(255) NOT NULL, detected_content_type VARCHAR(255), size_bytes BIGINT,
      checksum_sha256 CHAR(64), status VARCHAR(30) NOT NULL, rejection_reason VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(storage_container, object_key)
    );
    CREATE TABLE upload_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID NOT NULL REFERENCES documents(id),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, expected_size_bytes BIGINT NOT NULL,
      expected_content_type VARCHAR(255) NOT NULL, expected_checksum CHAR(64), status VARCHAR(20) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ, created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE share_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, token_hash CHAR(64) NOT NULL UNIQUE,
      allow_download BOOLEAN NOT NULL, expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ,
      last_accessed_at TIMESTAMPTZ, access_count INTEGER NOT NULL DEFAULT 0, created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE email_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), message_type VARCHAR(50) NOT NULL, workspace_id UUID REFERENCES workspaces(id),
      recipient_email VARCHAR(320) NOT NULL, subject VARCHAR(255) NOT NULL, template_name VARCHAR(100) NOT NULL,
      template_version INTEGER NOT NULL DEFAULT 1, template_data JSONB NOT NULL, related_entity_type VARCHAR(50),
      related_entity_id UUID, status VARCHAR(20) NOT NULL DEFAULT 'PENDING', provider_message_id VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ
    );
    CREATE TABLE email_delivery_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email_message_id UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
      attempt_number INTEGER NOT NULL, status VARCHAR(20) NOT NULL, error_code VARCHAR(100),
      sanitized_error_message VARCHAR(500), attempted_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_type VARCHAR(50) NOT NULL, payload JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL,
      locked_at TIMESTAMPTZ, locked_by VARCHAR(255), last_error VARCHAR(1000), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX jobs_claim_idx ON jobs(status, available_at) WHERE status IN ('PENDING','PROCESSING');
    CREATE TABLE outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), event_type VARCHAR(80) NOT NULL, aggregate_type VARCHAR(40) NOT NULL,
      aggregate_id UUID NOT NULL, payload JSONB NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, processed_at TIMESTAMPTZ,
      attempts INTEGER NOT NULL DEFAULT 0, last_error VARCHAR(1000)
    );
    CREATE INDEX outbox_pending_idx ON outbox_events(occurred_at) WHERE processed_at IS NULL;
    CREATE TABLE audit_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID REFERENCES workspaces(id), actor_user_id UUID REFERENCES users(id),
      action VARCHAR(80) NOT NULL, target_type VARCHAR(40) NOT NULL, target_id UUID, metadata JSONB NOT NULL DEFAULT '{}',
      request_id UUID, source_ip VARCHAR(64), user_agent VARCHAR(500), occurred_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX audit_workspace_time_idx ON audit_events(workspace_id, occurred_at DESC);
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.query(`
    DROP TABLE IF EXISTS audit_events, outbox_events, jobs, email_delivery_attempts, email_messages,
      share_links, upload_sessions, documents CASCADE;
    ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_root_item_fk;
    DROP TABLE IF EXISTS workspace_items, workspace_invitations, workspace_memberships, workspaces,
      bootstrap_invitations, password_reset_tokens, sessions, auth_identities, users CASCADE;
  `);
}
