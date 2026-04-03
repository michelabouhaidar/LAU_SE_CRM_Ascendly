#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  Ascendly CRM — Generate Self-Signed TLS Certificate
#  For development only. Replace with a real cert in production.
# ══════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="$SCRIPT_DIR/nginx/ssl"

mkdir -p "$SSL_DIR"

echo "[Ascendly] Generating self-signed TLS certificate for development..."

openssl req -x509 \
  -newkey rsa:4096 \
  -keyout "$SSL_DIR/ascendly.key" \
  -out    "$SSL_DIR/ascendly.crt" \
  -days   365 \
  -nodes \
  -subj  "/C=LB/ST=Beirut/L=Beirut/O=Ascendly CRM/CN=ascendly.io" \
  -addext "subjectAltName=DNS:ascendly.io,DNS:localhost,IP:127.0.0.1"

chmod 600 "$SSL_DIR/ascendly.key"
chmod 644 "$SSL_DIR/ascendly.crt"

echo "[Ascendly] Certificate written to $SSL_DIR"
echo "           ascendly.crt — public certificate"
echo "           ascendly.key — private key (keep secret!)"