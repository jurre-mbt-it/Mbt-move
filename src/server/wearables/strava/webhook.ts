/**
 * Strava-webhook-verwerking, los van de route zodat challenge-check en
 * event-dispatch unit-testbaar zijn (zelfde opzet als polar/webhook.ts).
 *
 * Strava Webhook Events API: één push-subscription per API-app
 * (scripts/strava-webhook-setup.ts). Bij het aanmaken valideert Strava de
 * callback met een GET (hub.mode/hub.verify_token/hub.challenge); daarna POST
 * hij per activiteit een event (create/update/delete) en bij ontkoppelen een
 * athlete-event met updates.authorized = "false". Anders dan Polar signeert
 * Strava events NIET — de route beperkt daarom de verwerking per atleet
 * (rate-limit) en de verwerking zelf is idempotent en haalt alleen data op
 * met het eigen token van de gekoppelde gebruiker. Een deauthorize-event
 * verwijdert de koppeling pas nadat Strava zelf het token heeft geweigerd;
 * anders kon iedereen met een geraden atleet-id andermans koppeling slopen
 * (gevonden in de audit van 2026-09-13).
 *
 * Strava wil binnen 2 s een 200 zien; de route antwoordt daarom meteen en
 * verwerkt het event in `after()`.
 */
import type { PrismaClient } from '@prisma/client'
import { timingSafeEqual } from 'crypto'
import { isStravaAccessRevoked, removeStravaActivity, syncStravaActivity } from './sync'

export type StravaWebhookEvent = {
  object_type?: 'activity' | 'athlete' | string
  object_id?: number
  aspect_type?: 'create' | 'update' | 'delete' | string
  owner_id?: number | string
  subscription_id?: number
  event_time?: number
  updates?: Record<string, string>
}

/**
 * Antwoord op Strava's subscription-validatie. Zonder geconfigureerd
 * verify-token weigeren we (503): dan mislukt `create` in het setup-script
 * met een duidelijke reden i.p.v. een stille onbeveiligde subscription.
 */
export function stravaSubscriptionChallenge(
  params: URLSearchParams,
  verifyToken: string | undefined,
): { status: number; body: Record<string, string> } {
  if (!verifyToken) return { status: 503, body: { error: 'verify_token_not_configured' } }
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token') ?? ''
  const challenge = params.get('hub.challenge')
  const a = Buffer.from(token)
  const b = Buffer.from(verifyToken)
  const tokenOk = a.length === b.length && timingSafeEqual(a, b)
  if (mode !== 'subscribe' || !tokenOk || !challenge) {
    return { status: 403, body: { error: 'verification_failed' } }
  }
  return { status: 200, body: { 'hub.challenge': challenge } }
}

type Db = Pick<PrismaClient, 'stravaConnection' | 'wearableConnection' | 'user' | 'cardioLog' | 'sessionLog'>

/**
 * Verwerk één webhook-event. Onbekende atleten geven bewust géén fout: een
 * ontkoppeld account of een verzonnen owner_id mag geen retry-storm of
 * info-lek opleveren.
 */
export async function handleStravaWebhookEvent(
  prisma: Db,
  ev: StravaWebhookEvent,
): Promise<{ handled: boolean; action?: 'synced' | 'skipped' | 'removed' | 'deauthorized' | 'ignored' }> {
  if (ev.owner_id == null) return { handled: false }
  const conn = await prisma.stravaConnection.findUnique({
    where: { athleteId: String(ev.owner_id) },
    select: { userId: true },
  })
  if (!conn) return { handled: false }

  if (ev.object_type === 'athlete') {
    // Gebruiker trok de toegang in bij Strava zelf → koppeling hier ook weg,
    // anders blijft een dooie tegel "gekoppeld" tonen en faalt elke sync.
    if (ev.aspect_type === 'update' && ev.updates?.authorized === 'false') {
      // Ongesigneerd event: eerst bij Strava toetsen of het token echt dood is.
      // Werkt het nog, dan was dit vervalst of achterhaald en blijft alles staan.
      if (!(await isStravaAccessRevoked(prisma, conn.userId))) {
        return { handled: true, action: 'ignored' }
      }
      await prisma.stravaConnection.deleteMany({ where: { userId: conn.userId } })
      await prisma.wearableConnection.deleteMany({ where: { userId: conn.userId, provider: 'STRAVA' } })
      return { handled: true, action: 'deauthorized' }
    }
    return { handled: false }
  }

  if (ev.object_type !== 'activity' || ev.object_id == null) return { handled: false }

  switch (ev.aspect_type) {
    case 'create':
    case 'update': {
      const ingested = await syncStravaActivity(prisma, conn.userId, ev.object_id)
      return { handled: true, action: ingested ? 'synced' : 'skipped' }
    }
    case 'delete': {
      const removed = await removeStravaActivity(prisma, conn.userId, ev.object_id)
      return { handled: true, action: removed ? 'removed' : 'skipped' }
    }
    default:
      return { handled: false }
  }
}
