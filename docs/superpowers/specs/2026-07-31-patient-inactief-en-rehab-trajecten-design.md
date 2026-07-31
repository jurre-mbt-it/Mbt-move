# Patiënt inactief zetten en revalidatietrajecten afsluiten

Ontwerpdocument, 31 juli 2026. Web (Next.js/tRPC/Prisma) en iOS (Expo, aparte repo).

## 1. Wat we bouwen

Twee losse acties die samen één werkelijkheid beschrijven: een behandeling begint en houdt een keer op.

1. **Patiënt inactief zetten.** De therapeut markeert een patiënt als uitbehandeld. De patiënt verdwijnt uit werklijsten, aandacht-signalen en herinneringen, maar het dossier blijft volledig leesbaar en de app blijft voor de patiënt werken.
2. **Revalidatietraject afsluiten.** Een lopend rehab-protocol krijgt een einddatum en een uitkomst. Komt de patiënt later terug, dan start er een nieuw traject dat schoon begint, terwijl het oude terug te lezen blijft.

Vandaag kan geen van beide. Er is alleen "koppeling verbreken" (`patients.delete`, verwijdert programma's) en soft-delete (AVG). En het rehab-model kan er maar één per patiënt aan: `PatientRehabTracker` heeft `patientId` als primary key en `RehabCriterionStatus` is uniek op `[patientId, criterionId]`.

## 2. Vastgestelde besluiten

Uit de vragenronde van 31 juli:

| Besluit | Keuze |
| --- | --- |
| Wat mag een inactieve patiënt | De app blijft werken. Doortrainen, loggen, terugkijken. |
| Rehab-historie | Losse trajecten met historie. Criteria per traject, oude trajecten bevriezen. |
| Automatische bijwerkingen | Planning stopt, push en herinneringen uit, lopende programma's op COMPLETED, uit aandacht-signalen. |
| Rechten | Elke therapeut in de praktijk. Coach idem voor eigen atleten. |

Aanvullend, door mij ingevuld en hier expliciet gemaakt:

- Inactief zetten en traject afsluiten zijn **twee knoppen**. Sluit je het laatste lopende traject, dan biedt de app aan de patiënt ook inactief te zetten. Inactief zetten met een lopend traject vraagt eerst wat er met dat traject moet gebeuren.
- Afsluiten legt vast: einddatum, uitkomst uit een vaste lijst, optionele notitie, en wie het deed.
- Alles is omkeerbaar. Een afgesloten traject heropenen kan zolang er geen nieuwer traject is gestart.
- Web eerst, iOS erachteraan. Alle serverwijzigingen zijn additief, want er is geen version-gate in de app.

## 3. Programma's afsluiten: vinkjes in de dialoog

**Programma's op COMPLETED botst met "de app blijft werken".**

Zeven patiënt-endpoints filteren hard op `status: 'ACTIVE'`: `getActiveProgram` ([patient.ts:218](src/server/routers/patient.ts:218)), `getActivePrograms` (316), `moveSession` (364), `getTodayExercises` (535), `getActiveCardioProgram` (1273), `hasTendinopathyProgram` (1698) en `getTendinopathyToday` (1819). Zet je bij het inactief maken alle programma's op COMPLETED, dan is de programmakant van de app voor die patiënt leeg: geen schema, geen oefeningen van vandaag, geen cardioplan, geen tendinopathie-dagritme met zijn streak en mijlpalen, en sessies verplaatsen kan niet meer. Dat is precies het tegenovergestelde van besluit 1.

**Besloten op 31 juli:** de middenweg, omdat die beide besluiten respecteert.

> Bij het inactief zetten toont de dialoog welke programma's lopen, met per programma een vinkje "afsluiten" dat standaard aan staat. De therapeut kan er één laten doorlopen als de patiënt zelfstandig verdergaat. Wat wordt afgesloten krijgt `status: COMPLETED`, `endDate = nu` en een nieuwe marker `closedByDischarge: true`, zodat heractiveren precies die programma's kan terugzetten en de programma's die de therapeut zelf eerder afrondde met rust laat.

`Program` krijgt daarvoor één kolom:

```prisma
/// Gezet toen dit programma automatisch werd afgesloten omdat de patiënt op
/// inactief ging. Alleen die programma's worden bij heractiveren teruggezet;
/// programma's die de therapeut zelf afrondde blijven COMPLETED.
closedByDischarge Boolean @default(false)
```

Bij heractiveren gaan die programma's terug naar `ACTIVE` met `endDate = null` en `closedByDischarge = false`, en wordt `startDate` opgeschoven met de duur van de onderbreking. Zonder dat laatste springt `computeCurrentWeekDay` ([patient.ts:104](src/server/routers/patient.ts:104)) meteen naar de laatste week van het programma, want die rekent kaal in dagen sinds `startDate`.

De overige open punten staan in sectie 12 en blokkeren de bouw niet.

## 4. Beveiligingsbevinding die vóór dit werk uit moet

Tijdens de verkenning is een bestaand, live gat gevonden dat losstaat van deze feature maar wel exact de tabellen raakt die we gaan verbouwen. Geverifieerd tegen productie op 31 juli.

**De keten.** De rol `authenticated` heeft INSERT op `public.patient_therapists`. De policy `pt_insert_therapist` ([20260420_enable_rls.sql:129](supabase/migrations/20260420_enable_rls.sql:129)) controleert alleen `"therapistId" = auth.uid()`, zonder rolcheck en zonder enige beperking op `patientId`. De kolommen `isActive` en `status` hebben database-defaults `true` en `APPROVED`. Elke ingelogde gebruiker kan dus met de anon-key uit de browserbundle een rij inserten die zichzelf tot behandelaar van een willekeurige gebruiker maakt.

Daarna geeft `is_therapist_of()` true, en dat ontsluit **18 tabellen** met klinische data van dat slachtoffer: `patient_rehab_trackers`, `rehab_criterion_status`, `patient_assessments`, `assessment_test_scores`, `assessment_archetype_summaries`, `session_logs`, `exercise_logs`, `cardio_logs`, `wellness_checks`, `insights`, `insight_actions`, `patient_insight_status`, `programs`, `program_exercises`, `week_schedules`, `week_schedule_days`, `week_schedule_day_items`, `exercises`. Op vijf daarvan ook schrijven. Plus de volledige `users`-rij van het slachtoffer via `users_select`.

Beperking: je moet de user-id van het doelwit kennen, en dat is een cuid, dus niet te raden.

**Wat geen exploit nodig heeft en nu al waar is.** `patient.revokeTherapistAccess` ([patient.ts:2476](src/server/routers/patient.ts:2476)) zet `status: 'REVOKED'` maar laat `isActive` op `true`. `is_therapist_of()` kijkt alleen naar `isActive`. Een therapeut wiens toegang de patiënt heeft ingetrokken houdt daarmee volledige REST-toegang tot alle 18 tabellen van die patiënt. Daar is alleen zijn eigen login en de publieke anon-key voor nodig.

**Voorgestelde reparatie, drie regels.**

1. `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` Geverifieerd veilig: geen enkele client schrijft rechtstreeks naar een tabel. Alle `.from()`-aanroepen in beide repo's gaan naar Supabase Storage-buckets, niet naar Postgres. Er zijn nu 158 INSERT-grants uitgedeeld aan clientrollen. Dit volgt het precedent van [20260728_lock_users_table_client_writes.sql](supabase/migrations/20260728_lock_users_table_client_writes.sql).
2. `is_therapist_of()` uitbreiden met `AND status = 'APPROVED'`. Raakt elke policy die de functie gebruikt, dus dit wil een eigen migratie met een inventarisatie vooraf.
3. `revokeTherapistAccess` zet ook `isActive: false`.

Dit hoort niet ín deze feature, maar wel ervóór, want stap 1 en 2 bepalen of de rehab-migratie functionele policies moet herschrijven of kan overgaan op deny-all. Met de REVOKE erbij is deny-all genoeg en wordt de rehab-migratie eenvoudiger.

## 5. Datamodel

### 5.1 Inactief: een eigen tabel, geen kolom op User

```prisma
model PatientCareStatus {
  id             String    @id @default(cuid())
  patientId      String
  patient        User      @relation("CareStatusPatient", fields: [patientId], references: [id], onDelete: Cascade)
  /// Scope-sleutel. THERAPIST -> practiceId van de therapeut. COACH -> eigen user-id.
  /// Nooit allebei null: een therapeut zonder praktijk wordt geweigerd.
  practiceId     String?
  practice       Practice? @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  coachId        String?
  coach          User?     @relation("CareStatusCoach", fields: [coachId], references: [id], onDelete: Cascade)

  dischargedAt   DateTime
  dischargedById String
  dischargedBy   User      @relation("CareStatusDischarger", fields: [dischargedById], references: [id])
  reason         CareDischargeReason
  /// Vrije toelichting. Medische PII, staat daarom hier en niet in AuditLog.metadata.
  note           String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([patientId])
  @@map("patient_care_status")
}

enum CareDischargeReason {
  COMPLETED      // behandeling afgerond
  DISCONTINUED   // voortijdig gestopt
  TRANSFERRED    // doorverwezen of overgedragen
  NO_SHOW        // niet meer verschenen
  OTHER
}
```

Plus twee partial unique indexen in SQL, want Prisma kan ze niet uitdrukken en Postgres ziet NULLs als verschillend:

```sql
CREATE UNIQUE INDEX "patient_care_status_one_per_practice"
  ON public.patient_care_status ("patientId", "practiceId") WHERE "practiceId" IS NOT NULL;
CREATE UNIQUE INDEX "patient_care_status_one_per_coach"
  ON public.patient_care_status ("patientId", "coachId") WHERE "coachId" IS NOT NULL;
```

Heractiveren verwijdert de rij. Bestaan-van-de-rij is de status, er is geen `reactivatedAt`. De geschiedenis van archiveren en terughalen zit in de audit-log.

**Waarom niet op `PatientTherapist`.** Zowel `isActive` als `status` zitten in het pad van `hasPatientAccess` ([patient-access.ts:43](src/server/lib/patient-access.ts:43)). Ze aanpassen ontneemt de therapeut het dossier, terwijl besluit 1 juist vereist dat het leesbaar blijft. Bovendien toont `patient.getTherapistAccess` ([patient.ts:2415](src/server/routers/patient.ts:2415)) die status aan de patiënt als toestemmingsstatus. Uitbehandeling zou daar lezen als een intrekking van consent.

**Waarom niet als kolom op `User`.** Twee redenen. Ten eerste: dezelfde persoon kan tegelijk coach-atleet en praktijk-patiënt zijn, want `patients.inviteCoMonitor` ([patients.ts:954](src/server/routers/patients.ts:954)) maakt die combinatie expliciet mogelijk. Een globale vlag laat een praktijk-therapeut de atleet uit de lijst van de coach halen, en AGENTS.md zet die scheiding bewust neer. Ten tweede: de self-SELECT-policy op `public.users` staat nog open, dus een `dischargeReason` op `users` is voor de patiënt zelf leesbaar met de anon-key. Een vrije toelichting van een therapeut over een patiënt hoort niet op die plek.

De scope-sleutel volgt het patroon van `planScope` ([plan-access.ts:14](src/server/lib/plan-access.ts:14)), dat als enige in de codebase correct oplost dat `practiceId NULL` twee dingen betekent.

RLS in dezelfde migratie, conform AGENTS.md:

```sql
ALTER TABLE public.patient_care_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "default_deny" ON public.patient_care_status
  FOR ALL TO public USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.patient_care_status FROM anon, authenticated;
```

### 5.2 Rehab-trajecten: episodes

`PatientRehabTracker` krijgt een eigen `id` en afsluitvelden. `RehabCriterionStatus` verhuist van `patientId` naar `trackerId`. Dat laatste is de kern: zolang statussen aan de patiënt hangen, lopen vinkjes van een oud traject door in een nieuw protocol.

```prisma
enum RehabTrajectOutcome {
  COMPLETED
  DISCONTINUED
  TRANSFERRED
  RELAPSE
  UNKNOWN
}

model PatientRehabTracker {
  id            String               @id @default(cuid())
  patientId     String
  patient       User                 @relation("RehabTrackerPatient", fields: [patientId], references: [id], onDelete: Cascade)
  protocolId    String
  protocol      RehabProtocol        @relation(fields: [protocolId], references: [id])
  activatedById String
  activatedBy   User                 @relation("RehabTrackerActivator", fields: [activatedById], references: [id])
  activatedAt   DateTime             @default(now())
  /// Sluitings-marker. Dit is het ENIGE veld dat bepaalt of een traject loopt;
  /// de partial unique index patient_rehab_trackers_one_open_per_patient hangt eraan.
  deactivatedAt DateTime?
  closedById    String?
  closedBy      User?                @relation("RehabTrackerCloser", fields: [closedById], references: [id], onDelete: SetNull)
  outcome       RehabTrajectOutcome?
  outcomeNote   String?
  surgeryDate   DateTime?
  injuryDate    DateTime?
  notes         String?
  updatedAt     DateTime             @updatedAt

  statuses RehabCriterionStatus[]

  @@index([patientId, activatedAt])
  @@map("patient_rehab_trackers")
}

model RehabCriterionStatus {
  id               String                    @id @default(cuid())
  trackerId        String
  tracker          PatientRehabTracker       @relation(fields: [trackerId], references: [id], onDelete: Cascade)
  criterionId      String
  criterion        RehabCriterion            @relation(fields: [criterionId], references: [id], onDelete: Cascade)
  status           RehabCriterionStatusValue @default(NOT_MET)
  measurementValue String?
  measurementDate  DateTime?
  notes            String?
  updatedById      String
  updatedBy        User                      @relation("RehabStatusUpdater", fields: [updatedById], references: [id])
  createdAt        DateTime                  @default(now())
  updatedAt        DateTime                  @updatedAt

  @@unique([trackerId, criterionId])
  @@index([trackerId])
  @@map("rehab_criterion_status")
}
```

Op `User`: `rehabTracker PatientRehabTracker?` wordt `rehabTrackers PatientRehabTracker[]`, plus `rehabTrackersClosed`. Die hernoeming is veilig, het veld wordt vandaag nergens in `src/` gebruikt.

Maximaal één lopend traject per patiënt, afgedwongen in de database:

```sql
CREATE UNIQUE INDEX "patient_rehab_trackers_one_open_per_patient"
  ON public.patient_rehab_trackers ("patientId") WHERE "deactivatedAt" IS NULL;
```

De tabelnaam blijft `patient_rehab_trackers`. Hernoemen naar `rehab_episodes` zou elke constraint-, index- en policy-naam meenemen zonder functioneel voordeel.

De nieuwe FK `trackerId -> patient_rehab_trackers(id) ON DELETE CASCADE` lost meteen een AVG-gat op: `rehab_criterion_status` heeft vandaag geen FK naar users, waardoor de gdpr-cleanup-cron medische statusrijen laat staan. In productie staan er twee van een hard verwijderde gebruiker.

## 6. Migratie

Er is geen dev- of staging-database. `prisma.config.ts` wijst naar `DIRECT_URL`, dus elke `db execute` en `db push` raakt live patiëntdata. Productie bevat nu 2 trackers en 57 criteriumstatussen, dus het volume is klein, maar de PK-wissel is dat niet.

**`prisma db push` is hier destructief.** Een `migrate diff` tegen een omgebouwd schema levert letterlijk `ADD COLUMN "id" TEXT NOT NULL` op een gevulde tabel (Postgres weigert dat, push lost het op met `--accept-data-loss`) en `DROP COLUMN "patientId"` op `rehab_criterion_status`, wat de enige koppeling van 57 medische rijen vernietigt. De handmatige SQL gaat dus eerst, `schema.prisma` daarna.

Expand en contract, in vier stappen:

| Stap | Wat | Terug te draaien |
| --- | --- | --- |
| A | Tracker krijgt `id`, PK verschuift, afsluitvelden en indexen erbij. Additief. | Ja |
| B | `trackerId` op de statustabel, backfill, FK, nieuwe unique index. Additief. | Ja |
| deploy | Code die op `trackerId` schrijft en `patientId` nog meeschrijft. | Ja |
| C | Oude policies droppen, `patientId` droppen, RLS en grants opnieuw zetten. | Lossy zodra er een tweede traject bestaat |

De volledige SQL per statement, met controlequery's en het rollback-pad, staat in [2026-07-31-rehab-episodes-migratie-sql.md](2026-07-31-rehab-episodes-migratie-sql.md). Vier punten die je niet mag overslaan:

1. **Backup vooraf.** JSON-dump naar `scripts/backups/` volgens het patroon van [merge-duplicate-weeks.ts](scripts/merge-duplicate-weeks.ts) (dry-run default, `--apply` vlag). Geen archieftabel in `public`, want `db push` wil tabellen verwijderen die niet in het schema staan.
2. **De vier policies op `rehab_criterion_status` bevatten `is_therapist_of("patientId")`.** Dat is een pg_depend-afhankelijkheid: `DROP COLUMN` faalt zolang ze bestaan, en `CASCADE` sloopt ze stil. Expliciet droppen en vervangen in dezelfde migratie. Vertrouw niet op [20260521_force_rls_all_public.sql](supabase/migrations/20260521_force_rls_all_public.sql) als vangnet: dat repareert pas bij de volgende run en raakt de grants niet aan.
3. **In de tussenfase moet het Prisma-model beide kolommen bevatten.** `patientId` is `NOT NULL` zonder default. Laat je het veld in die fase uit het model weg, dan faalt elke insert.
4. **Na afloop moet `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` "empty migration" geven.** De baseline is vandaag al leeg, dus elke afwijking is nieuw.

Drie checks bij aan [scripts/check-migrations.ts](scripts/check-migrations.ts): kolom `id` op de trackers, kolom `trackerId` op de statussen, en de afwezigheid van `patientId` daar.

### Stille fouten die in de tussenfase gewoon compileren

Deze drie geven geen typefout en geen runtime-fout, ze geven alleen verkeerde klinische uitkomsten:

- [rehab-data.ts:43](src/lib/rehab-data.ts:43) haalt statussen op met `{ patientId, criterionId: { in: [...] } }`. Dat levert de vinkjes van álle trajecten van die patiënt. Precies de bug die we oplossen, maar dan onzichtbaar. Deze functie voedt de UI én beide PDF-ingangen.
- [rehab.ts:264](src/server/routers/rehab.ts:264) telt behaalde criteria op `patientId`. Blijft dat staan, dan krijgt een patiënt bij het starten van een nieuw traject meteen een onterechte "fase behaald"-push.
- [rehab-data.ts:23](src/lib/rehab-data.ts:23) doet `findFirst` zonder `orderBy`. Met meerdere trajecten is "het actieve traject" niet-deterministisch.

## 7. Server

### Nieuwe procedures

| Procedure | Soort | Doet |
| --- | --- | --- |
| `patients.setInactive` | `coachStaffProcedure` | Schrijft `PatientCareStatus`, sluit programma's, sluit open insights, audit |
| `patients.reactivate` | `coachStaffProcedure` | Verwijdert de rij, zet gemarkeerde programma's terug, audit |
| `rehab.closeTraject` | `therapistProcedure` | Zet `deactivatedAt`, `closedById`, `outcome`, `outcomeNote` |
| `rehab.reopenTraject` | `therapistProcedure` | Zet `deactivatedAt` terug op null, alleen als er geen nieuwer traject is |
| `rehab.listTrajects` | `therapistProcedure` | Historie voor de therapeut, per patiënt |
| `rehab.getTraject` | `therapistProcedure` | Eén afgesloten traject met zijn bevroren criteria |

`patients.list` krijgt een **optionele** input `{ include: 'active' | 'archived' | 'all' }` met default `'active'`, in plaats van een tweede endpoint. De procedure heeft vandaag geen `.input()`, en optioneel blijft compatibel met bestaande clients, inclusief de iOS-app.

Rehab-schrijfacties blijven op `therapistProcedure`. Een coach mag geen traject afsluiten. AGENTS.md zet klinische schrijfacties expliciet daar. Consequentie: het rehab-blok moet in het coach-portaal verborgen worden, want `therapist/patients/[id]/page.tsx:853` rendert `RehabTracker` nu ook voor een coach, die dan stil FORBIDDEN krijgt.

### Beveiliging per procedure

**Rolfilter op het doel.** `hasPatientAccess` filtert niet op de rol van de patiënt en geeft `true` terug voor `patientId === user.id`. Zonder extra filter kan een therapeut een collega, een admin of zichzelf inactief zetten. Dat faalt stil, want de lijsten filteren op rol. Schrijf daarom via `updateMany`/`createMany` met `role: { in: ['PATIENT','ATHLETE'] }` in de where, exact zoals [patients.ts:925](src/server/routers/patients.ts:925) dat doet, met de comment die daar al staat.

**Anker de autorisatie op `tracker.patientId`, nooit op een meegestuurde `patientId`.** Zodra `trackerId` de sleutel wordt, kan een therapeut een eigen `patientId` meesturen met een `trackerId` van een vreemde patiënt: `assertTreating` slaagt en de schrijfactie landt in een ander dossier. Laad de tracker eerst, autoriseer op `tracker.patientId`, en gooi FORBIDDEN bij een mismatch in plaats van er één te negeren. Dit geldt ook voor `getTraject` en `listTrajects`.

**De protocol-guard moet mee.** [rehab.ts:202](src/server/routers/rehab.ts:202) vergelijkt het protocol van het criterium met het protocol van de tracker van de patiënt. Dat moet het protocol van het gekozen traject worden, anders kun je een criterium van traject A in traject B wegschrijven.

**Filters onder `AND`, nooit als tweede `OR`-sleutel.** De waarschuwing staat letterlijk in de code op [patients.ts:2099](src/server/routers/patients.ts:2099): een object-spread overschreef de scope-OR en lekte naam en e-mail uit elke praktijk (audit 27 juli, H1). `patients.search` toont de goede vorm.

**Coach-scope niet laten wegvallen.** `practiceScope(coach)` geeft een lege array. Een query van de vorm `...(scope.length ? { OR: scope } : {})` laat de scoping voor een coach volledig vallen. Daarom gaat het archief via een input op `patients.list` en niet via een nieuw endpoint met een eigen where.

**Geen zesde kopie van de toegangscheck.** Er staan er al vijf: `rehab.ts:17`, `weekSchedules.ts:32`, `planTemplates.ts:131`, `insights.ts:24`, `wearables.ts:52`. En twee afwijkende in `exercises.lastUsedParams` en `wellness.ts`, waar de praktijk-tak níet aan `role === 'THERAPIST'` gebonden is. Kopieer de goede vorm uit `patient-access.ts`, niet de dichtstbijzijnde.

**Audit.** Nieuwe events in de union van [audit.ts](src/server/audit.ts): `PATIENT_DISCHARGED`, `PATIENT_REACTIVATED`, `REHAB_TRAJECT_CLOSED`, `REHAB_TRAJECT_REOPENED`. Aanroepen met het bestaande patroon. Geen vrije tekst in `metadata`, want de regel bovenaan dat bestand verbiedt PII. De reden gaat mee als enum-waarde; de vrije toelichting staat op de rij zelf. En omdat `auditLog()` stil faalt, is het een spoor en geen slot: de zichtbare regel "gearchiveerd door X op datum" komt uit `dischargedById`/`dischargedAt`, niet uit de audit-log.

Sluit inactief zetten een traject mee af, log dan beide gebeurtenissen. Anders is achteraf niet te zien of de therapeut het traject zelf sloot.

### Waar het inactief-filter bij moet

Werklijsten en signalen, allemaal onder `AND`:

- `patients.list` (60-75), `patients.caseload` (188-205), `patients.search` (2132-2139)
- `patients.therapistDashboard` (470-487) en `silentPatients` (688-696)
- `insights.getDashboard` ([insights.ts:64](src/server/routers/insights.ts:64))
- `programs.reviewDue` ([programs.ts:571](src/server/routers/programs.ts:571)), aan de **patiënt**-kant, niet aan de programma-eigenaar. `shop.activateProgram` maakt programma's met de `creatorId` en `practiceId` van het sjabloon, dus een zelf geactiveerd shop-programma van een uitbehandelde koper komt er anders alsnog in.
- `messages.inbox` (252) en `messages.unreadTotal` (327), en daarmee de badge in [TherapistSidebar.tsx:130](src/components/layout/TherapistSidebar.tsx:130). Alleen relevant voor atleten: berichten zijn atleet-only.
- `cohort.therapistOverview` (51-64) en `cohort.adminOverview` (210-222)
- De CIE-cron [compute.ts:73](src/server/insights/compute.ts:73), vóór de notificatie-dispatch
- De ontvangerslijst van [daily-reminders/route.ts:85](src/app/api/cron/daily-reminders/route.ts:85), die bewust geen rolfilter heeft

Bewust **niet** gefilterd, want het archief moet leesbaar blijven: `hasPatientAccess`, `practiceScope`, `patients.get`, `getDashboardData`, `recentSessions`, `recentCardioSessions`, `monthlySummary`, `getProgress` en `getProgressPdfHtml`, `loadCurve`, `activityDetail`, `getPainEntries`, en beide print-routes.

Nog te beslissen (sectie 12): `dpa.listPatients`, het juridische DPA-overzicht voor de admin.

### Planning stopt: filteren, niet verwijderen

Verbergen is omkeerbaar, verwijderen niet, en verwijderen cascadeert via `WeekScheduleDay` naar items en oefeningen. Dus: weken waarvan de maandag op of na de eerste maandag ná `dischargedAt` valt, komen niet meer mee in `patient.calendarRange` ([patient.ts:2122](src/server/routers/patient.ts:2122)), `weekSchedules.mySchedule` (831) en `weekSchedules.myWeekMeta` (865). De lopende week blijft dus heel.

Reken die grens met `mondayKey` en `amsMidnight` uit [week-dates.ts](src/lib/week-dates.ts). `startDate` staat als NL-middernacht opgeslagen (`2026-05-03T22:00Z` is maandag 4 mei in Amsterdam), dus een UTC-vergelijking zit een hele week mis. Let ook op de legacy-rijen met `startDate: null`: elke bestaande query heeft daar een expliciete tak voor.

Schrijf-guards op de therapeut-kant, zodat een gearchiveerde patiënt geen nieuwe toekomst krijgt en er geen `notifyNewSchedule` uitgaat: `planTemplates.applyToPatient` (453), `weekSchedules.scheduleProgram` (910), `programs.create` en `duplicate` met een `patientId` (251-271, 398-469), en de item-mutaties in de weekplanner.

Twee bestaande scheefheden die hierbij rechtgetrokken moeten worden, anders faalt de knop voor een collega: `programs.save` ([programs.ts:307](src/server/routers/programs.ts:307)) is `creatorId === user.id || ADMIN` zonder praktijk-tak, terwijl `changeDay` en `markReviewed` die tak wél hebben. En `weekSchedules.save/delete/setDayProgram/setWeekMeta/deleteWeek` zoeken op `creatorId: ctx.user.id`. Bind de verruiming expliciet aan `role === 'THERAPIST'`.

### Reactivatie-lekken dichten

Drie paden brengen een koppeling terug tot leven zonder de inactief-status aan te raken. Zonder reparatie krijg je een patiënt met een levende koppeling die in geen enkele lijst staat, zonder foutmelding:

- `invite.finalize` ([invite.ts:728](src/server/routers/invite.ts:728)) zet `isActive: true, status: 'APPROVED'` op een bestaande rij
- `invite.resend` (278-330) en `patients.resendInvite` (1209-1247)
- `patients.invite` (1076-1206)

Alle vier heffen voortaan de `PatientCareStatus`-rij op.

## 8. Web-UI

**Patiëntenlijst** (`src/app/(therapist)/therapist/patients/page.tsx`). De quickfilter-set is nu `all | active | low-compliance`, waarbij `active` op programmastatus kijkt en niet op behandelstatus. Die twee betekenissen gaan door elkaar lopen. Hernoem de bestaande naar "met lopend schema" en voeg "archief" toe. `CaseloadTable` krijgt een inactief-badge; in de archiefweergave zijn de kolommen aandacht en stille dagen betekenisloos en horen ze weg.

**Patiëntdetail** (`src/app/(therapist)/therapist/patients/[id]/page.tsx`). Een archiefbanner bovenaan met wie en wanneer, en de actie in het bestaande actiemenu naast "koppeling verbreken". Het verschil tussen die twee moet in de copy pijnlijk duidelijk zijn: verbreken verwijdert programma's en toegang, inactief zetten niet. [UnlinkDialog.tsx](src/components/patients/UnlinkDialog.tsx) is het tekstmodel.

**Afsluitdialoog.** Uitkomst uit de vaste lijst, optionele notitie, en de programmalijst met vinkjes uit sectie 3. Staat er een lopend rehab-traject, dan toont de dialoog dat en vraagt of het mee wordt afgesloten.

**Rehab-blok.** `RehabTracker` toont het lopende traject zoals nu, met daaronder een inklapbare historie van afgesloten trajecten (protocol, periode, uitkomst, behaalde criteria). "Protocol aanzetten" wordt "nieuw traject starten" zodra er historie is.

**Weekplanner** (`src/app/(therapist)/therapist/week-planner/page.tsx:1527`). De patiëntkeuze markeert gearchiveerde patiënten en zet de mutatie-knoppen uit. Er is nu geen read-only modus, dus dit is echt UI-werk.

**Coach-portaal** erft alles via de re-export. Links via `usePortal()`, nooit hardcoded `/therapist/...`.

**Copy** volgt [docs/tone-of-voice.md](docs/tone-of-voice.md). Geen em-dashes, Nederlands, geen holle marketingtaal.

**Release-note.** [release-notes.ts](src/lib/release-notes.ts) staat sinds 24 juni stil en is het enige in-app kanaal naar therapeuten. Patiënten die uit tien pickers verdwijnen, programma's die op afgerond springen en rehab-vinkjes die niet meer terugkomen lezen zonder aankondiging als storing. De huidige uitzet-dialoog belooft letterlijk het tegenovergestelde.

## 9. iOS

De app staat op buildNumber 78 met vijf commits in de wachtrij. Er is **geen version-gate en geen OTA**, dus elke serverwijziging raakt onmiddellijk alle geïnstalleerde builds. Dat stuurt het hele ontwerp van de API.

**Blijft exact zoals het is:**

- `rehab.getMyTracker` geeft één object of `null` terug. `app/rehab.tsx:87` doet `tracker.phases.map` zonder guard en er is nergens een ErrorBoundary. Een array is truthy en geeft dus een render-crash op build 78. Historie komt achter een nieuwe procedurenaam.
- `rehab.getPatientTracker`, `updateCriterionStatus`, `deactivateForPatient` en `activateForPatient` blijven `patientId` accepteren. `components/rehab-section.tsx` stuurt niets anders (regels 56, 81, 94, 236). De server resolvt zelf het lopende traject. `trackerId` mag er optioneel bij, en dan mét de FORBIDDEN bij mismatch, want anders is dat optionele veld zelf de IDOR.
- `patients.list` zonder parameters blijft werken en toont alleen actieve patiënten. Dat is de veilige kant: op oude builds verdwijnt een gearchiveerde patiënt uit de lijst en er is geen scherm waar hij vast komt te zitten.

**Nieuw in de app, na de webrelease** (paden relatief aan `/Users/eva/mbt-gym-mobile`):

- Archief-segment in de patiëntenlijst (`app/patients.tsx`) via de nieuwe `include`-input
- Inactief-badge en archiefbanner op `app/patient/[id].tsx`
- Traject afsluiten en historie in `components/rehab-section.tsx`
- Patiëntkant: als het traject is afgesloten, toont `app/rehab.tsx` een afgerond-staat in plaats van een leeg scherm

Werk in de dark-ui componenten van de mobiele repo, niet generiek.

## 10. Wat er bewust niet in zit

- **Testrapporten aan een traject koppelen.** `TestReport` heeft `trajectLabel` en `rehabPhaseLabel` als vrije tekst en alleen een `patientId`. Dat is dezelfde ontwerpfout die we bij `RehabCriterionStatus` repareren, en de logische volgende stap, maar het is een aparte app-release. Idem voor `PatientTestAssignment` en `PatientTestResult`.
- **Criteria meekopiëren naar een nieuw traject** bij een terugval op hetzelfde protocol. Elk traject begint schoon.
- **Een behandelepisode als overkoepelend model** waar rehab-trajecten onder hangen. De twee tabellen zijn zo genoemd dat dat later kan.
- **`is_therapist_of()` uitbreiden met `status`.** Hoort in de losse securityronde uit sectie 4, met een eigen inventarisatie.
- **Een mail naar de patiënt bij afsluiting.** Er bestaat vandaag één losse mailtemplate in de repo; er is geen aanleiding er een bij te maken.

## 11. Verifiëren

Er is nul geautomatiseerd vangnet. `src/lib/__tests__` bevat vier bestanden en geen daarvan raakt scoping, rehab of toegang. `npm run check:mirror` dekt alleen cardio en voorschriften en zegt hier niets. `scripts/check-migrations.ts` is de enige post-deploy verificatie.

Minimaal toevoegen:

1. Een test op de uitvoer van `patients.list` per rol en per `include`-waarde, inclusief de coach-tak met lege `practiceScope`.
2. Een test dat criteriumstatussen van traject A niet in traject B opduiken.
3. De drie migratie-checks in `check-migrations.ts`.
4. Handmatige controle-query's na elke migratiefase, zoals in de bijlage.

En [scripts/delete-user.ts](scripts/delete-user.ts) uitbreiden: de reassign-transactie mist `patientRehabTracker.activatedById` en `rehabCriterionStatus.updatedById`, allebei `ON DELETE RESTRICT`. Daardoor kan een therapeut met rehab-historie vandaag al niet verwijderd worden, en faalt de gdpr-cleanup-cron daar stil per gebruiker. Met `closedById` erbij wordt dat erger.

## 12. Nog te beslissen

Deze blokkeren de bouw niet; ik ga uit van de aangegeven aanname.

| Vraag | Aanname |
| --- | --- |
| Blijven inactieve patiënten in het admin-DPA-overzicht? | Ja, het is een juridische telling |
| Stoppen ook de herstel- en belastingpushes, of alleen de planning-gebonden herinnering? | Alles stopt; de patiënt mag doortrainen maar krijgt geen duwtjes meer |
| Krijgt de patiënt iets te zien bij afsluiting? | Nee, alleen de rehab-status verandert zichtbaar |
| Wat gebeurt er met een openstaande PENDING-invite bij archiveren? | Blijft wachten; accepteren heft de status op |
| Komen rehab-trajecten in de AVG-export? | Ja, `gdpr.exportMyData` mist ze nu en dat wordt met dit werk scherper |
| Mag `patients.changeRole` op een gearchiveerd dossier? | Ja, maar met een waarschuwing in de UI |
| Mag een uitbehandelde koper via de shop zelf een programma activeren? | Ja; het filter zit in `reviewDue`, niet in de shop |
| Gaat build 79 eerst met de vijf wachtende commits? | Ja, los van deze feature |

## 13. Uitrolvolgorde

1. ~~Securityronde uit sectie 4~~. **Gedaan op 31 juli**, zie [security-fix-2026-07-31-client-write-grants.md](../../security-fix-2026-07-31-client-write-grants.md). De twee migraties draaien op productie; de codewijziging in `patient.ts` gaat mee met de eerstvolgende deploy.
2. Migratie A en B, additief, met backup vooraf.
3. Web-deploy: episode-code, `PatientCareStatus`, alle filters, UI, release-note.
4. Migratie C.
5. `schema.prisma` opschonen, `migrate diff` moet leeg zijn.
6. iOS: archief, traject afsluiten, historie. Build 80 of later, ná de webrelease.
