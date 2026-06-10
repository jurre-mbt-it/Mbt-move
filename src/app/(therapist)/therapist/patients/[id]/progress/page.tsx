'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { trpc } from '@/lib/trpc/client'
import { HR_ZONES, type HRZone, CARDIO_ACTIVITIES, type CardioActivityKey } from '@/lib/cardio-constants'
import { formatPaceFromSecPerKm } from '@/lib/cardio-zones'
import { LoadCurveChart } from '@/components/workload/LoadCurveChart'
import {
  DARK_CHART_STYLES,
  DarkButton,
  DarkChartTooltip,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogFooter as DialogFooter,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkTabs as Tabs,
  DarkTabsContent as TabsContent,
  DarkTabsList as TabsList,
  DarkTabsTrigger as TabsTrigger,
  DarkTextarea,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Tile>
      <div className="space-y-3">
        <MetaLabel>{title}</MetaLabel>
        {children}
      </div>
    </Tile>
  )
}

function StatChip({ label, value, sub, tint }: {
  label: string; value: string | number; sub?: string; tint?: string
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: P.surface, border: `1px solid ${P.line}` }}
    >
      <MetaLabel>{label.toUpperCase()}</MetaLabel>
      <div className="flex items-baseline gap-2 mt-1">
        <span
          className="athletic-display"
          style={{ color: tint ?? P.ink, fontSize: 28, lineHeight: '32px', letterSpacing: '-0.03em' }}
        >
          {value}
        </span>
        {sub && <span style={{ color: P.inkMuted, fontSize: 12 }}>{sub}</span>}
      </div>
    </div>
  )
}

// Adherence calendar based on real sessions
function SessionCalendar({ sessions }: { sessions: { date: string }[] }) {
  const sessionDates = new Set(sessions.map(s => s.date.slice(0, 10)))
  const today = new Date()
  const days = Array.from({ length: 56 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - 55 + i)
    const key = d.toISOString().slice(0, 10)
    const isFuture = d > today
    return { date: d, key, completed: sessionDates.has(key), isFuture }
  })

  const firstDow = days[0].date.getDay()
  const mondayOffset = firstDow === 0 ? 6 : firstDow - 1
  const padded: (typeof days[0] | null)[] = [...Array(mondayOffset).fill(null), ...days]
  const rem = padded.length % 7
  if (rem > 0) for (let i = 0; i < 7 - rem; i++) padded.push(null)
  const weekRows: (typeof days[0] | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) weekRows.push(padded.slice(i, i + 7))

  const dayLabels = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {dayLabels.map(d => (
          <div
            key={d}
            className="athletic-mono text-center"
            style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.1em', fontWeight: 700 }}
          >
            {d.toUpperCase()}
          </div>
        ))}
      </div>
      {weekRows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-7 gap-1.5 mb-1.5">
          {row.map((day, di) => {
            if (!day) return <div key={di} className="aspect-square rounded-md" />
            const bg = day.isFuture ? P.surfaceLow
              : day.completed ? 'rgba(232,122,85,0.18)' : P.surfaceHi
            const border = day.isFuture ? P.line
              : day.completed ? P.lime : P.inkDim
            return (
              <div
                key={di}
                className="aspect-square rounded-md"
                style={{ background: bg, border: `2px solid ${border}` }}
                title={`${day.date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}${day.completed ? ': Sessie' : ''}`}
              />
            )
          })}
        </div>
      ))}
      <div className="flex items-center gap-4 mt-3">
        {[
          { color: 'rgba(232,122,85,0.18)', border: P.lime,   label: 'Sessie' },
          { color: P.surfaceHi,               border: P.inkDim, label: 'Geen sessie' },
        ].map(({ color, border, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className="w-3.5 h-3.5 rounded"
              style={{ background: color, border: `2px solid ${border}` }}
            />
            <span
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.08em' }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PatientProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: patient } = trpc.patients.get.useQuery({ id })
  const { data: progress, isLoading } = trpc.patients.getProgress.useQuery({ patientId: id })
  const { data: loadCurve } = trpc.patients.loadCurve.useQuery({ patientId: id, days: 120 })
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const [pdfNote, setPdfNote] = useState('')

  function openPdf(withNote: boolean) {
    const note = withNote ? pdfNote.trim() : ''
    const url = note
      ? `/print/progress/${id}?note=${encodeURIComponent(note)}`
      : `/print/progress/${id}`
    window.open(url, '_blank', 'noopener')
    setPdfDialogOpen(false)
  }

  const sessions = progress?.sessions ?? []
  const oneRmByExercise = progress?.oneRmByExercise ?? {}
  const exerciseNames = Object.keys(oneRmByExercise)

  // Pain trend: first 5 vs last 5 sessions
  const painSessions = sessions.filter(s => s.painLevel !== null)
  const firstPain = painSessions.slice(0, 5).reduce((s, l) => s + (l.painLevel ?? 0), 0) / Math.max(1, Math.min(5, painSessions.length))
  const lastPain = painSessions.slice(-5).reduce((s, l) => s + (l.painLevel ?? 0), 0) / Math.max(1, Math.min(5, painSessions.length))
  const painTrend: 'up' | 'down' | 'neutral' = lastPain < firstPain - 0.5 ? 'down' : lastPain > firstPain + 0.5 ? 'up' : 'neutral'

  // Chart data: sessions over time
  const sessionChartData = sessions.map(s => ({
    date: new Date(s.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
    Pijn: s.painLevel ?? null,
    Inspanning: s.exertionLevel ?? null,
    Duur: s.durationMinutes,
  }))

  // Active 1RM exercise
  const activeEx = selectedExercise ?? exerciseNames[0] ?? null
  const oneRmData = activeEx ? (oneRmByExercise[activeEx] ?? []).map(p => ({
    date: new Date(p.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
    '1RM (kg)': p.oneRm,
  })) : []

  // ── Cardio ──
  const cardio = progress?.cardio
  const cardioSessions = cardio?.sessions ?? []
  const cardioCount = cardio?.totalSessions ?? 0
  const cardioChartData = cardioSessions.map(s => ({
    date: new Date(s.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
    Afstand: s.distanceKm,
    RPE: s.rpe,
    // Tempo als decimale minuten/km (5:00 → 5.0) zodat Recharts er een lijn van maakt.
    Tempo: s.avgPaceSecPerKm != null ? Math.round((s.avgPaceSecPerKm / 60) * 100) / 100 : null,
  }))
  const zoneEntries = Object.entries(cardio?.timeInZonesSec ?? {})
    .map(([z, sec]) => ({ zone: Number(z) as HRZone, minutes: Math.round(sec / 60) }))
    .filter(e => e.zone >= 1 && e.zone <= 5 && e.minutes > 0)
    .sort((a, b) => a.zone - b.zone)
  const zoneTotalMin = zoneEntries.reduce((s, e) => s + e.minutes, 0)

  const hasAnyData = sessions.length > 0 || cardioCount > 0
  const defaultTab = 'belasting'

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-3xl mx-auto px-4 pt-10 pb-8 space-y-4 animate-pulse">
          <div className="h-5 w-32 rounded" style={{ background: P.surfaceHi }} />
          <div className="h-24 rounded-xl" style={{ background: P.surfaceHi }} />
          <div className="h-48 rounded-xl" style={{ background: P.surfaceHi }} />
        </div>
      </div>
    )
  }

  const painTrendLabel = painTrend === 'down' ? 'verbetering' : painTrend === 'up' ? 'verslechtering' : 'stabiel'

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-8 space-y-5">
        {/* Back */}
        <Link
          href={`/therapist/patients/${id}`}
          className="athletic-mono inline-flex items-center gap-1.5"
          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
        >
          ← {(patient?.name ?? 'PATIËNT').toUpperCase()}
        </Link>

        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <Kicker>Voortgang</Kicker>
            <Display size="md">RAPPORT</Display>
            <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
              Laatste 90 dagen · {sessions.length} kracht · {cardioCount} cardio
            </MetaLabel>
          </div>
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={() => setPdfDialogOpen(true)}
              className="athletic-mono athletic-tap"
              style={{
                background: P.lime,
                color: P.bg,
                border: 0,
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Exporteer PDF
            </button>
          )}
        </div>

        <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
          <DialogContent
            style={{
              borderRadius: '16px',
              background: P.surface,
              color: P.ink,
              border: `1px solid ${P.lineStrong}`,
            }}
          >
            <DialogHeader>
              <DialogTitle style={{ color: P.ink }}>Voortgangsrapport exporteren</DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-3">
              <MetaLabel>Notitie behandelaar (optioneel)</MetaLabel>
              <DarkTextarea
                rows={5}
                value={pdfNote}
                onChange={(e) => setPdfNote(e.target.value)}
                placeholder="bv. Toelichting voor verwijzer, advies, observatie deze maand…"
                maxLength={4000}
              />
              <p style={{ color: P.inkMuted, fontSize: 11 }}>
                Verschijnt prominent bovenaan in het rapport. Laat leeg om over te slaan.
              </p>
            </div>
            <DialogFooter>
              <DarkButton variant="ghost" size="sm" onClick={() => openPdf(false)}>
                Zonder notitie
              </DarkButton>
              <DarkButton variant="primary" size="sm" onClick={() => openPdf(true)}>
                Genereer PDF
              </DarkButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatChip label="Sessies" value={progress?.totalSessions ?? 0} tint={P.lime} />
          <StatChip
            label="Gem. pijn"
            value={progress?.avgPain !== null && progress?.avgPain !== undefined ? `${progress.avgPain}/10` : '—'}
            sub={painSessions.length > 0 ? painTrendLabel : undefined}
            tint={P.danger}
          />
          <StatChip
            label="Gem. RPE"
            value={progress?.avgExertion !== null && progress?.avgExertion !== undefined ? `${progress.avgExertion}/10` : '—'}
            tint={P.gold}
          />
          <StatChip label="Oefeningen" value={exerciseNames.length} sub="met 1RM" tint={P.ice} />
        </div>

        {!hasAnyData ? (
          <Tile>
            <div className="py-12 text-center">
              <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>Nog geen sessies</p>
              <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 6 }}>
                Zodra de patiënt sessies afrondt verschijnen hier de gegevens.
              </p>
            </div>
          </Tile>
        ) : (
          <Tabs defaultValue={defaultTab} className="space-y-4">
            <TabsList
              className="w-full grid grid-cols-5 rounded-xl"
              style={{ background: P.surface, border: `1px solid ${P.line}` }}
            >
              <TabsTrigger value="belasting" className="text-xs">Belasting</TabsTrigger>
              <TabsTrigger value="sessies" className="text-xs">Sessies</TabsTrigger>
              <TabsTrigger value="cardio" className="text-xs">Cardio</TabsTrigger>
              <TabsTrigger value="kalender" className="text-xs">Kalender</TabsTrigger>
              <TabsTrigger value="krachtopbouw" className="text-xs">1RM</TabsTrigger>
            </TabsList>

            {/* ── Belasting tab: fitness-fatigue curve (kracht + cardio) ── */}
            <TabsContent value="belasting" className="space-y-4">
              {loadCurve ? (
                <LoadCurveChart data={loadCurve} />
              ) : (
                <Tile>
                  <div className="py-8 text-center">
                    <MetaLabel>BELASTING LADEN…</MetaLabel>
                  </div>
                </Tile>
              )}
            </TabsContent>

            {/* ── Sessies tab ── */}
            <TabsContent value="sessies" className="space-y-4">
              {sessionChartData.some(s => s.Pijn !== null) && (
                <ChartCard title="Pijn per sessie (NRS 0–10)">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={sessionChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid {...DARK_CHART_STYLES.grid} />
                      <XAxis dataKey="date" {...DARK_CHART_STYLES.axis} interval="preserveStartEnd" />
                      <YAxis domain={[0, 10]} {...DARK_CHART_STYLES.axis} />
                      <Tooltip content={<DarkChartTooltip />} />
                      <Line type="monotone" dataKey="Pijn" stroke={P.danger} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {sessionChartData.some(s => s.Inspanning !== null) && (
                <ChartCard title="Inspanning per sessie (RPE 0–10)">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={sessionChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid {...DARK_CHART_STYLES.grid} />
                      <XAxis dataKey="date" {...DARK_CHART_STYLES.axis} interval="preserveStartEnd" />
                      <YAxis domain={[0, 10]} {...DARK_CHART_STYLES.axis} />
                      <Tooltip content={<DarkChartTooltip />} />
                      <Line type="monotone" dataKey="Inspanning" stroke={P.lime} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              <ChartCard title="Sessieduur (minuten)">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={sessionChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid {...DARK_CHART_STYLES.grid} />
                    <XAxis dataKey="date" {...DARK_CHART_STYLES.axis} interval="preserveStartEnd" />
                    <YAxis {...DARK_CHART_STYLES.axis} />
                    <Tooltip content={<DarkChartTooltip />} />
                    <Bar dataKey="Duur" fill={P.lime} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </TabsContent>

            {/* ── Cardio tab ── */}
            <TabsContent value="cardio" className="space-y-4">
              {cardioCount === 0 ? (
                <Tile>
                  <div className="py-8 text-center">
                    <p style={{ color: P.inkMuted, fontSize: 13 }}>Nog geen cardio gelogd</p>
                  </div>
                </Tile>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatChip label="Cardio sessies" value={cardioCount} tint={P.ice} />
                    <StatChip label="Totaal min." value={cardio?.totalMinutes ?? 0} tint={P.lime} />
                    <StatChip label="Afstand" value={`${cardio?.totalDistanceKm ?? 0} km`} tint={P.brand} />
                    <StatChip label="Gem. RPE" value={cardio?.avgRpe != null ? `${cardio.avgRpe}/10` : '—'} tint={P.gold} />
                  </div>

                  {/* Tijd-in-zone verdeling */}
                  {zoneTotalMin > 0 && (
                    <ChartCard title="Tijd in hartslagzone (totaal)">
                      <div className="space-y-2">
                        <div className="flex w-full h-3 rounded-full overflow-hidden" style={{ background: P.surfaceHi }}>
                          {zoneEntries.map(e => (
                            <div
                              key={e.zone}
                              style={{ width: `${(e.minutes / zoneTotalMin) * 100}%`, background: HR_ZONES[e.zone].color }}
                              title={`Zone ${e.zone}: ${e.minutes} min`}
                            />
                          ))}
                        </div>
                        <div className="grid grid-cols-5 gap-1.5 mt-2">
                          {([1, 2, 3, 4, 5] as HRZone[]).map(z => {
                            const m = zoneEntries.find(e => e.zone === z)?.minutes ?? 0
                            return (
                              <div key={z} className="text-center rounded-lg py-1.5" style={{ background: HR_ZONES[z].color + '18', border: `1px solid ${HR_ZONES[z].color}44` }}>
                                <div className="athletic-mono" style={{ fontSize: 11, fontWeight: 900, color: HR_ZONES[z].color }}>Z{z}</div>
                                <div className="athletic-mono" style={{ fontSize: 11, color: P.inkMuted, marginTop: 2 }}>{m}m</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </ChartCard>
                  )}

                  {/* Tempo-trend */}
                  {cardioChartData.some(s => s.Tempo !== null) && (
                    <ChartCard title="Tempo per sessie (min/km — lager = sneller)">
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={cardioChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid {...DARK_CHART_STYLES.grid} />
                          <XAxis dataKey="date" {...DARK_CHART_STYLES.axis} interval="preserveStartEnd" />
                          <YAxis {...DARK_CHART_STYLES.axis} reversed domain={['auto', 'auto']} />
                          <Tooltip content={<DarkChartTooltip />} />
                          <Line type="monotone" dataKey="Tempo" stroke={P.brand} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}

                  {/* Afstand per sessie */}
                  {cardioChartData.some(s => s.Afstand != null) && (
                    <ChartCard title="Afstand per sessie (km)">
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={cardioChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid {...DARK_CHART_STYLES.grid} />
                          <XAxis dataKey="date" {...DARK_CHART_STYLES.axis} interval="preserveStartEnd" />
                          <YAxis {...DARK_CHART_STYLES.axis} />
                          <Tooltip content={<DarkChartTooltip />} />
                          <Bar dataKey="Afstand" fill={P.ice} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}

                  {/* RPE-trend */}
                  {cardioChartData.some(s => s.RPE != null) && (
                    <ChartCard title="Inspanning per cardio-sessie (RPE 0–10)">
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={cardioChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid {...DARK_CHART_STYLES.grid} />
                          <XAxis dataKey="date" {...DARK_CHART_STYLES.axis} interval="preserveStartEnd" />
                          <YAxis domain={[0, 10]} {...DARK_CHART_STYLES.axis} />
                          <Tooltip content={<DarkChartTooltip />} />
                          <Line type="monotone" dataKey="RPE" stroke={P.gold} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}

                  {/* Recente cardio-lijst met tempo */}
                  <ChartCard title="Recente cardio-sessies">
                    <div className="space-y-2">
                      {cardioSessions.slice(-8).reverse().map(s => {
                        const act = CARDIO_ACTIVITIES[s.activity as CardioActivityKey]
                        const pace = formatPaceFromSecPerKm(s.activity as CardioActivityKey, s.avgPaceSecPerKm)
                        return (
                          <div key={s.id} className="flex items-center justify-between gap-2 py-1.5" style={{ borderBottom: `1px solid ${P.line}` }}>
                            <span style={{ color: P.ink, fontSize: 12, fontWeight: 700 }}>
                              {act?.icon} {act?.label ?? s.activity}
                            </span>
                            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>
                              {new Date(s.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                              {' · '}{s.durationMinutes}m
                              {s.distanceKm != null ? ` · ${s.distanceKm}km` : ''}
                              {pace ? ` · ${pace}` : ''}
                              {s.rpe != null ? ` · RPE ${s.rpe}` : ''}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </ChartCard>
                </>
              )}
            </TabsContent>

            {/* ── Kalender tab ── */}
            <TabsContent value="kalender">
              <Tile>
                <div className="space-y-4">
                  <MetaLabel>Sessie-aanwezigheid (laatste 8 weken)</MetaLabel>
                  <SessionCalendar sessions={sessions} />
                  <div
                    className="mt-4 pt-4 grid grid-cols-3 gap-3 text-center"
                    style={{ borderTop: `1px solid ${P.line}` }}
                  >
                    <div>
                      <p
                        className="athletic-display"
                        style={{ color: P.ink, fontSize: 22, lineHeight: '26px' }}
                      >
                        {sessions.length}
                      </p>
                      <MetaLabel>Sessies</MetaLabel>
                    </div>
                    <div>
                      <p
                        className="athletic-display"
                        style={{ color: P.ink, fontSize: 22, lineHeight: '26px' }}
                      >
                        {sessions.filter(s => s.durationMinutes > 0).reduce((s, l) => s + l.durationMinutes, 0)}
                      </p>
                      <MetaLabel>Totaal min.</MetaLabel>
                    </div>
                    <div>
                      <p
                        className="athletic-display"
                        style={{ color: P.ink, fontSize: 22, lineHeight: '26px' }}
                      >
                        {progress?.avgExertion !== null && progress?.avgExertion !== undefined ? progress.avgExertion : '—'}
                      </p>
                      <MetaLabel>Gem. RPE</MetaLabel>
                    </div>
                  </div>
                </div>
              </Tile>
            </TabsContent>

            {/* ── 1RM tab ── */}
            <TabsContent value="krachtopbouw" className="space-y-4">
              {exerciseNames.length === 0 ? (
                <Tile>
                  <div className="py-8 text-center">
                    <p style={{ color: P.inkMuted, fontSize: 13 }}>Nog geen gewichtsdata gelogd</p>
                  </div>
                </Tile>
              ) : (
                <>
                  {/* Exercise selector */}
                  <div className="flex gap-2 flex-wrap">
                    {exerciseNames.map(name => (
                      <button
                        key={name}
                        onClick={() => setSelectedExercise(name)}
                        className="athletic-tap athletic-mono text-xs px-3 py-1.5 rounded-full font-bold transition-all"
                        style={{
                          background: activeEx === name ? P.brand : P.surfaceHi,
                          color: activeEx === name ? P.bg : P.inkMuted,
                          border: `1px solid ${activeEx === name ? P.brand : P.lineStrong}`,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  {activeEx && oneRmData.length > 0 && (
                    <ChartCard title={`${activeEx} — Geschat 1RM (kg)`}>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={oneRmData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid {...DARK_CHART_STYLES.grid} />
                          <XAxis dataKey="date" {...DARK_CHART_STYLES.axis} interval="preserveStartEnd" />
                          <YAxis {...DARK_CHART_STYLES.axis} />
                          <Tooltip content={<DarkChartTooltip />} />
                          <Line type="monotone" dataKey="1RM (kg)" stroke={P.lime} strokeWidth={2.5} dot={{ r: 4, fill: P.lime }} />
                        </LineChart>
                      </ResponsiveContainer>
                      <div
                        className="mt-3 grid grid-cols-3 gap-3 text-center pt-3"
                        style={{ borderTop: `1px solid ${P.line}` }}
                      >
                        <div>
                          <p
                            className="athletic-display"
                            style={{ color: P.ink, fontSize: 22, lineHeight: '26px' }}
                          >
                            {oneRmData[0]?.['1RM (kg)'] ?? '—'}
                          </p>
                          <MetaLabel>Start</MetaLabel>
                        </div>
                        <div>
                          <p
                            className="athletic-display"
                            style={{ color: P.ink, fontSize: 22, lineHeight: '26px' }}
                          >
                            {oneRmData[oneRmData.length - 1]?.['1RM (kg)'] ?? '—'}
                          </p>
                          <MetaLabel>Huidig</MetaLabel>
                        </div>
                        <div>
                          {(() => {
                            const start = oneRmData[0]?.['1RM (kg)'] ?? 0
                            const current = oneRmData[oneRmData.length - 1]?.['1RM (kg)'] ?? 0
                            const diff = current - start
                            return (
                              <>
                                <p
                                  className="athletic-display"
                                  style={{
                                    color: diff >= 0 ? P.lime : P.danger,
                                    fontSize: 22,
                                    lineHeight: '26px',
                                  }}
                                >
                                  {diff >= 0 ? '+' : ''}{diff} kg
                                </p>
                                <MetaLabel>Verschil</MetaLabel>
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    </ChartCard>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
