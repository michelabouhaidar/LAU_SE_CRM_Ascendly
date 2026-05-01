#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  Ascendly CRM — Runtime bootstrap
#  Runs on first container start. Creates the live org admin user
#  from environment variables (not baked into the image).
#
#  Requires: ADMIN_NAME  ADMIN_EMAIL  ADMIN_PASSWORD
# ══════════════════════════════════════════════════════════════════
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL

  -- Ensure the org exists
  INSERT INTO organizations (name)
  VALUES ('Ascendly Corp')
  ON CONFLICT (name) DO NOTHING;

  -- Live org admin (credentials come from .env, never committed)
  INSERT INTO employees (org_id, name, email, password_hash, role)
  SELECT o.id, '$ADMIN_NAME', '$ADMIN_EMAIL', crypt('$ADMIN_PASSWORD', gen_salt('bf', 12)), 'Admin'
  FROM   organizations o
  WHERE  o.name = 'Ascendly Corp'
  ON CONFLICT DO NOTHING;

SQL
