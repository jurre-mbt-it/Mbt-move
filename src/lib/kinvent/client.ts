/**
 * KINVENT Public API — client.
 *
 * Alleen lezen. De schrijf-endpoints van Kinvent (participants aanmaken,
 * protocollen wijzigen of verwijderen) staan hier bewust niet in: Kinvent is
 * de bron van waarheid voor metingen, en een bug in BASE mag daar nooit iets
 * aan kunnen veranderen.
 *
 * Authenticatie: Basic Auth op /login geeft een JWT, daarna gaat die mee als
 * `X-Auth-Token`. Er is geen refresh-token; het token is 31 dagen geldig en we
 * loggen bij een 401 gewoon opnieuw in.
 *
 * LET OP — tweefactorauthenticatie. Staat 2FA aan op het account, dan slaagt
 * /login wél maar levert het een challenge op in plaats van een sessie: de
 * respons bevat `twoFaPreferredMethod` en een token van een paar tekens, en de
 * eerstvolgende call geeft 401. In de gepubliceerde API bestaat geen endpoint
 * om die challenge af te ronden, dus een onbemande sync kan er niet doorheen.
 * `login()` herkent dat geval en zegt het met zoveel woorden, in plaats van te
 * stranden op een onverklaarbare 401 verderop.
 */

const BASE_URL = process.env.KINVENT_BASE_URL ?? 'https://api.k-invent.com'

/** Kinvent kapt de brede lijst af; analyse in blokken van 25 gaat wel goed. */
export const ANALYZE_BATCH_SIZE = 25

export class KinventError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly needsSecondFactor = false,
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
  measurements?: Array<{
    deviceType?: string | null
    bodyPart?: string | null
    bodyPartSide?: string | null
    serialCode?: string | null
  }> | null
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

let cachedToken: { value: string; fetchedAt: number } | null = null

/** Ruim onder de 31 dagen die Kinvent geeft, zodat we nooit op de rand zitten. */
const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000

function credentials() {
  const email = process.env.KINVENT_EMAIL
  const password = process.env.KINVENT_PASSWORD
  if (!email || !password) {
    throw new KinventError('KINVENT_EMAIL en KINVENT_PASSWORD ontbreken in de omgeving.')
  }
  return { email, password }
}

export async function login(): Promise<string> {
  const { email, password } = credentials()
  const res = await fetch(`${BASE_URL}/api/authorization/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`,
    },
  })
  if (!res.ok) {
    throw new KinventError(`Inloggen bij Kinvent mislukt (HTTP ${res.status}).`, res.status)
  }
  const body = (await res.json()) as { token?: string; twoFaPreferredMethod?: string }
  const token = body.token
  // Een echte sessie is een JWT (drie delen). Komt er iets korters terug, of
  // meldt Kinvent een tweede factor, dan hebben we een challenge te pakken.
  if (!token || body.twoFaPreferredMethod || token.split('.').length !== 3) {
    throw new KinventError(
      'Kinvent vraagt een tweede factor voor dit account. Een automatische koppeling ' +
        'kan die niet beantwoorden; er is een service-credential of app-wachtwoord nodig.',
      undefined,
      true,
    )
  }
  cachedToken = { value: token, fetchedAt: Date.now() }
  return token
}

async function token(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_MAX_AGE_MS) {
    return cachedToken.value
  }
  return login()
}

async function get<T>(path: string, retryOn401 = true): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': await token() },
  })
  if (res.status === 401 && retryOn401) {
    cachedToken = null
    return get<T>(path, false)
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
export async function fetchParticipants(): Promise<KinventParticipant[]> {
  return get<KinventParticipant[]>('/api/participants/v1?includeDeleted=false')
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
  participantCode: string,
  updatedAfter = 0,
): Promise<KinventProtocol[]> {
  const params = new URLSearchParams({
    participantCode,
    updatedAfter: String(updatedAfter),
    includeDeleted: 'false',
  })
  return get<KinventProtocol[]>(`/api/protocols/v1/findByParticipantCode?${params}`)
}

/** Berekende uitkomsten. Schrijft niets, ondanks de POST. */
export async function analyzeProtocols(protocolCodes: string[]): Promise<KinventAnalysis[]> {
  const out: KinventAnalysis[] = []
  for (let i = 0; i < protocolCodes.length; i += ANALYZE_BATCH_SIZE) {
    const chunk = protocolCodes.slice(i, i + ANALYZE_BATCH_SIZE)
    const res = await fetch(`${BASE_URL}/api/protocols/v2/analyze`, {
      method: 'POST',
      headers: { 'X-Auth-Token': await token(), 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) {
      throw new KinventError(`Analyse mislukt (HTTP ${res.status}) voor ${chunk.length} protocollen.`, res.status)
    }
    const body = (await res.json()) as { protocolsResults?: KinventAnalysis[] }
    out.push(...(body.protocolsResults ?? []))
  }
  return out
}

/** Alleen voor tests: gooit het gecachete token weg. */
export function __resetTokenCache() {
  cachedToken = null
}
