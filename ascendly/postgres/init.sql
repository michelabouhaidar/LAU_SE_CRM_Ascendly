CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(50)  NOT NULL UNIQUE,
  permissions_level INT          NOT NULL DEFAULT 1,
  description       TEXT
);

INSERT INTO roles (name, permissions_level, description) VALUES
  ('Admin',         5, 'Full system access including user management and audit logs'),
  ('Sales Manager', 4, 'View all deals, approve discounts, team dashboard'),
  ('Sales Rep',     3, 'Own deals, contacts, tasks, approval requests'),
  ('SDR',           2, 'New/Contacted/Qualified stages only'),
  ('Finance',       1, 'Read-only access to won deals and revenue reports')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS organizations (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL UNIQUE,
  industry     VARCHAR(100),
  founded_date DATE,
  country      VARCHAR(100),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(50),
  password_hash   TEXT         NOT NULL,
  role            VARCHAR(50)  NOT NULL REFERENCES roles(name),
  join_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  failed_attempts INT          NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ  DEFAULT NULL,
  token_version          INT          NOT NULL DEFAULT 0,          
  password_reset_required BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_org_email
  ON employees(org_id, LOWER(email));

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_employee ON refresh_tokens(employee_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires  ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS stage_catalog (
  id                  UUID         PRIMARY KEY,
  name                VARCHAR(100) NOT NULL UNIQUE,
  position            INT          NOT NULL UNIQUE,
  default_probability INT          NOT NULL DEFAULT 0 CHECK (default_probability BETWEEN 0 AND 100),
  is_terminal         BOOLEAN      NOT NULL DEFAULT false
);

INSERT INTO stage_catalog (id, name, position, default_probability, is_terminal) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'New',         1,  10, false),
  ('a1000000-0000-0000-0000-000000000002', 'Contacted',   2,  20, false),
  ('a1000000-0000-0000-0000-000000000003', 'Qualified',   3,  40, false),
  ('a1000000-0000-0000-0000-000000000004', 'Proposal',    4,  60, false),
  ('a1000000-0000-0000-0000-000000000005', 'Negotiation', 5,  80, false),
  ('a1000000-0000-0000-0000-000000000006', 'Won',         6, 100, true),
  ('a1000000-0000-0000-0000-000000000007', 'Lost',        7,   0, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS stage_required_fields (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES stage_catalog(id) ON DELETE CASCADE,
  field    VARCHAR(100) NOT NULL,
  UNIQUE(stage_id, field)
);

CREATE TABLE IF NOT EXISTS org_active_stages (
  org_id    UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stage_id  UUID    NOT NULL REFERENCES stage_catalog(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (org_id, stage_id)
);

CREATE TABLE IF NOT EXISTS lead_sources (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label      VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(org_id, label)
);

CREATE TABLE IF NOT EXISTS contacts (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by  UUID         NOT NULL REFERENCES employees(id),
  full_name   VARCHAR(255) NOT NULL,
  email       VARCHAR(255),
  phone       VARCHAR(50),
  company     VARCHAR(255),
  lead_source VARCHAR(100),
  notes       TEXT,
  deleted_at  TIMESTAMPTZ,                                  
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_org_email
  ON contacts(org_id, LOWER(email))
  WHERE email IS NOT NULL AND email != '';

CREATE TABLE IF NOT EXISTS contact_tags (
  id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name   VARCHAR(50)  NOT NULL,
  color  CHAR(7)      NOT NULL DEFAULT '#6B7A90',
  UNIQUE(org_id, name)
);

CREATE TABLE IF NOT EXISTS contact_tag_assignments (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES contact_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tag_assignments_contact ON contact_tag_assignments(contact_id);

CREATE TABLE IF NOT EXISTS org_deal_counters (
  org_id      UUID   PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  last_number BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS deals (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id            UUID          NOT NULL REFERENCES employees(id),
  contact_id          UUID          NOT NULL REFERENCES contacts(id),
  stage_id            UUID          NOT NULL REFERENCES stage_catalog(id),
  deal_number         BIGSERIAL,
  title               VARCHAR(255)  NOT NULL,
  description         TEXT,
  expected_value      NUMERIC(15,2),
  probability         INT           CHECK (probability BETWEEN 0 AND 100),
  expected_close_date DATE,
  status              VARCHAR(10)   NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Won','Lost')),
  final_value         NUMERIC(15,2),
  contract_date       DATE,
  lost_reason         TEXT,
  deleted_at          TIMESTAMPTZ,                          
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deal_value_history (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    UUID          NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  changed_by UUID          NOT NULL REFERENCES employees(id),
  old_value  NUMERIC(15,2),
  new_value  NUMERIC(15,2),
  changed_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deal_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    UUID        NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES employees(id),
  body       TEXT        NOT NULL,
  mentions   JSONB       NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deal_templates (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by     UUID          NOT NULL REFERENCES employees(id),
  name           VARCHAR(120)  NOT NULL,
  title          VARCHAR(200)  NOT NULL,
  description    TEXT,
  expected_value NUMERIC(14,2),
  probability    INTEGER       CHECK (probability BETWEEN 0 AND 100),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID        NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  logged_by   UUID        NOT NULL REFERENCES employees(id),
  type        VARCHAR(20) NOT NULL CHECK (type IN ('Call','Email','Meeting')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary     TEXT        NOT NULL,
  next_step   TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID         REFERENCES deals(id)    ON DELETE SET NULL,
  contact_id  UUID         REFERENCES contacts(id) ON DELETE SET NULL,
  created_by  UUID         NOT NULL REFERENCES employees(id),
  assigned_to UUID         REFERENCES employees(id),
  title       VARCHAR(255) NOT NULL,
  type        VARCHAR(50),
  due_date    DATE,
  status      VARCHAR(20)  NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Done')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approvals (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID          NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  requested_by  UUID          NOT NULL REFERENCES employees(id),
  reviewed_by   UUID          REFERENCES employees(id),
  type          VARCHAR(100)  NOT NULL,
  discount_pct  NUMERIC(5,2)  CHECK (discount_pct BETWEEN 0 AND 100),
  justification TEXT,
  status        VARCHAR(20)   NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
  request_date  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  decision_date TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  actor_id    UUID         REFERENCES employees(id) ON DELETE SET NULL,
  org_id      UUID         REFERENCES organizations(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  description TEXT,
  entity_type VARCHAR(50),
  entity_id   TEXT,
  chain_hash  TEXT,                                         
  occurred_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deal_stage_history (
  id        BIGSERIAL    PRIMARY KEY,
  deal_id   UUID         NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage UUID        REFERENCES stage_catalog(id),
  to_stage  UUID         NOT NULL REFERENCES stage_catalog(id),
  moved_by  UUID         NOT NULL REFERENCES employees(id),
  moved_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_owner      ON deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage      ON deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_status     ON deals(status);
CREATE INDEX IF NOT EXISTS idx_contacts_org     ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned   ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_audit_actor      ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_org        ON audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_occurred   ON audit_log(occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity     ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approvals_deal   ON approvals(deal_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

CREATE INDEX IF NOT EXISTS idx_deals_org               ON deals(org_id);
CREATE INDEX IF NOT EXISTS idx_deals_org_status        ON deals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_stage_history_deal       ON deal_stage_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_deal_moved ON deal_stage_history(deal_id, moved_at);
CREATE INDEX IF NOT EXISTS idx_interactions_deal        ON interactions(deal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by         ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_deal               ON tasks(deal_id);

CREATE INDEX IF NOT EXISTS idx_contacts_active     ON contacts(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deals_active        ON deals(org_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deal_value_history_deal ON deal_value_history(deal_id);

CREATE INDEX IF NOT EXISTS idx_deal_comments_deal   ON deal_comments(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_comments_author ON deal_comments(author_id);

CREATE INDEX IF NOT EXISTS deal_templates_org_id_idx ON deal_templates(org_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_occurred   ON audit_log(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_org_deleted     ON contacts(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deals_contact            ON deals(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_interactions_deal_occurred ON interactions(deal_id, occurred_at DESC);

INSERT INTO schema_migrations (version) VALUES
  ('0001_initial_schema'),
  ('0002_deal_stage_history'),
  ('0003_performance_indexes'),
  ('0004_security_hardening'),
  ('0005_data_logic_hardening'),
  ('0006_deal_comments'),
  ('0007_performance'),
  ('002_contact_tags'),
  ('003_deal_templates')
ON CONFLICT (version) DO NOTHING;
