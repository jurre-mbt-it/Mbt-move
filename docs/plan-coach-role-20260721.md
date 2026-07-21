# Plan: COACH-rol (coaching-omgeving à la Final Surge)

Datum: 2026-07-21. Status: PLAN, nog niet uitvoeren. Uitvoering door Opus 4.8.

## Wat Jurre wil

Een rol naast THERAPIST die:
- **niet** aan een praktijk gekoppeld is;
- eigen atleten kan uitnodigen en beheren;
- oefeningen kan gebruiken/maken, programma's en weekschema's kan bouwen;
- trainingsplannen (meerweeks) kan maken en "uploaden" naar atleten;
- zijn atleten makkelijk kan monitoren (Final Surge-achtig);
- fysiotherapeuten kan uitnodigen om mee te kijken bij een atleet.

De ATHLETE-rol blijft bestaan; een atleet wordt dan gekoppeld aan een coach
i.p.v. aan een therapeut/praktijk.

## Kernbeslissingen (architectuur)

1. **Nieuwe enum-waarde `COACH`** in `UserRole` (prisma/schema.prisma:9).
   Geen aparte tabel: een coach is een `User` met `role = 'COACH'` en
   `practiceId = null`, altijd. Er is bewust géén pad om een coach aan een
   praktijk te hangen; dat houdt alle bestaande praktijk-takken in
   access-checks automatisch dicht.

2. **Hergebruik `PatientTherapist` als koppel-tabel.** De coach staat in de
   `therapistId`-kolom. Geen nieuwe tabel, geen migratie van bestaande data,
   en de bestaande consent-workflow (`PatientAccessStatus`, respond/revoke
   aan atleet-kant) werkt meteen. In UI-copy heet de relatie "coach" op basis
   van de rol van de gekoppelde user, niet van de tabelnaam.

3. **Toegangsregel voor een coach = ALLEEN directe koppeling.** Geen
   praktijk-tak. `hasPatientAccess` (src/server/lib/patient-access.ts) wordt
   de enige plek: de rolcheck `user.role !== 'THERAPIST'` wordt
   `!['THERAPIST','COACH'].includes(user.role)`, en de praktijk-OR-tak blijft
   feitelijk dood voor coaches omdat `practiceId` null is. Let op: dezelfde
   inline-variant leeft nog in `wearables.ts` (buildOverview/hasPatientAccess),
   `weekSchedules.ts` (regel ~31) en `patients.ts` (regel ~25). Die drie
   consolideren naar de centrale helper, of minimaal identiek bijwerken.

4. **Feature-set van de coach: alles ZIEN, klinisch HANDELEN blijft
   therapeut.** (Besluit Jurre 2026-07-21: "ziet alles".) De coach heeft
   volledige lees-toegang op het dossier van de gekoppelde atleet:
   atletenlijst + monitoring, wearables, wellness/readiness, pijn-invoer,
   sessie-historie/progressie, insights, testresultaten (read). Daarnaast de
   volledige bouw-tools: oefeningen, programma's, week-planner,
   plan-sjablonen (= trainingsplannen), berichten, signalen.
   Therapist-only blijven de klinische SCHRIJF-flows: behandel-sessies
   loggen (`logSessionForPatient`/`updateSessionLog`), assessments afnemen,
   test-reports aanmaken, hardloopanalyse, revalidatie-protocol activeren.
   Dat is precies waarom een meekijkende fysio waarde toevoegt.

5. **MFA verplicht voor coaches, net als voor therapeuten.** Coaches zien
   gezondheidsdata van derden. `assertStaffMfaEnrolled` (src/server/trpc.ts:290)
   en de web-shell behandelen COACH als staff.

6. **Wie maakt coaches aan: alleen ADMIN.** Via het bestaande invite-systeem
   (`invite.create` krijgt rol-optie COACH, alleen aan te roepen door admin)
   plus zichtbaar/beheerbaar in `/admin/users`. Geen zelf-registratie.

## Datamodel + migraties

- `ALTER TYPE "UserRole" ADD VALUE 'COACH';` — hand-migratie in
  `supabase/migrations/`, draaien met `npx prisma db execute --file ...`
  (één los statement; ADD VALUE kan niet in dezelfde transactie als gebruik
  ervan, dus als eigen bestand vóór alle andere wijzigingen draaien).
- **`WeekPlanTemplate` krijgt `creatorId String?`** + index. Reden: de huidige
  scoping is `practiceScope(practiceId)` waarbij `practiceId NULL` = "globale
  seed, voor iedereen, en bewerkbaar". Een coach heeft practiceId null; zonder
  fix zou elk trainingsplan van een coach (a) voor alle praktijken zichtbaar
  worden en (b) zou de coach globale seeds kunnen bewerken. Nieuwe regel in
  `planTemplates.ts`: voor users mét praktijk verandert niets; voor users
  zónder praktijk geldt reads = globale seeds (alleen-lezen) + eigen
  (`creatorId = user.id`), writes = alleen eigen. Backfill: bestaande rijen
  houden `creatorId = null` (gedrag ongewijzigd).
- **Zelfde check voor `WeekSchedule` en `Exercise`:** die hebben al
  `creatorId`/`createdById`-scoping die met `practiceId null` correct
  terugvalt op "alleen eigen + publiek" — verifiëren in de uitvoering, geen
  schema-wijziging verwacht.
- Geen nieuwe tabellen → geen nieuwe RLS nodig. De kolom-migratie voor
  `week_plan_templates` raakt RLS niet (deny-all blijft staan).

## Serverwerk (tRPC)

1. **Nieuwe procedure `coachStaffProcedure`** (naam vrij): THERAPIST, COACH of
   ADMIN, met staff-MFA-checks. De bestaande `therapistProcedure` blijft
   bestaan voor klinische routers. Per router omzetten:
   - naar coachStaff: `patients` (list/get/therapistDashboard/loadCurve/
     activityDetail/update/getSessionLog — NIET logSessionForPatient, dat is
     behandelen), `programs`, `weekSchedules`, `planTemplates`, `exercises`
     (`creatorProcedure` + COACH), `wearables` (gate + forPatient),
     `messages` (inbox/thread/send: rolchecks THERAPIST→THERAPIST|COACH),
     `insights` (incl. pijn-signalen, zie hieronder), `wellness`,
     pijn-leesroutes, `signals`-leesroutes, testResults-LEESroutes in
     `testReports` (alleen de queries, niet de mutaties), `invite`
     (zie hieronder), `tags` (check gebruik).
   - therapist-only laten (schrijf-flows): `rehab` (protocol-beheer),
     `assessments`, `testReports`-mutaties, `runningAnalysis`,
     treatment-flows in `patients.ts` (logSessionForPatient/
     updateSessionLog), print-routes.
   - **Pijn in de signalen**: de signalen/insights-feed kent al het type
     `'pain'` (insights.ts regel ~487/530). Verifiëren dat een pijn-melding
     van een atleet bij de coach in het signalen-dashboard én als
     berichten-aanleiding binnenkomt, net als bij de therapeut. (Besluit
     Jurre: de signalen-pagina is óók het kanaal waarmee de coach
     pijn-meldingen oppikt.)
   - Bij elke omgezette route checken dat de praktijk-tak niet per ongeluk
     data lekt bij `practiceId null` (lege OR-tak).
2. **`invite.create`:** COACH mag alleen `role: 'ATHLETE'` uitnodigen (geen
   PATIENT). `practiceId` van de invite/atleet blijft dan null. ADMIN mag
   `role: 'COACH'` uitnodigen. E-mailfooter: rendert al niets als
   praktijkgegevens ontbreken — verifiëren met een coach-invite.
3. **Co-monitoring (therapeut meekijken):** nieuwe mutatie
   `patients.inviteCoMonitor({ patientId, email })` voor COACH (en THERAPIST):
   - bestaat er een user met die e-mail en rol THERAPIST → maak een extra
     `PatientTherapist`-rij aan met `status: 'PENDING'`; de atleet keurt goed
     via de bestaande consent-flow (patient settings), de therapeut ziet de
     atleet daarna in de eigen lijst.
   - geen bestaande therapeut-user → foutmelding "nodig deze therapeut eerst
     uit als gebruiker" (v1; volledig extern uitnodigen is v2).
   - Audit-log op aanmaken + goedkeuren.
4. **`auth`/redirects:** `RequiredRole` + `ROLE_HOME` (require-role.ts) +
   `post-login-redirect.ts` + `api/auth/sync-user` uitbreiden met COACH →
   `/coach/dashboard`.
5. **Wearables:** `WEARABLES_ALLOWED_ROLES` + COACH (eigen watch mag ook;
   levert meteen de eigen-data-schermen op mobiel als een coach later de app
   gebruikt).

## Web-UI

Nieuw route-segment **`src/app/(coach)/coach/...`** met eigen layout
(`requireRole(['COACH'])`) en een smallere nav. Pagina's hergebruiken de
bestaande therapist-componenten waar die al op tRPC-data draaien; waar een
therapist-pagina klinische blokken bevat, krijgt het gedeelde component een
`variant: 'coach'`-prop i.p.v. een kopie:

- `/coach/dashboard` — hergebruik therapistDashboard: signalen (readiness
  rood, load-spikes, gemiste sessies), laatste activiteit per atleet.
- `/coach/athletes` + `/coach/athletes/[id]` — atletenlijst en profiel:
  progressie, belasting (loadCurve), wearables, wellness én pijn,
  sessie-historie, testresultaten (read), weekschema, notities
  (`PatientTherapist.notes` bestaat al), knop "therapeut uitnodigen"
  (co-monitoring). Geen knoppen voor klinische schrijf-acties (behandeling
  loggen, assessment/test afnemen).
- `/coach/exercises`, `/coach/programs`, `/coach/week-planner` — bestaande
  builders; scoping werkt via creatorId + practiceId null.
- `/coach/plans` — plan-sjablonen (trainingsplannen): bibliotheek + "toepassen
  op atleet vanaf datum" (`planTemplates.applyToPatient`, is al een kopie dus
  latere wijzigingen raken lopende atleten niet — precies het Final
  Surge-gedrag).
- `/coach/messages`, `/coach/settings` (incl. MFA-enrollment).

Atleet-kant: relatie-labels in patient/athlete settings tonen "Coach" als de
gekoppelde user rol COACH heeft (nu staat er "therapeut" hardcoded — checken
en aanpassen).

## Mobiel (klein, v1)

- Atleten van een coach gebruiken de app ongewijzigd (rol ATHLETE, koppeling
  via PatientTherapist werkt al; berichten/push-triggers verifiëren met een
  coach als afzender).
- `lib/auth.tsx` (regel ~162) laat alleen PATIENT/ATHLETE door; coach in de
  app is v2. Wel de rol-string netjes afvangen (nu zou COACH in dezelfde
  "geen toegang"-bak vallen — dat is oké, maar de melding moet kloppen).
- Copy die "therapeut" zegt in de atleten-omgeving (bv. berichten, uitleg
  dagstatus) nalopen: waar de tegenpartij een coach kan zijn, neutraal maken
  ("je coach of therapeut" of de naam gebruiken).

## Extra functies om mee te nemen (voorstel, in volgorde van waarde)

1. **Signalen-dashboard voor de coach** (hergebruik `signals`): dat is het
   monitoring-hart, Final Surge heeft dit als "athlete alerts".
2. **Compliance-week**: per atleet gepland vs gedaan deze week, in de
   atletenlijst als kolom. Data is er al (calendarRange + session logs).
3. **Coach-notities per atleet** — bestaat al (`PatientTherapist.notes`,
   privé per relatie), alleen UI op de coach-profielpagina.
4. **Bulk-apply**: één trainingsplan op meerdere atleten tegelijk zetten
   (loop over `applyToPatient`). Goedkoop, veel tijdwinst.
5. V2, niet nu bouwen: teams/groepen, coach in de mobiele app,
   volledig-externe therapeut-invite, betaalde coach-abonnementen.

## Beveiliging / AVG

- Coach ziet uitsluitend expliciet gekoppelde atleten met APPROVED/PENDING
  consent; atleet kan de koppeling intrekken (bestaande flow).
- Coach kan geen PATIENT-rollen koppelen of zien; invite-rol is afgedwongen
  server-side.
- Praktijk-therapeuten zien coach-atleten NIET (practiceId null matcht geen
  praktijk-tak) tenzij expliciet als co-monitor gekoppeld. Andersom ziet een
  coach nooit praktijk-patiënten. Dit in de testronde expliciet bewijzen.
- DPA/GHV-acceptance voor atleten blijft gelden (platform-niveau), MFA voor
  coach verplicht. `docs/avg-verwerkers.md` + DPIA + register bijwerken: er
  komt een nieuwe categorie verwerker-gebruikers (coaches) bij die
  gezondheidsdata van derden inziet.
- Audit-logs op co-monitor-invites en op coach-reads waar de bestaande
  therapeut-reads ook loggen (`auditLog`-callsites volgen).

## Uitvoeringsvolgorde voor Opus 4.8

1. **Fundament**: enum-migratie + `WeekPlanTemplate.creatorId`-migratie
   (beide handmatig draaien op prod, zie runbook hieronder), Prisma-schema,
   `RequiredRole`/`ROLE_HOME`/sync-user/post-login-redirect,
   `coachStaffProcedure`, `hasPatientAccess`-consolidatie, MFA-gates.
2. **Invites + beheer**: admin nodigt COACH uit; coach nodigt ATHLETE uit;
   admin/users toont COACH.
3. **Coach-shell**: layout + dashboard + athletes(+detail) + settings/MFA.
4. **Content-tools**: exercises/programs/week-planner/plans met de
   practiceId-null-scoping en de planTemplates-fix.
5. **Monitoring**: wearables-gate, signalen, berichten, compliance-kolom.
6. **Co-monitoring**: inviteCoMonitor + consent + labels aan atleet-kant.
7. **Mobiel-kleinwerk + QA**: copy-check, e2e-testronde (zie hieronder),
   `npm run check:mirror` (geen mirror-bronnen geraakt, maar draaien),
   tsc + eslint beide repo's, AVG-docs bijwerken.

Migratie-runbook (volgorde belangrijk):
```
npx prisma db execute --file supabase/migrations/2026XXXX_userrole_coach.sql
npx prisma db execute --file supabase/migrations/2026XXXX_weekplantemplate_creator.sql
npx prisma generate
```
Enum-ADD VALUE moet gecommit zijn vóór code deployt die 'COACH' schrijft.

Testronde minimaal: (a) admin → coach-invite → coach onboardt + MFA;
(b) coach → atleet-invite → atleet accepteert + DPA → verschijnt in lijst;
(c) coach maakt plan → apply op atleet → atleet ziet week in app/web en kan
workout starten; (d) coach opent wearables/progressie van atleet; (e) coach
probeert klinische route (bv. testReports) → FORBIDDEN; (f) praktijk-therapeut
ziet coach-atleet niet; (g) co-monitor-invite → atleet keurt goed → therapeut
ziet atleet mét klinische tools; (h) atleet trekt coach-toegang in → coach
ziet niets meer.

## Besluiten Jurre (2026-07-21, vragen beantwoord)

1. **Berichten-inbox: ja**, 1-op-1 zoals de therapeut. De signalen-pagina is
   daarbij ook het kanaal waarmee de coach pijn-meldingen van atleten oppikt.
2. **Coach ziet alles** van de gekoppelde atleet, inclusief het
   pijn-dossier. Alleen de klinische schrijf-flows blijven therapist-only
   (zie kernbeslissing 4).
3. **Branding: gewoon BASE**, geen aparte coach-branding in v1.
