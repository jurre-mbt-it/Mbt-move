'use client'

/**
 * Tests-pagina van de patiënt of atleet zelf: alleen definitieve rapporten
 * (testReports.myTestHistory). `?test=<key>&criterium=<id>` opent meteen de
 * test achter een criterium, met die drempel als doellijn.
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

import { trpc } from '@/lib/trpc/client'
import { DarkHeader, DarkScreen, Kicker, P } from '@/components/dark-ui'
import { TestVerloop } from './TestVerloop'

function Inhoud() {
  const params = useSearchParams()
  const { data, isLoading } = trpc.testReports.myTestHistory.useQuery(undefined, { retry: false })
  return (
    <div className="px-4 pt-4 pb-24 max-w-4xl mx-auto w-full space-y-4">
      <div>
        <Kicker>Verloop per test</Kicker>
        <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4 }}>
          Uitslagen uit de definitieve testrapporten van je therapeut.
        </p>
      </div>
      <TestVerloop
        data={data}
        isLoading={isLoading}
        meekijken={false}
        initialKey={params.get('test')}
        criteriumId={params.get('criterium')}
      />
    </div>
  )
}

export function MijnTestsPagina({ backHref }: { backHref: string }) {
  return (
    <DarkScreen>
      <DarkHeader title="Tests" backHref={backHref} />
      <Suspense fallback={null}>
        <Inhoud />
      </Suspense>
    </DarkScreen>
  )
}
