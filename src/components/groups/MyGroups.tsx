'use client'

/**
 * Groepen waar ik zelf in zit, met per groep de knop om eruit te stappen.
 * Staat op het profiel van patiënt en atleet. Verbergt zichzelf als er geen
 * groepen zijn: de meeste patiënten zitten nergens in.
 */
import { useState } from 'react'
import { toast } from 'sonner'

import { trpc } from '@/lib/trpc/client'
import { DarkButton, Kicker, P, Tile } from '@/components/dark-ui'

const fmt = (d: Date | string) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

export function MyGroups() {
  const utils = trpc.useUtils()
  const { data = [], isLoading } = trpc.athleteGroups.mine.useQuery(undefined, { retry: false })
  const [bevestig, setBevestig] = useState<string | null>(null)
  const leave = trpc.athleteGroups.leave.useMutation({
    onSuccess: () => {
      setBevestig(null)
      utils.athleteGroups.mine.invalidate()
      toast.success('Je staat niet meer in de groep')
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading || data.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <Kicker>Groepen</Kicker>
      <Tile>
        <div className="flex flex-col">
          {data.map((g, i) => (
            <div key={g.groupId} className="py-3 flex flex-col gap-2" style={{ borderTop: i === 0 ? 'none' : `1px solid ${P.line}` }}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{g.name}</p>
                  <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
                    {g.planName ? `In je kalender als "Onderdeel van ${g.planName}" · ` : ''}
                    door {g.ownerName} · sinds {fmt(g.addedAt)}
                  </p>
                </div>
                {bevestig !== g.groupId && (
                  <DarkButton variant="ghost" size="sm" onClick={() => setBevestig(g.groupId)}>
                    UIT DE GROEP
                  </DarkButton>
                )}
              </div>
              {bevestig === g.groupId && (
                <div className="flex flex-col gap-2 p-3" style={{ background: P.surfaceLow, borderRadius: 10 }}>
                  <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
                    Je stapt uit {g.name}. Trainingen die al in je kalender staan blijven staan; nieuwe groepstrainingen komen niet meer bij jou. {g.ownerName} krijgt hier een berichtje van.
                  </p>
                  <div className="flex gap-2">
                    <DarkButton variant="danger" size="sm" loading={leave.isPending} onClick={() => leave.mutate({ groupId: g.groupId })}>
                      JA, HAAL ME ERUIT
                    </DarkButton>
                    <DarkButton variant="ghost" size="sm" onClick={() => setBevestig(null)}>
                      ANNULEREN
                    </DarkButton>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Tile>
    </div>
  )
}
