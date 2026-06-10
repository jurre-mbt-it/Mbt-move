#!/usr/bin/env bash
# Bootstrap een staging-Supabase-DB als faithful mirror van prod (schema + RLS,
# GEEN data). Voor DPIA actie 10 (Prisma-rol-migratie) — testomgeving om de
# BYPASSRLS-afbouw te valideren zonder prod te raken.
#
# Vereist:
#   - STAGING_DATABASE_URL in .env.local (directe connectie, poort 5432) van een
#     LEEG, apart gratis Supabase-project — NOOIT prod.
#   - supabase/.temp/prod-public-schema.sql (schema-only dump van prod).
#   - libpq (psql): /opt/homebrew/opt/libpq/bin
#
# Veiligheid: weigert te draaien als de staging-host gelijk is aan de prod-host.
set -euo pipefail

cd "$(dirname "$0")/.."
PSQL=/opt/homebrew/opt/libpq/bin/psql
DUMP=supabase/.temp/prod-public-schema.sql

read_env() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'; }
host_of() { echo "$1" | sed -E 's#^[a-zA-Z]+://[^@]*@([^:/]+).*#\1#'; }

STAGING_URL="$(read_env STAGING_DATABASE_URL || true)"
PROD_URL="$(read_env DIRECT_URL || true)"

if [ -z "$STAGING_URL" ]; then
  echo "✗ STAGING_DATABASE_URL ontbreekt in .env.local. Maak eerst het gratis Supabase-project + zet de directe connection string (poort 5432)."; exit 1
fi
if [ ! -f "$DUMP" ]; then echo "✗ Dump ontbreekt: $DUMP"; exit 1; fi

STAGING_HOST="$(host_of "$STAGING_URL")"
PROD_HOST="$(host_of "$PROD_URL")"
if [ -n "$PROD_HOST" ] && [ "$STAGING_HOST" = "$PROD_HOST" ]; then
  echo "✗ VEILIGHEIDSSLOT: STAGING_DATABASE_URL wijst naar de PROD-host ($PROD_HOST). Afgebroken."; exit 1
fi
echo "→ Staging-host: $STAGING_HOST (prod: ${PROD_HOST:-onbekend}) — verschillend ✓"

echo "→ Schema + RLS toepassen op staging…"
"$PSQL" "$STAGING_URL" -v ON_ERROR_STOP=1 -f "$DUMP"

echo "→ Verificatie (moet matchen: 64 tabellen / 134 policies / 6 functies / RLS op 64):"
"$PSQL" "$STAGING_URL" -At -c "
  SELECT 'tabellen=' || count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';
  SELECT 'policies=' || count(*) FROM pg_policies WHERE schemaname='public';
  SELECT 'functies=' || count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace;
  SELECT 'rls_on=' || count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity;
"
echo "✓ Staging gebootstrapt."
