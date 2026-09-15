'use client'

/**
 * Verloop per test op de patiëntpagina van de behandelaar (tab Tests).
 * Zelfde weergave als de patiënt krijgt, maar met conceptrapporten erbij.
 */
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { Kicker, P, Tile } from '@/components/dark-ui'
import { TestVerloop } from './TestVerloop'

export function PatientTestVerloopCard({ patientId }: { patientId: string }) {
  const portal = usePortal()
  const { data, isLoading } = trpc.testReports.historyForPatient.useQuery({ patientId })
  return (
    <Tile>
      <Kicker>Verloop per test</Kicker>
      <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2, marginBottom: 12 }}>
        Alle testrapporten, ook concepten. De patiënt ziet in de app en het portaal alleen definitieve rapporten.
      </p>
      <TestVerloop
        data={data}
        isLoading={isLoading}
        meekijken
        kinventHref={`${portal.patients}/${patientId}/kinvent`}
      />
    </Tile>
  )
}
