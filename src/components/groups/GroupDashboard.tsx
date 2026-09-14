'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { MetaLabel, Tile, DarkInput, SkeletonList, P } from '@/components/dark-ui'
import { OptionSwitch } from '@/components/week-planner/block-forms/fields'

const BAND_KLEUR: Record<string, string> = { GREEN: P.lime, AMBER: P.gold, RED: P.danger, LEARNING: P.inkMuted }
const BAND_LABEL: Record<string, string> = { GREEN: 'Fris', AMBER: 'Matig', RED: 'Rood', LEARNING: 'Leert nog' }
const VORM_KLEUR: Record<string, string> = { overreaching: P.danger, productief: P.gold, neutraal: P.inkMuted, fris: P.lime, ontraind: P.inkMuted }
const FEEL: Record<number, string> = { 1: 'slecht', 2: 'matig', 3: 'oké', 4: 'goed', 5: 'top' }

function kort(at: string): string {
  return new Date(at).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

function Pil({ kleur, tekst }: { kleur: string; tekst: string }) {
  return (
    <span className="athletic-mono inline-flex items-center gap-1.5 rounded px-1.5 py-0.5" style={{ fontSize: 10, color: kleur, border: `1px solid ${kleur}55`, background: `${kleur}14` }}>
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: kleur }} />
      {tekst.toUpperCase()}
    </span>
  )
}

/**
 * Status van elke atleet in één oogopslag: geblesseerd, fris, vorm, deze
 * week, laatste en volgende training, notitie. Wie aandacht vraagt staat
 * bovenaan; de filter laat alleen die rijen zien.
 */
export function GroupDashboard({ groupId }: { groupId: string }) {
  const portal = usePortal()
  const { data, isLoading } = trpc.athleteGroups.dashboard.useQuery({ groupId }, { staleTime: 30_000 })
  const setNote = trpc.athleteGroups.setMemberNote.useMutation({ onError: e => toast.error(e.message) })
  const [alleenAandacht, setAlleenAandacht] = useState(false)

  if (isLoading || !data) return <SkeletonList count={3} />
  const rijen = alleenAandacht ? data.rijen.filter(r => r.aandacht) : data.rijen
  const atleetPad = portal.base === '/coach' ? 'athletes' : 'patients'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {([['Aandacht nodig', data.tellers.aandacht, P.brand], ['Geblesseerd', data.tellers.geblesseerd, P.danger], ['Geen wearable', data.tellers.geenWearable, P.inkMuted]] as const).map(([label, n, kleur]) => (
          <div key={label} className="rounded-lg px-3 py-2" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
            <p className="athletic-mono" style={{ fontSize: 9, letterSpacing: '0.12em', color: P.inkMuted }}>{label.toUpperCase()}</p>
            <p className="athletic-mono" style={{ fontSize: 20, fontWeight: 900, color: n > 0 ? kleur : P.ink }}>{n}</p>
          </div>
        ))}
        <div className="ml-auto">
          <OptionSwitch checked={alleenAandacht} onCheckedChange={setAlleenAandacht} label="Alleen wie aandacht vraagt" />
        </div>
      </div>

      {rijen.length === 0 ? (
        <Tile><p className="text-sm" style={{ color: P.inkMuted }}>{data.rijen.length === 0 ? 'Nog geen leden in deze groep.' : 'Niemand vraagt op dit moment aandacht.'}</p></Tile>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${P.line}` }}>
          <table className="w-full text-sm" style={{ minWidth: 980 }}>
            <thead>
              <tr style={{ background: P.surfaceLow }}>
                {['Atleet', 'Status', 'Fris', 'Vorm', 'Deze week', 'Laatste training', 'Volgende', 'Notitie'].map(h => (
                  <th key={h} className="text-left px-3 py-2 athletic-mono" style={{ fontSize: 9, letterSpacing: '0.12em', color: P.inkMuted, fontWeight: 800 }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rijen.map(r => (
                <tr key={r.patientId} style={{ borderTop: `1px solid ${P.line}`, background: r.aandacht ? 'rgba(232,122,85,0.05)' : 'transparent' }}>
                  <td className="px-3 py-2 align-top">
                    <a href={`${portal.base}/${atleetPad}/${r.patientId}`} className="font-semibold" style={{ color: P.ink }}>{r.naam}</a>
                    {r.aandachtRedenen.length > 0 && (
                      <p className="text-[11px] mt-0.5" style={{ color: P.brand }}>{r.aandachtRedenen.join(' · ')}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Pil kleur={r.status === 'geblesseerd' ? P.danger : P.lime} tekst={r.status === 'geblesseerd' ? 'Geblesseerd' : 'Fit'} />
                    {r.statusDetail && <p className="text-[11px] mt-1" style={{ color: P.inkMuted }}>{r.statusDetail}</p>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.readiness ? (
                      <>
                        <Pil kleur={BAND_KLEUR[r.readiness.band]} tekst={BAND_LABEL[r.readiness.band]} />
                        {r.readiness.score != null && <p className="athletic-mono text-[11px] mt-1" style={{ color: P.inkMuted }}>{r.readiness.score}/100</p>}
                      </>
                    ) : (
                      <span className="text-[11px]" style={{ color: P.inkDim }}>Geen wearable</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.vorm ? (
                      <>
                        <span className="athletic-mono text-xs font-bold" style={{ color: r.vorm.calibrated ? VORM_KLEUR[r.vorm.statusKey] : P.inkMuted }}>
                          {r.vorm.calibrated ? r.vorm.statusLabel : 'IJkt nog'}
                        </span>
                        <p className="athletic-mono text-[11px] mt-1" style={{ color: P.inkMuted }}>vorm {r.vorm.form > 0 ? '+' : ''}{r.vorm.form} · week {r.vorm.weekLoad}</p>
                      </>
                    ) : (
                      <span className="text-[11px]" style={{ color: P.inkDim }}>Nog niets gelogd</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top athletic-mono" style={{ color: r.gepland > 0 && r.gedaan === 0 ? P.gold : P.ink }}>
                    {r.gedaan} van {r.gepland}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.laatste ? (
                      <>
                        {r.laatste.sessionId ? (
                          <a href={`${portal.base}/${atleetPad}/${r.patientId}/sessions/${r.laatste.sessionId}`} style={{ color: P.ink }}>{kort(r.laatste.at)}</a>
                        ) : (
                          <span style={{ color: P.ink }}>{kort(r.laatste.at)}</span>
                        )}
                        <p className="athletic-mono text-[11px] mt-1" style={{ color: P.inkMuted }}>
                          {r.laatste.soort === 'cardio' ? 'cardio' : 'kracht'}{r.laatste.rpe != null ? ` · RPE ${r.laatste.rpe}` : ''}{r.laatste.feel != null ? ` · ${FEEL[r.laatste.feel] ?? r.laatste.feel}` : ''}
                        </p>
                      </>
                    ) : (
                      <span className="text-[11px]" style={{ color: P.inkDim }}>Nog geen sessie</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.volgende ? (
                      <>
                        <span style={{ color: P.ink }}>{kort(`${r.volgende.at}T12:00:00`)}</span>
                        <p className="text-[11px] mt-1 truncate max-w-[160px]" style={{ color: P.inkMuted }}>{r.volgende.name}</p>
                      </>
                    ) : (
                      <span className="text-[11px]" style={{ color: P.inkDim }}>Niets gepland</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <DarkInput
                      defaultValue={r.notitie ?? ''}
                      placeholder="Notitie"
                      aria-label={`Notitie over ${r.naam}`}
                      className="w-44"
                      style={{ padding: '6px 8px', fontSize: 12 }}
                      onBlur={e => { if ((e.target.value || '') !== (r.notitie ?? '')) setNote.mutate({ groupId, patientId: r.patientId, note: e.target.value || null }) }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MetaLabel>Fris komt uit de wearable (HRV, rusthartslag, slaap, welzijn); vorm uit de belastingscurve; deze week telt gelogde sessies tegen geplande trainingen.</MetaLabel>
    </div>
  )
}
