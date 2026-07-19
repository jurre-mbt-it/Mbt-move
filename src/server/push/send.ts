/**
 * Push-verzending naar de mobiele app via de Expo Push API.
 *
 * `sendPush` is de enige ingang: het schrijft ALTIJD een in-app `Notification`
 * (bron van waarheid, ook als push uit staat), checkt daarna de voorkeuren van
 * de ontvanger (master-switch, per-categorie, quiet hours) en pusht pas als dat
 * mag. Dode tokens (DeviceNotRegistered) worden opgeruimd.
 *
 * AVG: title/body bevatten NOOIT PHI (namen van derden, berichtinhoud,
 * meetwaarden). Details horen in `data` en laden pas in de app na ontgrendeling.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const TZ = 'Europe/Amsterdam'

export type PushCategory = 'message' | 'schedule' | 'reminder' | 'insight'

/** Urgente categorieën negeren quiet hours. Alleen een direct bericht is dat:
 *  een nieuw schema is informatief en mag netjes wachten tot buiten de nacht. */
const URGENT_CATEGORIES: readonly PushCategory[] = ['message']

/** Default quiet-hours voor niet-urgente pushes als de gebruiker niets instelde:
 *  niets tussen 21:00 en 08:00 (minuten na middernacht, lokale tijd). */
const DEFAULT_QUIET_START = 21 * 60
const DEFAULT_QUIET_END = 8 * 60

export type PushMessage = {
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
    const prefs = await prisma.notificationPreference.findUnique({ where: { userId } })
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
          title: message.title,
          body: message.body,
          type: `push.${category}`,
          data: { ...(message.data ?? {}), pushed: willPush } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {})

    // 3. Afleveren.
    if (!willPush) return
    await deliver(
      tokens.map((t) => t.token),
      message,
    )
  } catch (err) {
    console.error('[push] sendPush faalde', { userId, category, err })
  }
}

/** POST de berichten naar Expo en ruim tokens op die Expo als dood markeert. */
async function deliver(tokens: string[], message: PushMessage): Promise<void> {
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
    return
  }

  const json = (await res.json().catch(() => null)) as
    | { data?: Array<{ status?: string; details?: { error?: string } }> }
    | null
  const tickets = json?.data
  if (!Array.isArray(tickets)) return

  const dead: string[] = []
  tickets.forEach((ticket, i) => {
    if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
      dead.push(tokens[i])
    }
  })
  if (dead.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: dead } } }).catch(() => {})
  }
}
