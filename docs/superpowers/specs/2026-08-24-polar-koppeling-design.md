# Polar AccessLink-koppeling — ontwerp

Datum: 2026-08-24 · Status: WACHT OP AKKOORD (nog niets geïmplementeerd)

## Doel

Polar-gebruikers koppelen hun Polar-account aan BASE en krijgen daarmee de
volledige wearable-laag die nu alleen Apple Watch-gebruikers hebben:

- **trainingen** → `CardioLog` (zoals Strava nu al doet), inclusief HR-serie
  voor de grafiek + cardiac decoupling en de rating-popup
- **slaap** (Sleep Plus Stages) → `SleepEntry`
- **nachtelijk herstel** (Nightly Recharge: HRV, nacht-HR, ademfrequentie) →
  `VitalsEntry` → readiness
- **dagbelasting** (continue hartslag, 5-min-samples) → `ExertionEntry`
- **stappen/verbranding** (daily activity) → `VitalsEntry`

Dat is het verschil met de Strava-koppeling, die alleen trainingen dekt.
Polar-horloges (Vantage, Ignite, Grit X, Pacer) meten slaap en herstel net zo
goed als een Apple Watch, en een H10-borstband met de Polar-app werkt voor
trainingen. Voor patiënten zonder Apple Watch is dit dus de eerste route naar
readiness, slaapinzicht en exertion.

## Wat AccessLink is (en de valkuilen)

Cloud-to-cloud: het horloge synct naar Polar Flow, wij lezen Flow via de
AccessLink REST-API. Er komt dus **geen mobiele SDK of Bluetooth** aan te pas;
de app hoeft alleen de koppel-flow te tonen.

| Feit | Gevolg voor ons |
| --- | --- |
| OAuth2 authorization-code-flow, scope `accesslink.read_all` | Zelfde claim-model als Strava kan 1-op-1 hergebruikt |
| Access-token is langlevend (~1 jaar), **geen refresh-token** | Geen refresh-logica; bij 401/verloop koppeling als "verlopen" markeren en opnieuw laten koppelen |
| Na OAuth moet de user expliciet geregistreerd worden: `POST /v3/users` met een `member-id` | Registratie in de claim-stap; 409 = al geregistreerd = ok |
| Webhooks (EXERCISE, SLEEP, CONTINUOUS_HEART_RATE, ACTIVITY_SUMMARY, …), HMAC-SHA256-gesigneerd, **max 1 webhook per client** | Eénmalig setup-script, secret in env; webhook deactiveert zichzelf na 7 dagen fouten → cron als vangnet |
| Exercises: alleen laatste **30 dagen** beschikbaar | Backfill is beperkt tot 30 dagen (zelfde venster als de Strava-sync nu) |
| Rate limits schalen mee: 15 min = 500 + 20/user, 24 u = 5000 + 100/user | Ruim; wel de bestaande per-user rate-limit op handmatige sync aanhouden |
| Endpoints: `https://www.polaraccesslink.com/v3/…`; token via `https://polarremote.com/v2/oauth2/token` (Basic auth), authorize via `https://flow.polar.com/oauth2/authorization` | |
| Exercises kunnen samples/zones inline meegeven (`?samples=true&zones=true`) | Geen FIT/TCX-parsing nodig voor de HR-serie |

**Les uit de Kinvent-koppeling:** documentatie ≠ werkelijkheid. Elke
veldnaam/eenheid bij de implementatie tegen een echte API-respons verifiëren
vóór er mapping-code op wordt gebouwd.

## Overwogen aanpakken

1. **Alleen trainingen (Strava-kloon).** Kleinste stap, maar mist precies
   waarom Polar interessant is (slaap/herstel/dagbelasting) en moet later
   alsnog worden opengebroken.
2. **Volledig, in twee shipbare fasen** — trainingen eerst, daarna de
   wellness-data via de bestaande ingest-pijplijn. **← aanbevolen.** De
   ingest (`ingestWearableData`) accepteert al generieke sleep/vitals/
   hrIntraday-payloads en herrekent readiness zelf; Polar-responses daarop
   mappen is veel kleiner werk dan het lijkt.
3. **FIT-bestanden parsen voor high-res data.** Overkill: `?samples=true`
   levert genoeg voor de per-minuut-serie die we toch al als plafond hanteren.

## Architectuur

Zelfde driehoek als Strava, plus een webhook:

```
iOS-app ── tRPC polarAuthorizeUrl ──> browser ──> Polar OAuth
   ^                                                  │
   │  deep link mbtgym://polar?blob (AES-verzegeld)   v
   └─────────────── /api/wearable/polar/callback (slaat niets op)
   │
   └─ tRPC polarClaim ──> registreer bij Polar (POST /v3/users)
                          + PolarConnection + WearableConnection + eerste sync

Polar ── webhook POST /api/wearable/polar/webhook (HMAC-check)
              └─> pull voor die gebruiker ──> ingest ──> readiness
                                                   └─> herstelmelding-hook
Cron (dagelijks) ── vangnet-sync voor alle Polar-koppelingen
```

Kernbeslissingen:

- **Claim-model hergebruiken.** De callback wisselt de code om maar slaat
  niets op; tokens gaan AES-verzegeld via de deep-link terug en de ingelogde
  app-sessie claimt ze. Zelfde reden als bij Strava: een doorgestuurde
  authorize-link kan nooit andermans Polar onder een aanvaller-account hangen.
- **`member-id` = random UUID**, opgeslagen op de connectie. Niet ons interne
  user-id naar Polar sturen; een losse pseudoniem-sleutel is gratis.
- **Tokens versleuteld at rest** (AES-256-GCM), zoals Strava. De sign/seal/
  at-rest-helpers uit `strava/config.ts` worden daarvoor geëxtraheerd naar een
  gedeeld `src/server/wearables/token-crypto.ts`, geparametriseerd op secret +
  key-afleiding (Strava-gedrag blijft bit-voor-bit gelijk; de bestaande
  at-rest-prefix en key-afleiding per provider blijven verschillend).
- **Wellness-data via `ingestWearableData`.** De sleep/vitals/hrIntraday-paden
  krijgen een `source`-parameter (default `APPLE_WATCH`, dus bestaand gedrag
  ongewijzigd). Polar-sync mapt API-responses naar het bestaande
  `syncPayloadSchema`-vormen en krijgt readiness-hercompute + afgeleide
  qualityScore er gratis bij.
- **Trainingen via het Strava-pad**, niet via ingest: direct naar `CardioLog`
  met `updateExistingSyncedLog` + `findCrossSourceDuplicate`, `externalId =
  "polar:<exerciseId>"`, `source = POLAR`.

## Fasen

### Fase 0 — randvoorwaarden (Jurre, ~15 min)

1. AccessLink-client aanmaken op https://admin.polaraccesslink.com (Polar
   Flow-account nodig). Redirect-URI:
   `https://getbase.coach/api/wearable/polar/callback`.
2. Env (Vercel + `.env.local`): `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET`.
   (`POLAR_WEBHOOK_SECRET` volgt in fase 5 uit het setup-script.)

### Fase 1 — datamodel + migratie

- `prisma/schema.prisma`: `POLAR` toevoegen aan `WorkoutSource` én
  `WearableProvider`; nieuw model `PolarConnection`:
  `userId` (unique), `polarUserId` (unique, de `x_user_id` uit de token-
  respons), `memberId`, `accessToken` (versleuteld), `expiresAt`,
  `registeredAt`, `lastSyncAt`, `lastWellnessSyncAt`, timestamps.
- `supabase/migrations/20260824_polar.sql`: idempotent, naar het voorbeeld van
  `20260710_strava.sql`, **inclusief RLS deny-all in dezelfde migratie**.
  Handmatig draaien op prod met `npx prisma db execute` (hand-geschreven
  migraties rollen niet mee met de deploy).

### Fase 2 — OAuth-koppelflow

- `src/server/wearables/token-crypto.ts`: extractie van signState/verifyState,
  sealTokens/openTokens en encryptToken/decryptToken uit `strava/config.ts`
  (Strava importeert voortaan de gedeelde versie; gedrag identiek, bestaande
  DB-rijen blijven leesbaar).
- `src/server/wearables/polar/config.ts`: endpoints, scope, redirect-URI,
  `buildAuthorizeUrl`, provider-specifieke key-afleiding.
- `src/server/wearables/polar/api.ts`: token-exchange (Basic auth +
  form-encoded), `polarGet` (Bearer + `Accept: application/json`),
  `registerUser` (409 = ok), `deleteUser`.
- `src/app/api/wearable/polar/callback/route.ts`: code omwisselen, niets
  opslaan, verzegelde blob via `mbtgym://polar?…` terug naar de app.
- tRPC (`src/server/routers/wearables.ts`): `polarAuthorizeUrl`, `polarClaim`
  (registratie bij Polar + upsert `PolarConnection` + `WearableConnection`
  provider POLAR + eerste sync), `polarStatus`, `polarSync` (rate-limited,
  nieuwe entry in `RATE_LIMITS`), `polarDisconnect` (best-effort
  `DELETE /v3/users/{id}` bij Polar, dan rijen weg).
- iOS: `lib/polar.ts` (spiegel van `lib/strava.ts`, deep-link-afhandeling) +
  Polar-tegel in `app/integrations.tsx` + i18n (nl/en). Geen build starten;
  meelift met de eerstvolgende EAS-build na startsein.

### Fase 3 — trainingen-sync (shipbaar)

- `src/server/wearables/polar/sync.ts` — `syncPolarExercises`:
  `GET /v3/exercises?samples=true&zones=true` (venster: sinds `lastSyncAt`,
  max 30 dagen terug), per exercise mappen naar het bestaande CardioLog-
  datablok: sport-map (Polar `RUNNING`/`CYCLING`/`NORDIC_WALKING`/… →
  `CardioActivity`, rest `OTHER`), duur (ISO-8601-duration parsen!), afstand,
  HR avg/max, calorieën, `rpeFromHeartRate`, HR-samples → per-minuut `series`
  (zelfde bucket-aanpak als `buildSeries` in de Strava-sync, cap 240 punten).
- Dedupe: `updateExistingSyncedLog` + `findCrossSourceDuplicate`. Dit vangt
  ook het geval dat iemand Polar Flow → Strava doorsynct én beide koppelingen
  heeft: tijd-overlap = zelfde training, alleen verrijken.
- `hrOverriddenAt`-contract respecteren (zit al in `updateExistingSyncedLog`).

### Fase 4 — wellness-sync (slaap, herstel, activiteit, dagbelasting)

- `ingestWearableData`: `source`-parameter voor de sleep/vitals/hrIntraday-
  paden (default `APPLE_WATCH`).
- `syncPolarWellness` in dezelfde sync-module, mapt naar `syncPayloadSchema`-
  vormen en roept ingest aan:
  - **Sleep** `GET /v3/users/sleep`: hypnogram → segmenten
    (`light/deep/rem/awake`), `externalId = "polar:sleep:<date>"`. Onze eigen
    qualityScore-berekening houden (consistent over bronnen), Polar's sleep
    score negeren.
  - **Nightly Recharge** `GET /v3/users/nightly-recharge`: `hrv_avg` → `hrv`
    met `hrvType: 'RMSSD'` (bestaat al in het enum; **nooit** met Apple's SDNN
    mengen), `breathing_rate_avg` → `respiratoryRate`, nachtgemiddelde HR →
    `restingHeartRate` (zie open vraag 2).
  - **Daily activity**: stappen + actieve calorieën → vitals.
  - **Continuous HR** `GET /v3/users/continuous-heart-rate?from&to`
    (5-min-samples): histogram (bin per 5 bpm, 300 s per sample) →
    `ExertionEntry` via het bestaande hrIntraday-pad. **Geen** `buckets`
    meesturen: de stress-meter verwacht rust-alleen-data en workouts eruit
    filteren is hier niet betrouwbaar te doen → StressEntry blijft bewust
    Apple-only.
- Readiness komt gratis mee (ingest retourneert affectedDates → hercompute).
  **Aandachtspunt:** verifieer dat de HRV-baseline in `src/server/readiness.ts`
  niet stilzwijgend SDNN- en RMSSD-nachten mengt als iemand van bron wisselt;
  zo nodig baseline per hrvType.
- Cross-source-beleid nachten/dagen: bestaat er voor die nacht/dag al een rij
  van een **andere** bron, dan afblijven (eerste bron wint). Geen flip-flop
  tussen Apple en Polar bij dubbeldragers.

### Fase 5 — webhook + cron-vangnet

- `scripts/polar-webhook-setup.ts` (eenmalig, met client-credentials):
  webhook aanmaken op `POST /v3/webhooks` voor EXERCISE + SLEEP +
  CONTINUOUS_HEART_RATE + ACTIVITY_SUMMARY, `signature_secret_key` printen →
  `POLAR_WEBHOOK_SECRET` in env. Ook `--activate`/`--status` subcommando's
  (webhook deactiveert zichzelf na 7 dagen fouten).
- `src/app/api/wearable/polar/webhook/route.ts`: HMAC-SHA256 verifiëren
  (timingSafeEqual) vóór alles; `user_id` → `PolarConnection.polarUserId`
  opzoeken (onbekend = 200 en negeren, niets loggen dat herleidbaar is);
  daarna gericht pullen: EXERCISE → die ene exercise via de meegestuurde url,
  wellness-events → `syncPolarWellness` voor een kort venster. Snel 200
  teruggeven; het werk past binnen de function-timeout.
- Na ingest van de nacht van vandaag: `maybeNotifyRecoveryOnSync` aanroepen —
  precies zoals de Apple-sync-route doet, zodat Polar-gebruikers ook de
  herstelmelding krijgen (Polar-horloges syncen 's ochtends bij het openen
  van de Flow-app, dus de webhook is het juiste moment).
- `src/app/api/cron/polar-sync/route.ts` + entry in `vercel.json`
  (bijv. 04:30): volledige sync voor alle koppelingen als vangnet voor
  gemiste/gedeactiveerde webhooks. `CRON_SECRET`-check via `authorizeCron`.

### Fase 6 — zichtbaarheid in web + app

- Alle source-filters verruimen: `{ in: ['APPLE_WATCH','STRAVA'] }` →
  `+ 'POLAR'` in `wearables.ts` (overview-activiteiten, rating-wachtrij,
  `forPatient`) en overal waar de bron als label/badge wordt getoond
  (web + `health-ui.tsx`/`training-detail.tsx` in de app, i18n).
- De bestaande rating-popup en HR-correctieflow werken dan vanzelf ook voor
  Polar-activiteiten.
- Therapeut ziet Polar-data via `wearables.forPatient` zonder extra werk
  (zelfde tabellen).

### Fase 7 — compliance, tests, security

- **AVG** (proactief, vóór livegang): `compliance/avg-verwerkers.md` + DPIA +
  register bijwerken — Polar Electro Oy als nieuwe databron (zelfstandig
  verwerkingsverantwoordelijke; grondslag = expliciete OAuth-toestemming van
  de gebruiker; categorieën: trainings-, slaap- en hartslagdata). Privacy-
  tekst in de app checken waar wearable-bronnen worden opgesomd. Blijft
  lokaal (compliance/ is bewust niet in de publieke repo).
- **Tests** (patroon `__tests__/ingest.test.ts`): sport-map, ISO-duration-
  parsing, hypnogram→segmenten, histogram uit 5-min-samples, webhook-
  signatuur (goed/fout/replay), state/claim-flow, 409-registratie,
  token-verloop → status "verlopen".
- **Security-checklist** (standaard): state HMAC+TTL ✓ claim-model ✓ tokens
  at rest versleuteld ✓ webhook-signatuur + lookup op onze eigen mapping (geen
  user-controlled ids) ✓ rate-limit op handmatige sync ✓ geen intern user-id
  naar Polar ✓ RLS op de nieuwe tabel ✓ secrets alleen in env ✓ geen
  info-disclosure in error-responses ✓.

## Randgevallen

- **Token verlopen/ingetrokken** (401 van Polar): koppeling niet weggooien
  maar markeren, status-tegel toont "opnieuw koppelen". Sync slaat stil over.
- **Dubbeldragers** (Apple Watch + Polar, of Polar→Strava-doorsync):
  trainingen dedupen op tijd-overlap (bestaand mechanisme); nachten/dagen:
  eerste bron wint, geen overschrijven.
- **Webhook 7 dagen stuk** → auto-deactivatie: cron-vangnet blijft data
  binnenhalen; setup-script `--status`/`--activate` om te herstellen.
- **Gebruiker verwijdert account** (gdpr-cleanup): `PolarConnection` cascadet
  mee; best-effort `DELETE /v3/users/{id}` bij Polar toevoegen aan de
  cleanup zodat het token ook aan Polar-zijde wordt ingetrokken.
- **Eerste sync**: max 30 dagen exercises (API-limiet) en ~28 dagen wellness —
  zelfde ratingvenster-logica als bij de Strava-backfill (popup kijkt maar 7
  dagen terug) geldt al.

## Bewust NIET in scope (YAGNI)

FIT/TCX/GPX-export en routes/GPS-kaarten; gewicht/lengte-sync uit physical
info (botst met ons eigen profiel); Polar's eigen sleep score, Training Load
Pro en SleepWise (we rekenen alles in onze eigen, bron-onafhankelijke
metrieken); temperatuur/SpO2/ECG; web-koppelflow (koppelen kan alleen in de
app, zoals Strava — zie open vraag 3); StressEntry uit Polar-data.

## Open vragen voor Jurre

1. **Faseer-akkoord**: fase 3 (trainingen) als eerste ship, fase 4 (slaap/
   herstel/dagbelasting) direct erachteraan? Of alles in één keer testen?
   Advies: in twee stappen, dan is de koppel-flow al in het veld terwijl de
   wellness-mapping tegen echte data wordt geverifieerd.
2. **Nacht-HR als rust-HR**: Nightly Recharge geeft het nachtgemiddelde, geen
   klassieke "resting HR". Whoop/Oura gebruiken hetzelfde signaal. Advies:
   wel mappen (consistent baseline-signaal), met bronvermelding in de code.
3. **Web-koppelflow**: nu overslaan (alleen iOS, zoals Strava)? De deep-link-
   claim werkt niet in de browser; een web-variant is een aparte kleine klus.
4. **Fase 0 ligt bij jou**: AccessLink-client aanmaken + env-waarden. Zonder
   die kan alles wél gebouwd en getest worden op de guards, maar niet
   end-to-end.

## Nieuwe/geraakte bestanden (samenvatting)

```
prisma/schema.prisma                                  enums + PolarConnection
supabase/migrations/20260824_polar.sql                + RLS deny-all
src/server/wearables/token-crypto.ts                  extractie uit strava/config
src/server/wearables/strava/config.ts                 gebruikt gedeelde crypto
src/server/wearables/polar/{config,api,sync}.ts       nieuw
src/server/wearables/ingest.ts                        source-parameter
src/server/routers/wearables.ts                       polar* procedures + filters
src/server/ratelimit.ts                               polarSync-limiet
src/app/api/wearable/polar/{callback,webhook}/route.ts nieuw
src/app/api/cron/polar-sync/route.ts + vercel.json    vangnet-cron
scripts/polar-webhook-setup.ts                        eenmalige webhook-setup
src/server/wearables/__tests__/polar.test.ts          nieuw
--- mbt-gym-mobile ---
lib/polar.ts, app/integrations.tsx, health-ui/i18n    koppel-UI + labels
--- lokaal, niet in git ---
compliance/avg-verwerkers.md, compliance/DPIA.md      Polar als databron
```
