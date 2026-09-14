'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarDays, Send, Settings2, Trash2, UserPlus, X } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { mondayKeyOf } from '@/lib/week-dates'
import {
  Kicker, Display, MetaLabel, Tile, DarkButton, DarkInput, DarkSelect, SkeletonList, P,
  DarkDialog, DarkDialogContent, DarkDialogHeader, DarkDialogTitle,
} from '@/components/dark-ui'
import { GroupSendDialog } from '@/components/week-planner/GroupSendDialog'

type Rol = 'OWNER' | 'VIEWER' | 'PLANNER' | 'MANAGER'
const ROL_LABEL: Record<Rol, string> = { OWNER: 'Eigenaar', VIEWER: 'Meekijken', PLANNER: 'Meeplannen', MANAGER: 'Beheren' }
const KIESBARE_ROLLEN: Array<Exclude<Rol, 'OWNER'>> = ['VIEWER', 'PLANNER', 'MANAGER']

function datum(d: Date | string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}
function dagsleutel(d: Date | string | null | undefined): string {
  return d ? mondayKeyOf(new Date(d)) : ''
}

/**
 * Groepspagina: kop met acties, tabblad Dashboard (deel 2) en tabblad Leden en
 * staf. Knoppen volgen de rol; de server dwingt dezelfde tabel af.
 */
export function GroupDetail({ groupId }: { groupId: string }) {
  const portal = usePortal()
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: groep, isLoading } = trpc.athleteGroups.get.useQuery({ id: groupId })
  const [tab, setTab] = useState<'dashboard' | 'leden'>('dashboard')
  const [sendOpen, setSendOpen] = useState(false)
  const [ledenOpen, setLedenOpen] = useState(false)
  const [stafOpen, setStafOpen] = useState(false)
  const [instellingenOpen, setInstellingenOpen] = useState(false)
  const [verwijderOpen, setVerwijderOpen] = useState(false)

  const ververs = () => Promise.all([utils.athleteGroups.get.invalidate({ id: groupId }), utils.athleteGroups.list.invalidate()])
  const fout = (e: unknown, terugval: string) => toast.error(e instanceof Error ? e.message : terugval)

  const removeMember = trpc.athleteGroups.removeMember.useMutation({ onSuccess: ververs, onError: e => fout(e, 'Verwijderen mislukt') })
  const setNote = trpc.athleteGroups.setMemberNote.useMutation({ onError: e => fout(e, 'Notitie opslaan mislukt') })
  const setStaffRole = trpc.athleteGroups.setStaffRole.useMutation({ onSuccess: ververs, onError: e => fout(e, 'Rol wijzigen mislukt') })
  const removeStaff = trpc.athleteGroups.removeStaff.useMutation({ onSuccess: ververs, onError: e => fout(e, 'Verwijderen mislukt') })
  const verwijder = trpc.athleteGroups.delete.useMutation({
    onSuccess: async () => { await utils.athleteGroups.list.invalidate(); toast.success('Groep verwijderd'); router.push(`${portal.base}/groups`) },
    onError: e => fout(e, 'Verwijderen mislukt'),
  })

  if (isLoading || !groep) return <SkeletonList count={3} />

  const rol = groep.role as Rol
  const magBeheren = rol === 'MANAGER' || rol === 'OWNER'
  const magPlannen = magBeheren || rol === 'PLANNER'
  const isEigenaar = rol === 'OWNER'
  const programma = groep.planName ?? groep.name

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Kicker>Groep</Kicker>
          <Display>{groep.name}</Display>
          <MetaLabel>
            {programma} · vanaf {datum(groep.startDate)}{groep.endDate ? ` tot ${datum(groep.endDate)}` : ''} · {groep.memberCount} {groep.memberCount === 1 ? 'atleet' : 'atleten'}
            {groep.lastSentAt ? ` · laatst verzonden ${datum(groep.lastSentAt)}` : ' · nog niet verzonden'}
          </MetaLabel>
          {groep.description && <p className="text-sm mt-1" style={{ color: P.inkMuted }}>{groep.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {magPlannen && (
            <DarkButton variant="secondary" href={`${portal.base}/week-planner?groupId=${groep.id}`}>
              <CalendarDays className="w-4 h-4 mr-1.5" /> Plannen
            </DarkButton>
          )}
          {magBeheren && (
            <DarkButton variant="primary" onClick={() => setSendOpen(true)}>
              <Send className="w-4 h-4 mr-1.5" /> Stuur naar iedereen
            </DarkButton>
          )}
          {magBeheren && (
            <DarkButton variant="ghost" onClick={() => setInstellingenOpen(true)} aria-label="Instellingen">
              <Settings2 className="w-4 h-4" />
            </DarkButton>
          )}
          {isEigenaar && (
            <DarkButton variant="ghost" onClick={() => setVerwijderOpen(true)} aria-label="Groep verwijderen">
              <Trash2 className="w-4 h-4" style={{ color: P.danger }} />
            </DarkButton>
          )}
        </div>
      </div>

      <div className="flex gap-1 rounded-full p-0.5 w-fit" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
        {([['dashboard', 'Dashboard'], ['leden', 'Leden en staf']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className="athletic-mono rounded-full px-3 py-1.5"
            style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 800, background: tab === k ? P.control : 'transparent', color: tab === k ? P.brand : P.inkMuted }}
          >
            {label.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? (
        <Tile>
          <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.6 }}>
            Het dashboard met de status van elke atleet komt in deel 2. Tot die tijd vind je de atleten onder Leden en staf.
          </p>
        </Tile>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Tile>
            <div className="flex items-center justify-between gap-2 mb-3">
              <MetaLabel>Leden</MetaLabel>
              {magBeheren && (
                <DarkButton variant="secondary" size="sm" onClick={() => setLedenOpen(true)}>
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Leden toevoegen
                </DarkButton>
              )}
            </div>
            {groep.members.length === 0 ? (
              <p className="text-sm" style={{ color: P.inkMuted }}>Nog geen leden. Voeg atleten toe die je begeleidt.</p>
            ) : (
              <div className="space-y-2">
                {groep.members.map(m => (
                  <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
                    <div className="min-w-0 flex-1">
                      <a href={`${portal.base}/${portal.base === '/coach' ? 'athletes' : 'patients'}/${m.patientId}`} className="text-sm font-semibold truncate block" style={{ color: P.ink }}>
                        {m.patient.name ?? m.patient.email}
                      </a>
                      <p className="athletic-mono" style={{ fontSize: 10, color: m.lastSentAt ? P.inkDim : P.brand }}>
                        {m.lastSentAt ? `LAATST VERZONDEN ${datum(m.lastSentAt).toUpperCase()}` : 'NOG NIETS ONTVANGEN'}
                      </p>
                    </div>
                    <DarkInput
                      defaultValue={m.note ?? ''}
                      placeholder="Notitie (alleen voor staf)"
                      aria-label={`Notitie over ${m.patient.name ?? m.patient.email}`}
                      className="w-56"
                      onBlur={e => { if ((e.target.value || '') !== (m.note ?? '')) setNote.mutate({ groupId, patientId: m.patientId, note: e.target.value || null }) }}
                    />
                    {magBeheren && (
                      <button type="button" onClick={() => removeMember.mutate({ groupId, patientId: m.patientId })} aria-label="Lid verwijderen" className="p-1" style={{ color: P.inkMuted }}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Tile>

          <Tile>
            <div className="flex items-center justify-between gap-2 mb-3">
              <MetaLabel>Staf</MetaLabel>
              {isEigenaar && (
                <DarkButton variant="secondary" size="sm" onClick={() => setStafOpen(true)}>
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Therapeut toevoegen
                </DarkButton>
              )}
            </div>
            <div className="space-y-2">
              {groep.staff.map(st => (
                <div key={st.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: P.ink }}>{st.user.name ?? st.user.email}</p>
                    <p className="text-xs truncate" style={{ color: P.inkMuted }}>{st.user.email}</p>
                  </div>
                  {st.role === 'OWNER' || !isEigenaar ? (
                    <span className="athletic-mono" style={{ fontSize: 10, color: P.inkMuted }}>{ROL_LABEL[st.role as Rol].toUpperCase()}</span>
                  ) : (
                    <>
                      <DarkSelect
                        value={st.role}
                        aria-label={`Rol van ${st.user.name ?? st.user.email}`}
                        onChange={e => setStaffRole.mutate({ groupId, userId: st.userId, role: e.target.value as Exclude<Rol, 'OWNER'> })}
                        style={{ padding: '4px 8px', fontSize: 12 }}
                      >
                        {KIESBARE_ROLLEN.map(r => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                      </DarkSelect>
                      <button type="button" onClick={() => removeStaff.mutate({ groupId, userId: st.userId })} aria-label="Staf verwijderen" className="p-1" style={{ color: P.inkMuted }}>
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: P.inkDim }}>
              Meekijken: dashboard en kalender lezen. Meeplannen: ook de kalender bewerken. Beheren: ook versturen en leden beheren.
            </p>
          </Tile>
        </div>
      )}

      {sendOpen && <GroupSendDialog groupId={groupId} open onClose={() => setSendOpen(false)} />}
      {ledenOpen && <LedenToevoegen groupId={groupId} huidige={groep.members.map(m => m.patientId)} onClose={() => { setLedenOpen(false); void ververs() }} />}
      {stafOpen && <StafToevoegen groupId={groupId} onClose={() => { setStafOpen(false); void ververs() }} />}
      {instellingenOpen && (
        <Instellingen
          groep={{ id: groep.id, name: groep.name, planName: groep.planName, description: groep.description, startDate: dagsleutel(groep.startDate), endDate: dagsleutel(groep.endDate) }}
          onClose={() => { setInstellingenOpen(false); void ververs() }}
        />
      )}

      <DarkDialog open={verwijderOpen} onOpenChange={o => { if (!o) setVerwijderOpen(false) }}>
        <DarkDialogContent aria-describedby={undefined} className="max-w-sm">
          <DarkDialogHeader><DarkDialogTitle>Groep verwijderen</DarkDialogTitle></DarkDialogHeader>
          <p className="text-sm" style={{ color: P.inkMuted }}>
            {groep.name} met {groep.memberCount} {groep.memberCount === 1 ? 'lid' : 'leden'} en de groepskalender wordt verwijderd. Trainingen die al bij atleten staan blijven staan.
          </p>
          <div className="flex gap-2 mt-3">
            <DarkButton variant="primary" className="flex-1" onClick={() => verwijder.mutate({ id: groupId })} disabled={verwijder.isPending}>Verwijderen</DarkButton>
            <DarkButton variant="ghost" onClick={() => setVerwijderOpen(false)}>Annuleren</DarkButton>
          </div>
        </DarkDialogContent>
      </DarkDialog>
    </div>
  )
}

function LedenToevoegen({ groupId, huidige, onClose }: { groupId: string; huidige: string[]; onClose: () => void }) {
  const { data: atleten = [] } = trpc.patients.list.useQuery()
  const add = trpc.athleteGroups.addMembers.useMutation()
  const [q, setQ] = useState('')
  const [keuze, setKeuze] = useState<Set<string>>(() => new Set())
  const kandidaten = useMemo(() => {
    const al = new Set(huidige)
    const needle = q.trim().toLowerCase()
    return atleten
      .filter(a => !al.has(a.id))
      .filter(a => !needle || (a.name ?? '').toLowerCase().includes(needle) || (a.email ?? '').toLowerCase().includes(needle))
  }, [atleten, huidige, q])

  async function toevoegen() {
    try {
      const r = await add.mutateAsync({ groupId, patientIds: [...keuze] })
      toast.success(`${r.added} ${r.added === 1 ? 'lid' : 'leden'} toegevoegd`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toevoegen mislukt')
    }
  }

  return (
    <DarkDialog open onOpenChange={o => { if (!o) onClose() }}>
      <DarkDialogContent aria-describedby={undefined} className="max-w-md">
        <DarkDialogHeader><DarkDialogTitle>Leden toevoegen</DarkDialogTitle></DarkDialogHeader>
        <div className="space-y-3">
          <DarkInput placeholder="Zoek op naam of e-mail" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <div className="max-h-72 overflow-y-auto space-y-1">
            {kandidaten.length === 0 && <p className="text-sm" style={{ color: P.inkMuted }}>Geen atleten gevonden die nog geen lid zijn.</p>}
            {kandidaten.map(a => (
              <label key={a.id} className="flex items-center gap-2 py-1 cursor-pointer">
                <input type="checkbox" className="accent-[var(--p-brand)]" checked={keuze.has(a.id)} onChange={() => setKeuze(s => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n })} />
                <span className="text-sm" style={{ color: P.ink }}>{a.name ?? a.email}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <DarkButton variant="primary" className="flex-1" onClick={toevoegen} disabled={keuze.size === 0 || add.isPending}>
              {keuze.size === 0 ? 'Kies atleten' : `${keuze.size} toevoegen`}
            </DarkButton>
            <DarkButton variant="ghost" onClick={onClose}>Annuleren</DarkButton>
          </div>
        </div>
      </DarkDialogContent>
    </DarkDialog>
  )
}

function StafToevoegen({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const add = trpc.athleteGroups.addStaff.useMutation()
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<Exclude<Rol, 'OWNER'>>('PLANNER')
  async function toevoegen() {
    try {
      await add.mutateAsync({ groupId, email: email.trim(), role: rol })
      toast.success('Toegevoegd aan de staf')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toevoegen mislukt')
    }
  }
  return (
    <DarkDialog open onOpenChange={o => { if (!o) onClose() }}>
      <DarkDialogContent aria-describedby={undefined} className="max-w-sm">
        <DarkDialogHeader><DarkDialogTitle>Therapeut toevoegen</DarkDialogTitle></DarkDialogHeader>
        <div className="space-y-3">
          <div>
            <MetaLabel>E-mailadres van het therapeutaccount</MetaLabel>
            <DarkInput type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="naam@praktijk.nl" autoFocus />
          </div>
          <div>
            <MetaLabel>Rol</MetaLabel>
            <DarkSelect value={rol} onChange={e => setRol(e.target.value as Exclude<Rol, 'OWNER'>)} aria-label="Rol">
              {KIESBARE_ROLLEN.map(r => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
            </DarkSelect>
          </div>
          <div className="flex gap-2">
            <DarkButton variant="primary" className="flex-1" onClick={toevoegen} disabled={!email.trim() || add.isPending}>Toevoegen</DarkButton>
            <DarkButton variant="ghost" onClick={onClose}>Annuleren</DarkButton>
          </div>
        </div>
      </DarkDialogContent>
    </DarkDialog>
  )
}

function Instellingen({ groep, onClose }: {
  groep: { id: string; name: string; planName: string | null; description: string | null; startDate: string; endDate: string }
  onClose: () => void
}) {
  const update = trpc.athleteGroups.update.useMutation()
  const [naam, setNaam] = useState(groep.name)
  const [programma, setProgramma] = useState(groep.planName ?? '')
  const [omschrijving, setOmschrijving] = useState(groep.description ?? '')
  const [start, setStart] = useState(groep.startDate)
  const [einde, setEinde] = useState(groep.endDate)
  async function opslaan() {
    try {
      await update.mutateAsync({
        id: groep.id,
        name: naam.trim() || groep.name,
        planName: programma.trim() || null,
        description: omschrijving.trim() || null,
        startDate: start || undefined,
        endDate: einde || null,
      })
      toast.success('Opgeslagen')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Opslaan mislukt')
    }
  }
  return (
    <DarkDialog open onOpenChange={o => { if (!o) onClose() }}>
      <DarkDialogContent aria-describedby={undefined} className="max-w-md">
        <DarkDialogHeader><DarkDialogTitle>Instellingen</DarkDialogTitle></DarkDialogHeader>
        <div className="space-y-3">
          <div><MetaLabel>Groepsnaam</MetaLabel><DarkInput value={naam} onChange={e => setNaam(e.target.value)} /></div>
          <div><MetaLabel>Programmanaam (wat de atleet ziet)</MetaLabel><DarkInput value={programma} onChange={e => setProgramma(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><MetaLabel>Start (week 1)</MetaLabel><DarkInput type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div><MetaLabel>Einde (optioneel)</MetaLabel><DarkInput type="date" value={einde} onChange={e => setEinde(e.target.value)} /></div>
          </div>
          <div><MetaLabel>Omschrijving</MetaLabel><DarkInput value={omschrijving} onChange={e => setOmschrijving(e.target.value)} /></div>
          <div className="flex gap-2">
            <DarkButton variant="primary" className="flex-1" onClick={opslaan} disabled={update.isPending}>Opslaan</DarkButton>
            <DarkButton variant="ghost" onClick={onClose}>Annuleren</DarkButton>
          </div>
        </div>
      </DarkDialogContent>
    </DarkDialog>
  )
}
