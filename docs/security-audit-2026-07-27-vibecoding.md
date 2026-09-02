# Security-audit 2026-07-27: vibe-coding-kwetsbaarheden

> **Status 2026-07-27, na de fix-ronde.** Alle code-bevindingen hieronder zijn
> gedicht en de trigger-migratie is op productie gedraaid. `npx tsc` schoon in
> beide repo's, `npm test` groen (14/14), `npm run build` slaagt, geen secret in
> `.next/static`. Nog te doen door een mens, want het zit in het Supabase-
> dashboard en niet in code:
>
> 1. **Signup uitzetten** (Authentication → Providers → Email → "Allow new users
>    to sign up"). Lees eerst de volgorde-waarschuwing bij C1: zet
>    `invite.request` eerst om naar `inviteUserByEmail()`, anders breekt
>    patiënt-onboarding.
> 2. **`mailer_autoconfirm` uitzetten**, zodat een e-mailadres weer geverifieerd
>    wordt vóór het als identiteit telt.
> 3. **`admin@mbtmove.com` opruimen of binden** (C1b). Niet automatisch
>    verwijderd: dat is productiedata weggooien en die keuze is aan jullie.
>
> De code is inmiddels bestand tegen alle drie, maar ze horen alsnog dicht.

**Aanleiding:** onderzoek naar de meest voorkomende fouten en beveiligingslekken
in AI-geassisteerd gebouwde ("vibe coded") applicaties, en daarna een audit van
beide repo's tegen die lijst.

**Scope:** `/Users/eva/mbt-gym` (web) en `/Users/eva/mbt-gym-mobile` (iOS), plus
de live Supabase-configuratie en de productiedatabase.

**Methode:** vier parallelle onderzoekssporen (empirische studies, OWASP/CWE-
taxonomie, praktijkrapportages, stack-specifiek) gesynthetiseerd tot een
checklist van 36 punten. Daarna tien parallelle audit-passes over beide repo's,
elk bevonden punt geverifieerd door drie onafhankelijke agents die het moesten
weerleggen (exploiteerbaarheid, code-realiteit, business-impact). 130 agents,
40 ruwe bevindingen, 22 overleefden de verificatie. De bevindingen met de
hoogste impact zijn daarna met de hand nagelopen tegen de live database en de
live auth-configuratie.

## Eindscore

| Severity | Aantal |
|---|---|
| CRITICAL | 1 |
| HIGH | 2 |
| MEDIUM | 3 |
| LOW | 6 |
| INFO | 4 |

Twee bevindingen zijn volledig geverifieerd tegen productie en geven allebei
admin-toegang tot bijzondere persoonsgegevens. De rest is hardening.

---

## Wat het onderzoek zegt

Drie onafhankelijke bewijslijnen wijzen dezelfde kant op.

**Modelbenchmarks.** Veracode (Spring 2026, 150+ modellen, 80 taken) meet een
security-passrate van 55 procent tegenover meer dan 95 procent syntactische
correctheid. Uitgesplitst: XSS 15 procent, log-injectie 13 procent, maar
SQL-injectie 82 procent en crypto 86 procent. BaxBench (ETH Zurich, 392
backend-taken) vond exploits op ongeveer de helft van alle functioneel correcte
programma's.

**Exploit-geverifieerde audits.** Theori bouwde 28 applicaties met vijf
modellen en dedupliceerde 8.827 detecties tot 434 bevindingen met werkende
proof-of-concept: resource exhaustion 21 procent, autorisatie 20 procent. Het
belangrijkste getal staat niet in de kop: IDOR was 11 procent van de
bevindingen in kleine builds en 28 procent in de grote applicatie. De regel die
over honderden endpoints moet spannen laat elke keer een paar gaten vallen.
DryRun liet drie agents elk twee applicaties bouwen en vond in 87 procent van
de pull requests minstens een kwetsbaarheid, met broken access control als
enige patroon dat bij alle drie voorkwam.

**Scans van live applicaties.** ModernPentest onderzocht 107 Supabase-startups
en vond bij 61 procent datalekkage, 20,1 miljoen anoniem leesbare rijen en PII
bij 28 procent. Symbiotic scande 1.072 apps: 16 procent met critical-issues,
172 sites die onauthenticated verwijdering toestonden. CVE-2025-48757 (CVSS
9.3) is dezelfde fout op platformschaal.

**De belangrijkste nuance.** Injectie en XSS nemen af in AI-code, omdat
modellen inmiddels ongevraagd prepared statements en framework-sanitizers
gebruiken. Het risico is verschoven naar autorisatie, tenant-scoping en
configuratie. Dat is precies het gebied waar statische analyse blind is: een
ontbrekende ownership-check is geen codepatroon. Een schone Snyk- of
Semgrep-run op deze stack zegt daarom weinig.

**Bronnen (selectie):**
[Theori/Xint](https://www.helpnetsecurity.com/2026/07/23/report-ai-code-vulnerabilities/),
[Veracode Spring 2026](https://www.veracode.com/blog/spring-2026-genai-code-security/),
[ModernPentest](https://modernpentest.com/blog/yc-supabase-vulnerability-research),
[Symbiotic](https://www.symbioticsec.ai/blog/we-scanned-1-072-vibe-coded-apps-98-had-security-flaws),
[CVE-2025-48757](https://mattpalmer.io/posts/2025/05/CVE-2025-48757/),
[Wiz over Base44](https://www.wiz.io/blog/critical-vulnerability-base44),
[BaxBench](https://arxiv.org/abs/2502.11844),
[Supabase Database Advisors](https://supabase.com/docs/guides/database/database-advisors),
[Next.js data security](https://nextjs.org/docs/app/guides/data-security).

---

## De rode draad in onze eigen bevindingen

De applicatiecode ligt ruim boven het niveau dat het onderzoek beschrijft. De
procedureladder, de gedeelde `patient-access.ts`, `getUser()` in plaats van
`getSession()`, de soft-delete-clientextensie en de nonce-based CSP zijn precies
de controls die de studies missen.

Beide zware bevindingen hebben dezelfde vorm: **een zorgvuldige controle staat
in de applicatie, terwijl het gat in de Supabase-projectconfiguratie zit,
waar de applicatie niet bij kan.** De code doet het goed en de aanvaller praat
er gewoon omheen. Dat is de blinde vlek die het onderzoek beschrijft en die
geen scanner ziet.

---

## CRITICAL

### C1 — Iedereen kan zich registreren als ADMIN en leest daarna patiëntdata via de REST-API

**Locatie:** trigger `on_auth_user_created` op `auth.users`, functie
`public.handle_new_user()`, plus de auth-instellingen van het Supabase-project.

De keten, elke stap geverifieerd tegen productie:

1. `GET /auth/v1/settings` geeft `"disable_signup": false` en
   `"mailer_autoconfirm": true`. Registreren staat open voor iedereen met de
   anon-key, en die staat in de browserbundle. Door autoconfirm is de sessie
   direct bruikbaar, zonder toegang tot het opgegeven mailadres.
2. De trigger staat aan (`tgenabled = O`) en draait bij elke insert op
   `auth.users`.
3. De functie doet:
   ```sql
   role = COALESCE(NEW.raw_user_meta_data->>'role', 'THERAPIST')
   ```
   `raw_user_meta_data` is exact wat de aanroeper als `options.data` meestuurt.
   `signUp({ options: { data: { role: 'ADMIN' } } })` levert dus een ADMIN-rij.
   Wordt er niets meegestuurd, dan is de default THERAPIST.
4. De functie zet `users.id = NEW.id::text`, en dat is precies wat
   `auth.uid()::text` teruggeeft.
5. `is_admin()` is `EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND
   role = 'ADMIN')` en matcht die rij dus.
6. `anon` en `authenticated` hebben SELECT, INSERT, UPDATE en DELETE op alle 80
   public-tabellen. RLS is de enige poort, en **35 tabellen openen op
   `is_admin()`**, waaronder `patient_assessments`, `session_logs`,
   `wellness_checks`, `cardio_logs`, `exercise_logs`, `insights`,
   `patient_rehab_trackers`, `patient_therapists`, `research_consents` en
   `users`.

**Dit is geen theorie.** een hotmail-adres (11 juli) en
een gmail-adres (13 juli) zijn allebei zo aangemaakt, met `role` in
client-metadata. Hun `users.id` is uuid-vormig, wat aantoont dat de trigger de
rij schreef. Had een van beide `ADMIN` meegestuurd in plaats van `ATHLETE`, dan
hadden ze dat gekregen.

Extra scherpte: de meeste bestaande gebruikers hebben een cuid-vormige
`users.id`, dus voor hen matcht `auth.uid()::text = users.id` nooit en faalt RLS
dicht. De rij van een aanvaller is uuid-vormig en matcht wel. Een aanvaller
krijgt dus meer RLS-bereik dan vrijwel elke echte gebruiker.

**Waarom de app-laag niet helpt.** `resolveUser()` in `src/server/trpc.ts`
weigert de email-fallback voor THERAPIST en ADMIN, en beide clients gebruiken
`shouldCreateUser: false`. Dat is goed werk en het beschermt de app. Maar de
aanvaller gebruikt de app niet: hij praat rechtstreeks met
`https://<project>.supabase.co/rest/v1/...`.

**Impact:** onbevoegde inzage in en wijziging van bijzondere persoonsgegevens
(AVG art. 9) van alle patiënten. Meldplicht-relevant.

**Aanbeveling, in volgorde:**

1. **Haal de rol uit client-metadata.** Vervang in `handle_new_user()` de
   `COALESCE(NEW.raw_user_meta_data->>'role', 'THERAPIST')` door een afleiding
   uit een server-gemaakte invite:
   ```sql
   role = COALESCE(
     (SELECT ic.role FROM public.invite_codes ic
       WHERE lower(ic.email) = lower(NEW.email)
         AND ic."usedAt" IS NULL AND ic."expiresAt" > now()
       ORDER BY ic."createdAt" DESC LIMIT 1),
     'PATIENT'
   )
   ```
   Geen enkele client-invoer meer, en de laagste rol als default.
2. **Zet signup uit** (Authentication, Providers, Email, "Allow new users to
   sign up"). Let op: `invite.request` gebruikt
   `signInWithOtp({ shouldCreateUser: true })`, en dat endpoint respecteert
   `disable_signup` ook met de service_role-key. Zet die aanroep eerst om naar
   `admin.auth.admin.inviteUserByEmail()` of `admin.auth.admin.generateLink()`,
   want dat zijn admin-endpoints die de instelling wel passeren. `patients.ts`
   en `admin.ts` gebruiken die API al.
3. **Zet `mailer_autoconfirm` uit.** Zonder mailverificatie is een mailadres
   geen identiteit, en de hele codebase gebruikt het wel als identiteit (zie H2).
4. Overweeg de rechten van `anon` op het public-schema in te perken. Nu heeft
   `anon` volledige DML op alle 80 tabellen en is RLS de enige rem.

### C1b — De verweesde ADMIN-rij

`admin@mbtmove.com` staat in `public.users` met `role = 'ADMIN'` en
`supabaseUserId = NULL`. Het is de enige rij zonder binding. In combinatie met
H2 hieronder is dat direct bruikbaar. Verwijderen of binden.

---

## HIGH

### H1 — `patients.search` laat alle tenant-scoping vallen zodra er gezocht wordt

**Locatie:** [src/server/routers/patients.ts:2120](src/server/routers/patients.ts#L2120)

```ts
const baseWhere = {
  ...(input.query ? {
    OR: [
      { name:  { contains: input.query, mode: 'insensitive' as const } },
      { email: { contains: input.query, mode: 'insensitive' as const } },
    ],
  } : {}),
}

return ctx.prisma.user.findMany({
  where: {
    role: { in: ['PATIENT', 'ATHLETE'] },
    OR: [
      { patientTherapists: { some: { therapistId: ctx.user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } } } },
      ...practiceScope(ctx.user),
    ],
    ...baseWhere,          // <-- overschrijft de OR hierboven
  },
  select: { id: true, name: true, email: true },
  take: 20,
})
```

Een object-spread met dezelfde sleutel overschrijft de eerdere sleutel. Zodra
`input.query` niet leeg is, wordt de toegangscontrole-`OR` dus volledig
vervangen door de zoek-`OR`. Nagerekend in node: `{...{OR:['ACCESS']},
...{OR:['SEARCH']}}` geeft `{OR:['SEARCH']}`.

**Aanval:** elke ingelogde THERAPIST of COACH (`coachStaffProcedure`, de
laagste staff-rol) POST't `patients.search` met `{"query":"a"}` en krijgt
naam, e-mailadres en interne id van patiënten en atleten uit **elke** praktijk,
20 per aanroep. Losse letters en veelvoorkomende fragmenten leveren de hele
populatie op. Een coach hoort per ontwerp alleen direct gekoppelde atleten te
zien; die grens valt hier helemaal weg.

Lidmaatschap van een fysio-patiëntenlijst is zelf al gezondheids-gerelateerd, en
de opgehaalde ids zijn directe invoer voor elk ander endpoint dat een
`patientId` aanneemt.

**Aanbeveling:** zet de twee filters onder `AND` in plaats van ze te mergen.

```ts
const scope = ctx.user.role === 'ADMIN' ? {} : {
  OR: [
    { patientTherapists: { some: { therapistId: ctx.user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } } } },
    ...practiceScope(ctx.user),
  ],
}
const q = input.query
  ? { OR: [
      { name:  { contains: input.query, mode: 'insensitive' as const } },
      { email: { contains: input.query, mode: 'insensitive' as const } },
    ] }
  : {}

return ctx.prisma.user.findMany({
  where: { role: { in: ['PATIENT', 'ATHLETE'] }, AND: [scope, q] },
  select: { id: true, name: true, email: true },
  take: 20,
})
```

Voeg een regressietest toe: therapeut uit praktijk B zoekt, patiënt uit praktijk
A mag niet terugkomen.

De rest van de codebase is op dit punt schoon. `practiceScope()` geeft een
array die in een OR-array wordt gespreid, en `scopeFilter` /
`accessibleScopeFilter` landen in objecten zonder concurrerende `OR`. Dit is de
enige plek.

### H2 — Vijf REST-routes binden identiteit op e-mailadres in plaats van `supabaseUserId`

**Locaties:**
[api/shop/invoice/[orderId]:22](src/app/api/shop/invoice/[orderId]/route.ts#L22),
[api/email/send:47](src/app/api/email/send/route.ts#L47),
[api/auth/me:49](src/app/api/auth/me/route.ts#L49),
[api/auth/log-login:65](src/app/api/auth/log-login/route.ts#L65),
[api/auth/sync-user:47](src/app/api/auth/sync-user/route.ts#L47)

```ts
const caller = await prisma.user.findUnique({
  where: { email: user.email },
  select: { role: true },
})
if (caller?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

`resolveUser()` in `trpc.ts` heeft juist een expliciete verdediging tegen dit
scenario: bij een email-match zonder `supabaseUserId` weigert hij THERAPIST en
ADMIN. Deze route-handlers lopen niet via `resolveUser` en missen die
verdediging dus.

**Aanval, met C1 en C1b erbij:** registreer `admin@mbtmove.com` op
`/auth/v1/signup`. Door `mailer_autoconfirm` is de sessie direct geldig en is
toegang tot dat mailadres niet nodig. `supabase.auth.getUser()` geeft die
gebruiker terug, de lookup op e-mail vindt de bestaande ADMIN-rij, en de route
verleent admin-toegang. `/api/auth/me` schrijft `role=ADMIN` daarna zelfs met
de service_role-key in de `user_metadata` van de aanvaller.

**Aanbeveling:** zoek overal op `supabaseUserId`, of hergebruik `resolveUser()`.
Een e-mailadres is pas een identiteit als het geverifieerd is, en dat is het nu
niet.

---

## MEDIUM

### M1 — Drie routers definiëren eigen procedures die de MFA-poorten overslaan

`assessmentProcedure` ([assessments.ts:50](src/server/routers/assessments.ts#L50)),
`runningProcedure` ([runningAnalysis.ts:54](src/server/routers/runningAnalysis.ts#L54)) en
`wearablesProcedure` ([wearables.ts:17](src/server/routers/wearables.ts#L17)) zijn op
`protectedProcedure` gebouwd en checken zelf de rol, maar roepen
`assertStaffMfaEnrolled()` en `assertMfaSatisfied()` niet aan. Die staan alleen
in `therapistProcedure`, `coachStaffProcedure`, `creatorProcedure` en
`adminProcedure`.

Gevolg: een therapeut met MFA aan maar een aal1-sessie kan de circa 32
procedures in deze drie routers aanroepen, inclusief klinische schrijf-acties
(assessments, hardloopanalyse). Dat is precies het gat dat commit `98c552a`
elders dichtzette.

**Aanbeveling:** bouw deze drie op `therapistProcedure` in plaats van
`protectedProcedure`, of exporteer `assertStaffMfaEnrolled` en
`assertMfaSatisfied` uit `trpc.ts` en roep ze aan.

### M2 — `resolveUser` laat een nieuw account een ongebonden rij claimen

[src/server/trpc.ts:74](src/server/trpc.ts#L74)

De email-fallback weigert THERAPIST en ADMIN, maar staat PATIENT, ATHLETE en
COACH toe en backfilt dan `supabaseUserId`. `invite.create` maakt die rijen
vooruit aan, zonder binding. Wie het mailadres van een genodigde kent, kan zich
daarmee registreren voordat de echte genodigde dat doet, en neemt het account
dan permanent over inclusief de therapeut-koppeling.

Op dit moment staan er nul openstaande invites, dus er is nu niets te kapen. De
route bestaat wel. Vervalt grotendeels zodra signup dicht staat en
`mailer_autoconfirm` uit is (C1).

### M3 — `shop.previewProgram` geeft het volledige betaalde programma

[src/server/routers/shop.ts:313](src/server/routers/shop.ts#L313)

`publicProcedure`, gated op `process.env.SHOP_PUBLIC === 'true' || ADMIN`. Er is
geen entitlement-check en geen `PUBLISHED`-check. Staat `SHOP_PUBLIC=true` in
productie, dan haalt iedereen met een slug het complete programma op: alle
oefeningen, sets, reps, rusttijden en video-URL's, over alle weken. Dat is het
product zelf, niet een preview.

Ik kon de productiewaarde van `SHOP_PUBLIC` hier niet uitlezen. Staat hij op
false, dan is dit nu niet bereikbaar en blijft het een aandachtspunt voor de
launch.

**Aanbeveling:** beperk de preview tot week 1, of tot namen zonder video-URL's
en zonder voorschrift, en voeg een `status === 'PUBLISHED'`-check toe.

---

## LOW

- **L1 — `practice.removeLogo` verwijdert een pad uit een aanvaller-gestuurde
  URL** met de service_role-key.
  [practice.ts:123](src/server/routers/practice.ts#L123). Valideer dat het
  afgeleide object onder de eigen `{practiceId}/`-prefix valt.
- **L2 — CSV-formule-injectie** in de admin DPA-export.
  [admin/dpa/page.tsx:27](<src/app/(admin)/admin/dpa/page.tsx#L27>). Prefix
  velden die met `=`, `+`, `-` of `@` beginnen met een apostrof.
- **L3 — Rate limiting valt terug op een in-memory Map.**
  [ratelimit.ts:119](src/server/ratelimit.ts#L119). Op Vercel heeft elke
  instantie zijn eigen map en reset die bij een cold start, dus de effectieve
  limiet is een veelvoud van de ingestelde. Fail-closed zit achter een
  ongedocumenteerde env-var. Configureer een gedeelde store.
- **L4 — `invite.request` limiteert op het door de aanvaller opgegeven
  e-mailadres.** [invite.ts:452](src/server/routers/invite.ts#L452). Varieer je
  het adres, dan is er geen limiet en groeien `audit_logs` ongelimiteerd. Voeg
  een IP-bucket toe.
- **L5 — Geen limiet op `wearables.stravaSync`, `shop.checkout` en
  `push.register`.** Strava deelt één applicatie-brede quota, dus één gebruiker
  kan de sync voor alle anderen breken.
- **L6 — Mobiele sessie zonder `ThisDeviceOnly`.**
  [lib/secureStorage.ts:57](../../mbt-gym-mobile/lib/secureStorage.ts). Zet
  `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`, anders overleeft het
  refresh-token een backup-restore op een ander toestel.
- **L7 — `current_role()` en `handle_new_user()` hebben geen vastgezette
  `search_path`.** De migratie `20260727_security_hardening_storage_and_funcs.sql`
  pakte de vier `is_*`-helpers, deze twee niet.

## INFO

- Sentry `onRequestError` stuurt de rauwe `Cookie`- en `Authorization`-headers
  mee. [instrumentation.ts:53](instrumentation.ts#L53). Scrub ze in `beforeSend`.
- `shop.requestAccess` is een onauthenticated bestaans-orakel over de hele
  `User`-tabel, en zet de opgegeven naam ongeescaped in de HTML van de
  notificatiemail.
- GDPR-verwijdering gebruikt een ongepagineerde `listUsers()`.
  [gdpr.ts:370](src/server/routers/gdpr.ts#L370). Voorbij 50 auth-users blijft
  het Supabase-account bestaan.
- De `practice-logos`-bucket is publiek. Downloads lopen bewust buiten RLS om
  voor `<img>` in e-mails. De anon-listing is op 27 juli dichtgezet.

---

## Gecontroleerd en in orde

Deze punten uit de checklist zijn nagelopen en gaven geen bevinding.

- **RLS:** alle 80 public-tabellen hebben RLS aan met minstens één policy. Nul
  tabellen zonder RLS, nul met RLS maar zonder policy. Geen policy leest
  `user_metadata` of `app_metadata`.
- **Secrets:** geen secret in de git-historie, alleen `.env.example` is
  getrackt. `NEXT_PUBLIC_` is beperkt tot de Supabase-URL, de anon-key en de
  app-URL. `EXPO_PUBLIC_` idem. Alle 15 `SUPABASE_SERVICE_ROLE_KEY`-verwijzingen
  staan in server-only bestanden.
- **Tokens:** invite-codes gebruiken `crypto.randomBytes(16)`. De 15
  `Math.random`-treffers zijn allemaal React-keys in de client, geen van alle
  security-relevant.
- **XSS:** geen `dangerouslySetInnerHTML` in `src/`.
- **SQL-injectie:** de enige `$queryRawUnsafe` in productiecode
  (`lib/shop/invoice/number.ts`) interpoleert geen gebruikersinvoer.
- **Cron:** alle vier de paden in `vercel.json` bestaan en roepen
  `authorizeCron` aan, met `timingSafeEqual`.
- **Middleware:** `proxy.ts` is geen autorisatiegrens. Alle vijf de
  rol-segmenten hebben een eigen server-side `requireRole`-guard.
- **Next.js-CVE's:** 16.2.10 valt binnen negen advisories die in 16.2.11 zijn
  gedicht, maar geen ervan is hier bereikbaar. Geen `i18n`/`locales` (poort voor
  de middleware-bypass), geen `rewrites()` (SSRF), geen `images`-blok, nul
  `"use server"` (vier Server Action-advisories), nul `new Request(`
  (cache-confusion). Upgraden is onderhoud, geen incident.
- **Cookies:** HSTS staat op elke response met een looptijd van twee jaar, dus
  er is geen venster waarin een geldige sessiecookie over http kan lekken.
- **Mobiele opslag:** de Supabase-sessie staat in SecureStore met migratie uit
  AsyncStorage. AsyncStorage zelf staat standaard buiten de iOS-backup, en de
  SWR-cache is alleen leesbaar met een levende sessie.
- **tRPC-batching:** de batchgrootte komt uit het URL-pad, niet uit de body, en
  de app-buckets vuren per aanroep.

## Nog niet gedekt

- Geen dynamische test tegen productie. De ketens in C1 en H2 zijn afgeleid uit
  configuratie en code, niet uitgevoerd, omdat dat een echte gebruiker in de
  productiedatabase zou aanmaken.
- De productiewaarde van `SHOP_PUBLIC` is niet uitgelezen (M3).
- De Vercel-env-scoping (preview met productiedata) is niet gecontroleerd; de
  Vercel-integratie is in deze sessie niet geautoriseerd.
