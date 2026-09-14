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
 *
 * Endpoints volgens Kinvents documentatie van september 2026 (kopie in
 * ~/kinvent-koppeling/docs-2026-09/). We gebruiken uitsluitend de lichte
 * "common"-projectie van protocollen, zonder de ruwe sensorcurves die de oude
 * v1-lijst 253 KB per protocol maakten, en de gepagineerde zoekcall voor
 * participants, zodat alleen de treffers op een naam over de lijn gaan.
 */

const BASE_URL = process.env.KINVENT_BASE_URL ?? 'https://api.k-invent.com'

/** Kinvent staat 1000 codes per analyse-call toe; honderd houdt de respons hanteerbaar. */
export const ANALYZE_BATCH_SIZE = 100

/** Kinvents eigen foutcodes, voor zover we erop reageren. */
export const ERR_NO_ANALYZER = 'ERR_4090'

export class KinventError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Het bewaarde token is niet (meer) geldig; iemand moet opnieuw aanmelden. */
    readonly needsSignIn = false,
    /** Kinvents `errorCode`, als de respons er een droeg. */
    readonly code?: string,
  ) {
    super(message)
    this.name = 'KinventError'
  }
}

/**
 * Wat we van een participant overhouden na het zoeken: genoeg om de juiste
 * persoon aan te wijzen, en of er consent is vastgelegd. E-mail, foto,
 * gewicht en de rest blijven bij Kinvent.
 */
export type KinventParticipantHit = {
  code: string
  firstName: string | null
  lastName: string | null
  dateOfBirth: number | null
  /** `dateConsentToKeepData` gezet. Kinvent legt het toezien hierop bij ons. */
  consentRecorded: boolean
}

export type KinventMeasurement = {
  deviceType?: string | null
  bodyPart?: string | null
  bodyPartSide?: string | null
  serialCode?: string | null
}

export type KinventActivityConfig = {
  exerciseType?: string | null
  activityType?: string | null
  title?: string | null
  /** Ingebouwde configuratie waarvan deze afstamt; groepeert dezelfde oefening over patiënten. */
  baseConfigCode?: string | null
}

/** `ProtocolCommon`: licht, zonder ruwe curves en zonder opgeslagen rep-waarden. */
export type KinventProtocol = {
  code: string
  participantCode?: string | null
  createdOn?: number | null
  updatedOn?: number | null
  deleted?: boolean | null
  singleActivity?: boolean | null
  config?: { title?: string | null; baseConfigCode?: string | null } | null
  activities?: Array<{
    code?: string | null
    startTime?: number | null
    deleted?: boolean | null
    config?: KinventActivityConfig | null
    activityReps?: Array<{ deleted?: boolean | null; measurements?: KinventMeasurement[] | null }> | null
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
    config?: KinventActivityConfig | null
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

type ErrorBody = { errorCode?: string; message?: string }

async function errorFrom(res: Response, path: string): Promise<KinventError> {
  if (res.status === 401) {
    return new KinventError('De Kinvent-aanmelding is verlopen. Meld opnieuw aan.', 401, true)
  }
  let body: ErrorBody = {}
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    // Geen JSON-body; de status zegt genoeg.
  }
  const code = typeof body.errorCode === 'string' ? body.errorCode : undefined
  return new KinventError(
    `Kinvent gaf HTTP ${res.status}${code ? ` (${code})` : ''} op ${path}.`,
    res.status,
    false,
    code,
  )
}

async function request<T>(token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'X-Auth-Token': token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok) throw await errorFrom(res, path)
  return (await res.json()) as T
}

type ParticipantPage = {
  content?: Array<{
    code?: string
    firstName?: string | null
    lastName?: string | null
    dateOfBirth?: number | null
    dateConsentToKeepData?: number | null
  }> | null
}

/**
 * Zoekt participants op naam. Het filteren gebeurt bij Kinvent, dus alleen
 * de treffers komen over de lijn. Wordt alleen op het koppelmoment gebruikt;
 * we slaan hier niets van op behalve de gekozen `code`. Bevat namen en
 * geboortedata, dus niet loggen.
 */
export async function searchParticipants(token: string, query: string, size = 25): Promise<KinventParticipantHit[]> {
  const page = await request<ParticipantPage>(token, 'POST', '/api/participants/v2/paginated', {
    query,
    page: 0,
    size,
  })
  return (page.content ?? [])
    .filter((p): p is typeof p & { code: string } => typeof p.code === 'string')
    .map((p) => ({
      code: p.code,
      firstName: p.firstName ?? null,
      lastName: p.lastName ?? null,
      dateOfBirth: p.dateOfBirth ?? null,
      consentRecorded: (p.dateConsentToKeepData ?? 0) > 0,
    }))
}

/**
 * Alle niet-verwijderde protocollen van één patiënt, in de lichte projectie.
 *
 * Bewust per patiënt en niet via de brede lijst: dataminimalisatie, want
 * metingen van patiënten zonder BASE-dossier bereiken ons niet. De call kent
 * geen `updatedAfter`; wie alleen het verschil wil, vergelijkt `updatedOn`.
 */
export async function fetchProtocolsForParticipant(token: string, participantCode: string): Promise<KinventProtocol[]> {
  const params = new URLSearchParams({ participantCode })
  return request<KinventProtocol[]>(token, 'POST', `/api/protocols/common/v1/findByParticipantCode?${params}`)
}

/**
 * Codes van sessies die in Kinvent verwijderd zijn. De lichte lijst hierboven
 * laat verwijderde records weg, dus dit is de enige manier om te zien dat een
 * eerder geïmporteerde meting bij Kinvent niet meer bestaat.
 */
export async function fetchDeletedProtocolCodes(token: string, participantCode: string): Promise<string[]> {
  const params = new URLSearchParams({ participantCode, deleted: 'true' })
  return request<string[]>(token, 'GET', `/api/protocols/v2/protocolInfoByParticipantCode?${params}`)
}

async function analyzeBatch(token: string, codes: string[]): Promise<KinventAnalysis[]> {
  const body = await request<{ protocolsResults?: KinventAnalysis[] }>(
    token,
    'POST',
    '/api/protocols/v2/analyze?detailed=false',
    codes,
  )
  return body.protocolsResults ?? []
}

/**
 * Berekende uitkomsten, samenvattingen alleen. Schrijft niets, ondanks de POST.
 *
 * Eén activity type zonder analyzer laat bij Kinvent de hele batch falen
 * (ERR_4090). Dan proberen we per protocol opnieuw en slaan we alleen dat ene
 * over, zodat één exotische meting niet de hele ophaalronde blokkeert.
 * Protocollen waar het account niet bij mag laat Kinvent stil weg; de
 * aanroeper vergelijkt daarom zelf wat er terugkwam.
 */
export async function analyzeProtocols(token: string, protocolCodes: string[]): Promise<KinventAnalysis[]> {
  const out: KinventAnalysis[] = []
  for (let i = 0; i < protocolCodes.length; i += ANALYZE_BATCH_SIZE) {
    const chunk = protocolCodes.slice(i, i + ANALYZE_BATCH_SIZE)
    try {
      out.push(...(await analyzeBatch(token, chunk)))
    } catch (err) {
      if (!(err instanceof KinventError) || err.code !== ERR_NO_ANALYZER) throw err
      if (chunk.length === 1) continue
      for (const code of chunk) {
        try {
          out.push(...(await analyzeBatch(token, [code])))
        } catch (single) {
          if (!(single instanceof KinventError) || single.code !== ERR_NO_ANALYZER) throw single
        }
      }
    }
  }
  return out
}
