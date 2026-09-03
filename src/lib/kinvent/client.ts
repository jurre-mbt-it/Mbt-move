/**
 * KINVENT Public API — client.
 *
 * Alleen lezen. De schrijf-endpoints van Kinvent (participants aanmaken,
 * protocollen wijzigen of verwijderen) staan hier bewust niet in: Kinvent is
 * de bron van waarheid voor metingen, en een bug in BASE mag daar nooit iets
 * aan kunnen veranderen.
 *
 * Authenticatie, zoals door Kinvent bevestigd op 2026-08-20:
 *
 *   1. Basic Auth op /login. Met 2FA aan levert dat geen sessie op maar een
 *      challenge (`twoFaPreferredMethod` plus een kort token); Kinvent stuurt
 *      dan een code per mail of sms.
 *   2. Basic Auth op /twoFaLogin met `{ token: "<code>" }` geeft het echte JWT.
 *   3. Dat JWT is 31 dagen geldig, is NIET te verversen zonder stap 1 en 2
 *      opnieuw te doen, en gaat mee als `X-Auth-Token`.
 *
 * Een onbemande sync kan stap 2 niet doen. Daarom bewaart BASE het JWT
 * (versleuteld, zie crypto.ts en KinventConnection) en meldt een therapeut
 * zich één keer per maand opnieuw aan. Eind 2026 komt Kinvent met API-sleutels;
 * dan vervangt dat alleen dit bestand en niets daarbuiten.
 *
 * De leesfuncties krijgen het token als argument. Waar het vandaan komt (de
 * database, via de router) hoort hier niet thuis.
 */

const BASE_URL = process.env.KINVENT_BASE_URL ?? 'https://api.k-invent.com'

/** Kinvent kapt de brede lijst af; analyse in blokken van 25 gaat wel goed. */
export const ANALYZE_BATCH_SIZE = 25

export class KinventError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Het bewaarde token is niet (meer) geldig; iemand moet opnieuw aanmelden. */
    readonly needsSignIn = false,
  ) {
    super(message)
    this.name = 'KinventError'
  }
}

export type KinventParticipant = {
  code: string
  firstName?: string | null
  lastName?: string | null
  dateOfBirth?: number | null
}

export type KinventActivityRep = {
  code: string
  ordinal: number
  maxValue?: number | null
  averageValue?: number | null
  maxLeftRatio?: number | null
  bodyPartSide?: string | null
  startTime?: number | null
}

export type KinventProtocol = {
  code: string
  participantCode: string
  createdOn?: number | null
  updatedOn?: number | null
  activities?: Array<{
    code: string
    startTime?: number | null
    config?: {
      exerciseType?: string | null
      activityType?: string | null
      title?: string | null
      name?: string | null
    } | null
    repetitions?: KinventActivityRep[] | null
  }> | null
}

export type KinventAnalysis = {
  protocolCode: string
  protocolSummaryResults?: string | null
  activitiesResults?: Array<{
    activityCode?: string | null
    startTime?: number | null
    /** Stringified JSON, vorm verschilt per exerciseType. Zie parse.ts. */
    activityResults?: string | null
    config?: { exerciseType?: string | null; title?: string | null } | null
  }> | null
}

// ── Aanmelden ────────────────────────────────────────────────────────────────

function basicAuth(): string {
  const email = process.env.KINVENT_EMAIL
  const password = process.env.KINVENT_PASSWORD
  if (!email || !password) {
    throw new KinventError('KINVENT_EMAIL en KINVENT_PASSWORD ontbreken in de omgeving.')
  }
  return `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`
}

type LoginBody = { token?: string; twoFaPreferredMethod?: string }

const isJwt = (t: string | undefined): t is string => !!t && t.split('.').length === 3

/**
 * Stap 1: vraagt Kinvent om de tweede factor te versturen.
 *
 * Geeft terug via welk kanaal de code komt, zodat de therapeut weet waar hij
 * moet kijken. Staat 2FA uit op het account, dan komt hier meteen een JWT
 * terug en is stap 2 niet nodig.
 */
export async function requestSecondFactor(): Promise<
  { kind: 'code-sent'; method: string } | { kind: 'signed-in'; token: string }
> {
  const res = await fetch(`${BASE_URL}/api/authorization/login`, {
    method: 'POST',
    headers: { Authorization: basicAuth() },
  })
  if (!res.ok) {
    throw new KinventError(`Inloggen bij Kinvent mislukt (HTTP ${res.status}).`, res.status)
  }
  const body = (await res.json()) as LoginBody
  if (isJwt(body.token)) return { kind: 'signed-in', token: body.token }
  return { kind: 'code-sent', method: body.twoFaPreferredMethod ?? 'onbekend' }
}

/** Stap 2: wisselt de code uit mail of sms in voor het JWT. */
export async function completeSecondFactor(code: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/authorization/twoFaLogin`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: code.trim() }),
  })
  if (!res.ok) {
    throw new KinventError(
      res.status === 401
        ? 'Kinvent accepteerde de code niet. Controleer de code of vraag een nieuwe aan.'
        : `Aanmelden bij Kinvent mislukt (HTTP ${res.status}).`,
      res.status,
    )
  }
  const body = (await res.json()) as LoginBody
  if (!isJwt(body.token)) {
    throw new KinventError('Kinvent gaf na de tweede factor geen geldig token terug.')
  }
  return body.token
}

// ── Lezen ────────────────────────────────────────────────────────────────────

async function get<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { 'X-Auth-Token': token } })
  if (res.status === 401) {
    throw new KinventError('De Kinvent-aanmelding is verlopen. Meld opnieuw aan.', 401, true)
  }
  if (!res.ok) {
    throw new KinventError(`Kinvent gaf HTTP ${res.status} op ${path}.`, res.status)
  }
  return (await res.json()) as T
}

/**
 * Alle participants van dit account. Wordt alleen op het koppelmoment gebruikt
 * zodat de therapeut de juiste persoon kan aanwijzen; we slaan hier niets van
 * op behalve de gekozen `code`. Bevat namen en geboortedata, dus niet loggen.
 */
export async function fetchParticipants(token: string): Promise<KinventParticipant[]> {
  return get<KinventParticipant[]>(token, '/api/participants/v1?includeDeleted=false')
}

/**
 * Protocollen van één patiënt sinds `updatedAfter` (epoch-milliseconden).
 *
 * Bewust per patiënt en niet via de brede lijst: die heeft geen paginering,
 * sleept ruwe sensorcurves mee (~253 KB per protocol) en geeft boven ongeveer
 * een jaar een 504. Per patiënt vragen levert bovendien dataminimalisatie op,
 * want metingen van patiënten zonder BASE-dossier bereiken ons niet.
 */
export async function fetchProtocolsForParticipant(
  token: string,
  participantCode: string,
  updatedAfter = 0,
): Promise<KinventProtocol[]> {
  const params = new URLSearchParams({
    participantCode,
    updatedAfter: String(updatedAfter),
    includeDeleted: 'false',
  })
  return get<KinventProtocol[]>(token, `/api/protocols/v1/findByParticipantCode?${params}`)
}

/** Berekende uitkomsten. Schrijft niets, ondanks de POST. */
export async function analyzeProtocols(token: string, protocolCodes: string[]): Promise<KinventAnalysis[]> {
  const out: KinventAnalysis[] = []
  for (let i = 0; i < protocolCodes.length; i += ANALYZE_BATCH_SIZE) {
    const chunk = protocolCodes.slice(i, i + ANALYZE_BATCH_SIZE)
    const res = await fetch(`${BASE_URL}/api/protocols/v2/analyze`, {
      method: 'POST',
      headers: { 'X-Auth-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    })
    if (res.status === 401) {
      throw new KinventError('De Kinvent-aanmelding is verlopen. Meld opnieuw aan.', 401, true)
    }
    if (!res.ok) {
      throw new KinventError(`Analyse mislukt (HTTP ${res.status}) voor ${chunk.length} protocollen.`, res.status)
    }
    const body = (await res.json()) as { protocolsResults?: KinventAnalysis[] }
    out.push(...(body.protocolsResults ?? []))
  }
  return out
}
