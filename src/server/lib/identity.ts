/**
 * Eén plek voor de regel "mag deze Supabase-account zich binden aan deze
 * bestaande User-rij?".
 *
 * Achtergrond (audit 2026-07-27, H2). De codebase zoekt op vier plekken een
 * Prisma-user op bij een Supabase-sessie, en de veilige volgorde is overal
 * dezelfde: eerst op `supabaseUserId`, en pas daarna een email-fallback voor
 * legacy-rijen die nog nergens aan gebonden zijn. Die fallback is nodig, maar
 * ook gevaarlijk: een e-mailadres is pas een identiteit als het geverifieerd
 * is, en Supabase staat zowel e-mailwijziging als (nu nog) open registratie
 * met `mailer_autoconfirm` toe. Wie zich registreert met het adres van een
 * ongebonden rij zou die identiteit anders overnemen.
 *
 * Daarom: voor rollen met inzage in andermans gezondheidsdata nooit via de
 * email-fallback binden. Die rijen horen hun `supabaseUserId` al te hebben
 * (via de bulk-backfill in supabase-schema.sql of via `admin.inviteTherapist`).
 *
 * Twee routes deden dit tot 2026-07-27 helemaal niet en keken alleen naar het
 * e-mailadres: `/api/shop/invoice/[orderId]` en `/api/email/send`. In
 * combinatie met de verweesde ADMIN-rij `admin@mbtmove.com` was dat een
 * directe admin-ingang.
 */

/** Rollen die andermans dossier kunnen inzien. Nooit claimbaar op e-mail. */
export const HIGH_VALUE_ROLES: ReadonlySet<string> = new Set([
  'THERAPIST',
  'ADMIN',
  'COACH',
])

/**
 * Mag `supabaseUserId` zich aan deze op e-mail gevonden rij binden?
 *
 * - Rij hoort al bij een Supabase-account → alleen als het hetzelfde account is.
 * - Rij is nog ongebonden → alleen voor laag-privilege rollen.
 */
export function mayBindByEmail(
  row: { role: string; supabaseUserId: string | null } | null | undefined,
  supabaseUserId: string,
): boolean {
  if (!row) return false
  if (row.supabaseUserId) return row.supabaseUserId === supabaseUserId
  return !HIGH_VALUE_ROLES.has(row.role)
}
