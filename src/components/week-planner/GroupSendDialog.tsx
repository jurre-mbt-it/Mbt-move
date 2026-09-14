'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { DarkDialog, DarkDialogContent, DarkDialogHeader, DarkDialogTitle, DarkButton, MetaLabel, P } from '@/components/dark-ui'
import { OptionSwitch } from '@/components/week-planner/block-forms/fields'
import { mondayKeyOf } from '@/lib/week-dates'

/**
 * "Stuur naar iedereen": kies weken (standaard vanaf de huidige week) en leden
 * (standaard iedereen), zie wat er gaat gebeuren, verstuur. De server bepaalt
 * wat er per lid vervangen wordt; zie lib/group-send.ts.
 */
export function GroupSendDialog({ groupId, open, onClose }: { groupId: string; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils()
  const { data: weken = [] } = trpc.athleteGroups.weeks.useQuery({ groupId }, { enabled: open })
  const { data: groep } = trpc.athleteGroups.get.useQuery({ id: groupId }, { enabled: open })
  const send = trpc.athleteGroups.send.useMutation()

  const dezeMaandag = mondayKeyOf(new Date())
  const [weekIds, setWeekIds] = useState<Set<string>>(new Set())
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())
  const [oudeWekenOpen, setOudeWekenOpen] = useState(false)

  // Standaardkeuze zodra de data er is: weken vanaf nu, alle leden.
  useEffect(() => {
    if (!open) return
    setWeekIds(new Set(weken.filter(w => w.monday >= dezeMaandag).map(w => w.id)))
  }, [open, weken, dezeMaandag])
  useEffect(() => {
    if (!open || !groep) return
    setMemberIds(new Set(groep.members.map(m => m.patientId)))
  }, [open, groep])

  const gekozenWeken = weken.filter(w => weekIds.has(w.id))
  const trainingen = gekozenWeken.reduce((n, w) => n + w.itemCount, 0)
  const oudeWeken = useMemo(() => weken.filter(w => w.monday < dezeMaandag), [weken, dezeMaandag])
  const nieuweWeken = useMemo(() => weken.filter(w => w.monday >= dezeMaandag), [weken, dezeMaandag])

  const wissel = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n }

  async function verstuur() {
    try {
      const r = await send.mutateAsync({ groupId, weekIds: [...weekIds], memberIds: [...memberIds] })
      toast.success(`${r.items} trainingen naar ${r.members} atleten gestuurd (${r.weeks} weken)`)
      if (r.skipped.length) toast.warning(`Overgeslagen: ${r.skipped.join(', ')}`)
      await Promise.all([utils.athleteGroups.get.invalidate({ id: groupId }), utils.athleteGroups.list.invalidate()])
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Versturen mislukt')
    }
  }

  const WeekRij = ({ w }: { w: (typeof weken)[number] }) => (
    <label className="flex items-center gap-2 py-1 cursor-pointer">
      <input type="checkbox" className="accent-[var(--p-brand)]" checked={weekIds.has(w.id)} onChange={() => setWeekIds(s => wissel(s, w.id))} />
      <span className="text-sm flex-1" style={{ color: P.ink }}>Week {w.weekNumber} · vanaf {w.monday}</span>
      <span className="athletic-mono" style={{ fontSize: 10, color: w.itemCount === 0 ? P.gold : P.inkMuted }}>
        {w.itemCount === 0 ? '0 TRAININGEN' : `${w.itemCount} TRAININGEN`}
      </span>
    </label>
  )

  return (
    <DarkDialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DarkDialogContent aria-describedby={undefined} className="max-w-lg">
        <DarkDialogHeader><DarkDialogTitle>Stuur naar iedereen</DarkDialogTitle></DarkDialogHeader>
        <div className="space-y-4">
          <div>
            <MetaLabel>Weken</MetaLabel>
            {nieuweWeken.length === 0 && <p className="text-sm mt-1" style={{ color: P.inkMuted }}>Er staan nog geen weken vanaf vandaag in de groepskalender.</p>}
            {nieuweWeken.map(w => <WeekRij key={w.id} w={w} />)}
            {oudeWeken.length > 0 && (
              <div className="mt-2">
                <OptionSwitch checked={oudeWekenOpen} onCheckedChange={setOudeWekenOpen} label="Ook oudere weken tonen" hint="Dagen vóór vandaag blijven bij de atleet altijd staan." />
                {oudeWekenOpen && oudeWeken.map(w => <WeekRij key={w.id} w={w} />)}
              </div>
            )}
          </div>
          <div>
            <MetaLabel>Leden</MetaLabel>
            {(groep?.members ?? []).map(m => (
              <label key={m.patientId} className="flex items-center gap-2 py-1 cursor-pointer">
                <input type="checkbox" className="accent-[var(--p-brand)]" checked={memberIds.has(m.patientId)} onChange={() => setMemberIds(s => wissel(s, m.patientId))} />
                <span className="text-sm flex-1" style={{ color: P.ink }}>{m.patient.name ?? m.patient.email}</span>
                {!m.lastSentAt && <span className="athletic-mono" style={{ fontSize: 10, color: P.brand }}>NOG NIETS ONTVANGEN</span>}
              </label>
            ))}
          </div>
          <div className="rounded-lg p-3" style={{ background: 'rgba(232,122,85,0.08)', border: '1px solid rgba(232,122,85,0.35)' }}>
            <p className="text-sm font-semibold" style={{ color: P.ink }}>
              {gekozenWeken.length} {gekozenWeken.length === 1 ? 'week' : 'weken'}, {memberIds.size} {memberIds.size === 1 ? 'atleet' : 'atleten'}, {trainingen * memberIds.size} trainingen
            </p>
            <p className="text-xs mt-1" style={{ color: P.inkMuted }}>
              In deze weken worden de trainingen van deze groep bij de gekozen atleten vervangen. Eigen trainingen, andere programma&apos;s, dagen vóór vandaag en gelogde sessies blijven staan.
            </p>
          </div>
          <div className="flex gap-2">
            <DarkButton variant="primary" className="flex-1" onClick={verstuur} disabled={send.isPending || weekIds.size === 0 || memberIds.size === 0}>
              {send.isPending ? 'Bezig met versturen' : 'Versturen'}
            </DarkButton>
            <DarkButton variant="ghost" onClick={onClose} disabled={send.isPending}>Annuleren</DarkButton>
          </div>
        </div>
      </DarkDialogContent>
    </DarkDialog>
  )
}
