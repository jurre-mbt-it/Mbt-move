'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UsersRound } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { mondayKeyOf } from '@/lib/week-dates'
import {
  Kicker, Display, MetaLabel, Tile, DarkButton, DarkInput, SkeletonList, P,
  DarkDialog, DarkDialogContent, DarkDialogHeader, DarkDialogTitle,
} from '@/components/dark-ui'

const ROL_LABEL: Record<string, string> = { OWNER: 'Eigenaar', VIEWER: 'Meekijken', PLANNER: 'Meeplannen', MANAGER: 'Beheren' }

function datum(d: Date | string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Overzicht van atletengroepen: verzendlijst plus één gedeelde kalender.
 * Zie docs/superpowers/specs/2026-09-14-atletengroepen-design.md.
 */
export function GroupsOverview() {
  const portal = usePortal()
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: me } = trpc.auth.getMe.useQuery()
  const { data: groepen, isLoading } = trpc.athleteGroups.list.useQuery()
  const maak = trpc.athleteGroups.create.useMutation()
  const [q, setQ] = useState('')
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [naam, setNaam] = useState('')
  const [programma, setProgramma] = useState('')
  const [start, setStart] = useState(() => mondayKeyOf(new Date()))
  const [einde, setEinde] = useState('')
  const [omschrijving, setOmschrijving] = useState('')

  const magAanmaken = me?.role === 'COACH' || me?.role === 'ADMIN'
  const lijst = useMemo(() => {
    const alles = groepen ?? []
    const needle = q.trim().toLowerCase()
    if (!needle) return alles
    return alles.filter(g => g.name.toLowerCase().includes(needle) || (g.planName ?? '').toLowerCase().includes(needle))
  }, [groepen, q])

  async function aanmaken() {
    if (!naam.trim()) { toast.error('Geef de groep een naam'); return }
    try {
      const r = await maak.mutateAsync({
        name: naam.trim(),
        planName: programma.trim() || undefined,
        description: omschrijving.trim() || undefined,
        startDate: start,
        endDate: einde || null,
      })
      await utils.athleteGroups.list.invalidate()
      setNieuwOpen(false)
      router.push(`${portal.base}/groups/${r.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aanmaken mislukt')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker>Groepen</Kicker>
          <Display>Atletengroepen</Display>
          <MetaLabel>Eén weekindeling voor een hele groep, met één knop naar iedereen</MetaLabel>
        </div>
        <div className="flex flex-wrap gap-2">
          {magAanmaken && (
            <DarkButton variant="primary" onClick={() => setNieuwOpen(true)}>Nieuwe groep</DarkButton>
          )}
          <DarkButton variant="secondary" href={`${portal.base}/week-planner`}>Naar de weekplanner</DarkButton>
        </div>
      </div>

      <DarkInput placeholder="Zoek op groep of programma" value={q} onChange={e => setQ(e.target.value)} />

      {isLoading ? (
        <SkeletonList count={3} />
      ) : lijst.length === 0 ? (
        <Tile>
          <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.6 }}>
            {groepen?.length
              ? 'Geen groep gevonden met die zoekterm.'
              : magAanmaken
                ? 'Je hebt nog geen groepen. Maak er een aan, voeg atleten toe en plan de weken in de weekplanner.'
                : 'Je bent nog aan geen enkele groep toegevoegd. De coach van de groep kan je toevoegen.'}
          </p>
        </Tile>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lijst.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => router.push(`${portal.base}/groups/${g.id}`)}
              className="text-left mbt-btn-hover"
            >
              <Tile>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-2.5">
                    <span className="flex shrink-0 mt-0.5" style={{ color: P.brand }}><UsersRound className="w-4 h-4" /></span>
                    <div className="min-w-0">
                      <p style={{ color: P.ink, fontWeight: 800, fontSize: 15 }}>{g.name}</p>
                      {g.planName ? <MetaLabel>{g.planName}</MetaLabel> : null}
                    </div>
                  </div>
                  <span className="athletic-mono shrink-0 rounded px-2 py-1" style={{ background: 'rgba(212,232,230,0.06)', color: P.inkMuted, fontSize: 10 }}>
                    {ROL_LABEL[g.role] ?? g.role}
                  </span>
                </div>
                <p className="athletic-mono mt-3" style={{ color: P.inkDim, fontSize: 11 }}>
                  {g.memberCount} {g.memberCount === 1 ? 'atleet' : 'atleten'} · {g.weekCount} {g.weekCount === 1 ? 'week' : 'weken'} · vanaf {datum(g.startDate)}
                  {g.endDate ? ` tot ${datum(g.endDate)}` : ''}
                </p>
                <p className="athletic-mono mt-1" style={{ color: g.lastSentAt ? P.inkDim : P.brand, fontSize: 11 }}>
                  {g.lastSentAt ? `Laatst verzonden ${datum(g.lastSentAt)}` : 'Nog niet verzonden'}
                </p>
              </Tile>
            </button>
          ))}
        </div>
      )}

      <DarkDialog open={nieuwOpen} onOpenChange={o => { if (!o) setNieuwOpen(false) }}>
        <DarkDialogContent aria-describedby={undefined} className="max-w-md">
          <DarkDialogHeader><DarkDialogTitle>Nieuwe groep</DarkDialogTitle></DarkDialogHeader>
          <div className="space-y-3">
            <div>
              <MetaLabel>Groepsnaam</MetaLabel>
              <DarkInput value={naam} onChange={e => setNaam(e.target.value)} placeholder="Selectie" autoFocus />
            </div>
            <div>
              <MetaLabel>Programmanaam (wat de atleet ziet)</MetaLabel>
              <DarkInput value={programma} onChange={e => setProgramma(e.target.value)} placeholder="Periodisering 2026/27" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <MetaLabel>Start (week 1)</MetaLabel>
                <DarkInput type="date" value={start} onChange={e => setStart(e.target.value)} />
              </div>
              <div>
                <MetaLabel>Einde (optioneel)</MetaLabel>
                <DarkInput type="date" value={einde} onChange={e => setEinde(e.target.value)} />
              </div>
            </div>
            <div>
              <MetaLabel>Omschrijving (optioneel)</MetaLabel>
              <DarkInput value={omschrijving} onChange={e => setOmschrijving(e.target.value)} placeholder="Voor wie, waar en wanneer" />
            </div>
            <p className="text-xs" style={{ color: P.inkMuted }}>De startdatum wordt afgerond naar de maandag van die week; dat is week 1 voor iedereen.</p>
            <div className="flex gap-2">
              <DarkButton variant="primary" className="flex-1" onClick={aanmaken} disabled={maak.isPending}>
                {maak.isPending ? 'Bezig' : 'Aanmaken'}
              </DarkButton>
              <DarkButton variant="ghost" onClick={() => setNieuwOpen(false)}>Annuleren</DarkButton>
            </div>
          </div>
        </DarkDialogContent>
      </DarkDialog>
    </div>
  )
}
