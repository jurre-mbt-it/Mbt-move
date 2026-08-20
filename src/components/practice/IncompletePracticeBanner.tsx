'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { AlertTriangle } from 'lucide-react'

/** Definitie identiek aan `isPracticeUsable` in [server/email/footer.ts] —
 *  een footer wordt pas gerenderd als deze minimale set aanwezig is. */
function isPracticeUsable(p: {
  name?: string | null
  addressLine1?: string | null
  city?: string | null
  email?: string | null
  phone?: string | null
} | null | undefined): boolean {
  if (!p) return false
  if (!p.name?.trim()) return false
  if (!p.addressLine1?.trim()) return false
  if (!p.city?.trim()) return false
  if (!p.email?.trim() && !p.phone?.trim()) return false
  return true
}

/** Hook die teruggeeft of de praktijk-footer renderbaar is + handige sub-info
 *  voor copy in de banner (owner-naam, of jij owner bent). */
export function usePracticeCompleteness() {
  const { data: practice, isLoading } = trpc.practice.getMine.useQuery()
  const { data: me } = trpc.auth.getMe.useQuery()
  return {
    isLoading,
    practice,
    isComplete: isPracticeUsable(practice),
    isOwner: !!me?.isPracticeOwner,
    ownerName:
      practice?.owner?.firstName?.trim()
        || practice?.owner?.name?.trim()
        || practice?.owner?.email
        || 'de praktijkeigenaar',
  }
}

/** Banner-variant voor settings-pagina's (full-width tile-stijl). */
export function IncompletePracticeBanner({
  variant = 'tile',
}: {
  variant?: 'tile' | 'inline'
}) {
  const { isLoading, isComplete, isOwner, ownerName, practice } = usePracticeCompleteness()
  if (isLoading || isComplete) return null

  const ownerCopy = isOwner
    ? practice
      ? 'Je praktijkgegevens zijn nog niet compleet. Vul ze aan zodat patiëntmails een nette praktijk-footer krijgen.'
      : 'Je bent nog niet aan een praktijk gekoppeld. Mail-footer kan niet gerenderd worden.'
    : `${ownerName} heeft de praktijkgegevens nog niet compleet ingevuld. Patiëntmails worden zonder footer verstuurd tot dat is gebeurd.`

  if (variant === 'inline') {
    return (
      <div
        className="flex items-start gap-2 rounded-lg p-3 text-xs"
        style={{
          background: 'rgba(245,185,66,0.08)',
          border: '1px solid rgba(245,185,66,0.30)',
          color: 'var(--p-gold)',
        }}
      >
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold">Praktijkgegevens incompleet</p>
          <p className="opacity-90 mt-0.5" style={{ color: 'var(--p-gold)' }}>{ownerCopy}</p>
          {isOwner && practice && (
            <Link
              href="/therapist/settings/practice"
              className="inline-block mt-1.5 underline font-semibold"
            >
              Aanvullen →
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-start gap-3 rounded-2xl p-4"
      style={{
        background: 'rgba(245,185,66,0.06)',
        border: '1px solid rgba(245,185,66,0.30)',
      }}
    >
      <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--p-gold)' }} />
      <div className="flex-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--p-gold)' }}>
          Praktijkgegevens incompleet
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-gold)' }}>
          {ownerCopy}
        </p>
        {isOwner && practice && (
          <Link
            href="/therapist/settings/practice"
            className="inline-block mt-2 text-xs font-semibold underline"
            style={{ color: 'var(--p-gold)' }}
          >
            Praktijkprofiel openen →
          </Link>
        )}
      </div>
    </div>
  )
}
