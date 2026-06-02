<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Multi-tenant scope: wat *wel* en *niet* praktijk-gescheiden is

De app is multi-tenant via `User.practiceId`. De volgende objecten zijn
**gedeeld binnen een `Practice`** — niet per therapeut afgeschermd. Dit is
opzettelijk; documenteer hier áls je het wijzigt:

- **Exercises** — een oefening die therapeut A in praktijk X aanmaakt is
  zichtbaar voor alle collega's in dezelfde praktijk (via `exercises.list`
  filter). Geen ownership-check op `creatorId` voor reads.
- **Programs (templates)** — `isTemplate: true` programma's zijn
  praktijk-breed zichtbaar; assigned programma's zitten alleen bij de
  patiënt + treating-therapeuten.
- **Week-schedules** — owner is creator, maar collega-therapeuten in
  dezelfde praktijk kunnen ze lezen.
- **Patiënt-data** (sessions, wellness, pain entries, assessments,
  rehab-trackers, programma-toewijzing, dashboard, voortgang, insights) —
  toegang via directe `PatientTherapist`-relatie **OF** zelfde
  `practiceId` als de patiënt. Dit laat collega-therapeuten binnen één
  praktijk elkaars patiënten behandelen en sessies loggen zonder aparte
  invite/koppeling. Audit-trail (`SessionLog.therapistId`) legt vast wie
  wat heeft gedaan. Patroon: `hasPatientAccess()` in `patients.ts` of
  inline `OR: [{ patientTherapists: { some: ... } }, { practiceId: user.practiceId }]`.

Wat *wél* per-therapeut afgeschermd blijft:

- **Therapist-notities op `PatientTherapist`** — privé per relatie, niet
  zichtbaar voor collega's (`patients.update` raakt alleen eigen relatie).
- **Koppelingsbeheer** (`patients.delete`, `patients.resendInvite`,
  patient-side `respondToTherapistAccess`/`revokeTherapistAccess`) —
  alleen eigen `PatientTherapist`-rij; collega's kunnen jouw koppeling
  niet verwijderen of opnieuw verzenden.
- **Audit-logs** — alleen admin.

Soft-delete (`User.deletedAt`) wordt automatisch afgedwongen op reads via
een Prisma client-extension in [`src/lib/prisma.ts`](src/lib/prisma.ts).
Escape-hatch: `where: { deletedAt: undefined }` (geen filter) of
`{ deletedAt: { not: null } }` (admin/cron flows).

DPA-acceptance is verplicht voor PATIENT/ATHLETE vóór ze patient-data
endpoints raken, server-side afgedwongen in
[`src/lib/auth/require-role.ts`](src/lib/auth/require-role.ts).

# RLS verplicht op ELKE nieuwe public-tabel

De anon-key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) zit in de browserbundle. Een
`public`-tabel zónder RLS is daarmee rechtstreeks leesbaar/schrijfbaar via
de Supabase REST-API, buiten de app om. Supabase-linter flagt dit als
`rls_disabled_in_public`.

**Regel: wie een tabel toevoegt, zet in dezelfde migratie RLS aan.** Niet
los laten en "later de force-migratie draaien" — dat is precies hoe
`pain_entries` en de clinical-tests-tabellen (`clinical_tests`,
`patient_test_assignments`, `patient_test_results`) door de mazen vielen.

Minimaal (Prisma draait als owner en bypasst RLS, dus deny-all volstaat):

```sql
ALTER TABLE public.<tabel> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "default_deny" ON public.<tabel>
  FOR ALL TO public USING (false) WITH CHECK (false);
```

`prisma db push` zet GEEN RLS — na een push die een tabel toevoegt altijd
de RLS-migratie meesturen. Vangnet bij drift:
`supabase/migrations/20260521_force_rls_all_public.sql` is idempotent en
zet RLS + `default_deny` op elke tabel die het mist (geen DROP). Check de
staat met een query op `pg_class.relrowsecurity` voor `public`-tabellen.
