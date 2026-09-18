/**
 * Bewaartermijn van berichten in de app (patiënt/atleet ⇄ behandelaar of coach).
 *
 * Berichten zijn bedoeld als kort contact over een sessie of oefening, niet als
 * dossier. Alles wat klinisch van belang is hoort de behandelaar in het dossier
 * (notities, sessies, testrapporten) vast te leggen; de berichten zelf worden
 * MESSAGE_RETENTION_DAYS na verzending automatisch gewist door de dagelijkse
 * cron `gdpr-cleanup`. Die termijn staat ook in de privacyverklaring
 * (getbase.coach/privacy, kopje "Hoe lang we bewaren"), in de lege staat van
 * het berichtenscherm (web + app) en in DPIA § 2.7. Verander je hem, verander
 * dan alle vier.
 *
 * Besluit Jurre Kok, 2026-09-18, vastgelegd bij de Google Play-verklaring.
 */
import type { PrismaClient } from '@prisma/client'
import { MESSAGE_RETENTION_DAYS } from '@/lib/message-retention'

export { MESSAGE_RETENTION_DAYS }

export function messageRetentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - MESSAGE_RETENTION_DAYS * 86400 * 1000)
}

type MessageDeleter = Pick<PrismaClient, 'message'>

/** Wist alle berichten ouder dan de bewaartermijn. Geeft het aantal terug. */
export async function purgeExpiredMessages(
  prisma: MessageDeleter,
  now: Date = new Date(),
): Promise<{ deleted: number; cutoff: Date }> {
  const cutoff = messageRetentionCutoff(now)
  const { count } = await prisma.message.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return { deleted: count, cutoff }
}
