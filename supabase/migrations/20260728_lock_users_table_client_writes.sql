-- CRITICAL privilege-escalation fix (2026-07-28).
--
-- Probleem: de rollen `anon` en `authenticated` (dat is elke ingelogde
-- gebruiker via de publieke Supabase REST-API) hadden UPDATE/INSERT/DELETE op
-- `public.users`, inclusief de kolommen `role` en `practiceId`. De RLS-policy
-- `users_update_self` toetst alleen rij-EIGENDOM (`id = auth.uid()`), niet
-- WELKE kolom verandert. Een patiënt kon dus zijn eigen rij patchen met
--   PATCH /rest/v1/users?id=eq.<eigen-id>   { "role": "ADMIN" }
-- en werd ADMIN — `is_admin()` leest exact die kolom. Dat opent de hele
-- database buiten tRPC om (multi-tenant, medische dossiers).
--
-- Fix: client-rollen mogen `public.users` nooit schrijven. De app schrijft
-- users uitsluitend via Prisma (verbindt als `postgres`, tabel-eigenaar,
-- BYPASSRLS) — geverifieerd: geen enkele `.from('users')`-write in de web- of
-- mobiele repo. `handle_new_user()` is SECURITY DEFINER, eigenaar `postgres`,
-- dus signup blijft werken: de trigger draait met postgres-rechten, niet met
-- die van `authenticated`.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.users FROM anon, authenticated;

-- Defense-in-depth: maak de schrijf-policies deny-all conform het model in
-- AGENTS.md ("Prisma bypasst RLS, deny-all volstaat"). SELECT-policy blijft
-- staan (self-scoped, read-only, onschadelijk) zodat een eventueel toekomstig
-- client-read-pad niet stilletjes breekt.
DROP POLICY IF EXISTS users_insert_self ON public.users;
DROP POLICY IF EXISTS users_update_self ON public.users;
