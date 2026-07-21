'use client'

import { use } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { ChevronLeft } from 'lucide-react'
import { Kicker, P } from '@/components/dark-ui'
import { MessageThread } from '@/components/messages/MessageThread'

export default function TherapistMessageThreadPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const portal = usePortal()
  const { patientId } = use(params)
  const { data: patient } = trpc.patients.get.useQuery({ id: patientId })

  return (
    <div
      className="flex flex-col max-w-3xl mx-auto w-full"
      // Header + main-padding + (mobiele) bottom-nav eraf zodat de composer
      // in beeld blijft zonder dubbele scroll.
      style={{ height: 'calc(100dvh - 170px)' }}
    >
      <div className="px-4 sm:px-6 pt-4 pb-3 flex items-center gap-3" style={{ borderBottom: `1px solid ${P.line}` }}>
        <Link
          href={`${portal.base}/messages`}
          className="athletic-tap p-2 -ml-2 rounded-lg"
          style={{ color: P.ink }}
          aria-label="Terug naar berichten"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <Kicker>BERICHTEN</Kicker>
          <p className="truncate" style={{ color: P.ink, fontSize: 17, fontWeight: 800, marginTop: 2 }}>
            {patient?.name ?? '…'}
          </p>
        </div>
        {patient && (
          <Link
            href={`${portal.patients}/${patientId}`}
            className="athletic-tap athletic-mono ml-auto shrink-0 rounded-full"
            style={{
              padding: '6px 12px',
              border: `1px solid ${P.lineStrong}`,
              color: P.inkMuted,
              fontSize: 10,
              letterSpacing: '0.1em',
              fontWeight: 800,
            }}
          >
            DOSSIER
          </Link>
        )}
      </div>
      <MessageThread viewerSide="practice" patientId={patientId} />
    </div>
  )
}
