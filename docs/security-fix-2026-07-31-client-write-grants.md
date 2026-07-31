# Securityfix 2026-07-31: client-schrijfrechten en consent op de RLS-helper

Vervolg op [security-audit-2026-07-27-vibecoding.md](security-audit-2026-07-27-vibecoding.md).
Gevonden tijdens de verkenning voor het ontwerp
[patiënt inactief en rehab-trajecten](superpowers/specs/2026-07-31-patient-inactief-en-rehab-trajecten-design.md),
niet tijdens een geplande auditronde.

**Status: gedicht op productie.** De twee migraties zijn gedraaid en tegen de
live database geverifieerd. De codewijziging in `patient.ts` staat in de working
tree en gaat mee met de eerstvolgende deploy; er is geen volgorde-afhankelijkheid
tussen de twee.

## De bevinding

De audit van 27 juli sloot `public.users` voor de client-rollen
([20260728_lock_users_table_client_writes.sql](../supabase/migrations/20260728_lock_users_table_client_writes.sql)),
maar liet de overige public-tabellen open. Daar zat een tweede escalatieketen.

1. `authenticated` had INSERT op `public.patient_therapists`. Dat is elke
   ingelogde gebruiker, via de anon-key die in de browserbundle zit.
2. Policy `pt_insert_therapist` toetste alleen
   `WITH CHECK ("therapistId" = auth.uid()::text OR is_admin())`. Geen rolcheck,
   en geen enkele beperking op wélke `patientId` werd ingevuld. De kolommen
   `isActive` en `status` hebben database-defaults `true` en `APPROVED`, dus een
   minimale insert volstond.
3. Daarna gaf `is_therapist_of()` true. Die functie wordt gebruikt door
   **41 policies op 18 tabellen**: rehab-trackers en criteriumstatussen,
   assessments en testscores, sessielogs, exercise-logs, cardiologs, wellness,
   insights en insight-acties, programma's en programma-oefeningen, weekschema's
   met dagen en items, en oefeningen. Op vijf daarvan ook schrijven. Plus de
   volledige `users`-rij van het slachtoffer via `users_select`.

Om het uit te voeren moest je de cuid van het doelwit kennen; die zijn niet te
raden. Dat is de enige reden dat dit geen triviaal massaal lek was.

**Wat geen exploit nodig had.** `is_therapist_of()` toetste alleen `isActive`,
terwijl `patient.revokeTherapistAccess` bij het intrekken van toegang alleen
`status = 'REVOKED'` zette en `isActive` op `true` liet staan. Een therapeut
wiens toegang de patiënt had ingetrokken hield daarmee volledige REST-toegang tot
alle 18 tabellen van die patiënt. Daar was alleen zijn eigen login en de publieke
anon-key voor nodig.

## De fix

| Wat | Waar |
| --- | --- |
| Alle schrijfrechten van `anon` en `authenticated` op elke public-tabel ingetrokken, plus de default privileges zodat nieuwe tabellen ze niet opnieuw erven | [20260731_lock_client_writes_all_tables.sql](../supabase/migrations/20260731_lock_client_writes_all_tables.sql) |
| De drie schrijf-policies op `patient_therapists` verwijderd; `pt_select` blijft | idem |
| `is_therapist_of()` toetst nu ook `status IN ('APPROVED','PENDING')`, gelijk aan `hasPatientAccess()` in de applicatielaag | [20260731_is_therapist_of_respects_consent.sql](../supabase/migrations/20260731_is_therapist_of_respects_consent.sql) |
| `revokeTherapistAccess` zet `isActive: false`, `respondToTherapistAccess` zet `isActive` gelijk aan het antwoord | `src/server/routers/patient.ts` |

**Waarom dit niets breekt.** De app schrijft uitsluitend via Prisma, dat als
`postgres` verbindt (tabel-eigenaar, `BYPASSRLS`). Geverifieerd vóór de ingreep:
er is geen enkele `.from('<tabel>')`-write in de web- of de mobiele repo, alle
`.from()`-aanroepen gaan naar Supabase Storage-buckets, en er zijn geen
Realtime-abonnementen (`postgres_changes`) die op deze rechten leunen. `npx tsc`
is schoon.

SELECT is bewust blijven staan: dat is read-only en wordt door de RLS-policies
afgedekt. Nu de schrijfrechten weg zijn, is de enige manier om aan een
`patient_therapists`-rij te komen via tRPC, waar de rol- en praktijkchecks staan.

## Verificatie tegen productie

Gemeten na afloop:

| Controle | Uitkomst |
| --- | --- |
| Schrijfrechten `anon`/`authenticated` op public | 0 (was 632) |
| Leesrechten (SELECT) | 160, ongewijzigd |
| Policies op `patient_therapists` | 1, alleen `pt_select` |
| `is_therapist_of()` toetst `status` | ja |
| Koppelingen met `isActive = true` én status REVOKED/DECLINED | 0 |

De oorspronkelijke rechten staan in
`scripts/backups/grants-anon-authenticated-2026-07-31.json` (1112 grants, waarvan
632 schrijfrechten), zodat een `GRANT` terug mogelijk is als er ooit toch een
client-schrijfpad blijkt te bestaan.

## Wat hierna nog open staat

- **SELECT-rechten van client-rollen** zijn niet ingetrokken. Zolang geen client
  rechtstreeks leest, zijn ze overbodig en zou intrekken de RLS-policies
  overbodig maken. Dat is een grotere ingreep en is bewust niet meegenomen.
- De drie handmatige punten uit de audit van 27 juli (signup uitzetten,
  `mailer_autoconfirm`, `admin@mbtmove.com`) staan nog steeds open. Die zitten in
  het Supabase-dashboard, niet in code.
