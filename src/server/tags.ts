/**
 * Server-kant van het hashtag-systeem: parseert #tags uit notities bij het
 * opslaan van een sessie/cardio-log en houdt HashTag + HashTagUsage in sync.
 *
 * Bewust fout-tolerant: tag-sync mag een workout-save NOOIT laten falen
 * (de log zelf is heilig — zie ook de offline-outbox op mobile). Fouten
 * worden geslikt en gelogd.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { findMatchingTag, parseHashtags } from '@/lib/tags'

const createId = () => crypto.randomUUID()

type Db = Pick<PrismaClient, 'hashTag' | 'hashTagUsage'> | Prisma.TransactionClient

export type TagSyncTarget =
  | { sessionLogId: string; cardioLogId?: undefined }
  | { cardioLogId: string; sessionLogId?: undefined }

/**
 * Sync de hashtags van één log met de notitie-tekst. Idempotent: usages die
 * niet meer in de tekst staan worden verwijderd (voor notitie-edits), nieuwe
 * worden aangemaakt. Nieuwe varianten die sterk lijken op een bestaande tag
 * van deze patiënt worden aan die bestaande tag gekoppeld (typefout-vangnet).
 */
export async function syncHashtagsForLog(
  db: Db,
  opts: {
    patientId: string
    /** Wie tagde (patiënt zelf of therapeut) — audit. */
    taggedById: string
    /** completedAt van de log; basis voor episode-groepering. */
    loggedAt: Date
    notes: string | null | undefined
    target: TagSyncTarget
  },
): Promise<void> {
  try {
    const parsed = parseHashtags(opts.notes)

    const targetWhere =
      'sessionLogId' in opts.target && opts.target.sessionLogId
        ? { sessionLogId: opts.target.sessionLogId }
        : { cardioLogId: opts.target.cardioLogId }

    // Bestaande tags van deze patiënt één keer ophalen (kleine N) — matching
    // gebeurt in TS zodat web/iOS/tests dezelfde regels delen.
    const existing = await db.hashTag.findMany({
      where: { patientId: opts.patientId },
      select: { id: true, name: true },
    })

    const tagIds: string[] = []
    for (const { name, display } of parsed) {
      const match = findMatchingTag(name, existing)
      if (match) {
        tagIds.push(match.id)
        continue
      }
      const created = await db.hashTag.create({
        data: { id: createId(), patientId: opts.patientId, name, display },
        select: { id: true, name: true },
      })
      existing.push(created)
      tagIds.push(created.id)
    }

    // Usages die niet meer in de tekst staan opruimen (notitie-edit) …
    await db.hashTagUsage.deleteMany({
      where: { ...targetWhere, ...(tagIds.length ? { tagId: { notIn: tagIds } } : {}) },
    })
    // … en de actuele set idempotent aanmaken.
    for (const tagId of tagIds) {
      const already = await db.hashTagUsage.findFirst({
        where: { tagId, ...targetWhere },
        select: { id: true },
      })
      if (already) continue
      await db.hashTagUsage.create({
        data: {
          id: createId(),
          tagId,
          ...targetWhere,
          taggedById: opts.taggedById,
          loggedAt: opts.loggedAt,
        },
      })
    }
  } catch (err) {
    // Nooit de save laten falen op tag-sync.
    console.error('[tags] syncHashtagsForLog faalde', err)
  }
}
