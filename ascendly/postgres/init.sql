-- ══════════════════════════════════════════════════════════════════
--  Ascendly CRM — Complete PostgreSQL Schema
--  Includes all migrations (0001-0007, 002-003) in one file.
--  Applied automatically on first container start via initdb.d.
-- ══════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Migration version tracker ─────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS schema_migrations (
--   version    TEXT PRIMARY KEY,
--   applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

-- ── ROLES ─────────────────────────────────────────────────────────
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

-- ── ORGANIZATIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL UNIQUE,
  industry     VARCHAR(100),
  founded_date DATE,
  country      VARCHAR(100),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── EMPLOYEES ─────────────────────────────────────────────────────
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
  token_version          INT          NOT NULL DEFAULT 0,          -- migration 0004
  password_reset_required BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Per-org unique email (case-insensitive)  -- migration 0004
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_org_email
  ON employees(org_id, LOWER(email));

-- ── REFRESH TOKENS  (migration 0004) ──────────────────────────────
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

-- ── STAGE CATALOG  (global, fixed list) ───────────────────────────
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

-- ── STAGE REQUIRED FIELDS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stage_required_fields (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES stage_catalog(id) ON DELETE CASCADE,
  field    VARCHAR(100) NOT NULL,
  UNIQUE(stage_id, field)
);

-- ── ORG ACTIVE STAGES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_active_stages (
  org_id    UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stage_id  UUID    NOT NULL REFERENCES stage_catalog(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (org_id, stage_id)
);

-- ── LEAD SOURCES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_sources (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label      VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(org_id, label)
);

-- ── CONTACTS ──────────────────────────────────────────────────────
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
  deleted_at  TIMESTAMPTZ,                                  -- migration 0005
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Per-org unique contact email (case-insensitive, non-empty)  -- migration 0005
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_org_email
  ON contacts(org_id, LOWER(email))
  WHERE email IS NOT NULL AND email != '';

-- ── CONTACT TAGS  (migration 002) ─────────────────────────────────
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

-- ── ORG DEAL COUNTERS  (migration 0005) ───────────────────────────
CREATE TABLE IF NOT EXISTS org_deal_counters (
  org_id      UUID   PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  last_number BIGINT NOT NULL DEFAULT 0
);

-- ── DEALS ─────────────────────────────────────────────────────────
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
  deleted_at          TIMESTAMPTZ,                          -- migration 0005
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── DEAL VALUE HISTORY  (migration 0005) ──────────────────────────
CREATE TABLE IF NOT EXISTS deal_value_history (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    UUID          NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  changed_by UUID          NOT NULL REFERENCES employees(id),
  old_value  NUMERIC(15,2),
  new_value  NUMERIC(15,2),
  changed_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── DEAL COMMENTS  (migration 0006) ───────────────────────────────
CREATE TABLE IF NOT EXISTS deal_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    UUID        NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES employees(id),
  body       TEXT        NOT NULL,
  mentions   JSONB       NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── DEAL TEMPLATES  (migration 003) ───────────────────────────────
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

-- ── INTERACTIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID        NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  logged_by   UUID        NOT NULL REFERENCES employees(id),
  type        VARCHAR(20) NOT NULL CHECK (type IN ('Call','Email','Meeting')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary     TEXT        NOT NULL,
  next_step   TEXT
);

-- ── TASKS ─────────────────────────────────────────────────────────
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

-- ── APPROVALS ─────────────────────────────────────────────────────
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

-- ── AUDIT LOG ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  actor_id    UUID         REFERENCES employees(id) ON DELETE SET NULL,
  org_id      UUID         REFERENCES organizations(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  description TEXT,
  entity_type VARCHAR(50),
  entity_id   TEXT,
  chain_hash  TEXT,                                         -- migration 0004
  occurred_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── DEAL STAGE HISTORY ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deal_stage_history (
  id        BIGSERIAL    PRIMARY KEY,
  deal_id   UUID         NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage UUID        REFERENCES stage_catalog(id),
  to_stage  UUID         NOT NULL REFERENCES stage_catalog(id),
  moved_by  UUID         NOT NULL REFERENCES employees(id),
  moved_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════════
--  INDEXES  (migrations 0001, 0003, 0005, 0006, 0007)
-- ════════════════════════════════════════════════════════════════════

-- Core indexes (0001)
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

-- Performance indexes (0003)
CREATE INDEX IF NOT EXISTS idx_deals_org               ON deals(org_id);
CREATE INDEX IF NOT EXISTS idx_deals_org_status        ON deals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_stage_history_deal       ON deal_stage_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_deal_moved ON deal_stage_history(deal_id, moved_at);
CREATE INDEX IF NOT EXISTS idx_interactions_deal        ON interactions(deal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by         ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_deal               ON tasks(deal_id);

-- Soft-delete partial indexes (0005)
CREATE INDEX IF NOT EXISTS idx_contacts_active     ON contacts(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deals_active        ON deals(org_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deal_value_history_deal ON deal_value_history(deal_id);

-- Deal comments indexes (0006)
CREATE INDEX IF NOT EXISTS idx_deal_comments_deal   ON deal_comments(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_comments_author ON deal_comments(author_id);

-- Deal templates index (003)
CREATE INDEX IF NOT EXISTS deal_templates_org_id_idx ON deal_templates(org_id);

-- Performance indexes (0007)
CREATE INDEX IF NOT EXISTS idx_audit_log_org_occurred   ON audit_log(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_org_deleted     ON contacts(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deals_contact            ON deals(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_interactions_deal_occurred ON interactions(deal_id, occurred_at DESC);



-- -- ════════════════════════════════════════════════════════════════════
-- --  DEMO DATA
-- --  ─────────────────────────────────────────────────────────────────
-- --  Remove or comment out everything from this marker to the end of
-- --  the file to start with a clean, empty organisation.
-- -- ════════════════════════════════════════════════════════════════════
-- --  Ascendly CRM — Demo Co Seed Data
-- --  Org:  Ascendly Demo Co  (0e53696e-2aca-491b-b2d1-9c643aa26ec7)
-- -- ══════════════════════════════════════════════════════════════════

-- -- Short aliases
-- DO $$
-- DECLARE
-- ══════════════════════════════════════════════════════════════════
--  Ascendly CRM — Full Demo Seed
--  Run against a live database to wipe + repopulate demo data.
--  Password for all users: Admin@1234
-- ══════════════════════════════════════════════════════════════════

-- ── Wipe all data (FK-safe order) ────────────────────────────────
TRUNCATE TABLE
  audit_log, approvals, deal_stage_history, deal_value_history,
  deal_comments, deal_templates, interactions, tasks,
  contact_tag_assignments, contact_tags, deals, org_deal_counters,
  contacts, lead_sources, org_active_stages,
  refresh_tokens, employees, organizations
CASCADE;

DO $$
DECLARE
  -- ── orgs ──────────────────────────────────────────────────────
  org      UUID := 'a0000002-0000-0000-0000-000000000001'; -- Northwind Labs (demo org)

  -- ── employees ─────────────────────────────────────────────────
  pw       TEXT := '$2a$12$IUTaRlax.MveoqNrdosSWekZbXaBQbxq3tZz2.cFgIEezlwFT2xme'; -- Admin@1234
--   sysadmin UUID := 'e0000001-0000-0000-0000-000000000001';
  admin    UUID := 'e0000002-0000-0000-0000-000000000001';
  maya     UUID := 'e0000003-0000-0000-0000-000000000001'; -- Sales Manager
  bilal    UUID := 'e0000004-0000-0000-0000-000000000001'; -- Sales Manager
  lina     UUID := 'e0000005-0000-0000-0000-000000000001'; -- Sales Rep
  rami     UUID := 'e0000006-0000-0000-0000-000000000001'; -- Sales Rep
  omar     UUID := 'e0000007-0000-0000-0000-000000000001'; -- SDR
  nour     UUID := 'e0000008-0000-0000-0000-000000000001'; -- Finance

  -- ── stages ────────────────────────────────────────────────────
  s_new  UUID := 'a1000000-0000-0000-0000-000000000001';
  s_con  UUID := 'a1000000-0000-0000-0000-000000000002';
  s_qual UUID := 'a1000000-0000-0000-0000-000000000003';
  s_prop UUID := 'a1000000-0000-0000-0000-000000000004';
  s_neg  UUID := 'a1000000-0000-0000-0000-000000000005';
  s_won  UUID := 'a1000000-0000-0000-0000-000000000006';
  s_lost UUID := 'a1000000-0000-0000-0000-000000000007';

  -- ── contact vars ──────────────────────────────────────────────
  c01 UUID; c02 UUID; c03 UUID; c04 UUID; c05 UUID;
  c06 UUID; c07 UUID; c08 UUID; c09 UUID; c10 UUID;
  c11 UUID; c12 UUID; c13 UUID; c14 UUID; c15 UUID;
  c16 UUID; c17 UUID; c18 UUID; c19 UUID; c20 UUID;

  -- ── deal vars ─────────────────────────────────────────────────
  d01 UUID; d02 UUID; d03 UUID; d04 UUID; d05 UUID;
  d06 UUID; d07 UUID; d08 UUID; d09 UUID; d10 UUID;
  d11 UUID; d12 UUID; d13 UUID; d14 UUID; d15 UUID;
  d16 UUID; d17 UUID; d18 UUID; d19 UUID; d20 UUID;
  d21 UUID; d22 UUID; d23 UUID; d24 UUID; d25 UUID;
  d26 UUID; d27 UUID; d28 UUID; d29 UUID; d30 UUID;
  d31 UUID; d32 UUID; d33 UUID; d34 UUID; d35 UUID;
  d36 UUID; d37 UUID; d38 UUID; d39 UUID; d40 UUID;
  d41 UUID; d42 UUID;

  -- ── bulk seed vars ────────────────────────────────────────────
  deal_id    UUID;
  c_id       UUID;
  o_id       UUID;
  i          INTEGER;
  created_ts TIMESTAMPTZ;
  close_ts   TIMESTAMPTZ;
  d_title    TEXT;
  d_value    NUMERIC;
  f_value    NUMERIC;
  d_close    DATE;
  n_contacts INTEGER;
  contact_ids UUID[];
  owner_ids   UUID[];

  companies TEXT[] := ARRAY[
    'TechForge','DataStream','CloudNine','NetSphere','PipelineHub',
    'SalesAxis','RevEngine','MarketPulse','GrowthLab','OptiCRM',
    'FunnelPro','LeadWave','DealForce','SyncBase','ConnectHub',
    'FlowDesk','TaskGrid','ScaleUp','ReachOut','PivotCRM',
    'LoopTech','AgileBase','CoreSync','VeloCloud','PrimeCRM',
    'NexusOps','SparkHub','ZenSales','AgilePipe','BoostCRM',
    'ProSync','EliteDesk','SwiftCRM','NovaPipe','FluxBase',
    'DigiOps','CodeSales','TechSync','DataPipe','CloudBase',
    'BoltCRM','GridPro','NexFlow','WarpSales','OmniPipe',
    'RapidBase','TurboSync','PeakOps','SummitCRM','ApexFlow'
  ];
  products TEXT[] := ARRAY[
    'Enterprise Plan','Pro License','Team Bundle','Annual Contract',
    'Platform Deal','CRM Suite','Starter Package','Growth Tier',
    'Business Plan','Premium Setup'
  ];
  lost_reasons TEXT[] := ARRAY[
    'Chose competitor (Salesforce)','No budget this quarter',
    'Chose competitor (HubSpot)','Project cancelled internally',
    'Technical requirements not met','Went with Pipedrive',
    'Deal deferred to next fiscal year','Procurement freeze'
  ];

BEGIN

-- ── ORGANIZATIONS ─────────────────────────────────────────────────
INSERT INTO organizations (id, name, industry, country, created_at) VALUES
  (org, 'Northwind Labs', 'Technology', 'Lebanon', NOW() - INTERVAL '1 year');

-- ── EMPLOYEES ─────────────────────────────────────────────────────
INSERT INTO employees (id, org_id, name, email, phone, password_hash, role, is_active) VALUES
  (admin, org, 'Admin User', 'admin@northwind.test', '+1-000-000-0000', pw, 'Admin', true),
  (maya,     org,     'Maya Manager',    'maya.manager@northwind.test',    '+1-415-555-0200', pw, 'Sales Manager', true),
  (bilal,    org,     'Bilal Manager',   'bilal.manager@northwind.test',   '+1-415-555-0201', pw, 'Sales Manager', true),
  (lina,     org,     'Lina Rep',        'lina.rep@northwind.test',        '+1-415-555-0202', pw, 'Sales Rep',     true),
  (rami,     org,     'Rami Rep',        'rami.rep@northwind.test',        '+1-415-555-0203', pw, 'Sales Rep',     true),
  (omar,     org,     'Omar SDR',        'omar.sdr@northwind.test',        '+1-415-555-0204', pw, 'SDR',           true),
  (nour,     org,     'Nour Finance',    'nour.finance@northwind.test',    '+1-415-555-0205', pw, 'Finance',       true);

-- ── ORG ACTIVE STAGES ─────────────────────────────────────────────
INSERT INTO org_active_stages (org_id, stage_id, is_active) VALUES
  (org, s_new,  true),
  (org, s_con,  true),
  (org, s_qual, true),
  (org, s_prop, true),
  (org, s_neg,  true),
  (org, s_won,  true),
  (org, s_lost, true);

-- ── LEAD SOURCES ──────────────────────────────────────────────────
INSERT INTO lead_sources (org_id, label) VALUES
  (org, 'Website'),    (org, 'Referral'),    (org, 'Cold Outreach'),
  (org, 'LinkedIn'),   (org, 'Cold Email'),  (org, 'Ad Campaign'),
  (org, 'Event'),      (org, 'Walk-in'),     (org, 'Partner')
ON CONFLICT DO NOTHING;

-- ── CONTACT TAGS ──────────────────────────────────────────────────
INSERT INTO contact_tags (org_id, name, color) VALUES
  (org, 'VIP',        '#F59E0B'),
  (org, 'Enterprise', '#8B5CF6'),
  (org, 'SMB',        '#3B82F6'),
  (org, 'Tech',       '#14B8A6'),
  (org, 'Finance',    '#22C55E'),
  (org, 'Decision Maker', '#F97316')
ON CONFLICT DO NOTHING;

-- ── CONTACTS (20 B2B contacts) ────────────────────────────────────
INSERT INTO contacts (org_id, created_by, full_name, email, phone, company, lead_source, notes)
VALUES
  (org, omar,  'Marcus Holloway',  'marcus.holloway@nexatech.io',  '+1-312-555-0101', 'NexaTech',       'Cold Outreach', 'Key contact in ops team'),
  (org, omar,  'Priya Nair',       'priya.nair@cloudpivot.com',    '+1-415-555-0102', 'CloudPivot',     'LinkedIn',      'Manages 15-person sales team'),
  (org, lina,  'Ethan Caldwell',   'ethan.c@vertexops.com',        '+1-646-555-0103', 'VertexOps',      'Referral',      'Referred by existing customer'),
  (org, lina,  'Sofia Reyes',      'sofia.reyes@brightloop.co',    '+1-512-555-0104', 'BrightLoop',     'Website',       'Marketing director, 20-person team'),
  (org, rami,  'James Whitfield',  'j.whitfield@corepath.io',      '+1-213-555-0105', 'CorePath',       'Event',         'IT lead, enterprise buyer'),
  (org, rami,  'Amara Osei',       'amara.osei@datavault.ai',      '+1-404-555-0106', 'DataVault AI',   'Cold Email',    'CTO, data platform company'),
  (org, omar,  'Nathan Brooks',    'n.brooks@pulsework.io',        '+1-206-555-0107', 'PulseWork',      'Ad Campaign',   'Small team, 12 seats'),
  (org, lina,  'Isla Fernandez',   'isla.f@meridianlogic.com',     '+1-303-555-0108', 'MeridianLogic',  'Referral',      'Multi-user pipeline need'),
  (org, rami,  'Kwame Asante',     'kwame.a@infrastack.dev',       '+1-617-555-0109', 'InfraStack',     'LinkedIn',      'DevOps team, exploring sales tooling'),
  (org, lina,  'Chloe Bergmann',   'c.bergmann@quantumhive.com',   '+1-718-555-0110', 'QuantumHive',    'Website',       'Budget $50k confirmed, procurement involved'),
  (org, maya,  'Leo Tanaka',       'leo.tanaka@swiftbridge.io',    '+1-408-555-0111', 'SwiftBridge',    'Cold Outreach', '40 seats, decision by end of April'),
  (org, rami,  'Nadia Volkov',     'nadia.v@alphanode.com',        '+1-214-555-0112', 'AlphaNode',      'Referral',      'Moving from spreadsheets'),
  (org, lina,  'Diego Morales',    'diego.m@clearflow.tech',       '+1-305-555-0113', 'ClearFlow Tech', 'Event',         'Budget and timeline confirmed'),
  (org, omar,  'Fatima El-Amine',  'fatima.e@nexgen-erp.com',      '+1-202-555-0114', 'NexGen ERP',     'Cold Email',    'Wants product demo'),
  (org, rami,  'Ryan Okafor',      'ryan.o@peakventures.co',       '+1-469-555-0115', 'Peak Ventures',  'Partner',       '3 portfolio companies to onboard'),
  (org, lina,  'Hannah Kim',       'h.kim@stackwise.io',           '+1-503-555-0116', 'StackWise',      'LinkedIn',      'Small dev team, 8 seats'),
  (org, omar,  'Carlos Mendez',    'carlos.m@bitstream-labs.com',  '+1-702-555-0117', 'BitStream Labs', 'Ad Campaign',   'Referral from existing customer'),
  (org, rami,  'Sasha Ivanova',    'sasha.i@orbitsales.com',       '+1-312-555-0118', 'OrbitSales',     'Website',       'Requested pricing discussion'),
  (org, lina,  'Tariq Hussain',    'tariq.h@growthengine.co',      '+1-415-555-0119', 'GrowthEngine',   'Cold Outreach', 'Evaluating 3 CRM vendors'),
  (org, maya,  'Maya Richardson',  'maya.r@novaanalytics.io',      '+1-646-555-0120', 'Nova Analytics', 'Referral',      'VP of Data, strong champion');

SELECT id INTO c01 FROM contacts WHERE email='marcus.holloway@nexatech.io'  AND org_id=org;
SELECT id INTO c02 FROM contacts WHERE email='priya.nair@cloudpivot.com'    AND org_id=org;
SELECT id INTO c03 FROM contacts WHERE email='ethan.c@vertexops.com'        AND org_id=org;
SELECT id INTO c04 FROM contacts WHERE email='sofia.reyes@brightloop.co'    AND org_id=org;
SELECT id INTO c05 FROM contacts WHERE email='j.whitfield@corepath.io'      AND org_id=org;
SELECT id INTO c06 FROM contacts WHERE email='amara.osei@datavault.ai'      AND org_id=org;
SELECT id INTO c07 FROM contacts WHERE email='n.brooks@pulsework.io'        AND org_id=org;
SELECT id INTO c08 FROM contacts WHERE email='isla.f@meridianlogic.com'     AND org_id=org;
SELECT id INTO c09 FROM contacts WHERE email='kwame.a@infrastack.dev'       AND org_id=org;
SELECT id INTO c10 FROM contacts WHERE email='c.bergmann@quantumhive.com'   AND org_id=org;
SELECT id INTO c11 FROM contacts WHERE email='leo.tanaka@swiftbridge.io'    AND org_id=org;
SELECT id INTO c12 FROM contacts WHERE email='nadia.v@alphanode.com'        AND org_id=org;
SELECT id INTO c13 FROM contacts WHERE email='diego.m@clearflow.tech'       AND org_id=org;
SELECT id INTO c14 FROM contacts WHERE email='fatima.e@nexgen-erp.com'      AND org_id=org;
SELECT id INTO c15 FROM contacts WHERE email='ryan.o@peakventures.co'       AND org_id=org;
SELECT id INTO c16 FROM contacts WHERE email='h.kim@stackwise.io'           AND org_id=org;
SELECT id INTO c17 FROM contacts WHERE email='carlos.m@bitstream-labs.com'  AND org_id=org;
SELECT id INTO c18 FROM contacts WHERE email='sasha.i@orbitsales.com'       AND org_id=org;
SELECT id INTO c19 FROM contacts WHERE email='tariq.h@growthengine.co'      AND org_id=org;
SELECT id INTO c20 FROM contacts WHERE email='maya.r@novaanalytics.io'      AND org_id=org;

-- ── DEALS — NEW (8) ───────────────────────────────────────────────
INSERT INTO deals (id, org_id, owner_id, contact_id, stage_id, title, expected_value, probability, expected_close_date, status, description, created_at, updated_at) VALUES
  (gen_random_uuid(), org, omar,  c01, s_new, 'NexaTech — CRM Starter Plan',        12000, 10, '2026-06-15', 'Open', 'Initial outreach via cold email. Prospect showed interest in pipeline management.', NOW()-INTERVAL '3 days',  NOW()-INTERVAL '3 days'),
  (gen_random_uuid(), org, omar,  c02, s_new, 'CloudPivot — Analytics Module',       8500,  10, '2026-06-20', 'Open', 'LinkedIn connection converted to a call. Looking for reporting dashboards.',        NOW()-INTERVAL '2 days',  NOW()-INTERVAL '2 days'),
  (gen_random_uuid(), org, omar,  c07, s_new, 'PulseWork — Team Onboarding Pack',    5500,  10, '2026-07-01', 'Open', 'Inbound from ad campaign. Small team, 12 seats.',                                  NOW()-INTERVAL '1 day',   NOW()-INTERVAL '1 day'),
  (gen_random_uuid(), org, omar,  c14, s_new, 'NexGen ERP — Integration Add-on',    14000, 10, '2026-07-10', 'Open', 'Cold email reply requesting a product demo next week.',                            NOW()-INTERVAL '4 days',  NOW()-INTERVAL '4 days'),
  (gen_random_uuid(), org, lina,  c17, s_new, 'BitStream Labs — Starter License',    7200,  10, '2026-06-28', 'Open', 'Referral from existing customer. Need basic CRM features.',                       NOW()-INTERVAL '2 days',  NOW()-INTERVAL '2 days'),
  (gen_random_uuid(), org, rami,  c18, s_new, 'OrbitSales — Entry Package',          6000,  10, '2026-06-30', 'Open', 'Website sign-up, requested a call to discuss pricing.',                           NOW()-INTERVAL '1 day',   NOW()-INTERVAL '1 day'),
  (gen_random_uuid(), org, rami,  c09, s_new, 'InfraStack — DevOps CRM Bundle',     18000, 10, '2026-07-15', 'Open', 'Event contact. Engineering team exploring sales tooling.',                        NOW()-INTERVAL '5 days',  NOW()-INTERVAL '5 days'),
  (gen_random_uuid(), org, lina,  c19, s_new, 'GrowthEngine — Growth CRM Tier',      9500,  10, '2026-07-05', 'Open', 'Cold outreach response. Evaluating 3 vendors.',                                   NOW()-INTERVAL '3 days',  NOW()-INTERVAL '3 days');

SELECT id INTO d01 FROM deals WHERE title='NexaTech — CRM Starter Plan'     AND org_id=org;
SELECT id INTO d02 FROM deals WHERE title='CloudPivot — Analytics Module'    AND org_id=org;
SELECT id INTO d03 FROM deals WHERE title='PulseWork — Team Onboarding Pack' AND org_id=org;
SELECT id INTO d04 FROM deals WHERE title='NexGen ERP — Integration Add-on'  AND org_id=org;
SELECT id INTO d05 FROM deals WHERE title='BitStream Labs — Starter License'  AND org_id=org;
SELECT id INTO d06 FROM deals WHERE title='OrbitSales — Entry Package'        AND org_id=org;
SELECT id INTO d07 FROM deals WHERE title='InfraStack — DevOps CRM Bundle'   AND org_id=org;
SELECT id INTO d08 FROM deals WHERE title='GrowthEngine — Growth CRM Tier'   AND org_id=org;

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at) VALUES
  (d01, NULL, s_new, omar,  NOW()-INTERVAL '3 days'),
  (d02, NULL, s_new, omar,  NOW()-INTERVAL '2 days'),
  (d03, NULL, s_new, omar,  NOW()-INTERVAL '1 day'),
  (d04, NULL, s_new, omar,  NOW()-INTERVAL '4 days'),
  (d05, NULL, s_new, lina,  NOW()-INTERVAL '2 days'),
  (d06, NULL, s_new, rami,  NOW()-INTERVAL '1 day'),
  (d07, NULL, s_new, rami,  NOW()-INTERVAL '5 days'),
  (d08, NULL, s_new, lina,  NOW()-INTERVAL '3 days');

-- ── DEALS — CONTACTED (6) ─────────────────────────────────────────
INSERT INTO deals (id, org_id, owner_id, contact_id, stage_id, title, expected_value, probability, expected_close_date, status, description, created_at, updated_at) VALUES
  (gen_random_uuid(), org, omar,  c03, s_con, 'VertexOps — Operations Suite',        22000, 20, '2026-06-10', 'Open', 'Discovery call completed. Mapping pain points in their ops workflow.',   NOW()-INTERVAL '10 days', NOW()-INTERVAL '8 days'),
  (gen_random_uuid(), org, lina,  c04, s_con, 'BrightLoop — Marketing CRM',          15000, 20, '2026-06-12', 'Open', 'Second call scheduled. Team of 20. Interested in contact management.', NOW()-INTERVAL '8 days',  NOW()-INTERVAL '6 days'),
  (gen_random_uuid(), org, rami,  c05, s_con, 'CorePath — Enterprise Pilot',         35000, 20, '2026-06-18', 'Open', 'Introductory call done. IT lead will join next session.',              NOW()-INTERVAL '7 days',  NOW()-INTERVAL '5 days'),
  (gen_random_uuid(), org, lina,  c08, s_con, 'MeridianLogic — SaaS Pipeline',       19500, 20, '2026-06-22', 'Open', 'Referred by partner. Needs multi-user pipeline management.',          NOW()-INTERVAL '9 days',  NOW()-INTERVAL '7 days'),
  (gen_random_uuid(), org, rami,  c12, s_con, 'AlphaNode — Cloud CRM Setup',         11000, 20, '2026-06-25', 'Open', 'Inbound lead. Using a spreadsheet now, ready to upgrade.',            NOW()-INTERVAL '6 days',  NOW()-INTERVAL '4 days'),
  (gen_random_uuid(), org, lina,  c16, s_con, 'StackWise — Developer Accounts',       8000,  20, '2026-07-08', 'Open', 'LinkedIn reply. Dev team looking for lightweight CRM.',              NOW()-INTERVAL '5 days',  NOW()-INTERVAL '3 days');

SELECT id INTO d09  FROM deals WHERE title='VertexOps — Operations Suite'    AND org_id=org;
SELECT id INTO d10  FROM deals WHERE title='BrightLoop — Marketing CRM'       AND org_id=org;
SELECT id INTO d11  FROM deals WHERE title='CorePath — Enterprise Pilot'       AND org_id=org;
SELECT id INTO d12  FROM deals WHERE title='MeridianLogic — SaaS Pipeline'    AND org_id=org;
SELECT id INTO d13  FROM deals WHERE title='AlphaNode — Cloud CRM Setup'      AND org_id=org;
SELECT id INTO d14  FROM deals WHERE title='StackWise — Developer Accounts'   AND org_id=org;

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at) VALUES
  (d09, NULL, s_new, omar,  NOW()-INTERVAL '10 days'),
  (d09, s_new, s_con, omar, NOW()-INTERVAL '9 days'),
  (d10, NULL, s_new, lina,  NOW()-INTERVAL '8 days'),
  (d10, s_new, s_con, lina, NOW()-INTERVAL '7 days'),
  (d11, NULL, s_new, rami,  NOW()-INTERVAL '7 days'),
  (d11, s_new, s_con, rami, NOW()-INTERVAL '6 days'),
  (d12, NULL, s_new, lina,  NOW()-INTERVAL '9 days'),
  (d12, s_new, s_con, lina, NOW()-INTERVAL '8 days'),
  (d13, NULL, s_new, rami,  NOW()-INTERVAL '6 days'),
  (d13, s_new, s_con, rami, NOW()-INTERVAL '5 days'),
  (d14, NULL, s_new, lina,  NOW()-INTERVAL '5 days'),
  (d14, s_new, s_con, lina, NOW()-INTERVAL '4 days');

-- ── DEALS — QUALIFIED (7) ─────────────────────────────────────────
INSERT INTO deals (id, org_id, owner_id, contact_id, stage_id, title, expected_value, probability, expected_close_date, status, description, created_at, updated_at) VALUES
  (gen_random_uuid(), org, lina,  c10, s_qual, 'QuantumHive — Enterprise Suite',     48000, 40, '2026-05-30', 'Open', 'Budget $50k confirmed. Procurement involved. Strong fit.',          NOW()-INTERVAL '18 days', NOW()-INTERVAL '10 days'),
  (gen_random_uuid(), org, rami,  c11, s_qual, 'SwiftBridge — Platform License',     27500, 40, '2026-06-05', 'Open', 'BANT qualified. 40 seats. Decision maker identified.',             NOW()-INTERVAL '14 days', NOW()-INTERVAL '8 days'),
  (gen_random_uuid(), org, lina,  c13, s_qual, 'ClearFlow — Ops Automation',         31000, 40, '2026-06-08', 'Open', 'Qualified on last call. Sending RFP template tomorrow.',           NOW()-INTERVAL '12 days', NOW()-INTERVAL '7 days'),
  (gen_random_uuid(), org, rami,  c15, s_qual, 'Peak Ventures — VC Portfolio CRM',   42000, 40, '2026-06-14', 'Open', 'Partner network deal. 3 portfolio companies to onboard.',          NOW()-INTERVAL '16 days', NOW()-INTERVAL '9 days'),
  (gen_random_uuid(), org, omar,  c06, s_qual, 'DataVault AI — Data Pipeline CRM',   55000, 40, '2026-06-01', 'Open', 'Highly engaged, attended webinar, qualified by email sequence.',   NOW()-INTERVAL '20 days', NOW()-INTERVAL '12 days'),
  (gen_random_uuid(), org, lina,  c20, s_qual, 'Nova Analytics — BI Integration',    38000, 40, '2026-06-16', 'Open', 'Needs BI integration. IT and business lead both involved.',        NOW()-INTERVAL '13 days', NOW()-INTERVAL '7 days'),
  (gen_random_uuid(), org, rami,  c19, s_qual, 'GrowthEngine — Scale Package',       24000, 40, '2026-06-19', 'Open', 'Qualified on growth use case. Comparing with Salesforce lite.',    NOW()-INTERVAL '11 days', NOW()-INTERVAL '6 days');

SELECT id INTO d15 FROM deals WHERE title='QuantumHive — Enterprise Suite'   AND org_id=org;
SELECT id INTO d16 FROM deals WHERE title='SwiftBridge — Platform License'    AND org_id=org;
SELECT id INTO d17 FROM deals WHERE title='ClearFlow — Ops Automation'        AND org_id=org;
SELECT id INTO d18 FROM deals WHERE title='Peak Ventures — VC Portfolio CRM'  AND org_id=org;
SELECT id INTO d19 FROM deals WHERE title='DataVault AI — Data Pipeline CRM'  AND org_id=org;
SELECT id INTO d20 FROM deals WHERE title='Nova Analytics — BI Integration'   AND org_id=org;
SELECT id INTO d21 FROM deals WHERE title='GrowthEngine — Scale Package'      AND org_id=org;

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at) VALUES
  (d15, NULL, s_new, lina,  NOW()-INTERVAL '20 days'),
  (d15, s_new, s_con, lina,  NOW()-INTERVAL '18 days'),
  (d15, s_con, s_qual, lina, NOW()-INTERVAL '14 days'),
  (d16, NULL, s_new, rami,  NOW()-INTERVAL '16 days'),
  (d16, s_new, s_con, rami,  NOW()-INTERVAL '14 days'),
  (d16, s_con, s_qual, rami, NOW()-INTERVAL '11 days'),
  (d17, NULL, s_new, lina,  NOW()-INTERVAL '14 days'),
  (d17, s_new, s_con, lina,  NOW()-INTERVAL '12 days'),
  (d17, s_con, s_qual, lina, NOW()-INTERVAL '10 days'),
  (d18, NULL, s_new, rami,  NOW()-INTERVAL '18 days'),
  (d18, s_new, s_con, rami,  NOW()-INTERVAL '16 days'),
  (d18, s_con, s_qual, rami, NOW()-INTERVAL '13 days'),
  (d19, NULL, s_new, omar,  NOW()-INTERVAL '22 days'),
  (d19, s_new, s_con, omar,  NOW()-INTERVAL '20 days'),
  (d19, s_con, s_qual, omar, NOW()-INTERVAL '16 days'),
  (d20, NULL, s_new, lina,  NOW()-INTERVAL '15 days'),
  (d20, s_new, s_con, lina,  NOW()-INTERVAL '13 days'),
  (d20, s_con, s_qual, lina, NOW()-INTERVAL '10 days'),
  (d21, NULL, s_new, rami,  NOW()-INTERVAL '13 days'),
  (d21, s_new, s_con, rami,  NOW()-INTERVAL '11 days'),
  (d21, s_con, s_qual, rami, NOW()-INTERVAL '8 days');

-- ── DEALS — PROPOSAL (6) ──────────────────────────────────────────
INSERT INTO deals (id, org_id, owner_id, contact_id, stage_id, title, expected_value, probability, expected_close_date, status, description, created_at, updated_at) VALUES
  (gen_random_uuid(), org, lina,  c08, s_prop, 'MeridianLogic — Enterprise Upgrade',  62000, 60, '2026-05-25', 'Open', 'Full proposal sent. Client reviewing with legal.',                NOW()-INTERVAL '25 days', NOW()-INTERVAL '12 days'),
  (gen_random_uuid(), org, rami,  c05, s_prop, 'CorePath — Full Platform Deal',        88000, 60, '2026-05-28', 'Open', 'Proposal delivered. On-site demo scheduled next week.',          NOW()-INTERVAL '22 days', NOW()-INTERVAL '10 days'),
  (gen_random_uuid(), org, lina,  c10, s_prop, 'QuantumHive — Pro Add-ons',            29000, 60, '2026-06-03', 'Open', 'Upsell proposal sent after enterprise call. Awaiting sign-off.', NOW()-INTERVAL '20 days', NOW()-INTERVAL '9 days'),
  (gen_random_uuid(), org, rami,  c11, s_prop, 'SwiftBridge — Custom Tier',            45000, 60, '2026-06-06', 'Open', 'Proposal tailored for 40-seat team with custom integrations.',   NOW()-INTERVAL '18 days', NOW()-INTERVAL '8 days'),
  (gen_random_uuid(), org, maya,  c20, s_prop, 'Nova Analytics — Analytics Suite',     71000, 60, '2026-05-22', 'Open', 'Manager-level deal. Proposal includes 3 modules + SLA.',        NOW()-INTERVAL '30 days', NOW()-INTERVAL '15 days'),
  (gen_random_uuid(), org, lina,  c16, s_prop, 'StackWise — Team Pro Plan',            17500, 60, '2026-06-09', 'Open', 'Revised proposal sent after pricing push-back. Discounted 5%.',  NOW()-INTERVAL '15 days', NOW()-INTERVAL '7 days');

SELECT id INTO d22 FROM deals WHERE title='MeridianLogic — Enterprise Upgrade' AND org_id=org;
SELECT id INTO d23 FROM deals WHERE title='CorePath — Full Platform Deal'       AND org_id=org;
SELECT id INTO d24 FROM deals WHERE title='QuantumHive — Pro Add-ons'           AND org_id=org;
SELECT id INTO d25 FROM deals WHERE title='SwiftBridge — Custom Tier'           AND org_id=org;
SELECT id INTO d26 FROM deals WHERE title='Nova Analytics — Analytics Suite'    AND org_id=org;
SELECT id INTO d27 FROM deals WHERE title='StackWise — Team Pro Plan'           AND org_id=org;

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at) VALUES
  (d22, NULL, s_new, lina,  NOW()-INTERVAL '30 days'),
  (d22, s_new, s_con, lina,  NOW()-INTERVAL '28 days'),
  (d22, s_con, s_qual, lina, NOW()-INTERVAL '26 days'),
  (d22, s_qual, s_prop, lina,NOW()-INTERVAL '22 days'),
  (d23, NULL, s_new, rami,  NOW()-INTERVAL '28 days'),
  (d23, s_new, s_con, rami,  NOW()-INTERVAL '26 days'),
  (d23, s_con, s_qual, rami, NOW()-INTERVAL '24 days'),
  (d23, s_qual, s_prop, rami,NOW()-INTERVAL '20 days'),
  (d24, NULL, s_new, lina,  NOW()-INTERVAL '26 days'),
  (d24, s_new, s_con, lina,  NOW()-INTERVAL '24 days'),
  (d24, s_con, s_qual, lina, NOW()-INTERVAL '22 days'),
  (d24, s_qual, s_prop, lina,NOW()-INTERVAL '18 days'),
  (d25, NULL, s_new, rami,  NOW()-INTERVAL '24 days'),
  (d25, s_new, s_con, rami,  NOW()-INTERVAL '22 days'),
  (d25, s_con, s_qual, rami, NOW()-INTERVAL '20 days'),
  (d25, s_qual, s_prop, rami,NOW()-INTERVAL '16 days'),
  (d26, NULL, s_new, maya,  NOW()-INTERVAL '36 days'),
  (d26, s_new, s_con, maya,  NOW()-INTERVAL '34 days'),
  (d26, s_con, s_qual, maya, NOW()-INTERVAL '32 days'),
  (d26, s_qual, s_prop, maya,NOW()-INTERVAL '28 days'),
  (d27, NULL, s_new, lina,  NOW()-INTERVAL '22 days'),
  (d27, s_new, s_con, lina,  NOW()-INTERVAL '20 days'),
  (d27, s_con, s_qual, lina, NOW()-INTERVAL '18 days'),
  (d27, s_qual, s_prop, lina,NOW()-INTERVAL '13 days');

-- ── DEALS — NEGOTIATION (5) ───────────────────────────────────────
INSERT INTO deals (id, org_id, owner_id, contact_id, stage_id, title, expected_value, probability, expected_close_date, status, description, created_at, updated_at) VALUES
  (gen_random_uuid(), org, lina,  c03, s_neg, 'VertexOps — Annual Contract',         78000,  80, '2026-05-18', 'Open', 'Contract terms being finalized. Legal review in progress.',                    NOW()-INTERVAL '35 days', NOW()-INTERVAL '15 days'),
  (gen_random_uuid(), org, rami,  c06, s_neg, 'DataVault AI — Premium Platform',    110000,  80, '2026-05-20', 'Open', 'Negotiating 18-month vs 24-month term. 12% discount requested.',             NOW()-INTERVAL '32 days', NOW()-INTERVAL '14 days'),
  (gen_random_uuid(), org, maya,  c11, s_neg, 'SwiftBridge — Enterprise MSA',        95000,  80, '2026-05-15', 'Open', 'MSA redlines sent. Procurement wants net-60 payment terms.',                 NOW()-INTERVAL '40 days', NOW()-INTERVAL '18 days'),
  (gen_random_uuid(), org, lina,  c13, s_neg, 'ClearFlow — Multi-year Deal',         56000,  80, '2026-05-22', 'Open', 'Counter-offer at $52k. Reviewing with finance team.',                        NOW()-INTERVAL '28 days', NOW()-INTERVAL '12 days'),
  (gen_random_uuid(), org, rami,  c15, s_neg, 'Peak Ventures — Portfolio Bundle',   130000,  80, '2026-05-12', 'Open', 'Bundled deal for 3 portfolio companies. Discount approval needed.',          NOW()-INTERVAL '38 days', NOW()-INTERVAL '16 days');

SELECT id INTO d28 FROM deals WHERE title='VertexOps — Annual Contract'       AND org_id=org;
SELECT id INTO d29 FROM deals WHERE title='DataVault AI — Premium Platform'    AND org_id=org;
SELECT id INTO d30 FROM deals WHERE title='SwiftBridge — Enterprise MSA'       AND org_id=org;
SELECT id INTO d31 FROM deals WHERE title='ClearFlow — Multi-year Deal'        AND org_id=org;
SELECT id INTO d32 FROM deals WHERE title='Peak Ventures — Portfolio Bundle'   AND org_id=org;

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at) VALUES
  (d28, NULL, s_new, lina,  NOW()-INTERVAL '42 days'),
  (d28, s_new, s_con, lina,  NOW()-INTERVAL '40 days'),
  (d28, s_con, s_qual, lina, NOW()-INTERVAL '38 days'),
  (d28, s_qual, s_prop, lina,NOW()-INTERVAL '36 days'),
  (d28, s_prop, s_neg, lina, NOW()-INTERVAL '32 days'),
  (d29, NULL, s_new, rami,  NOW()-INTERVAL '38 days'),
  (d29, s_new, s_con, rami,  NOW()-INTERVAL '36 days'),
  (d29, s_con, s_qual, rami, NOW()-INTERVAL '34 days'),
  (d29, s_qual, s_prop, rami,NOW()-INTERVAL '33 days'),
  (d29, s_prop, s_neg, rami, NOW()-INTERVAL '29 days'),
  (d30, NULL, s_new, maya,  NOW()-INTERVAL '46 days'),
  (d30, s_new, s_con, maya,  NOW()-INTERVAL '44 days'),
  (d30, s_con, s_qual, maya, NOW()-INTERVAL '42 days'),
  (d30, s_qual, s_prop, maya,NOW()-INTERVAL '41 days'),
  (d30, s_prop, s_neg, maya, NOW()-INTERVAL '37 days'),
  (d31, NULL, s_new, lina,  NOW()-INTERVAL '34 days'),
  (d31, s_new, s_con, lina,  NOW()-INTERVAL '32 days'),
  (d31, s_con, s_qual, lina, NOW()-INTERVAL '30 days'),
  (d31, s_qual, s_prop, lina,NOW()-INTERVAL '29 days'),
  (d31, s_prop, s_neg, lina, NOW()-INTERVAL '25 days'),
  (d32, NULL, s_new, rami,  NOW()-INTERVAL '44 days'),
  (d32, s_new, s_con, rami,  NOW()-INTERVAL '43 days'),
  (d32, s_con, s_qual, rami, NOW()-INTERVAL '41 days'),
  (d32, s_qual, s_prop, rami,NOW()-INTERVAL '39 days'),
  (d32, s_prop, s_neg, rami, NOW()-INTERVAL '35 days');

-- ── DEALS — WON (9) ───────────────────────────────────────────────
INSERT INTO deals (id, org_id, owner_id, contact_id, stage_id, title, expected_value, probability, expected_close_date, status, final_value, contract_date, description, created_at, updated_at) VALUES
  (gen_random_uuid(), org, lina,  c04, s_won, 'BrightLoop — Annual CRM',           15000, 100, '2026-03-05', 'Won',  14500, '2026-03-05', 'Closed successfully. 1-year SaaS contract signed.',                 NOW()-INTERVAL '50 days', NOW()-INTERVAL '50 days'),
  (gen_random_uuid(), org, rami,  c05, s_won, 'CorePath — Starter Deal',            18000, 100, '2026-03-08', 'Won',  17200, '2026-03-08', 'Pilot deal converted to annual. Upsell potential noted.',          NOW()-INTERVAL '48 days', NOW()-INTERVAL '48 days'),
  (gen_random_uuid(), org, lina,  c08, s_won, 'MeridianLogic — Pro Plan',           11000, 100, '2026-03-10', 'Won',  10500, '2026-03-10', '20-seat license for 12 months. Signed after 2 revisions.',        NOW()-INTERVAL '45 days', NOW()-INTERVAL '45 days'),
  (gen_random_uuid(), org, maya,  c20, s_won, 'Nova Analytics — BI Suite',          25000, 100, '2026-03-12', 'Won',  24000, '2026-03-12', 'Full suite deal. SLA included. Champion was the VP of Data.',     NOW()-INTERVAL '42 days', NOW()-INTERVAL '42 days'),
  (gen_random_uuid(), org, rami,  c09, s_won, 'InfraStack — Cloud CRM',             18000, 100, '2026-03-15', 'Won',  17500, '2026-03-15', 'Closed in 6 weeks. Strong technical champion internally.',        NOW()-INTERVAL '38 days', NOW()-INTERVAL '38 days'),
  (gen_random_uuid(), org, lina,  c16, s_won, 'StackWise — Annual Team Plan',        4500, 100, '2026-03-17', 'Won',   4300, '2026-03-17', 'Small but fast close. 8 seats, monthly billing to annual.',       NOW()-INTERVAL '35 days', NOW()-INTERVAL '35 days'),
  (gen_random_uuid(), org, rami,  c12, s_won, 'AlphaNode — CRM Rollout',            11000, 100, '2026-03-18', 'Won',  10500, '2026-03-18', 'Rolled out to 25 users. CSM handoff completed.',                  NOW()-INTERVAL '30 days', NOW()-INTERVAL '30 days'),
  (gen_random_uuid(), org, lina,  c10, s_won, 'QuantumHive — Platform Deal',        13500, 100, '2026-03-19', 'Won',  12900, '2026-03-19', 'Procurement approved after 2 rounds. Enterprise contract.',       NOW()-INTERVAL '25 days', NOW()-INTERVAL '25 days'),
  (gen_random_uuid(), org, maya,  c11, s_won, 'SwiftBridge — Org-wide License',     19500, 100, '2026-03-20', 'Won',  18700, '2026-03-20', 'Largest deal this quarter. Multi-department rollout agreed.',     NOW()-INTERVAL '20 days', NOW()-INTERVAL '20 days');

SELECT id INTO d33 FROM deals WHERE title='BrightLoop — Annual CRM'           AND org_id=org;
SELECT id INTO d34 FROM deals WHERE title='CorePath — Starter Deal'            AND org_id=org;
SELECT id INTO d35 FROM deals WHERE title='MeridianLogic — Pro Plan'           AND org_id=org;
SELECT id INTO d36 FROM deals WHERE title='Nova Analytics — BI Suite'          AND org_id=org;
SELECT id INTO d37 FROM deals WHERE title='InfraStack — Cloud CRM'             AND org_id=org;
SELECT id INTO d38 FROM deals WHERE title='StackWise — Annual Team Plan'       AND org_id=org;
SELECT id INTO d39 FROM deals WHERE title='AlphaNode — CRM Rollout'            AND org_id=org;
SELECT id INTO d40 FROM deals WHERE title='QuantumHive — Platform Deal'        AND org_id=org;
SELECT id INTO d41 FROM deals WHERE title='SwiftBridge — Org-wide License'     AND org_id=org;

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at) VALUES
  (d33, NULL, s_new, lina,  NOW()-INTERVAL '58 days'), (d33, s_new, s_con, lina,  NOW()-INTERVAL '56 days'),
  (d33, s_con, s_qual, lina,NOW()-INTERVAL '55 days'), (d33, s_qual, s_prop, lina,NOW()-INTERVAL '53 days'),
  (d33, s_prop, s_neg, lina,NOW()-INTERVAL '52 days'), (d33, s_neg, s_won, lina,  NOW()-INTERVAL '50 days'),
  (d34, NULL, s_new, rami,  NOW()-INTERVAL '56 days'), (d34, s_new, s_con, rami,  NOW()-INTERVAL '54 days'),
  (d34, s_con, s_qual, rami,NOW()-INTERVAL '53 days'), (d34, s_qual, s_prop, rami,NOW()-INTERVAL '51 days'),
  (d34, s_prop, s_neg, rami,NOW()-INTERVAL '50 days'), (d34, s_neg, s_won, rami,  NOW()-INTERVAL '48 days'),
  (d35, NULL, s_new, lina,  NOW()-INTERVAL '52 days'), (d35, s_new, s_con, lina,  NOW()-INTERVAL '50 days'),
  (d35, s_con, s_qual, lina,NOW()-INTERVAL '48 days'), (d35, s_qual, s_prop, lina,NOW()-INTERVAL '47 days'),
  (d35, s_prop, s_neg, lina,NOW()-INTERVAL '46 days'), (d35, s_neg, s_won, lina,  NOW()-INTERVAL '45 days'),
  (d36, NULL, s_new, maya,  NOW()-INTERVAL '50 days'), (d36, s_new, s_con, maya,  NOW()-INTERVAL '48 days'),
  (d36, s_con, s_qual, maya,NOW()-INTERVAL '46 days'), (d36, s_qual, s_prop, maya,NOW()-INTERVAL '45 days'),
  (d36, s_prop, s_neg, maya,NOW()-INTERVAL '44 days'), (d36, s_neg, s_won, maya,  NOW()-INTERVAL '42 days'),
  (d37, NULL, s_new, rami,  NOW()-INTERVAL '46 days'), (d37, s_new, s_con, rami,  NOW()-INTERVAL '44 days'),
  (d37, s_con, s_qual, rami,NOW()-INTERVAL '42 days'), (d37, s_qual, s_prop, rami,NOW()-INTERVAL '40 days'),
  (d37, s_prop, s_neg, rami,NOW()-INTERVAL '39 days'), (d37, s_neg, s_won, rami,  NOW()-INTERVAL '38 days'),
  (d38, NULL, s_new, lina,  NOW()-INTERVAL '42 days'), (d38, s_new, s_con, lina,  NOW()-INTERVAL '40 days'),
  (d38, s_con, s_qual, lina,NOW()-INTERVAL '38 days'), (d38, s_qual, s_prop, lina,NOW()-INTERVAL '37 days'),
  (d38, s_prop, s_neg, lina,NOW()-INTERVAL '36 days'), (d38, s_neg, s_won, lina,  NOW()-INTERVAL '35 days'),
  (d39, NULL, s_new, rami,  NOW()-INTERVAL '38 days'), (d39, s_new, s_con, rami,  NOW()-INTERVAL '36 days'),
  (d39, s_con, s_qual, rami,NOW()-INTERVAL '34 days'), (d39, s_qual, s_prop, rami,NOW()-INTERVAL '32 days'),
  (d39, s_prop, s_neg, rami,NOW()-INTERVAL '31 days'), (d39, s_neg, s_won, rami,  NOW()-INTERVAL '30 days'),
  (d40, NULL, s_new, lina,  NOW()-INTERVAL '32 days'), (d40, s_new, s_con, lina,  NOW()-INTERVAL '30 days'),
  (d40, s_con, s_qual, lina,NOW()-INTERVAL '28 days'), (d40, s_qual, s_prop, lina,NOW()-INTERVAL '27 days'),
  (d40, s_prop, s_neg, lina,NOW()-INTERVAL '26 days'), (d40, s_neg, s_won, lina,  NOW()-INTERVAL '25 days'),
  (d41, NULL, s_new, maya,  NOW()-INTERVAL '28 days'), (d41, s_new, s_con, maya,  NOW()-INTERVAL '26 days'),
  (d41, s_con, s_qual, maya,NOW()-INTERVAL '24 days'), (d41, s_qual, s_prop, maya,NOW()-INTERVAL '22 days'),
  (d41, s_prop, s_neg, maya,NOW()-INTERVAL '21 days'), (d41, s_neg, s_won, maya,  NOW()-INTERVAL '20 days');

-- ── DEALS — LOST (6) ──────────────────────────────────────────────
INSERT INTO deals (id, org_id, owner_id, contact_id, stage_id, title, expected_value, probability, expected_close_date, status, lost_reason, description, created_at, updated_at) VALUES
  (gen_random_uuid(), org, lina,  c17, s_lost, 'BitStream Labs — CRM Trial',          7200, 0, '2026-03-01', 'Lost', 'Chose competitor (HubSpot)',            'Lost to HubSpot on pricing. No budget flexibility.',                    NOW()-INTERVAL '55 days', NOW()-INTERVAL '55 days'),
  (gen_random_uuid(), org, rami,  c18, s_lost, 'OrbitSales — Pipeline Tool',           6000, 0, '2026-03-03', 'Lost', 'No budget this quarter',               'Deal deferred to Q3. Budget frozen after org restructure.',             NOW()-INTERVAL '52 days', NOW()-INTERVAL '52 days'),
  (gen_random_uuid(), org, omar,  c01, s_lost, 'NexaTech — CRM Pilot',               12000, 0, '2026-03-06', 'Lost', 'Project cancelled internally',         'Champion left the company. Successor not interested in CRM.',           NOW()-INTERVAL '48 days', NOW()-INTERVAL '48 days'),
  (gen_random_uuid(), org, lina,  c13, s_lost, 'ClearFlow — Annual Plan',            31000, 0, '2026-03-09', 'Lost', 'Went with Salesforce',                 'Enterprise mandate for Salesforce across all divisions.',               NOW()-INTERVAL '44 days', NOW()-INTERVAL '44 days'),
  (gen_random_uuid(), org, rami,  c07, s_lost, 'PulseWork — Pro Tier',               18000, 0, '2026-03-11', 'Lost', 'Chose competitor (Pipedrive)',          'Lost to Pipedrive on UI preference. Team voted internally.',            NOW()-INTERVAL '40 days', NOW()-INTERVAL '40 days'),
  (gen_random_uuid(), org, maya,  c14, s_lost, 'NexGen ERP — CRM Add-on',            42000, 0, '2026-03-14', 'Lost', 'Technical requirements not met',       'Custom ERP integration required. Not feasible in our roadmap.',         NOW()-INTERVAL '36 days', NOW()-INTERVAL '36 days');

SELECT id INTO d42 FROM deals WHERE title='BitStream Labs — CRM Trial' AND org_id=org;

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at) VALUES
  (d42, NULL, s_new, lina, NOW()-INTERVAL '60 days'), (d42, s_new, s_con, lina, NOW()-INTERVAL '58 days'),
  (d42, s_con, s_qual, lina, NOW()-INTERVAL '57 days'), (d42, s_qual, s_prop, lina, NOW()-INTERVAL '56 days'),
  (d42, s_prop, s_lost, lina, NOW()-INTERVAL '55 days');

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, NULL, s_new, rami, NOW()-INTERVAL '56 days' FROM deals WHERE title='OrbitSales — Pipeline Tool' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_new, s_con, rami, NOW()-INTERVAL '54 days' FROM deals WHERE title='OrbitSales — Pipeline Tool' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_con, s_lost, rami, NOW()-INTERVAL '52 days' FROM deals WHERE title='OrbitSales — Pipeline Tool' AND org_id=org;

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, NULL, s_new, omar, NOW()-INTERVAL '52 days' FROM deals WHERE title='NexaTech — CRM Pilot' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_new, s_con, omar, NOW()-INTERVAL '50 days' FROM deals WHERE title='NexaTech — CRM Pilot' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_con, s_lost, omar, NOW()-INTERVAL '48 days' FROM deals WHERE title='NexaTech — CRM Pilot' AND org_id=org;

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, NULL, s_new, lina, NOW()-INTERVAL '50 days' FROM deals WHERE title='ClearFlow — Annual Plan' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_new, s_con, lina, NOW()-INTERVAL '48 days' FROM deals WHERE title='ClearFlow — Annual Plan' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_con, s_qual, lina, NOW()-INTERVAL '46 days' FROM deals WHERE title='ClearFlow — Annual Plan' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_qual, s_lost, lina, NOW()-INTERVAL '44 days' FROM deals WHERE title='ClearFlow — Annual Plan' AND org_id=org;

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, NULL, s_new, rami, NOW()-INTERVAL '46 days' FROM deals WHERE title='PulseWork — Pro Tier' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_new, s_con, rami, NOW()-INTERVAL '44 days' FROM deals WHERE title='PulseWork — Pro Tier' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_con, s_qual, rami, NOW()-INTERVAL '42 days' FROM deals WHERE title='PulseWork — Pro Tier' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_qual, s_prop, rami, NOW()-INTERVAL '40 days' FROM deals WHERE title='PulseWork — Pro Tier' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_prop, s_lost, rami, NOW()-INTERVAL '38 days' FROM deals WHERE title='PulseWork — Pro Tier' AND org_id=org;

INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, NULL, s_new, maya, NOW()-INTERVAL '44 days' FROM deals WHERE title='NexGen ERP — CRM Add-on' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_new, s_con, maya, NOW()-INTERVAL '42 days' FROM deals WHERE title='NexGen ERP — CRM Add-on' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_con, s_qual, maya, NOW()-INTERVAL '40 days' FROM deals WHERE title='NexGen ERP — CRM Add-on' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_qual, s_prop, maya, NOW()-INTERVAL '38 days' FROM deals WHERE title='NexGen ERP — CRM Add-on' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_prop, s_neg, maya, NOW()-INTERVAL '37 days' FROM deals WHERE title='NexGen ERP — CRM Add-on' AND org_id=org;
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at)
  SELECT id, s_neg, s_lost, maya, NOW()-INTERVAL '36 days' FROM deals WHERE title='NexGen ERP — CRM Add-on' AND org_id=org;

-- ── ORG DEAL COUNTERS ─────────────────────────────────────────────
INSERT INTO org_deal_counters (org_id, last_number)
VALUES (org, 42)
ON CONFLICT (org_id) DO UPDATE SET last_number = 42;

-- ── TASKS ─────────────────────────────────────────────────────────
-- New stage
INSERT INTO tasks (deal_id, created_by, assigned_to, title, type, due_date, status) VALUES
  (d01, omar,  omar,  'Send intro email to Marcus Holloway',       'Email',    '2026-05-05', 'Open'),
  (d02, omar,  omar,  'Schedule discovery call with Priya',         'Call',     '2026-05-06', 'Open'),
  (d03, omar,  omar,  'Research PulseWork team size and use case',  'Email',    '2026-05-05', 'Open'),
  (d04, omar,  omar,  'Prepare demo for NexGen ERP call',           'Meeting',  '2026-05-07', 'Open'),
  (d05, lina,  lina,  'Follow up on BitStream referral',            'Call',     '2026-05-05', 'Open'),
  (d06, rami,  rami,  'Send pricing deck to OrbitSales',            'Email',    '2026-05-04', 'Open'),
  (d07, rami,  rami,  'Book intro call with InfraStack',            'Call',     '2026-05-07', 'Open'),
  (d08, lina,  lina,  'Research GrowthEngine competitors',          'Email',    '2026-05-06', 'Open');
-- Contacted stage
INSERT INTO tasks (deal_id, created_by, assigned_to, title, type, due_date, status) VALUES
  (d09, omar,  omar,  'Send VertexOps discovery summary',           'Email',    '2026-05-05', 'Open'),
  (d09, omar,  lina,  'Prepare VertexOps demo environment',         'Meeting',  '2026-05-08', 'Open'),
  (d10, lina,  lina,  'BrightLoop — confirm decision makers',       'Call',     '2026-05-06', 'Open'),
  (d10, lina,  lina,  'Send product walkthrough video',             'Email',    '2026-05-07', 'Done'),
  (d11, rami,  rami,  'CorePath IT lead intro call',                'Call',     '2026-05-05', 'Open'),
  (d12, lina,  lina,  'MeridianLogic partner context review',       'Email',    '2026-05-04', 'Done'),
  (d13, rami,  rami,  'AlphaNode — send comparison sheet',          'Email',    '2026-05-05', 'Open'),
  (d14, lina,  lina,  'StackWise — schedule technical call',        'Call',     '2026-05-08', 'Open');
-- Qualified stage
INSERT INTO tasks (deal_id, created_by, assigned_to, title, type, due_date, status) VALUES
  (d15, lina,  lina,  'QuantumHive — confirm budget approval',      'Call',     '2026-04-28', 'Done'),
  (d15, lina,  maya,  'QuantumHive — review contract template',     'Meeting',  '2026-05-09', 'Open'),
  (d16, rami,  rami,  'SwiftBridge — map 40-seat org chart',        'Email',    '2026-04-29', 'Done'),
  (d17, lina,  lina,  'ClearFlow — send RFP response draft',        'Email',    '2026-05-05', 'Open'),
  (d18, rami,  rami,  'Peak Ventures — portfolio onboarding plan',  'Meeting',  '2026-05-07', 'Open'),
  (d19, omar,  omar,  'DataVault AI — technical requirements',      'Email',    '2026-04-28', 'Done'),
  (d20, lina,  lina,  'Nova Analytics — BI integration scoping',    'Meeting',  '2026-05-06', 'Open'),
  (d21, rami,  rami,  'GrowthEngine — Salesforce comparison doc',   'Email',    '2026-05-05', 'Open');
-- Proposal stage
INSERT INTO tasks (deal_id, created_by, assigned_to, title, type, due_date, status) VALUES
  (d22, lina,  lina,  'MeridianLogic legal redline review',         'Meeting',  '2026-05-06', 'Open'),
  (d22, lina,  maya,  'MeridianLogic — pricing approval request',   'Email',    '2026-04-29', 'Done'),
  (d23, rami,  rami,  'CorePath on-site demo prep',                 'Meeting',  '2026-05-07', 'Open'),
  (d23, rami,  maya,  'CorePath — confirm security review',         'Email',    '2026-04-28', 'Done'),
  (d24, lina,  lina,  'QuantumHive add-on SOW draft',               'Email',    '2026-05-05', 'Open'),
  (d25, rami,  rami,  'SwiftBridge custom integration spec',        'Meeting',  '2026-05-08', 'Open'),
  (d26, maya,  maya,  'Nova Analytics SLA terms review',            'Meeting',  '2026-04-29', 'Done'),
  (d27, lina,  lina,  'StackWise revised proposal delivery',        'Email',    '2026-04-28', 'Done');
-- Negotiation stage
INSERT INTO tasks (deal_id, created_by, assigned_to, title, type, due_date, status) VALUES
  (d28, lina,  lina,  'VertexOps contract signing call',            'Call',     '2026-05-05', 'Open'),
  (d28, lina,  maya,  'VertexOps — legal final sign-off',           'Meeting',  '2026-05-06', 'Open'),
  (d29, rami,  rami,  'DataVault AI discount approval request',     'Email',    '2026-04-28', 'Done'),
  (d29, rami,  maya,  'DataVault AI term negotiation call',         'Call',     '2026-05-06', 'Open'),
  (d30, maya,  maya,  'SwiftBridge MSA final review',               'Meeting',  '2026-05-05', 'Open'),
  (d31, lina,  lina,  'ClearFlow multi-year counter response',      'Email',    '2026-04-28', 'Done'),
  (d32, rami,  rami,  'Peak Ventures bundle closing call',          'Call',     '2026-05-05', 'Open'),
  (d32, rami,  maya,  'Peak Ventures — discount approval',          'Email',    '2026-04-28', 'Done');
-- Won deals post-close
INSERT INTO tasks (deal_id, created_by, assigned_to, title, type, due_date, status) VALUES
  (d33, lina,  lina,  'BrightLoop — onboarding kickoff',            'Meeting',  '2026-03-10', 'Done'),
  (d34, rami,  rami,  'CorePath — CSM handoff',                     'Meeting',  '2026-03-12', 'Done'),
  (d35, lina,  lina,  'MeridianLogic — user provisioning',          'Email',    '2026-03-13', 'Done'),
  (d36, maya,  maya,  'Nova Analytics — implementation plan',       'Meeting',  '2026-03-14', 'Done'),
  (d37, rami,  rami,  'InfraStack — setup & config',                'Meeting',  '2026-03-16', 'Done'),
  (d38, lina,  lina,  'StackWise — annual invoice sent',            'Email',    '2026-03-18', 'Done'),
  (d39, rami,  rami,  'AlphaNode — user import & training',         'Meeting',  '2026-03-19', 'Done'),
  (d40, lina,  lina,  'QuantumHive — contract countersigned',       'Email',    '2026-03-20', 'Done'),
  (d41, maya,  maya,  'SwiftBridge — rollout plan delivery',        'Meeting',  '2026-03-20', 'Done');
-- Lost wrap-up
INSERT INTO tasks (deal_id, created_by, assigned_to, title, type, due_date, status) VALUES
  (d42, lina,  lina,  'BitStream — loss analysis logged',           'Email',    '2026-03-03', 'Done');

-- ── INTERACTIONS ──────────────────────────────────────────────────
-- New deals
INSERT INTO interactions (deal_id, logged_by, type, summary, next_step, occurred_at) VALUES
  (d01, omar,  'Email',   'Sent intro email. Marcus replied positively, asked for a product sheet.', 'Send product sheet', NOW()-INTERVAL '3 days'),
  (d02, omar,  'Call',    'Brief intro call with Priya. She manages 15-person team. Looking for pipeline visibility.', 'Book discovery call', NOW()-INTERVAL '2 days'),
  (d03, omar,  'Email',   'Inbound inquiry from Nathan via website form. Requested a call.', 'Schedule discovery call', NOW()-INTERVAL '1 day'),
  (d04, omar,  'Call',    'Cold call. Fatima asked for a demo next Thursday.', 'Prepare demo', NOW()-INTERVAL '4 days'),
  (d05, lina,  'Email',   'Referral intro email sent to Carlos. Mentioned mutual contact at StackWise.', 'Wait for response', NOW()-INTERVAL '2 days'),
  (d06, rami,  'Call',    'Sasha reached out via website chat. Booked a discovery call for Monday.', 'Send pricing info', NOW()-INTERVAL '1 day'),
  (d07, rami,  'Email',   'Intro email sent to Kwame after meeting at DevOps Summit.', 'Book intro call', NOW()-INTERVAL '5 days'),
  (d08, lina,  'Call',    'Tariq confirmed he is evaluating 3 CRM vendors. We are one of them.', 'Research competitors', NOW()-INTERVAL '3 days');
-- Contacted deals
INSERT INTO interactions (deal_id, logged_by, type, summary, next_step, occurred_at) VALUES
  (d09, omar,  'Meeting', 'Discovery call with Ethan. Pain point: sales team using 3 disconnected tools. Budget $25k.', 'Send summary', NOW()-INTERVAL '10 days'),
  (d09, omar,  'Email',   'Sent summary of discovery call + feature comparison sheet.', 'Follow up next week', NOW()-INTERVAL '9 days'),
  (d10, lina,  'Call',    'Intro call with Sofia. Team of 20 marketers. Needs contact tagging and email tracking.', 'Confirm decision makers', NOW()-INTERVAL '8 days'),
  (d10, lina,  'Email',   'Sent product walkthrough video. Sofia forwarded to her manager.', 'Wait for manager feedback', NOW()-INTERVAL '7 days'),
  (d11, rami,  'Meeting', 'Intro meeting with James Whitfield. IT lead will join next call to review security.', 'Book IT security call', NOW()-INTERVAL '7 days'),
  (d11, rami,  'Email',   'Sent security whitepaper and compliance checklist as requested.', 'Wait for IT review', NOW()-INTERVAL '6 days'),
  (d12, lina,  'Call',    'Referral intro with Isla. Discussed multi-user pipelines for 30-seat SaaS team.', 'Send product overview', NOW()-INTERVAL '9 days'),
  (d12, lina,  'Email',   'Sent product overview and case study from a similar SaaS company.', 'Follow up in 3 days', NOW()-INTERVAL '8 days'),
  (d13, rami,  'Call',    'Nadia confirmed they are currently using spreadsheets. Ready to move to a proper CRM.', 'Send comparison sheet', NOW()-INTERVAL '6 days'),
  (d14, lina,  'Email',   'Hannah from StackWise replied. Small dev team, 8 seats, wants lightweight tool.', 'Schedule technical call', NOW()-INTERVAL '5 days');
-- Qualified deals
INSERT INTO interactions (deal_id, logged_by, type, summary, next_step, occurred_at) VALUES
  (d15, lina,  'Meeting', 'Qualification call with Chloe. Budget $50k confirmed. Procurement involved.', 'Introduce procurement contact', NOW()-INTERVAL '18 days'),
  (d15, lina,  'Call',    'Follow-up: procurement contact introduced as Raj Mehta. Timeline: end of Q2.', 'Send contract template', NOW()-INTERVAL '16 days'),
  (d16, rami,  'Meeting', 'BANT call with Leo. 40 seats. Decision by end of April. Single champion.', 'Confirm technical requirements', NOW()-INTERVAL '14 days'),
  (d16, rami,  'Call',    'Confirmed technical requirements. Leo will present internally this week.', 'Wait for internal decision', NOW()-INTERVAL '12 days'),
  (d17, lina,  'Meeting', 'Qualification call done. Diego confirmed budget and timeline. RFP expected.', 'Send RFP response', NOW()-INTERVAL '12 days'),
  (d18, rami,  'Call',    'Ryan presented deal structure: 3 portfolio cos, annual commitment.', 'Plan portfolio onboarding workshop', NOW()-INTERVAL '16 days'),
  (d18, rami,  'Meeting', 'Portfolio onboarding workshop plan presented. All 3 companies confirmed interest.', 'Prepare proposal', NOW()-INTERVAL '14 days'),
  (d19, omar,  'Meeting', 'DataVault AI webinar follow-up. Fatima confirmed $55k budget. CTO engaged.', 'Send technical architecture overview', NOW()-INTERVAL '20 days'),
  (d19, omar,  'Email',   'Sent technical architecture overview and data security FAQ.', 'Wait for CTO feedback', NOW()-INTERVAL '18 days'),
  (d20, lina,  'Meeting', 'Scoping session for BI integration. Maya brought in their data architect.', 'Prepare proposal', NOW()-INTERVAL '13 days'),
  (d21, rami,  'Call',    'Tariq shared Salesforce quote. Need to position value not just price.', 'Prepare comparison document', NOW()-INTERVAL '11 days');
-- Proposal deals
INSERT INTO interactions (deal_id, logged_by, type, summary, next_step, occurred_at) VALUES
  (d22, lina,  'Email',   'Sent full commercial proposal to Isla and her legal contact.', 'Wait for legal review', NOW()-INTERVAL '25 days'),
  (d22, lina,  'Call',    'Legal team has minor redlines. Nothing blocking. Expect resolution next week.', 'Resolve redlines', NOW()-INTERVAL '22 days'),
  (d23, rami,  'Meeting', 'On-site proposal walkthrough with James and IT lead. Very positive reaction.', 'Send post-meeting summary', NOW()-INTERVAL '22 days'),
  (d23, rami,  'Email',   'Post-meeting summary sent. Security questionnaire completed and returned.', 'Await sign-off', NOW()-INTERVAL '20 days'),
  (d24, lina,  'Email',   'Sent add-on SOW to Chloe. Covers pipeline automation and advanced reporting.', 'Await sign-off', NOW()-INTERVAL '20 days'),
  (d25, rami,  'Meeting', 'Custom tier scoping call with Leo and SwiftBridge CTO.', 'Prepare custom proposal', NOW()-INTERVAL '18 days'),
  (d26, maya,  'Meeting', 'Nova Analytics proposal review with Maya and VP of Engineering.', 'Agree SLA terms', NOW()-INTERVAL '30 days'),
  (d26, maya,  'Call',    'SLA terms agreed verbally. Waiting on legal team to draft contract.', 'Follow up with legal', NOW()-INTERVAL '26 days'),
  (d27, lina,  'Email',   'Sent revised proposal with 5% discount applied. Hannah confirmed receipt.', 'Await decision', NOW()-INTERVAL '15 days');
-- Negotiation deals
INSERT INTO interactions (deal_id, logged_by, type, summary, next_step, occurred_at) VALUES
  (d28, lina,  'Meeting', 'Contract negotiation session with Ethan and VertexOps legal.', 'Await countersignature', NOW()-INTERVAL '35 days'),
  (d28, lina,  'Call',    'Final contract terms aligned. Awaiting countersignature from their CEO.', 'Follow up on signature', NOW()-INTERVAL '30 days'),
  (d29, rami,  'Call',    'Amara requested 12% discount for 24-month deal. Approval needed internally.', 'Request discount approval', NOW()-INTERVAL '32 days'),
  (d29, rami,  'Meeting', 'Agreed on 18-month at 8% discount. Pending final sign-off.', 'Get internal approval', NOW()-INTERVAL '28 days'),
  (d30, maya,  'Meeting', 'MSA redline review with SwiftBridge legal and procurement.', 'Accept net-60 terms', NOW()-INTERVAL '40 days'),
  (d30, maya,  'Call',    'Net-60 payment terms accepted. Contract going to final signature stage.', 'Final signature', NOW()-INTERVAL '35 days'),
  (d31, lina,  'Call',    'Counter-offer submitted at $52k for 2-year term. Finance reviewing.', 'Wait for finance response', NOW()-INTERVAL '28 days'),
  (d32, rami,  'Meeting', 'Portfolio bundle closing call with Ryan and all 3 portfolio co founders.', 'Request discount approval', NOW()-INTERVAL '38 days'),
  (d32, rami,  'Call',    '15% bundle discount requested. Pending approval. Close expected in 2 weeks.', 'Get discount approved', NOW()-INTERVAL '34 days');
-- Won deals
INSERT INTO interactions (deal_id, logged_by, type, summary, occurred_at) VALUES
  (d33, lina,  'Meeting', 'BrightLoop contract signed. Kickoff call scheduled for next Monday.',     NOW()-INTERVAL '50 days'),
  (d34, rami,  'Meeting', 'CorePath pilot converted. Annual contract executed. CSM assigned.',       NOW()-INTERVAL '48 days'),
  (d35, lina,  'Email',   'MeridianLogic PO received. Users being provisioned today.',              NOW()-INTERVAL '45 days'),
  (d36, maya,  'Meeting', 'Nova Analytics contract signed. 3-module rollout plan agreed.',          NOW()-INTERVAL '42 days'),
  (d37, rami,  'Meeting', 'InfraStack cloud CRM contract executed. Setup call complete.',           NOW()-INTERVAL '38 days'),
  (d38, lina,  'Email',   'StackWise annual invoice sent. 8 users onboarded successfully.',         NOW()-INTERVAL '35 days'),
  (d39, rami,  'Meeting', 'AlphaNode rollout complete. 25 users trained. CSM handoff done.',        NOW()-INTERVAL '30 days'),
  (d40, lina,  'Meeting', 'QuantumHive enterprise contract countersigned. 50-seat license active.', NOW()-INTERVAL '25 days'),
  (d41, maya,  'Meeting', 'SwiftBridge multi-dept rollout plan delivered. Largest deal this quarter.',NOW()-INTERVAL '20 days');
-- Lost deals
INSERT INTO interactions (deal_id, logged_by, type, summary, occurred_at) VALUES
  (d42, lina,  'Call',  'Carlos confirmed they went with HubSpot. Pricing was the deciding factor.', NOW()-INTERVAL '55 days'),
  (d42, lina,  'Email', 'Sent loss analysis to Maya. Main issue: pricing inflexibility vs HubSpot free tier.', NOW()-INTERVAL '54 days');
INSERT INTO interactions (deal_id, logged_by, type, summary, occurred_at)
  SELECT id, rami,  'Call',    'Sasha confirmed deal deferred to Q3 due to org restructure. Will re-engage in July.', NOW()-INTERVAL '52 days'
  FROM deals WHERE title='OrbitSales — Pipeline Tool' AND org_id=org;
INSERT INTO interactions (deal_id, logged_by, type, summary, occurred_at)
  SELECT id, omar,  'Email',   'Marcus new champion unresponsive. Project officially cancelled by successor.', NOW()-INTERVAL '48 days'
  FROM deals WHERE title='NexaTech — CRM Pilot' AND org_id=org;
INSERT INTO interactions (deal_id, logged_by, type, summary, occurred_at)
  SELECT id, lina,  'Call',    'Diego confirmed Salesforce mandate from corporate. No flexibility on vendor choice.', NOW()-INTERVAL '44 days'
  FROM deals WHERE title='ClearFlow — Annual Plan' AND org_id=org;
INSERT INTO interactions (deal_id, logged_by, type, summary, occurred_at)
  SELECT id, rami,  'Meeting', 'Nathan''s team voted for Pipedrive on UI. We lost on UX preference, not features.', NOW()-INTERVAL '40 days'
  FROM deals WHERE title='PulseWork — Pro Tier' AND org_id=org;
INSERT INTO interactions (deal_id, logged_by, type, summary, occurred_at)
  SELECT id, maya,  'Meeting', 'NexGen ERP custom integration not feasible this roadmap. Technical rejection.', NOW()-INTERVAL '36 days'
  FROM deals WHERE title='NexGen ERP — CRM Add-on' AND org_id=org;

-- ── DEAL COMMENTS ─────────────────────────────────────────────────
INSERT INTO deal_comments (deal_id, author_id, body, created_at, updated_at) VALUES
  (d28, maya, 'Legal confirmed no blocker on IP clause. Move forward to signature.',      NOW()-INTERVAL '29 days', NOW()-INTERVAL '29 days'),
  (d29, bilal,'DataVault has been a top account target — worth the 8% if we close Q2.',  NOW()-INTERVAL '27 days', NOW()-INTERVAL '27 days'),
  (d30, maya, 'Net-60 accepted. Finance signed off. Expecting signature by end of week.', NOW()-INTERVAL '34 days', NOW()-INTERVAL '34 days'),
  (d32, bilal,'Bundle discount is strategic — opens 3 new logos in one close.',           NOW()-INTERVAL '33 days', NOW()-INTERVAL '33 days'),
  (d15, lina, 'Raj confirmed procurement timeline is end of June. We are on track.',      NOW()-INTERVAL '14 days', NOW()-INTERVAL '14 days'),
  (d20, lina, 'Data architect loved the API integration story. VP is the last sign-off.', NOW()-INTERVAL '11 days', NOW()-INTERVAL '11 days');

-- ── APPROVALS ─────────────────────────────────────────────────────
-- Pending
INSERT INTO approvals (deal_id, requested_by, type, discount_pct, justification, status, request_date) VALUES
  (d29, rami,  'Discount',           8,    '18-month deal with DataVault AI. 8% keeps us competitive vs Salesforce.',      'Pending', NOW()-INTERVAL '27 days'),
  (d32, rami,  'Discount',          15,    'Portfolio bundle for Peak Ventures — 3 companies. Volume justifies 15%.',       'Pending', NOW()-INTERVAL '33 days'),
  (d30, maya,  'Contract Exception', NULL, 'SwiftBridge requesting net-60 payment terms instead of standard net-30.',      'Pending', NOW()-INTERVAL '34 days');
-- Approved
INSERT INTO approvals (deal_id, requested_by, reviewed_by, type, discount_pct, justification, status, request_date, decision_date) VALUES
  (d41, maya,  admin,  'Discount',           5,    'SwiftBridge org-wide license — 5% to close before end of quarter.',          'Approved', NOW()-INTERVAL '23 days', NOW()-INTERVAL '22 days'),
  (d40, lina,  maya,   'Discount',           3,    'QuantumHive enterprise deal — minor discount to beat competitor offer.',      'Approved', NOW()-INTERVAL '28 days', NOW()-INTERVAL '27 days'),
  (d37, rami,  maya,   'Contract Exception', NULL, 'InfraStack requested custom SLA (99.95% uptime). Approved with conditions.', 'Approved', NOW()-INTERVAL '41 days', NOW()-INTERVAL '40 days'),
  (d36, maya,  admin,  'Discount',           0,    'Nova Analytics full-price deal. No discount needed — strong champion.',      'Approved', NOW()-INTERVAL '45 days', NOW()-INTERVAL '44 days');
-- Rejected
INSERT INTO approvals (deal_id, requested_by, reviewed_by, type, discount_pct, justification, status, request_date, decision_date) VALUES
  (d39, rami,  maya,   'Discount',          20,    'AlphaNode asked for 20% to close today. Aggressive ask.',                    'Rejected', NOW()-INTERVAL '33 days', NOW()-INTERVAL '32 days'),
  (d38, lina,  maya,   'Discount',          10,    'StackWise small deal — 10% discount requested. Not strategic enough.',       'Rejected', NOW()-INTERVAL '38 days', NOW()-INTERVAL '37 days');

-- ── DEAL TEMPLATES ────────────────────────────────────────────────
INSERT INTO deal_templates (org_id, created_by, name, title, description, expected_value, probability) VALUES
  (org, maya, 'Enterprise License',   'Enterprise License — [Company]',   'Full enterprise platform deal with SLA and onboarding support.', 50000, 60),
  (org, lina, 'Starter Package',      '[Company] — Starter Package',      'Entry-level CRM for teams under 20 seats.',                     8000,  20),
  (org, rami, 'Annual Renewal',       '[Company] — Annual Renewal',       'Renewal deal for existing customers. Include upsell opportunity.',15000, 80),
  (org, maya, 'Portfolio Bundle',     'Portfolio Bundle — [Company]',     'Multi-company deal for VC portfolio. Requires volume discount approval.', 90000, 60);

-- ── AUDIT LOG ─────────────────────────────────────────────────────
INSERT INTO audit_log (actor_id, action, description, org_id, entity_type, entity_id, occurred_at) VALUES
  (admin, 'USER_CREATED', 'User maya.manager@northwind.test created with role Sales Manager', org, 'user', maya::TEXT,  NOW()-INTERVAL '365 days'),
  (admin, 'USER_CREATED', 'User bilal.manager@northwind.test created with role Sales Manager',org, 'user', bilal::TEXT, NOW()-INTERVAL '365 days'),
  (admin, 'USER_CREATED', 'User lina.rep@northwind.test created with role Sales Rep',         org, 'user', lina::TEXT,  NOW()-INTERVAL '365 days'),
  (admin, 'USER_CREATED', 'User rami.rep@northwind.test created with role Sales Rep',         org, 'user', rami::TEXT,  NOW()-INTERVAL '365 days'),
  (admin, 'USER_CREATED', 'User omar.sdr@northwind.test created with role SDR',               org, 'user', omar::TEXT,  NOW()-INTERVAL '365 days'),
  (admin, 'USER_CREATED', 'User nour.finance@northwind.test created with role Finance',       org, 'user', nour::TEXT,  NOW()-INTERVAL '365 days'),
  (maya, 'DEAL_WON',  'Deal "BrightLoop — Annual CRM" won — final value: $14,500',            org, 'deal', d33::TEXT,   NOW()-INTERVAL '50 days'),
  (maya, 'DEAL_WON',  'Deal "CorePath — Starter Deal" won — final value: $17,200',            org, 'deal', d34::TEXT,   NOW()-INTERVAL '48 days'),
  (maya, 'DEAL_WON',  'Deal "MeridianLogic — Pro Plan" won — final value: $10,500',           org, 'deal', d35::TEXT,   NOW()-INTERVAL '45 days'),
  (maya, 'DEAL_WON',  'Deal "Nova Analytics — BI Suite" won — final value: $24,000',          org, 'deal', d36::TEXT,   NOW()-INTERVAL '42 days'),
  (maya, 'DEAL_WON',  'Deal "InfraStack — Cloud CRM" won — final value: $17,500',             org, 'deal', d37::TEXT,   NOW()-INTERVAL '38 days'),
  (maya, 'DEAL_WON',  'Deal "StackWise — Annual Team Plan" won — final value: $4,300',        org, 'deal', d38::TEXT,   NOW()-INTERVAL '35 days'),
  (maya, 'DEAL_WON',  'Deal "AlphaNode — CRM Rollout" won — final value: $10,500',            org, 'deal', d39::TEXT,   NOW()-INTERVAL '30 days'),
  (maya, 'DEAL_WON',  'Deal "QuantumHive — Platform Deal" won — final value: $12,900',        org, 'deal', d40::TEXT,   NOW()-INTERVAL '25 days'),
  (maya, 'DEAL_WON',  'Deal "SwiftBridge — Org-wide License" won — final value: $18,700',     org, 'deal', d41::TEXT,   NOW()-INTERVAL '20 days'),
  (lina, 'DEAL_LOST', 'Deal "BitStream Labs — CRM Trial" lost — reason: Chose competitor (HubSpot)',   org, 'deal', d42::TEXT, NOW()-INTERVAL '55 days'),
  (admin,'APPROVAL_APPROVED', 'Discount 5% approved on SwiftBridge — Org-wide License',       org, 'approval', NULL, NOW()-INTERVAL '22 days'),
  (maya, 'APPROVAL_APPROVED', 'Discount 3% approved on QuantumHive — Platform Deal',          org, 'approval', NULL, NOW()-INTERVAL '27 days'),
  (maya, 'APPROVAL_REJECTED', 'Discount 20% rejected on AlphaNode — CRM Rollout',             org, 'approval', NULL, NOW()-INTERVAL '32 days'),
  (maya, 'APPROVAL_REJECTED', 'Discount 10% rejected on StackWise — Annual Team Plan',        org, 'approval', NULL, NOW()-INTERVAL '37 days');

-- ── BULK WON DEALS (numbers 43–65) ───────────────────────────────
SELECT ARRAY_AGG(id ORDER BY full_name) INTO contact_ids FROM contacts WHERE org_id = org;
n_contacts := COALESCE(array_length(contact_ids, 1), 20);
owner_ids  := ARRAY[lina, rami, omar, maya];

FOR i IN 43..65 LOOP
  o_id       := owner_ids[((i - 43) % 4) + 1];
  c_id       := contact_ids[((i - 1) % n_contacts) + 1];
  d_title    := companies[((i - 43) % 50) + 1] || ' — ' || products[((i - 43) % 10) + 1];
  d_value    := (5000 + (i * 120))::NUMERIC;
  f_value    := ROUND(d_value * 0.96, 2);
  created_ts := '2026-01-02 09:00:00+00'::TIMESTAMPTZ + ((i - 43) * INTERVAL '2 days');
  close_ts   := created_ts + INTERVAL '30 days';
  d_close    := close_ts::DATE;

  INSERT INTO deals (deal_number, org_id, owner_id, contact_id, stage_id, title, expected_value, probability, expected_close_date, status, final_value, contract_date, description, created_at, updated_at)
  VALUES (i, org, o_id, c_id, s_won, d_title, d_value, 100, d_close, 'Won', f_value, d_close,
    'Deal closed successfully. Annual contract signed and onboarding underway.', created_ts, close_ts)
  RETURNING id INTO deal_id;

  INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at) VALUES
    (deal_id, NULL,   s_new,  o_id, created_ts),
    (deal_id, s_new,  s_con,  o_id, created_ts + INTERVAL '3 days'),
    (deal_id, s_con,  s_qual, o_id, created_ts + INTERVAL '10 days'),
    (deal_id, s_qual, s_prop, o_id, created_ts + INTERVAL '18 days'),
    (deal_id, s_prop, s_neg,  o_id, created_ts + INTERVAL '24 days'),
    (deal_id, s_neg,  s_won,  o_id, close_ts);

  INSERT INTO tasks (deal_id, created_by, assigned_to, title, type, due_date, status) VALUES
    (deal_id, o_id, o_id, 'Onboarding kickoff — ' || d_title, 'Meeting', (d_close + 7)::DATE, 'Done');

  INSERT INTO interactions (deal_id, logged_by, type, summary, occurred_at) VALUES
    (deal_id, o_id, 'Meeting', 'Contract signed. Implementation team introduced. Kickoff scheduled for next week.', close_ts - INTERVAL '1 day');

  INSERT INTO audit_log (actor_id, action, description, org_id, entity_type, entity_id, occurred_at) VALUES
    (maya, 'DEAL_WON', 'Deal "' || d_title || '" won — final value: $' || f_value::INTEGER, org, 'deal', deal_id::TEXT, close_ts);
END LOOP;

-- ── BULK LOST DEALS (numbers 66–80) ──────────────────────────────
FOR i IN 66..80 LOOP
  o_id       := owner_ids[((i - 66) % 4) + 1];
  c_id       := contact_ids[((i - 1) % n_contacts) + 1];
  d_title    := companies[((i - 43) % 50) + 1] || ' — ' || products[((i - 43) % 10) + 1];
  d_value    := (9000 + (i * 1200))::NUMERIC;
  created_ts := '2026-01-06 09:00:00+00'::TIMESTAMPTZ + ((i - 66) * INTERVAL '3 days');
  close_ts   := created_ts + INTERVAL '35 days';
  d_close    := close_ts::DATE;

  INSERT INTO deals (deal_number, org_id, owner_id, contact_id, stage_id, title, expected_value, probability, expected_close_date, status, lost_reason, description, created_at, updated_at)
  VALUES (i, org, o_id, c_id, s_lost, d_title, d_value, 0, d_close, 'Lost',
    lost_reasons[((i - 66) % 8) + 1], 'Deal lost after competitive evaluation. Loss analysis filed.', created_ts, close_ts)
  RETURNING id INTO deal_id;

  INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by, moved_at) VALUES
    (deal_id, NULL,   s_new,  o_id, created_ts),
    (deal_id, s_new,  s_con,  o_id, created_ts + INTERVAL '5 days'),
    (deal_id, s_con,  s_qual, o_id, created_ts + INTERVAL '14 days'),
    (deal_id, s_qual, s_prop, o_id, created_ts + INTERVAL '24 days'),
    (deal_id, s_prop, s_lost, o_id, close_ts);

  INSERT INTO tasks (deal_id, created_by, assigned_to, title, type, due_date, status) VALUES
    (deal_id, o_id, o_id, 'Loss analysis — ' || d_title, 'Email', d_close + 3, 'Done');

  INSERT INTO interactions (deal_id, logged_by, type, summary, occurred_at) VALUES
    (deal_id, o_id, 'Call', 'Customer chose competitor. Loss analysis filed with reasons documented.', close_ts);
END LOOP;

-- Update deal counter to current max
UPDATE org_deal_counters SET last_number = 80 WHERE org_id = org;

END $$;
