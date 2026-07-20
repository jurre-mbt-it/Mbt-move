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
- **Plan-sjablonen** (`WeekPlanTemplate`) — meerweekse behandelplannen die je
  vanaf een datum op de kalender van een patiënt zet. Scope als de
  test-library: `practiceId` NULL = globale seed (voor iedereen), gevuld =
  eigen praktijk. Reads = `practiceScope()` in `planTemplates.ts`, writes =
  `assertCanEdit()`. RLS deny-all. De inhoud zijn `WeekSchedule`-rijen met
  `isTemplate: true` + `planTemplateId`. Toepassen (`applyToPatient`) is een
  KOPIE: het sjabloon later wijzigen raakt lopende patiënten niet.
- **Test-library** (`TestCatalogItem`, `TestBattery`/`TestBatteryItem`) —
  therapeut-bewerkbaar via `/therapist/test-reports/manage`. Scope via
  `practiceId`: NULL = globale seed (voor iedereen), gevuld = eigen
  praktijk. Reads = `practiceScope()` in `testReports.ts` (NULL OF eigen
  practiceId). Writes = `assertCanEditLibrary()`: globale seeds zijn in de
  single-clinic realiteit óók bewerkbaar, verder alleen eigen praktijk.
  Batterijen kunnen als revalidatie-protocol dienen (`durationWeeks` +
  per-test `targetWeek`). Deze drie tabellen hebben RLS deny-all.
- **Patiënt-data** (sessions, wellness, pain entries, assessments,
  rehab-trackers, programma-toewijzing, dashboard, voortgang, insights,
  **wearable-data** — `SleepEntry`, `VitalsEntry`, `ReadinessSnapshot`,
  `WearableConnection` plus de van de watch gesyncte `CardioLog`-rijen
  (`source = APPLE_WATCH`), gelezen via `wearables.forPatient`) —
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

# Gespiegelde code met de mobiele repo: draai de drift-check

De iOS-app (`/Users/eva/mbt-gym-mobile`, aparte repo) spiegelt bewust een paar
stukken uit deze repo: het cardio-blokkenmodel (`src/lib/cardio-workout.ts` ↔
`lib/cardio-workout.ts`) en de voorschrift/parameter-constanten
(`src/lib/prescription.ts` + `src/lib/program-constants.ts` ↔
`lib/prescription-mirror.ts`). Er is geen gedeeld package.

**Wijzig je een van die bronnen, draai dan `npm run check:mirror`** — dat laadt
de echte bestanden uit beide repo's en vergelijkt gedrag (zelfde blokken →
zelfde samenvatting/duur/kleuren/RPE's) en constanten. Faalt hij, trek de
andere kant gelijk vóór een release.

# Weekdatums: reken in NL-tijd, nooit in UTC

`WeekSchedule.startDate` is "maandag 00:00 lokale tijd", opgeslagen als instant.
In de database ziet dat eruit als `2026-05-03T22:00:00Z` — dat is **maandag 4
mei in Amsterdam, maar zondag 3 mei in UTC**. Alle startDate-waarden in
productie hebben deze vorm.

Server-side `getUTCDay()` gebruiken ziet dus een zondag en schuift naar de
maandag ervóór: **een hele week ernaast**. De server draait op Vercel in UTC,
dus `getDay()` helpt evenmin. Gebruik altijd [`src/lib/week-dates.ts`](src/lib/week-dates.ts):
kalenderdagen als `YYYY-MM-DD` in `Europe/Amsterdam`, en `amsMidnight()` om
terug te schrijven in dezelfde vorm als de bestaande data.

Gerelateerd: **`weekNumber` is geen sleutel.** Er is geen unique-constraint en
de planner zet 'm niet op; in productie is hij vrijwel altijd 1 en delen
meerdere weken van dezelfde patiënt hetzelfde nummer (één patiënt heeft er 3,
waarvan 2 op dezelfde maandag). Alles wat een kalenderweek moet aanwijzen —
`duplicateWeek`, `saveFromWeeks`, `applyToPatient` — ankert daarom op datum.

# Wat mag een patiënt-client zien van de weekplanner?

`WeekScheduleDayItem.kind` (`WeekItemKind`) bepaalt wat er op een dag staat.
Alleen **PROGRAM** en **WORKOUT** zijn workouts. REST/NOTE/TEST/EVENT zijn
kalender-markeringen voor de therapeut.

`patient.calendarRange` is het **enige** endpoint dat items aan een patiënt of
aan de mobiele app teruggeeft, en filtert daarom hard op
`kind: { in: ['PROGRAM', 'WORKOUT'] }`. Dat moet zo blijven zolang die clients
`kind` niet kennen: web-atleet én iOS doen allebei
`quickCategory ?? 'STRENGTH'`, dus een notitie zou daar als krachttraining
verschijnen — in het verleden zelfs als "gemist", en als start-knop naar de
sessie-runner. Ruim het filter pas op ná een mobiele release die `kind` leest.

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

## Tone of voice

Bij het schrijven of herschrijven van tekst voor dit product (UI-copy, notificaties,
marketing, blogs, patiëntadviezen, e-mails): volg `docs/tone-of-voice.md` en match
het juiste register. De AI-taal-blacklist daarin is hard (o.a. geen em-dashes, geen
holle marketingwoorden, geen slogan-antitheses).
