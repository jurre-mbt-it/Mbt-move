/**
 * Polar-webhook-verwerking, los van de route zodat signatuur-check en
 * event-dispatch unit-testbaar zijn.
 *
 * Polar signeert elke payload met HMAC-SHA256 over de raw body; de sleutel
 * (`signature_secret_key`) krijgen we eenmalig bij het aanmaken van de
 * webhook (scripts/polar-webhook-setup.ts) en staat als POLAR_WEBHOOK_SECRET
 * in de env. Header: `Polar-Webhook-Signature` (hex).
 */
import { createHmac, timingSafeEqual } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { maybeNotifyRecoveryOnSync } from '@/server/push/morning-insight'
import { syncPolarExercises, syncPolarWellness } from './sync'

/** Verifieer de HMAC-SHA256-hex-signatuur over de raw request-body. */
export function verifyPolarSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(signature.toLowerCase())
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type PolarWebhookBody = {
  event?: string
  user_id?: number | string
}

/**
 * Verwerk één (geverifieerd) webhook-event. Onbekende gebruikers of een
 * koppeling die opnieuw geautoriseerd moet worden geven bewust géén fout —
 * een losgekoppelde of verlopen account mag geen 500-retry-storm veroorzaken
 * (na 7 dagen fouten deactiveert Polar de hele webhook, voor iederéén).
 *
 * EXERCISE draait de volledige (idempotente) exercises-sync; een gerichte
 * entity-pull via de meegestuurde url is een latere optimalisatie. De
 * wellness-events delen één sync omdat slaap/recharge/activiteit toch samen
 * opgehaald worden; daarna hangt de herstelmelding aan de verse nacht —
 * precies zoals de Apple-sync-route dat doet (Polar-horloges syncen
 * 's ochtends bij het openen van de Flow-app).
 */
export async function handlePolarWebhookEvent(
  prisma: PrismaClient,
  body: PolarWebhookBody,
): Promise<{ handled: boolean }> {
  if (body.user_id == null) return { handled: false }
  const conn = await prisma.polarConnection.findUnique({
    where: { polarUserId: String(body.user_id) },
  })
  if (!conn || conn.needsReauth) return { handled: false }

  switch (body.event) {
    case 'EXERCISE': {
      await syncPolarExercises(prisma, conn.userId)
      return { handled: true }
    }
    case 'SLEEP':
    case 'CONTINUOUS_HEART_RATE':
    case 'ACTIVITY_SUMMARY': {
      const result = await syncPolarWellness(prisma, conn.userId)
      await maybeNotifyRecoveryOnSync(prisma, conn.userId, result.affectedDates)
      return { handled: true }
    }
    default:
      return { handled: false }
  }
}
