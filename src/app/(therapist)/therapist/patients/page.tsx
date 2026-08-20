'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { toast } from 'sonner'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogDescription as DialogDescription,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  Display,
  Kicker,
  MetaLabel,
  P,
  SkeletonList,
  Tile,
} from '@/components/dark-ui'
import { CaseloadTable, type CaseloadRow } from '@/components/patients/CaseloadTable'


/** Compacte regel-actie: leest als een link, gedraagt zich als een knop. */
function RowAction({ label, tint, onClick, onHover }: {
  label: string
  tint: string
  onClick: () => void
  onHover?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onHover}
      onFocus={onHover}
      className="athletic-mono athletic-tap rounded px-2 py-1 whitespace-nowrap"
      style={{
        fontSize: 9.5,
        color: tint,
        border: `1px solid color-mix(in srgb, ${tint} 30%, transparent)`,
        background: 'transparent',
      }}
    >
      {label}
    </button>
  )
}

type QuickFilter = 'all' | 'active' | 'low-compliance'
type RoleFilter = 'all' | 'PATIENT' | 'ATHLETE'
/**
 * Welke kant van het archief je ziet. Dit is de BEHANDELstatus en staat los van
 * de quickfilters hieronder, die over de programmastatus gaan.
 */
type ListView = 'behandeling' | 'archief'

export default function PatientsPage() {
  return (
    <Suspense fallback={null}>
      <PatientsPageInner />
    </Suspense>
  )
}

function PatientsPageInner() {
  const router = useRouter()
  const portal = usePortal()
  const searchParams = useSearchParams()
  const initialFilter = (searchParams.get('filter') as QuickFilter | null) ?? 'all'
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(initialFilter)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [view, setView] = useState<ListView>('behandeling')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteBirthYear, setInviteBirthYear] = useState('') // YYYY
  const [inviteRole, setInviteRole] = useState<'PATIENT' | 'ATHLETE'>('PATIENT')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteResult, setInviteResult] = useState<{
    url: string
    expiresAt: Date
    patientUserId: string | null
  } | null>(null)

  const archief = view === 'archief'
  // Zonder input voor de werklijst, zodat deze query dezelfde cache-sleutel
  // houdt als de andere schermen die `patients.list()` kaal aanroepen. De
  // server defaultt zelf op 'active'.
  const { data: patients = [], isLoading } = trpc.patients.list.useQuery(
    archief ? { include: 'archived' } : undefined,
  )

  // Belasting, pijn en laatste activiteit komen uit een aparte gebatchte query,
  // zodat de pickers en de weekplanner die `patients.list` ook gebruiken dat
  // rekenwerk niet dragen. De weekgrens gaat vanaf de client mee zodat de
  // server geen tijdzone-aannames doet.
  const weekStart = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return d.toISOString()
  }, [])
  // Alleen voor de werklijst. In het archief staan geen signaal-kolommen, dus
  // dat rekenwerk hoeft daar niet te draaien.
  const { data: caseload = [] } = trpc.patients.caseload.useQuery(
    { weekStart, weeks: 6 },
    { staleTime: 60_000, enabled: !archief },
  )

  const utils = trpc.useUtils()
  const createInvite = trpc.invite.create.useMutation()

  function resetInviteForm() {
    setInviteName('')
    setInviteEmail('')
    setInviteBirthYear('')
    setInviteRole('PATIENT')
    setInviteResult(null)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    const yearNum = Number(inviteBirthYear)
    const currentYear = new Date().getFullYear()
    if (!yearNum || yearNum < 1900 || yearNum > currentYear) {
      toast.error('Geboortejaar is verplicht (vier cijfers).')
      return
    }
    setInviteLoading(true)
    try {
      // Stuur als YYYY-01-01 — de server checkt alleen het jaartal bij login.
      const res = await createInvite.mutateAsync({
        email: inviteEmail,
        name: inviteName,
        dateOfBirth: `${yearNum}-01-01`,
        role: inviteRole,
      })
      setInviteResult({
        url: res.instructionUrl,
        expiresAt: new Date(res.expiresAt),
        patientUserId: res.patientUserId,
      })
      toast.success('Invite aangemaakt, deel de code-URL met je patiënt.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Er ging iets mis')
    } finally {
      setInviteLoading(false)
    }
  }

  const activeCount = patients.filter(p => p.programStatus === 'ACTIVE').length
  const lowComplianceCount = patients.filter(p => p.complianceLow).length
  const patientCount = patients.filter(p => p.role === 'PATIENT').length
  const athleteCount = patients.filter(p => p.role === 'ATHLETE').length

  const filtered = patients
    .filter(p => {
      // De quickfilters gaan over het PROGRAMMA. In het archief zeggen ze niets
      // meer, en ze staan daar ook niet in beeld, dus ze mogen daar niet stil
      // meefilteren.
      if (archief) return true
      if (quickFilter === 'active') return p.programStatus === 'ACTIVE'
      if (quickFilter === 'low-compliance') return p.complianceLow
      return true
    })
    .filter(p => roleFilter === 'all' || p.role === roleFilter)
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
    )

  /**
   * De lijst samenstellen en op aandacht sorteren. Vier dingen vragen aandacht:
   * pijn die is opgelopen, een weeksprong boven de 30%, zeven dagen of langer
   * niets gelogd, en lage therapietrouw. Wie daaraan voldoet staat bovenaan,
   * de rest op alfabet, zo is de bovenkant van het scherm je werklijst.
   *
   * In het archief is er niets te triëren. Daar staat de laatst afgesloten
   * behandeling bovenaan, want dat is degene die je waarschijnlijk zoekt.
   */
  const rows: CaseloadRow[] = useMemo(() => {
    const byId = new Map(caseload.map(c => [c.patientId, c]))
    const DAY = 24 * 60 * 60 * 1000
    return filtered
      .map(p => {
        const c = byId.get(p.id)
        const last = c?.lastActivityAt ? new Date(c.lastActivityAt) : null
        const silentDays = last
          ? Math.max(0, Math.floor((Date.now() - last.getTime()) / DAY))
          : null
        const attention =
          c?.pain?.trend === 'up' ||
          (c?.weekChangePct != null && c.weekChangePct > 30) ||
          (silentDays !== null && silentDays >= 7) ||
          p.complianceLow
        return {
          id: p.id,
          name: p.name,
          avatarInitials: p.avatarInitials,
          programId: p.programId,
          programName: p.programName,
          programStatus: p.programStatus,
          weeksTotal: p.weeksTotal,
          startDate: p.startDate,
          compliancePercent: p.compliancePercent,
          complianceLow: p.complianceLow,
          series: c?.series ?? [],
          weekLoad: c?.weekLoad ?? 0,
          weekChangePct: c?.weekChangePct ?? null,
          pain: c?.pain ?? null,
          lastActivityAt: c?.lastActivityAt ?? null,
          silentDays,
          attention,
          dischargedAt: p.dischargedAt,
          dischargeReason: p.dischargeReason,
        }
      })
      .sort((a, b) => {
        if (archief) {
          const ta = a.dischargedAt ? new Date(a.dischargedAt).getTime() : 0
          const tb = b.dischargedAt ? new Date(b.dischargedAt).getTime() : 0
          return tb - ta || a.name.localeCompare(b.name, 'nl')
        }
        return a.attention === b.attention
          ? a.name.localeCompare(b.name, 'nl')
          : a.attention ? -1 : 1
      })
  }, [filtered, caseload, archief])

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <Kicker>Overzicht</Kicker>
            <Display size="md">PATIËNTEN</Display>
            <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
              Beheer en monitor je patiënten
            </MetaLabel>
          </div>
          <DarkButton variant="primary" onClick={() => setInviteOpen(true)}>
            + Uitnodigen
          </DarkButton>
        </div>

        {/* Behandelstatus: in behandeling of afgesloten. Staat bovenaan en apart
            van de quickfilters eronder, want dit is een andere vraag: die
            filters kijken naar het programma, deze schakelaar naar de
            behandeling. */}
        <div className="flex gap-2">
          {([
            { value: 'behandeling', label: 'In behandeling' },
            { value: 'archief', label: 'Archief' },
          ] as const).map(opt => {
            const actief = view === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setView(opt.value)}
                className="athletic-tap athletic-mono px-3 py-1.5 rounded-lg text-xs transition-colors"
                style={actief
                  ? { border: `1.5px solid ${P.brand}`, background: P.brand + '1f', color: P.brand, fontWeight: 800, letterSpacing: '0.1em' }
                  : { border: `1.5px solid ${P.lineStrong}`, color: P.inkMuted, background: 'transparent', fontWeight: 700, letterSpacing: '0.1em' }
                }
              >
                {opt.label.toUpperCase()}
              </button>
            )
          })}
        </div>

        {archief && (
          <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.6 }}>
            Deze {portal.personLabelPlural} zijn niet meer in behandeling bij jou. Hun dossier is
            bewaard gebleven. Open iemand en kies &ldquo;Weer in behandeling&rdquo; om verder te gaan.
          </p>
        )}

        {/* Quick stats. Alleen in de werklijst: ze tellen programmastatus en
            therapietrouw, en dat zegt niets over een afgesloten dossier. */}
        {!archief && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <QuickStat
              value={patients.length}
              label="Totaal"
              tint={P.ice}
              active={quickFilter === 'all'}
              onClick={() => setQuickFilter('all')}
            />
            {/* "Actief" ging over het programma, niet over de behandeling. Nu er
                een archief naast staat, liepen die twee betekenissen door
                elkaar. De waarde blijft 'active'; alleen het woord verandert. */}
            <QuickStat
              value={activeCount}
              label="Met lopend schema"
              tint={P.lime}
              active={quickFilter === 'active'}
              onClick={() => setQuickFilter(quickFilter === 'active' ? 'all' : 'active')}
            />
            <QuickStat
              value={lowComplianceCount}
              label="Lage compliance"
              tint={P.danger}
              active={quickFilter === 'low-compliance'}
              onClick={() => setQuickFilter(quickFilter === 'low-compliance' ? 'all' : 'low-compliance')}
            />
          </div>
        )}

        {/* Role filter pills */}
        <div className="flex gap-2">
          {([
            { value: 'all', label: `Alle (${patients.length})`, color: P.ice },
            { value: 'PATIENT', label: `Patiënten (${patientCount})`, color: P.lime },
            { value: 'ATHLETE', label: `Atleten (${athleteCount})`, color: P.gold },
          ] as const).map(opt => {
            const active = roleFilter === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRoleFilter(opt.value)}
                className="athletic-tap athletic-mono px-3 py-1.5 rounded-full text-xs transition-colors"
                style={active
                  ? { border: `1.5px solid ${opt.color}`, background: opt.color + '15', color: opt.color, fontWeight: 800, letterSpacing: '0.06em' }
                  : { border: `1.5px solid ${P.lineStrong}`, color: P.inkMuted, background: 'transparent', fontWeight: 700, letterSpacing: '0.06em' }
                }
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <DarkInput
          placeholder="Zoek patiënt..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Loading state — skeleton in de vorm van de patiëntenlijst */}
        {isLoading && <SkeletonList count={6} />}

        {/* Caseload — één regel per sporter, gesorteerd op wie aandacht vraagt */}
        {/* Bewust een klein tekstknopje per regel en geen gevulde knop: in een
            lijst van veertien regels is een oranje vlak per rij het zwaarste
            element op het scherm, en dan leidt de knop in plaats van de
            gegevens. De hele regel is al klikbaar naar het dossier. */}
        {!isLoading && rows.length > 0 && (
          <CaseloadTable
            rows={rows}
            mode={archief ? 'archief' : 'werklijst'}
            onOpen={id => router.push(`${portal.patients}/${id}`)}
            onPrefetch={id => {
              router.prefetch(`${portal.patients}/${id}`)
              utils.patients.get.prefetch({ id })
            }}
            // Geen programma-knop in het archief: een nieuw schema beginnen bij
            // iemand die je hebt afgesloten hoort via het dossier te lopen,
            // waar de knop om hem terug te halen staat.
            renderAction={archief ? undefined : row => (
              row.programId ? (
                <RowAction
                  label="Programma"
                  tint={P.inkMuted}
                  onClick={() => router.push(`${portal.base}/programs/${row.programId}/edit`)}
                  onHover={() => {
                    router.prefetch(`${portal.base}/programs/${row.programId}/edit`)
                    if (row.programId) utils.programs.get.prefetch({ id: row.programId })
                  }}
                />
              ) : (
                <RowAction
                  label="+ Programma"
                  tint={P.brand}
                  onClick={() => router.push(`${portal.base}/programs/new?patientId=${row.id}`)}
                />
              )
            )}
          />
        )}

        {!isLoading && rows.length === 0 && (
          <Tile>
            <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
              <p style={{ color: P.inkMuted, fontSize: 13 }}>
                {archief
                  ? `Je hebt nog geen ${portal.personLabelPlural} op inactief gezet.`
                  : 'Geen patiënten gevonden'}
              </p>
              {!archief && (
                <DarkButton variant="secondary" size="sm" onClick={() => setInviteOpen(true)}>
                  + Patiënt uitnodigen
                </DarkButton>
              )}
            </div>
          </Tile>
        )}

        {/* Invite modal */}
        <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) resetInviteForm() }}>
          <DialogContent
            style={{
              borderRadius: '16px',
              background: P.surface,
              color: P.ink,
              border: `1px solid ${P.lineStrong}`,
            }}
          >
            <DialogHeader>
              <DialogTitle style={{ color: P.ink }}>Patiënt uitnodigen</DialogTitle>
              <DialogDescription style={{ color: P.inkMuted }}>
                Patiënt logt in met e-mail + geboortejaar + 6-cijfer code.
              </DialogDescription>
            </DialogHeader>

            {inviteResult ? (
              <div className="space-y-4 mt-2">
                <div
                  className="rounded-lg p-4 space-y-3"
                  style={{ border: `1px solid ${P.lime}`, background: 'rgba(232,122,85,0.08)' }}
                >
                  <div>
                    <MetaLabel style={{ color: P.lime }}>INVITE AANGEMAAKT</MetaLabel>
                    <p style={{ color: P.ink, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                      Deel deze URL met <strong>{inviteEmail}</strong>. Bij openen ziet de patiënt het code-scherm.
                      Supabase stuurt de 6-cijfer code vanzelf zodra de patiënt z&apos;n geboortejaar invult.
                    </p>
                  </div>
                  <div
                    className="rounded-md p-2 flex items-center gap-2"
                    style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
                  >
                    <code
                      className="athletic-mono flex-1 truncate"
                      style={{ fontSize: 11, color: P.ink, letterSpacing: '0.02em' }}
                    >
                      {inviteResult.url}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteResult.url)
                        toast.success('Gekopieerd')
                      }}
                      className="athletic-tap athletic-mono"
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: P.brand,
                        color: P.bg,
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: '0.12em',
                      }}
                    >
                      COPY
                    </button>
                  </div>
                  <p style={{ color: P.inkMuted, fontSize: 11 }}>
                    Verloopt op {new Date(inviteResult.expiresAt).toLocaleString('nl-NL')}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {inviteResult.patientUserId && (
                    <DarkButton
                      variant="primary"
                      className="w-full"
                      onClick={() => {
                        const pid = inviteResult.patientUserId!
                        setInviteOpen(false)
                        resetInviteForm()
                        router.push(`${portal.base}/programs/new?patientId=${pid}`)
                      }}
                    >
                      → Maak nu een programma voor deze patiënt
                    </DarkButton>
                  )}
                  <DarkButton
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setInviteOpen(false)
                      resetInviteForm()
                    }}
                  >
                    Sluiten
                  </DarkButton>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <MetaLabel>Volledige naam</MetaLabel>
                  <DarkInput
                    id="invite-name"
                    placeholder="Jan de Vries"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <MetaLabel>E-mailadres</MetaLabel>
                  <DarkInput
                    id="invite-email"
                    type="email"
                    placeholder="jan@example.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <MetaLabel>Geboortejaar</MetaLabel>
                  <DarkInput
                    id="invite-birth-year"
                    type="number"
                    inputMode="numeric"
                    placeholder={String(new Date().getFullYear() - 30)}
                    value={inviteBirthYear}
                    onChange={e => setInviteBirthYear(e.target.value)}
                    min={1900}
                    max={new Date().getFullYear()}
                    required
                  />
                  <p style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}>
                    Bij inloggen controleren we het geboortejaar, alleen de echte patiënt weet dit.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <MetaLabel>Rol</MetaLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'PATIENT', label: 'Patiënt', color: P.lime },
                      { value: 'ATHLETE', label: 'Atleet', color: P.gold },
                    ] as const).map(r => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setInviteRole(r.value)}
                        className="athletic-tap px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                        style={inviteRole === r.value
                          ? { border: `2px solid ${r.color}`, background: r.color + '15', color: r.color }
                          : { border: `2px solid ${P.lineStrong}`, color: P.inkMuted, background: 'transparent' }
                        }
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <DarkButton
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={inviteLoading}
                >
                  {inviteLoading ? 'Bezig...' : 'Code-invite aanmaken'}
                </DarkButton>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function QuickStat({ value, label, tint, active, onClick }: {
  value: number
  label: string
  tint: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="athletic-tap rounded-2xl text-left w-full"
      style={{
        background: P.surface,
        padding: 14,
        border: active ? `1px solid ${tint}` : `1px solid ${P.line}`,
      }}
    >
      <MetaLabel>{label.toUpperCase()}</MetaLabel>
      <p
        className="athletic-display"
        style={{ color: tint, fontSize: 28, lineHeight: '32px', letterSpacing: '-0.03em', marginTop: 4 }}
      >
        {value}
      </p>
    </button>
  )
}
