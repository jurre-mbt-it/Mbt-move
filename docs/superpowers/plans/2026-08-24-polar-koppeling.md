# Polar AccessLink-koppeling — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polar-accounts koppelen aan BASE: trainingen naar CardioLog, slaap/Nightly Recharge/dagactiviteit/continue HR naar de bestaande wellness-pijplijn, vers gehouden via webhook + cron.

**Architecture:** Cloud-to-cloud naar het Strava-voorbeeld (claim-model OAuth, tokens AES-versleuteld at rest), wellness via `ingestWearableData` met een nieuwe source-parameter, trainingen via het bestaande update/dedupe/create-pad naar CardioLog. Ontwerp: `docs/superpowers/specs/2026-08-24-polar-koppeling-design.md`.

**Tech Stack:** Next.js (App Router) + tRPC + Prisma/Supabase, vitest, Expo (mobiel, aparte repo).

## Global Constraints

- Werkmap web: worktree `/Users/eva/mbt-gym-polar` (branch `feat/polar-koppeling` vanaf `main`). NOOIT vanuit een worktree deployen; deployen gebeurt sowieso pas op startsein.
- Werkmap mobiel: `/Users/eva/mbt-gym-mobile`, branch `feat/polar-koppeling` (repo is schoon op main). Geen EAS-build starten.
- Codebase-stijl: geen puntkomma's, enkele quotes, Nederlandstalige commentaren met het waarom, bestaande patronen spiegelen (strava/, ingest.ts).
- Elke nieuwe public-tabel krijgt RLS + default_deny in dezelfde migratie (AGENTS.md).
- Polar API-feiten (geverifieerd in swagger 2026-08-24): base `https://www.polaraccesslink.com/v3`; token `POST https://polarremote.com/v2/oauth2/token` (Basic auth + form-encoded, response `{access_token, expires_in≈31535999, x_user_id}`, GEEN refresh-token); authorize `https://flow.polar.com/oauth2/authorization`; scope `accesslink.read_all`; registratie `POST /v3/users` body `{"member-id": …}` (409 = al geregistreerd); exercises = laatste 30 dagen, `?samples=true` (sample-type '0' = HR bpm, '1' = snelheid km/h, keys `recording-rate`/`sample-type`/`data` MET streepjes); sleep/nightly-recharge lijst = laatste 28 dagen (`{nights:[…]}` / `{recharges:[…]}`), slaapduren in SECONDEN, hypnogram `{"HH:MM": stage}` met 0=WAKE 1=REM 2/3=LIGHT 4=DEEP 5=UNKNOWN; activiteit `GET /v3/users/activities?from&to` (max 28 dagen, array met `start_time/calories/active_calories/steps`); continue HR `GET /v3/users/continuous-heart-rate?from&to` (`heart_rate_samples: [{heart_rate, sample_time "HH:MM:SS"}]`); webhook: 1 per client, `POST /v3/webhooks` (Basic auth) → `signature_secret_key` (eenmalig!), header `Polar-Webhook-Signature` = HMAC-SHA256 over de raw body, PING moet altijd 200 krijgen, auto-deactivatie na 7 dagen fouten.
- Env: `POLAR_CLIENT_ID` + `POLAR_CLIENT_SECRET` staan al in `.env.local` (ook gekopieerd naar de worktree); `POLAR_WEBHOOK_SECRET` volgt pas ná deploy uit het setup-script (taak 10).
- Testcommando's: `npx vitest run` en `npx tsc --noEmit` in de worktree.
- Compliance-docs (taak 12) leven in `/Users/eva/mbt-gym/compliance/` (gitignored, dus alleen in de hoofd-checkout — niet in de worktree).

---

### Taak 1: Datamodel + migratie

**Files:**
- Modify: `prisma/schema.prisma` (enums `WearableProvider`/`WorkoutSource` + User-relatie + nieuw model)
- Create: `supabase/migrations/20260824_polar.sql`

**Interfaces:**
- Produces: Prisma-model `PolarConnection` met velden `userId` (unique), `polarUserId` (unique), `memberId`, `accessToken`, `expiresAt`, `needsReauth`, `lastSyncAt`, `lastWellnessSyncAt`; enum-waarden `POLAR` op `WearableProvider` en `WorkoutSource`.

- [ ] **Stap 1: enums + model + relatie in schema.prisma**

`WearableProvider` en `WorkoutSource` krijgen elk `POLAR // Polar AccessLink (cloud-to-cloud, OAuth 2.0 + REST-pull)`. Bij `User` naast `stravaConnection`: `polarConnection PolarConnection?`. Nieuw model naast StravaConnection:

```prisma
/// Polar AccessLink-koppeling per user. Access-token is langlevend (~1 jaar)
/// en Polar geeft GEEN refresh-token: bij 401/verloop zet de sync
/// `needsReauth` en moet de gebruiker opnieuw koppelen. `polarUserId` =
/// x_user_id uit de token-respons (webhook-lookup); `memberId` = ons eigen
/// pseudoniem bij Polar (random UUID — bewust niet het interne user-id).
model PolarConnection {
  id                 String    @id @default(cuid())
  user               User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId             String    @unique
  polarUserId        String    @unique
  memberId           String
  accessToken        String // AES-versleuteld at rest (token-crypto)
  expiresAt          DateTime
  needsReauth        Boolean   @default(false)
  lastSyncAt         DateTime? // laatste geslaagde exercises-sync
  lastWellnessSyncAt DateTime? // laatste geslaagde slaap/vitals/HR-sync
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  @@index([polarUserId])
  @@map("polar_connections")
}
```

- [ ] **Stap 2: migratie schrijven** — `supabase/migrations/20260824_polar.sql`, idempotent naar het voorbeeld van `20260710_strava.sql`:

```sql
-- Polar AccessLink-koppeling: enum-waarden + connectie-tabel + RLS.
-- Idempotent zodat 'm veilig opnieuw draaien kan.

ALTER TYPE "WorkoutSource" ADD VALUE IF NOT EXISTS 'POLAR';
ALTER TYPE "WearableProvider" ADD VALUE IF NOT EXISTS 'POLAR';

CREATE TABLE IF NOT EXISTS "polar_connections" (
  "id"                 TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "polarUserId"        TEXT NOT NULL,
  "memberId"           TEXT NOT NULL,
  "accessToken"        TEXT NOT NULL,
  "expiresAt"          TIMESTAMP(3) NOT NULL,
  "needsReauth"        BOOLEAN NOT NULL DEFAULT false,
  "lastSyncAt"         TIMESTAMP(3),
  "lastWellnessSyncAt" TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "polar_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "polar_connections_userId_key" ON "polar_connections"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "polar_connections_polarUserId_key" ON "polar_connections"("polarUserId");
CREATE INDEX IF NOT EXISTS "polar_connections_polarUserId_idx" ON "polar_connections"("polarUserId");

DO $$ BEGIN
  ALTER TABLE "polar_connections" ADD CONSTRAINT "polar_connections_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS verplicht (anon-key zit in de browserbundle). Prisma draait als owner en
-- bypasst RLS, dus deny-all volstaat.
ALTER TABLE "polar_connections" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "default_deny" ON "polar_connections"
    FOR ALL TO public USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Stap 3: valideren + client genereren** — `npx prisma validate && npx prisma generate` (verwacht: succes; nog GEEN `db execute` — prod-migratie pas bij livegang).
- [ ] **Stap 4: commit** — `git add prisma/schema.prisma supabase/migrations/20260824_polar.sql && git commit -m "feat(polar): datamodel + migratie voor PolarConnection"`

### Taak 2: Gedeelde token-crypto extraheren

**Files:**
- Create: `src/server/wearables/token-crypto.ts`
- Modify: `src/server/wearables/strava/config.ts` (delegeren, publieke API ongewijzigd)
- Test: `src/server/wearables/__tests__/token-crypto.test.ts`

**Interfaces:**
- Produces (token-crypto.ts):
  - `sha256Key(input: string): Buffer`
  - `signState(secret: string, userId: string, ttlMs: number): string`
  - `verifyState(secret: string, state: string | null | undefined): string | null`
  - `sealJson(key: Buffer, payload: Record<string, unknown>, ttlMs: number): string` (AES-256-GCM, embed `exp`)
  - `openJson(key: Buffer, blob: string | null | undefined): Record<string, unknown> | null` (null bij ongeldig/verlopen)
  - `encryptAtRest(key: Buffer, plain: string): string` (prefix `enc:v1:`)
  - `decryptAtRest(key: Buffer, stored: string): string` (legacy plaintext passthrough)
- Consumes: niets nieuws; de implementatie is een 1-op-1 verplaatsing uit `strava/config.ts` met de sleutel als parameter.

- [ ] **Stap 1: falende test schrijven** — roundtrips + Strava-bitcompatibiliteit:

```ts
import { describe, expect, it } from 'vitest'
import {
  decryptAtRest, encryptAtRest, openJson, sealJson, sha256Key, signState, verifyState,
} from '../token-crypto'

const secret = 'test-secret'
const key = sha256Key(secret)

describe('token-crypto', () => {
  it('state: sign → verify geeft de userId terug', () => {
    expect(verifyState(secret, signState(secret, 'user-1', 60_000))).toBe('user-1')
  })
  it('state: verlopen of geknoeid → null', () => {
    expect(verifyState(secret, signState(secret, 'user-1', -1))).toBeNull()
    expect(verifyState(secret, signState('ander-secret', 'user-1', 60_000))).toBeNull()
    expect(verifyState(secret, null)).toBeNull()
  })
  it('sealJson → openJson roundtrip; verlopen blob → null', () => {
    const blob = sealJson(key, { a: 1 }, 60_000)
    expect(openJson(key, blob)).toMatchObject({ a: 1 })
    expect(openJson(key, sealJson(key, { a: 1 }, -1))).toBeNull()
    expect(openJson(sha256Key('andere'), blob)).toBeNull()
  })
  it('at-rest: roundtrip + legacy plaintext blijft ongewijzigd', () => {
    const enc = encryptAtRest(key, 'tok')
    expect(enc.startsWith('enc:v1:')).toBe(true)
    expect(decryptAtRest(key, enc)).toBe('tok')
    expect(decryptAtRest(key, 'plaintext-legacy')).toBe('plaintext-legacy')
  })
})
```

- [ ] **Stap 2: test draaien** — `npx vitest run src/server/wearables/__tests__/token-crypto.test.ts` → FAIL (module bestaat niet).
- [ ] **Stap 3: token-crypto.ts implementeren** — de bestaande functies uit `strava/config.ts` letterlijk verplaatsen en de sleutel/het secret als parameter geven. Het state-formaat (`base64url(userId.exp).hmac`), het blob-formaat (iv|tag|ct base64url met `exp` in de JSON) en de `enc:v1:`-prefix blijven byte-voor-byte identiek, anders breken bestaande DB-rijen en lopende OAuth-flows.
- [ ] **Stap 4: strava/config.ts laten delegeren** — de exports `signState`, `verifyState`, `sealTokens`, `openTokens`, `encryptToken`, `decryptToken` blijven bestaan met dezelfde signatures, maar roepen de gedeelde functies aan met `getStravaConfig().clientSecret` resp. `sha256Key(clientSecret)` (seal) en `sha256Key('strava-at-rest:' + clientSecret)` (at rest). `openTokens` houdt zijn typed veld-validatie bovenop `openJson`.
- [ ] **Stap 5: alles draaien** — `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Stap 6: commit** — `feat(polar): gedeelde token-crypto (extractie uit strava/config)`

### Taak 3: polar/config.ts + polar/api.ts

**Files:**
- Create: `src/server/wearables/polar/config.ts`, `src/server/wearables/polar/api.ts`
- Test: `src/server/wearables/__tests__/polar-config.test.ts`

**Interfaces:**
- Produces (config): `POLAR_ENDPOINTS`, `POLAR_SCOPE`, `isPolarConfigured()`, `getPolarConfig(): { clientId, clientSecret, redirectUri }`, `buildAuthorizeUrl(userId): string`, `verifyPolarState(state): string | null`, `sealPolarTokens(t: SealedPolarTokens): string`, `openPolarTokens(blob): SealedPolarTokens | null`, `encryptPolarToken(plain): string`, `decryptPolarToken(stored): string`, type `SealedPolarTokens = { accessToken: string; expiresAt: number; polarUserId: string }` (expiresAt = unix-seconden).
- Produces (api): `exchangeCode(code): Promise<{ access_token: string; expires_in: number; x_user_id: number }>`, `registerPolarUser(accessToken, memberId): Promise<void>` (409 = ok), `deregisterPolarUser(accessToken, polarUserId): Promise<void>` (best-effort, 204/404 = ok), `polarGet<T>(accessToken, path): Promise<T | null>` (204/404 → null), `PolarAuthError` (bij 401/403 — token verlopen/ingetrokken).

- [ ] **Stap 1: falende test** — authorize-URL + seal-roundtrip:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildAuthorizeUrl, openPolarTokens, sealPolarTokens, verifyPolarState } from '../polar/config'

describe('polar/config', () => {
  beforeEach(() => {
    process.env.POLAR_CLIENT_ID = 'cid'
    process.env.POLAR_CLIENT_SECRET = 'csecret'
    process.env.NEXT_PUBLIC_APP_URL = 'https://getbase.coach'
  })
  afterEach(() => {
    delete process.env.POLAR_CLIENT_ID
    delete process.env.POLAR_CLIENT_SECRET
  })
  it('authorize-URL bevat client_id, redirect_uri, scope en getekende state', () => {
    const u = new URL(buildAuthorizeUrl('user-1'))
    expect(u.origin + u.pathname).toBe('https://flow.polar.com/oauth2/authorization')
    expect(u.searchParams.get('client_id')).toBe('cid')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('scope')).toBe('accesslink.read_all')
    expect(u.searchParams.get('redirect_uri')).toBe('https://getbase.coach/api/wearable/polar/callback')
    expect(verifyPolarState(u.searchParams.get('state'))).toBe('user-1')
  })
  it('sealPolarTokens → openPolarTokens roundtrip; kapotte blob → null', () => {
    const t = { accessToken: 'tok', expiresAt: 1_900_000_000, polarUserId: '627139' }
    expect(openPolarTokens(sealPolarTokens(t))).toEqual(t)
    expect(openPolarTokens('nonsens')).toBeNull()
  })
})
```

- [ ] **Stap 2: test draaien** → FAIL.
- [ ] **Stap 3: config implementeren** — spiegel `strava/config.ts`, maar dan via token-crypto uit taak 2. Sleutels: seal = `sha256Key(clientSecret)`, at rest = `sha256Key('polar-at-rest:' + clientSecret)` (bewust andere afleiding dan Strava én dan de seal-key). State-TTL 10 min, blob-TTL 10 min. `redirectUri` = `${NEXT_PUBLIC_APP_URL}/api/wearable/polar/callback` met dezelfde `.trim()`-guard als Strava.
- [ ] **Stap 4: api implementeren** — met commentaar dat Polar géén refresh-token uitgeeft:

```ts
export class PolarAuthError extends Error {}

export async function exchangeCode(code: string) {
  const cfg = getPolarConfig()
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')
  const res = await fetch(POLAR_ENDPOINTS.token, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json;charset=UTF-8',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri }),
  })
  if (!res.ok) throw new Error(`polar_token_${res.status}`)
  return (await res.json()) as { access_token: string; expires_in: number; x_user_id: number }
}

export async function polarGet<T>(accessToken: string, path: string): Promise<T | null> {
  const res = await fetch(`${POLAR_ENDPOINTS.api}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (res.status === 204 || res.status === 404) return null
  // 401/403 = token verlopen/ingetrokken of consent ingetrokken → de aanroeper
  // zet needsReauth zodat de UI "opnieuw koppelen" kan tonen.
  if (res.status === 401 || res.status === 403) throw new PolarAuthError(`polar_auth_${res.status}`)
  if (!res.ok) throw new Error(`polar_api_${res.status}_${path}`)
  return (await res.json()) as T
}
```

`registerPolarUser`: POST `${api}/users` met Bearer + JSON `{ 'member-id': memberId }`, ok bij 2xx; 409 = al geregistreerd → stil ok; anders throw. `deregisterPolarUser`: DELETE `${api}/users/${polarUserId}` met Bearer; 204/404 = ok; anders alleen `console.warn` (best-effort — loskoppelen in de app mag nooit stranden op een Polar-storing).
- [ ] **Stap 5: draaien** — `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Stap 6: commit** — `feat(polar): config + API-client (OAuth, registratie, GET-helper)`

### Taak 4: Callback-route

**Files:**
- Create: `src/app/api/wearable/polar/callback/route.ts`

**Interfaces:**
- Consumes: `isPolarConfigured`, `verifyPolarState`, `sealPolarTokens` (taak 3-config), `exchangeCode` (taak 3-api).
- Produces: 302 naar `mbtgym://polar?status=pending&blob=…` of `mbtgym://polar?status=error&reason=…` — de app (taak 11) parseert exact deze parameters.

- [ ] **Stap 1: route schrijven** — spiegel `strava/callback/route.ts` (zelfde deep-link-helper, `APP_SCHEME = 'mbtgym'`, host `polar`). Verschillen: geen scope-check-parameter (Polar stuurt geen `scope` terug in de callback) en de seal bevat `{ accessToken, expiresAt: Math.floor(Date.now() / 1000) + t.expires_in, polarUserId: String(t.x_user_id) }`. Ontbreekt `x_user_id` → `reason=no_user`. `export const dynamic = 'force-dynamic'`, `runtime = 'nodejs'`. De route slaat bewust niets op (claim-model, zie strava-callback-kopcommentaar).
- [ ] **Stap 2: draaien** — `npx tsc --noEmit` → PASS (routes hebben in deze repo geen unit-tests; de flow-onderdelen zijn in taak 2/3 getest).
- [ ] **Stap 3: commit** — `feat(polar): OAuth-callback (claim-model, deep-link naar de app)`

### Taak 5: Trainingen-sync (polar/sync.ts, deel 1)

**Files:**
- Create: `src/server/wearables/polar/sync.ts`
- Test: `src/server/wearables/__tests__/polar-sync.test.ts`

**Interfaces:**
- Consumes: `polarGet`, `PolarAuthError`, `decryptPolarToken`; `rpeFromHeartRate`, `updateExistingSyncedLog` (ingest); `findCrossSourceDuplicate`, `enrichExistingLog` (dedupe); `resolveMaxHr` (cardio-zones).
- Produces: `parseIsoDuration(s: string | undefined): number | null` (seconden), `mapPolarSport(detailed: string | undefined, sport: string | undefined): CardioActivity`, `polarStartToDate(startTime: string, utcOffsetMin: number | undefined): Date`, `buildSeriesFromPolarSamples(samples: PolarSample[] | undefined, durationSec: number): SeriesPoint[] | undefined`, `syncPolarExercises(prisma, userId): Promise<number>`, `getPolarAccessToken(prisma, userId): Promise<string>` (gooit `polar_not_connected` / `polar_needs_reauth`), `markNeedsReauth(prisma, userId): Promise<void>`.

- [ ] **Stap 1: falende tests voor de pure mappers**

```ts
import { describe, expect, it } from 'vitest'
import {
  buildSeriesFromPolarSamples, mapPolarSport, parseIsoDuration, polarStartToDate,
} from '../polar/sync'

describe('polar/sync mappers', () => {
  it('parseIsoDuration', () => {
    expect(parseIsoDuration('PT2H44M45S')).toBe(2 * 3600 + 44 * 60 + 45)
    expect(parseIsoDuration('PT30M')).toBe(1800)
    expect(parseIsoDuration('PT4.5S')).toBe(5) // afronden op hele seconden
    expect(parseIsoDuration('kapot')).toBeNull()
    expect(parseIsoDuration(undefined)).toBeNull()
  })
  it('mapPolarSport: detailed_sport_info wint, substrings dekken de varianten', () => {
    expect(mapPolarSport('TREADMILL_RUNNING', 'RUNNING')).toBe('RUNNING')
    expect(mapPolarSport('INDOOR_CYCLING', undefined)).toBe('CYCLING')
    expect(mapPolarSport('NORDIC_WALKING', undefined)).toBe('WALKING')
    expect(mapPolarSport('OPEN_WATER_SWIMMING', undefined)).toBe('SWIMMING')
    expect(mapPolarSport('INDOOR_ROWING', undefined)).toBe('ROWING')
    expect(mapPolarSport('ELLIPTICAL', undefined)).toBe('CROSSTRAINER')
    expect(mapPolarSport('STAIR_CLIMBING', undefined)).toBe('STAIRCLIMBER')
    expect(mapPolarSport('STRENGTH_TRAINING', undefined)).toBe('OTHER')
    expect(mapPolarSport(undefined, 'RUNNING')).toBe('RUNNING')
  })
  it('polarStartToDate: lokale tijd + offset in minuten → UTC-instant', () => {
    // 10:40 lokaal op +180 min = 07:40Z
    expect(polarStartToDate('2026-08-13T10:40:02', 180).toISOString()).toBe('2026-08-13T07:40:02.000Z')
    // zonder offset: als UTC behandelen
    expect(polarStartToDate('2026-08-13T10:40:02', undefined).toISOString()).toBe('2026-08-13T10:40:02.000Z')
  })
  it('buildSeriesFromPolarSamples: HR (type 0) + snelheid (type 1, km/h→m/s) per minuut gebucket', () => {
    const hr = Array.from({ length: 24 }, (_, i) => 100 + i).join(',') // 24 samples à 5s = 2 min
    const spd = Array.from({ length: 24 }, () => '10.8').join(',') // 10.8 km/h = 3 m/s
    const series = buildSeriesFromPolarSamples(
      [
        { 'recording-rate': 5, 'sample-type': '0', data: hr },
        { 'recording-rate': 5, 'sample-type': '1', data: spd },
      ],
      120,
    )
    expect(series).toHaveLength(2)
    expect(series![0]).toEqual({ t: 0, hr: 106, spd: 3 }) // gemiddelde van 100..111 ≈ 106 (afgerond)
    expect(series![1].spd).toBe(3)
  })
  it('buildSeriesFromPolarSamples: null-gaten en <2 HR-punten → undefined', () => {
    expect(buildSeriesFromPolarSamples([{ 'recording-rate': 60, 'sample-type': '0', data: '100' }], 60)).toBeUndefined()
    expect(buildSeriesFromPolarSamples(undefined, 600)).toBeUndefined()
  })
})
```

- [ ] **Stap 2: draaien** → FAIL.
- [ ] **Stap 3: mappers implementeren.** `parseIsoDuration`: regex `/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/`, som × eenheden, `Math.round`, null bij mismatch of 0-lege match. `mapPolarSport`: uppercase op `detailed ?? sport ?? ''`, daarna substring-checks in deze volgorde: RUN/JOGGING → RUNNING; CYCLING/BIKING/BIKE/SPINNING → CYCLING; WALK/HIKING → WALKING; SWIM → SWIMMING; ROWING → ROWING; CROSS_TRAINER/ELLIPTICAL → CROSSTRAINER; STAIR → STAIRCLIMBER; anders OTHER. `polarStartToDate`: bevat de string al `Z` of een `±hh:mm`-offset → `new Date(s)`; anders `new Date(Date.parse(s + 'Z') - (offsetMin ?? 0) * 60_000)`. `buildSeriesFromPolarSamples`: pak sample-type '0' (HR) en '1' (snelheid); per sample-reeks `data.split(',')` met `''`/`'null'` → null; tijdstip i × `recording-rate` (default 5); bucket per 60 s zoals `buildSeries` in `strava/sync.ts` (gemiddelde per bucket, HR afgerond, snelheid km/h ÷ 3.6 op 2 decimalen, cap 240 punten, ≥2 HR-punten vereist).
- [ ] **Stap 4: draaien** → PASS.
- [ ] **Stap 5: token-helper + syncPolarExercises implementeren** — patroon = `syncStravaActivities`, zonder paginering (de lijst is per definitie ≤30 dagen):

```ts
export async function getPolarAccessToken(prisma: Db, userId: string): Promise<string> {
  const conn = await prisma.polarConnection.findUnique({ where: { userId } })
  if (!conn) throw new Error('polar_not_connected')
  // Geen refresh-token bij Polar: verlopen of geweigerd = opnieuw koppelen.
  if (conn.needsReauth || conn.expiresAt.getTime() <= Date.now()) throw new Error('polar_needs_reauth')
  return decryptPolarToken(conn.accessToken)
}

export async function markNeedsReauth(prisma: Db, userId: string): Promise<void> {
  await prisma.polarConnection.updateMany({ where: { userId }, data: { needsReauth: true } })
}
```

`syncPolarExercises(prisma, userId)`: token ophalen; `polarGet<PolarExercise[]>(token, '/exercises?samples=true')` (null → 0 en `lastSyncAt` bijwerken); HR-profiel + `resolveMaxHr` zoals in strava/sync; per exercise: `durationSec = parseIsoDuration(ex.duration)`, skip `< 60`; `completedAt = polarStartToDate(...)`; datablok met `activity: mapPolarSport(...)`, `protocol: 'STEADY_STATE'`, afstand/HR/calorieën, `rpe: rpeFromHeartRate(avg, maxHr, restHr)`, `avgPaceSecPerKm`, `series: buildSeriesFromPolarSamples(ex.samples, durationSec)`, `source: 'POLAR' as const`; `externalId = \`polar:${ex.id}\``; dan exact de Strava-afhandeling: `updateExistingSyncedLog` → anders `findCrossSourceDuplicate(..., 'POLAR')` → `enrichExistingLog` of `create` met P2002-vangnet. `PolarAuthError` → `markNeedsReauth` + rethrow `new Error('polar_needs_reauth')`. Afsluiten met `lastSyncAt: new Date()`.
- [ ] **Stap 6: sync-test met prisma-stub** (patroon `ingest.test.ts`): mock `fetch` via `vi.stubGlobal('fetch', …)` die één exercise teruggeeft (id `'2AC312F'`, `duration: 'PT30M'`, `heart_rate: { average: 140, maximum: 168 }`, `start_time: '2026-08-20T18:00:00'`, `start_time_utc_offset: 120`); stub-db met `polarConnection.findUnique` (geldige, versleutelde token via `encryptPolarToken`), `polarConnection.update`, `user.findUnique` (profiel met maxHeartRate 190, restingHeartRate 50), `cardioLog.updateMany` (count 0), `cardioLog.findMany` ([]), `cardioLog.create`. Asserts: `create` aangeroepen met `externalId: 'polar:2AC312F'`, `source: 'POLAR'`, `durationSec: 1800`, `completedAt` = `2026-08-20T16:00:00.000Z`, `rpe` niet null. Tweede test: 401-respons → `polarConnection.updateMany` met `needsReauth: true`.
- [ ] **Stap 7: draaien** — `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Stap 8: commit** — `feat(polar): trainingen-sync naar CardioLog (mappers + dedupe)`

### Taak 6: Ingest-source-parameter + wellness-sync (polar/sync.ts, deel 2)

**Files:**
- Modify: `src/server/wearables/ingest.ts` (opties-parameter)
- Modify: `src/server/wearables/polar/sync.ts` (wellness-mappers + `syncPolarWellness`)
- Test: `src/server/wearables/__tests__/polar-wellness.test.ts` + 1 regressietest in `ingest.test.ts`

**Interfaces:**
- Modified: `ingestWearableData(prisma, userId, payload, opts?: { source?: WorkoutSource; provider?: WearableProvider; deviceModel?: string })` — defaults `'APPLE_WATCH'`/`'APPLE_HEALTH'`, dus alle bestaande aanroepen ongewijzigd.
- Produces: `polarSleepToNight(s: PolarSleep): SyncPayload['sleep'][number] | null`, `polarRechargeToVitals(r: PolarRecharge): SyncPayload['vitals'][number] | null`, `polarActivityToVitals(a: PolarActivity): SyncPayload['vitals'][number] | null`, `polarContinuousHrToDay(d: PolarHrDay): SyncPayload['hrIntraday'][number] | null`, `syncPolarWellness(prisma, userId): Promise<IngestResult>`.

- [ ] **Stap 1: regressietest ingest-opties** in `ingest.test.ts`: zelfde `stubDb`, aanroep met `opts { source: 'POLAR', provider: 'POLAR' }` en lege payload → connection-upsert `where.userId_provider.provider === 'POLAR'`; en één zonder opts → `'APPLE_HEALTH'` (bestaand gedrag geborgd).
- [ ] **Stap 2: draaien** → FAIL (parameter bestaat nog niet).
- [ ] **Stap 3: ingest.ts aanpassen** — `const source = opts?.source ?? 'APPLE_WATCH'` en `const provider = opts?.provider ?? 'APPLE_HEALTH'` bovenin; alle `'APPLE_WATCH' as const`-literalen in de datablokken en de twee provider-plekken in de connection-upsert vervangen; `deviceModel` uit `opts?.deviceModel ?? payload.device?.model`. De cross-source-dedupe-aanroep in het workouts-pad krijgt `source` i.p.v. het literal. Gedrag verder ongewijzigd.
- [ ] **Stap 4: falende wellness-mapper-tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  polarActivityToVitals, polarContinuousHrToDay, polarRechargeToVitals, polarSleepToNight,
} from '../polar/sync'

describe('polar wellness-mappers', () => {
  it('slaap: hypnogram → segmenten met stage-map en nacht-wrap', () => {
    const night = polarSleepToNight({
      date: '2026-08-20',
      sleep_start_time: '2026-08-19T23:30:00+02:00',
      sleep_end_time: '2026-08-20T07:00:00+02:00',
      hypnogram: { '23:30': 3, '23:45': 4, '00:30': 1, '06:30': 0 },
    })
    expect(night).not.toBeNull()
    expect(night!.date).toBe('2026-08-20')
    expect(night!.externalId).toBe('polar:sleep:2026-08-20')
    const stages = night!.segments.map(s => s.stage)
    expect(stages).toEqual(['light', 'deep', 'rem', 'awake'])
    // wrap: 00:30 hoort bij 20 aug, 23:45 nog bij 19 aug
    expect(night!.segments[1].endAt).toBe(new Date('2026-08-20T00:30:00+02:00').toISOString())
    // laatste segment eindigt op sleep_end_time
    expect(night!.segments[3].endAt).toBe(new Date('2026-08-20T07:00:00+02:00').toISOString())
  })
  it('slaap zonder hypnogram → null', () => {
    expect(polarSleepToNight({ date: '2026-08-20', sleep_start_time: '2026-08-19T23:30:00+02:00', sleep_end_time: '2026-08-20T07:00:00+02:00' })).toBeNull()
  })
  it('nightly recharge → vitals met RMSSD', () => {
    expect(polarRechargeToVitals({
      date: '2026-08-20', heart_rate_avg: 52, heart_rate_variability_avg: 41, breathing_rate_avg: 13.4,
    })).toEqual({ date: '2026-08-20', restingHeartRate: 52, hrv: 41, hrvType: 'RMSSD', respiratoryRate: 13.4 })
  })
  it('daily activity → stappen + actieve/basale kcal', () => {
    expect(polarActivityToVitals({
      start_time: '2026-08-20T00:00:00', calories: 2500, active_calories: 700, steps: 8823,
    })).toEqual({ date: '2026-08-20', steps: 8823, activeEnergyKcal: 700, basalEnergyKcal: 1800 })
  })
  it('continue HR → histogram (5-bpm-bins, dt uit sample-afstand, workouts inbegrepen)', () => {
    const day = polarContinuousHrToDay({
      date: '2026-08-20',
      heart_rate_samples: [
        { heart_rate: 63, sample_time: '00:00:00' },
        { heart_rate: 64, sample_time: '00:05:00' },
        { heart_rate: 158, sample_time: '00:10:00' },
      ],
    })
    expect(day).toEqual({
      date: '2026-08-20',
      buckets: [], // stress blijft bewust Apple-only (rust-filtering kan hier niet)
      histogram: { '60': 600, '155': 300 }, // 63→bin 60 (300s) + 64→bin 60 (300s); laatste sample default 300s
    })
  })
  it('continue HR: leeg → null', () => {
    expect(polarContinuousHrToDay({ date: '2026-08-20', heart_rate_samples: [] })).toBeNull()
  })
})
```

- [ ] **Stap 5: draaien** → FAIL.
- [ ] **Stap 6: mappers implementeren.**
  - `polarSleepToNight`: zonder bruikbaar hypnogram (≥1 entry) of start/eindtijd → null. Offset-string uit `sleep_start_time` knippen (`Z` of `±hh:mm`); lokale datum = de eerste 10 tekens; per hypnogram-key (`HH:MM`) een ISO-string `${dag}T${key}:00${offset}` bouwen, waarbij een kloktijd < de kloktijd van `sleep_start_time` één dag opschuift; sorteren; segment i loopt tot start van segment i+1, de laatste tot `sleep_end_time`. Stage-map met commentaar: `0 → 'awake'`, `1 → 'rem'`, `2/3 → 'light'`, `4 → 'deep'`, `5 → 'light'` (UNKNOWN door slecht huidcontact; 'light' is de minst sturende keuze — 'awake' zou de efficiëntie/TST onterecht drukken).
  - `polarRechargeToVitals`: alleen aanwezige velden meegeven; `heart_rate_avg` → `restingHeartRate` met commentaar dat dit het nachtgemiddelde is (zelfde signaal als Whoop/Oura gebruiken; besluit Jurre 2026-08-24); hrv altijd samen met `hrvType: 'RMSSD'` (NOOIT met Apple's SDNN in één baseline — zie stap 9).
  - `polarActivityToVitals`: datum uit `start_time`; `basalEnergyKcal = calories - active_calories` alleen als beide aanwezig en het verschil > 0.
  - `polarContinuousHrToDay`: samples op tijd sorteren; `dt_i = clamp(volgende - huidige, 60, 600)` seconden, laatste sample 300; bin = `String(Math.floor(bpm / 5) * 5)`; som per bin, gecapt op 86 400; `buckets: []`.
- [ ] **Stap 7: draaien** → PASS.
- [ ] **Stap 8: syncPolarWellness implementeren.** Token via `getPolarAccessToken`; parallel ophalen: `polarGet<{ nights?: PolarSleep[] }>(token, '/users/sleep')`, `polarGet<{ recharges?: PolarRecharge[] }>(token, '/users/nightly-recharge')`, `polarGet<PolarActivity[]>(token, \`/users/activities?from=${from}&to=${to}\`)` en `polarGet<unknown>(token, \`/users/continuous-heart-rate?from=${from}&to=${to}\`)` met `from` = vandaag − 27 d, `to` = vandaag (Polar-limiet: max 28 dagen). Continue-HR-respons defensief normaliseren (het swagger-schema is hier één dag-object; de praktijk kan een array of `{ heart_rates: [...] }` zijn — alle drie de vormen naar `PolarHrDay[]`). Vitals per datum mergen (recharge + activity in één object). **Eerste bron wint:** vóór de ingest per tabel de datums opvragen die al een rij van een ándere bron hebben (`sleepEntry`/`vitalsEntry`/`exertionEntry`, `where: { userId, date: { gte: … }, source: { not: 'POLAR' } }, select: { date: true }`) en die datums uit de payload filteren — een Apple-nacht mag nooit door een Polar-nacht overschreven worden (en andersom, bij dubbeldragers). Daarna `ingestWearableData(prisma, userId, payload, { source: 'POLAR', provider: 'POLAR', deviceModel: 'Polar' })`, per `affectedDates` `computeAndStoreReadiness`, `lastWellnessSyncAt` bijwerken, `IngestResult` teruggeven. `PolarAuthError` → `markNeedsReauth` + `polar_needs_reauth`.
- [ ] **Stap 9: baseline-check HRV-typen** — lees `src/server/readiness.ts` en verifieer dat de HRV-baseline niet stilzwijgend SDNN- en RMSSD-nachten mengt wanneer een gebruiker van bron wisselt. Mengt hij wél: baseline-window filteren op het hrvType van de meest recente meting (kleinste ingreep die het klinische probleem oplost). Zo niet: alleen een verwijzend commentaar toevoegen bij `hrvType` in de mapper.
- [ ] **Stap 10: draaien** — `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Stap 11: commit** — `feat(polar): wellness-sync via ingest (slaap, recharge, activiteit, dag-HR)`

### Taak 7: tRPC-procedures + zichtbaarheid web

**Files:**
- Modify: `src/server/routers/wearables.ts`, `src/server/ratelimit.ts`
- Modify: alle web-plekken die op source filteren of labelen (opsporen met `rg -n "'STRAVA'" src --glob '!*wearables/strava*'`)

**Interfaces:**
- Produces (router `wearables.`): `polarAuthorizeUrl` (query → `{ url }`), `polarClaim` (mutation, input `{ blob: string }` → `{ ok: true }`), `polarStatus` (query → `{ connected: boolean; lastSyncAt: string | null; needsReauth: boolean }`), `polarSync` (mutation → `{ synced: number }`), `polarDisconnect` (mutation → `{ ok: true }`) — exact wat de app in taak 11 aanroept.

- [ ] **Stap 1: RATE_LIMITS uitbreiden** — naast `stravaSync`: `polarSync: { max: 12, windowSec: 3600, message: 'Te veel Polar-syncs. Probeer het later opnieuw.' }` (zelfde reden: applicatie-breed Polar-quotum, audit 2026-07-27 L5-patroon).
- [ ] **Stap 2: procedures toevoegen** — blok `// ── Polar (AccessLink, cloud-to-cloud) ──` naast het Strava-blok, alles op `wearablesProcedure`:
  - `polarAuthorizeUrl`: als `!isPolarConfigured()` → `NOT_IMPLEMENTED 'polar_not_configured'`; anders `{ url: buildAuthorizeUrl(ctx.user!.id) }`.
  - `polarClaim`: `openPolarTokens(blob)` → BAD_REQUEST bij null; bestaand `memberId` hergebruiken (`polarConnection.findUnique`) of `crypto.randomUUID()`; `registerPolarUser(t.accessToken, memberId)` (409 is daar al stil ok — bij re-koppelen van dezelfde gebruiker); daarna `$transaction` met `polarConnection.upsert` (`polarUserId`, `memberId`, `accessToken: encryptPolarToken(...)`, `expiresAt: new Date(t.expiresAt * 1000)`, `needsReauth: false`) + `wearableConnection.upsert` provider `'POLAR'`, `deviceModel: 'Polar'`, `enabled: true`; P2002 → `CONFLICT 'polar_already_linked'` (zelfde Polar-account kan niet aan twee app-accounts hangen).
  - `polarStatus`: `findUnique` → `{ connected, lastSyncAt, needsReauth }`.
  - `polarSync`: rate-limit; `syncPolarExercises` + `syncPolarWellness` na elkaar (wellness-fouten niet de trainingen laten maskeren: exercises eerst, fouten door laten borrelen); return `{ synced }`.
  - `polarDisconnect`: connectie lezen; bestaat hij → best-effort `deregisterPolarUser(decryptPolarToken(accessToken), polarUserId)` (try/catch — het token ook aan Polar-zijde intrekken hoort bij netjes loskoppelen); dan `polarConnection.deleteMany` + `wearableConnection.deleteMany` provider POLAR.
- [ ] **Stap 3: source-filters en labels verruimen** — in `wearables.ts`: de activiteitenlijst in `buildOverview` en het filter in `unratedActivities` van `['APPLE_WATCH', 'STRAVA']` naar `['APPLE_WATCH', 'STRAVA', 'POLAR']`. Daarna repo-breed `rg -n "'STRAVA'"` en `rg -n "APPLE_WATCH.*STRAVA|STRAVA.*APPLE_WATCH" src`: elke source-lijst en elk bron-label (bv. "via Strava"-badges op activity/detail-schermen web) krijgt de POLAR-variant met label `Polar`. Ook de connection-status in `buildOverview` (nu alleen provider `APPLE_HEALTH`): laat de integraties-status zoals hij is als hij providerspecifiek is — Polar-status loopt via `polarStatus`, zoals Strava via `stravaStatus`.
- [ ] **Stap 4: draaien** — `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Stap 5: commit** — `feat(polar): tRPC-koppelflow + Polar zichtbaar in web-overzichten`

### Taak 8: Webhook-route

**Files:**
- Create: `src/server/wearables/polar/webhook.ts` (pure verwerking, testbaar)
- Create: `src/app/api/wearable/polar/webhook/route.ts` (dun)
- Test: `src/server/wearables/__tests__/polar-webhook.test.ts`

**Interfaces:**
- Produces (webhook.ts): `verifyPolarSignature(rawBody: string, signature: string | null, secret: string): boolean`, `handlePolarWebhookEvent(prisma, body: { event?: string; user_id?: number | string }): Promise<{ handled: boolean }>`.
- Consumes: `syncPolarExercises`, `syncPolarWellness` (taak 5/6), `maybeNotifyRecoveryOnSync` uit `@/server/push/morning-insight`.

- [ ] **Stap 1: falende tests**

```ts
import { createHmac } from 'crypto'
import { describe, expect, it, vi } from 'vitest'
import { verifyPolarSignature } from '../polar/webhook'

describe('polar webhook-signatuur', () => {
  const secret = 'whsec'
  const body = '{"event":"EXERCISE","user_id":475}'
  const sig = createHmac('sha256', secret).update(body).digest('hex')
  it('geldige HMAC-SHA256 hex → true', () => {
    expect(verifyPolarSignature(body, sig, secret)).toBe(true)
  })
  it('verkeerde signatuur, ontbrekende header of andere body → false', () => {
    expect(verifyPolarSignature(body, sig.replace(/^./, '0').replace(/^0/, sig[0] === '0' ? '1' : '0'), secret)).toBe(false)
    expect(verifyPolarSignature(body, null, secret)).toBe(false)
    expect(verifyPolarSignature('{"iets":"anders"}', sig, secret)).toBe(false)
  })
})
```

- [ ] **Stap 2: draaien** → FAIL.
- [ ] **Stap 3: webhook.ts implementeren.** `verifyPolarSignature`: HMAC-SHA256 hex over de raw body, vergelijking met `timingSafeEqual` (lengte eerst checken, lowercase-normaliseren). `handlePolarWebhookEvent`: `polarConnection.findUnique({ where: { polarUserId: String(body.user_id) } })` — onbekend of `needsReauth` → `{ handled: false }` (bewust géén fout: een losgekoppelde gebruiker mag geen 500-retry-storm veroorzaken); `event === 'EXERCISE'` → `syncPolarExercises` (idempotent; gerichte entity-pull is een latere optimalisatie); `SLEEP`/`CONTINUOUS_HEART_RATE`/`ACTIVITY_SUMMARY` → `syncPolarWellness` en daarna `maybeNotifyRecoveryOnSync(prisma, userId, result.affectedDates)` — de herstelmelding hangt hiermee aan het moment dat de Polar-nacht binnenkomt, precies zoals de Apple-sync-route dat doet; onbekende events → `{ handled: false }`.
- [ ] **Stap 4: route.ts implementeren** — `runtime nodejs`, `dynamic force-dynamic`, `maxDuration = 60`:

```ts
export async function POST(req: NextRequest) {
  const raw = await req.text()
  let body: { event?: string; user_id?: number | string }
  try {
    body = JSON.parse(raw) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  // PING komt bij het aanmaken van de webhook, vóórdat wij het secret kennen —
  // moet altijd 200 krijgen, anders weigert Polar de webhook te registreren.
  if (body.event === 'PING') return NextResponse.json({ ok: true })

  const secret = process.env.POLAR_WEBHOOK_SECRET
  if (!secret) {
    // Webhook bestaat maar het secret is (nog) niet geconfigureerd: niets
    // verwerken, wel 200 — anders deactiveert Polar de webhook na 7 dagen.
    console.warn('[polar/webhook] POLAR_WEBHOOK_SECRET ontbreekt; event genegeerd')
    return NextResponse.json({ ok: true })
  }
  if (!verifyPolarSignature(raw, req.headers.get('polar-webhook-signature'), secret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }
  try {
    const result = await handlePolarWebhookEvent(prisma, body)
    return NextResponse.json({ ok: true, handled: result.handled })
  } catch (err) {
    // 500 → Polar probeert opnieuw; detail blijft server-side.
    console.error('[polar/webhook] failed', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
```

- [ ] **Stap 5: draaien** — `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Stap 6: commit** — `feat(polar): webhook-endpoint met HMAC-verificatie + herstelmelding-hook`

### Taak 9: Cron-vangnet + opruimen bij verwijdering

**Files:**
- Create: `src/app/api/cron/polar-sync/route.ts`
- Modify: `vercel.json` (cron-entry), gdpr-cleanup-flow (deregistratie)

- [ ] **Stap 1: cron-route** — spiegel `sync-readiness/route.ts` (`authorizeCron`, `maxDuration = 300`): alle `polarConnection.findMany({ where: { needsReauth: false } })`; per gebruiker `syncPolarExercises` + `syncPolarWellness` in try/catch (fout per gebruiker loggen, doorgaan — één kapot token mag de rest niet blokkeren); response `{ ok, connections, synced, elapsedMs }`.
- [ ] **Stap 2: vercel.json** — cron `{ "path": "/api/cron/polar-sync", "schedule": "30 4 * * *" }` (vóór daily-reminders om 05:00, ná sync-readiness — de wellness-sync herrekent readiness zelf al voor geraakte dagen).
- [ ] **Stap 3: deregistratie bij account-verwijdering** — lees `src/app/api/cron/gdpr-cleanup/route.ts`; op de plek waar een user met al zijn data definitief verwijderd wordt: eerst `polarConnection` lezen en best-effort `deregisterPolarUser(decryptPolarToken(accessToken), polarUserId)` (try/catch), zodat het token ook aan Polar-zijde wordt ingetrokken; de rij zelf cascadet mee. Raakt de cleanup users alleen via soft-delete/Prisma-cascade zonder eigen verwijderlus, documenteer dan in een commentaar bij `polarDisconnect` dat harde verwijdering via de bestaande cascade loopt en de Polar-zijde alleen bij expliciet loskoppelen wordt ingetrokken.
- [ ] **Stap 4: draaien** — `npx tsc --noEmit` → PASS.
- [ ] **Stap 5: commit** — `feat(polar): dagelijkse vangnet-cron + deregistratie bij opruimen`

### Taak 10: Webhook-setup-script

**Files:**
- Create: `scripts/polar-webhook-setup.ts`

- [ ] **Stap 1: script schrijven** — CLI met subcommando's `create | get | activate | deactivate | delete`, draaien als `npx tsx scripts/polar-webhook-setup.ts <cmd>`. Leest `POLAR_CLIENT_ID`/`POLAR_CLIENT_SECRET` uit env (`.env.local` laden zoals andere scripts in `scripts/` dat doen — patroon overnemen). Alle calls met Basic auth naar `https://www.polaraccesslink.com/v3/webhooks`. `create`: body `{ events: ['EXERCISE', 'SLEEP', 'CONTINUOUS_HEART_RATE', 'ACTIVITY_SUMMARY'], url: 'https://getbase.coach/api/wearable/polar/webhook' }` (URL overschrijfbaar met `--url`); print het webhook-id én de `signature_secret_key` met de instructie die als `POLAR_WEBHOOK_SECRET` in Vercel + `.env.local` te zetten — **het secret is alleen bij create zichtbaar**. Kopcommentaar met de uitrolvolgorde: eerst de app met de webhook-route deployen (de PING moet 200 krijgen), dán `create` draaien, dán het secret als env zetten en herdeployen. `get` toont status (voor het geval Polar 'm na 7 dagen fouten deactiveert → `activate`).
- [ ] **Stap 2: droog testen** — `npx tsx scripts/polar-webhook-setup.ts get` (verwacht: nette output, 200 met lege/bestaande webhook of duidelijke foutmelding; geen create draaien — de prod-route bestaat nog niet).
- [ ] **Stap 3: commit** — `feat(polar): eenmalig webhook-setup-script`

### Taak 11: Mobiel — koppel-UI (repo mbt-gym-mobile)

**Files (in `/Users/eva/mbt-gym-mobile`, branch `feat/polar-koppeling`):**
- Create: `lib/polar.ts`
- Modify: `app/integrations.tsx` (Polar-tegel naast Strava), `lib/i18n/locales/nl.json` + `en.json`, bron-labels in `components/health-ui.tsx` / `components/training-detail.tsx` / `components/rating-sheet.tsx` (waar `STRAVA` een label krijgt)

**Interfaces:**
- Consumes: de tRPC-procedures uit taak 7 (`wearables.polarAuthorizeUrl` etc.) en de deep-link `mbtgym://polar?status=…&blob=…` uit taak 4.

- [ ] **Stap 1: branch** — `cd /Users/eva/mbt-gym-mobile && git checkout -b feat/polar-koppeling` (repo staat schoon op main).
- [ ] **Stap 2: lib/polar.ts** — letterlijke spiegel van `lib/strava.ts` met `RETURN_URL = 'mbtgym://polar'` en de procedures `wearables.polarStatus` (type `{ connected: boolean; lastSyncAt: string | null; needsReauth: boolean }`), `polarSync`, `polarDisconnect`, `polarAuthorizeUrl`, `polarClaim`. Zelfde claim-afhandeling (`status=pending` + blob → `polarClaim`).
- [ ] **Stap 3: integrations.tsx** — Strava-tegel als sjabloon: zelfde kaartopbouw/stijl, Polar-naam, status uit `getPolarStatus`, knoppen koppelen/sync/loskoppelen; bij `needsReauth` de koppel-knop tonen met de "opnieuw koppelen"-tekst. Na een geslaagde connect direct `syncPolar()` aftrappen zoals de Strava-tegel dat na koppelen doet (gedrag daar eerst nalezen en exact spiegelen).
- [ ] **Stap 4: i18n** — nl/en-keys voor de tegel (titel "Polar", status- en knopteksten, "opnieuw koppelen"-melding), register en toon volgens `docs/tone-of-voice.md` (geen em-dashes, geen holle woorden); `npm run check:i18n` als de repo dat script heeft (zie `scripts/check-i18n.mjs`).
- [ ] **Stap 5: bron-labels** — overal waar `source === 'STRAVA'` een naam/badge oplevert ook `POLAR → 'Polar'` (zoeken met `rg -n "STRAVA" --glob '!node_modules'`).
- [ ] **Stap 6: checks** — `npx tsc --noEmit` in de mobiele repo → PASS. GEEN build starten.
- [ ] **Stap 7: commit** — `feat(polar): Polar-koppeling in integraties (tegel + deep-link-claim)`

### Taak 12: Compliance + eindcontrole

**Files:**
- Modify (hoofd-checkout, gitignored): `/Users/eva/mbt-gym/compliance/avg-verwerkers.md`, `/Users/eva/mbt-gym/compliance/DPIA.md`, `/Users/eva/mbt-gym/compliance/OPENSTAANDE-ACTIES.md`

- [ ] **Stap 1: AVG-docs** — Polar Electro Oy (Finland, EU) toevoegen als **databron/derde partij** (geen verwerker van ons: zelfstandig verantwoordelijke; wij ontvangen data op grond van expliciete toestemming van de gebruiker via OAuth). Categorieën: trainings-, slaap-, hartslag-/HRV- en activiteitsgegevens (bijzondere persoonsgegevens, art. 9: uitdrukkelijke toestemming). Vermelden: pseudonieme member-id richting Polar (random UUID), tokens versleuteld at rest, loskoppelen = deregistratie bij Polar. DPIA-dataflowdiagram/-tabel bijwerken; in OPENSTAANDE-ACTIES: privacyverklaring-tekst over wearable-bronnen nalopen vóór livegang.
- [ ] **Stap 2: eindcontrole web** — in de worktree: `npx vitest run && npx tsc --noEmit && npx prisma validate` → alles PASS; `git log --oneline main..` toont de taakcommits.
- [ ] **Stap 3: zelfreview tegen het ontwerp** — elk punt van de security-checklist uit de spec afvinken (state HMAC+TTL, claim-model, at-rest-encryptie, webhook-HMAC + eigen lookup, rate-limit, pseudoniem member-id, RLS, env-secrets, geen info-disclosure) en de "Randgevallen"-sectie nalopen.
- [ ] **Stap 4: rapport aan Jurre** — wat klaar is, wat bij livegang moet gebeuren (volgorde!): (1) prod-migratie `npx prisma db execute --file supabase/migrations/20260824_polar.sql`, (2) `POLAR_CLIENT_ID`/`SECRET` in Vercel, (3) mergen + deployen, (4) webhook-setup-script `create` + `POLAR_WEBHOOK_SECRET` in Vercel + herdeploy, (5) Jurre koppelt zijn eigen Polar als eerste echte test, (6) veldnamen verifiëren tegen de echte responses (les Kinvent), (7) EAS-build op startsein.

## Bewust niet in dit plan

Web-koppelflow, gerichte entity-pull in de webhook, StressEntry uit Polar-data, FIT/TCX/GPX, physical-info-sync, Polar sleep score / Training Load Pro / SleepWise — zie de spec ("Bewust NIET in scope").
