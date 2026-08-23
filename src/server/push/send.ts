/**
 * Push-verzending naar de mobiele app via de Expo Push API.
 *
 * `sendPush` is de ingang voor domein-notificaties: het schrijft ALTIJD een
 * in-app `Notification` (bron van waarheid, ook als push uit staat), checkt
 * daarna de voorkeuren van de ontvanger (master-switch, per-categorie, quiet
 * hours) en pusht pas als dat mag. Dode tokens (DeviceNotRegistered) worden
 * opgeruimd.
 *
 * `deliverToTokens` is de rauwe laag daaronder en slaat die checks over. Buiten
 * `sendPush` gebruikt alleen de test-melding uit de instellingen 'm, omdat de
 * gebruiker daar expliciet om een melding vraagt en de keten wil testen.
 *
 * AVG: title/body bevatten NOOIT PHI (namen van derden, berichtinhoud,
 * meetwaarden). Details horen in `data` en laden pas in de app na ontgrendeling.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const TZ = 'Europe/Amsterdam'

export type PushCategory = 'message' | 'schedule' | 'reminder' | 'insight'

/** Urgente categorieën negeren quiet hours. Alleen een direct bericht is dat:
 *  een nieuw schema is informatief en mag netjes wachten tot buiten de nacht. */
const URGENT_CATEGORIES: readonly PushCategory[] = ['message']

/**
 * Het uur van de ochtend-push en de quiet-hours-defaults staan in `timing.ts`,
 * los van dit bestand: die getallen zitten aan elkaar vast en worden gelezen
 * door code die geen databaseverbinding nodig heeft. Hier alleen doorgegeven,
 * zodat bestaande imports van `MORNING_PUSH_HOUR` uit `send` blijven werken.
 */
export { MORNING_PUSH_HOUR } from './timing'
import { DEFAULT_QUIET_START, DEFAULT_QUIET_END } from './timing'
import { pick, type Localized } from '@/server/i18n'

/** Titel en tekst mogen in beide talen komen; `sendPush` kiest op `User.locale`. */
export type PushMessage = {
  title: Localized
  body: Localized
  data?: Record<string, unknown>
}

/** Wat er echt naar Expo en de in-app rij gaat: al in één taal. */
export type ResolvedPushMessage = {
  title: string
  body: string
  data?: Record<string, unknown>
}

/** Huidige minuut-van-de-dag in Amsterdam. De server draait in UTC, dus
 *  getHours() zou er (zomertijd) een of twee uur naast zitten. */
function amsMinutesOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

function withinWindow(minuteOfDay: number, start: number, end: number): boolean {
  if (start === end) return false
  if (start < end) return minuteOfDay >= start && minuteOfDay < end
  // Overnacht-venster (bv. 1260..480).
  return minuteOfDay >= start || minuteOfDay < end
}

function categoryEnabled(categories: unknown, category: PushCategory): boolean {
  if (!categories || typeof categories !== 'object') return true
  // Ontbrekende sleutel = default AAN; alleen expliciet false zet 'm uit.
  return (categories as Record<string, unknown>)[category] !== false
}

/**
 * Stuur één logische notificatie naar één gebruiker (alle geregistreerde
 * devices). Schrijft altijd de in-app rij; pusht alleen als voorkeuren dat
 * toelaten. Gooit nooit — bel- en netwerkfouten mogen de aanroeper niet breken.
 */
export async function sendPush(
  userId: string,
  message: PushMessage,
  category: PushCategory,
): Promise<void> {
  try {
    // 1. Beslis éérst of er echt gepusht gaat worden, zodat de in-app rij dat
    //    kan vastleggen als `data.pushed`. De daily-reminders-cron gebruikt die
    //    vlag voor zijn idempotentie-check: een insight die tijdens quiet hours
    //    is onderdrukt (pushed: false) telt dan niet als "vandaag al verstuurd"
    //    en wordt bij de 09:00-run alsnog gepusht — voorheen blokkeerde zo'n
    //    stille rij de push voor de rest van de dag.
    const [prefs, user] = await Promise.all([
      prisma.notificationPreference.findUnique({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { locale: true } }),
    ])
    const resolved: ResolvedPushMessage = {
      title: pick(user?.locale, message.title),
      body: pick(user?.locale, message.body),
      data: message.data,
    }
    let willPush = true
    if (prefs?.pushEnabled === false) willPush = false
    else if (prefs && !categoryEnabled(prefs.categories, category)) willPush = false
    else if (!URGENT_CATEGORIES.includes(category)) {
      // Quiet hours gelden alleen voor niet-urgente categorieën.
      const start = prefs?.quietHoursStart ?? DEFAULT_QUIET_START
      const end = prefs?.quietHoursEnd ?? DEFAULT_QUIET_END
      if (withinWindow(amsMinutesOfDay(new Date()), start, end)) willPush = false
    }

    const tokens = willPush
      ? await prisma.pushToken.findMany({ where: { userId }, select: { token: true } })
      : []
    if (willPush && tokens.length === 0) willPush = false

    // 2. In-app notificatie — altijd, ongeacht push-voorkeur.
    await prisma.notification
      .create({
        data: {
          userId,
          title: resolved.title,
          body: resolved.body,
          type: `push.${category}`,
          data: { ...(message.data ?? {}), pushed: willPush } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {})

    // 3. Afleveren.
    if (!willPush) return
    await deliverToTokens(
      tokens.map((t) => t.token),
      resolved,
    )
  } catch (err) {
    console.error('[push] sendPush faalde', { userId, category, err })
  }
}

/** Uitkomst van één aflever-poging, per device geteld. `removedTokens` zijn
 *  tokens die Expo als dood meldde en die we hebben opgeruimd. */
export type DeliveryResult = {
  attempted: number
  delivered: number
  failed: number
  /** Foutcodes van Expo (bv. `DeviceNotRegistered`, `MessageRateExceeded`). */
  errors: string[]
  removedTokens: number
  /** Ticket-ids, om later het ontvangstbewijs bij Expo op te halen. */
  ticketIds: string[]
}

/**
 * POST de berichten naar Expo en ruim tokens op die Expo als dood markeert.
 *
 * Let op: dit gaat bewust langs voorkeuren en quiet hours heen. Alleen
 * `sendPush` (domein-notificaties) mag hier direct op aanroepen; de test-push
 * uit de instellingen doet dat ook, omdat de gebruiker daar expliciet om vraagt.
 */
export async function deliverToTokens(
  tokens: string[],
  message: ResolvedPushMessage,
): Promise<DeliveryResult> {
  const empty: DeliveryResult = {
    attempted: tokens.length,
    delivered: 0,
    failed: tokens.length,
    errors: [],
    removedTokens: 0,
    ticketIds: [],
  }
  if (tokens.length === 0) return { ...empty, failed: 0 }

  const payload = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: 'default' as const,
  }))

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    console.error('[push] Expo push API gaf', res.status)
    return { ...empty, errors: [`http_${res.status}`] }
  }

  const json = (await res.json().catch(() => null)) as
    | { data?: Array<{ status?: string; id?: string; details?: { error?: string } }> }
    | null
  const tickets = json?.data
  if (!Array.isArray(tickets)) return { ...empty, errors: ['geen_tickets'] }

  const dead: string[] = []
  const errors: string[] = []
  const ticketIds: string[] = []
  let delivered = 0
  tickets.forEach((ticket, i) => {
    if (ticket?.status === 'ok') {
      delivered++
      if (ticket.id) ticketIds.push(ticket.id)
      return
    }
    const code = ticket?.details?.error ?? 'onbekend'
    errors.push(code)
    if (code === 'DeviceNotRegistered') dead.push(tokens[i])
  })
  // Tel wat er écht weg is, niet wat Expo aanwees: die twee lopen uiteen zodra
  // een token al opgeruimd was. De test-melding toont dit aantal aan de
  // gebruiker, dus een te hoog getal is misleidend.
  let removedTokens = 0
  if (dead.length > 0) {
    const del = await prisma.pushToken
      .deleteMany({ where: { token: { in: dead } } })
      .catch(() => null)
    removedTokens = del?.count ?? 0
  }

  return {
    attempted: tokens.length,
    delivered,
    failed: tokens.length - delivered,
    errors,
    removedTokens,
    ticketIds,
  }
}

/**
 * Haal de ontvangstbewijzen van eerder aangenomen tickets op.
 *
 * Een ticket met status `ok` betekent alleen dat Expo de melding heeft
 * aangenomen — of Apple 'm daadwerkelijk afleverde blijkt pas uit het receipt.
 * Daar komen fouten als `DeviceNotRegistered` of een misconfiguratie van de
 * push-credentials alsnog naar boven. Wordt gebruikt door de test-melding in de
 * instellingen; de gewone verzendpaden hoeven hier niet op te wachten.
 */
export async function fetchReceipts(
  ticketIds: string[],
): Promise<{ ok: number; errors: string[] }> {
  if (ticketIds.length === 0) return { ok: 0, errors: [] }
  try {
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids: ticketIds }),
    })
    if (!res.ok) return { ok: 0, errors: [`http_${res.status}`] }
    const json = (await res.json().catch(() => null)) as {
      data?: Record<string, { status?: string; details?: { error?: string } }>
    } | null
    const receipts = json?.data
    if (!receipts) return { ok: 0, errors: [] }

    let ok = 0
    const errors: string[] = []
    for (const receipt of Object.values(receipts)) {
      if (receipt?.status === 'ok') ok++
      else errors.push(receipt?.details?.error ?? 'onbekend')
    }
    return { ok, errors }
  } catch {
    // Diagnostiek mag de test-melding nooit laten falen.
    return { ok: 0, errors: [] }
  }
}
