'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { HR_ZONES, type HRZone, CARDIO_ACTIVITIES, type CardioActivityKey } from '@/lib/cardio-constants'
import { formatPaceFromSecPerKm } from '@/lib/cardio-zones'
import { cardioLabel } from '@/lib/cardio-labels'
import { LoadCurveChart } from '@/components/workload/LoadCurveChart'
import { PatientTagsPanel } from '@/components/tags/PatientTagsPanel'
import { CARDIO_ICON_MAP } from '@/components/icons'
import { DARK_CHART_STYLES, DarkButton, DarkChartTooltip, DarkDialog as Dialog, DarkDialogContent as DialogContent, DarkDialogFooter as DialogFooter, DarkDialogHeader as DialogHeader, DarkDialogTitle as DialogTitle, DarkTabs as Tabs, DarkTabsContent as TabsContent, DarkTabsList as TabsList, DarkTabsTrigger as TabsTrigger, DarkTextarea, Display, Kicker, MetaLabel, P, CARD } from '@/components/dark-ui'

/* Zonder kader (fase 2): een grafieksectie is leeswerk. Haarlijn erboven,
   geen kaart; de grafiek zelf is het beeld. */
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="base-flat-rule" style={{ paddingTop: 18 }}>
      <div className="space-y-3">
        <MetaLabel>{title}</MetaLabel>
        {children}
      </div>
    </section>
  )
}

function StatChip({ label, value, sub, tint }: {
  label: string; value: string | number; sub?: string; tint?: string
}) {
  return (
    <div className="py-1">
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

/**
 * Subjectief herstel (wellness check-ins, 5 items × 1-5 → 5-25) als strip van
 * dag-balkjes naast de objectieve belasting-curve. Lime ≥ 18, goud 13-17,
 * rood < 13 — zelfde drempels als de patiënt-check-in.
 */
function WellnessReadinessStrip({ checks }: {
  checks: Array<{ date: string | Date; sleep: number; soreness: number; fatigue: number; mood: number; stress: number }>
}) {
  const days = [...checks]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-14)
  const latest = days[days.length - 1]
  const latestTotal = latest
    ? latest.sleep + latest.soreness + latest.fatigue + latest.mood + latest.stress
    : null

  return (
    <section className="base-flat-rule" style={{ paddingTop: 18 }}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <MetaLabel>WELLNESS · SUBJECTIEF HERSTEL</MetaLabel>
          {latestTotal !== null && (
            <span
              className="athletic-mono"
              style={{
                color: latestTotal >= 18 ? P.lime : latestTotal >= 13 ? P.gold : P.danger,
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              {latestTotal}/25
            </span>
          )}
        </div>
        <div className="flex items-end gap-1" style={{ height: 56 }}>
          {days.map((d) => {
            const total = d.sleep + d.soreness + d.fatigue + d.mood + d.stress
            const pct = ((total - 5) / 20) * 100
            const color = total >= 18 ? P.lime : total >= 13 ? P.gold : P.danger
            return (
              <div
                key={String(d.date)}
                className="flex-1 rounded-t-sm"
                style={{ height: `${Math.max(pct, 6)}%`, background: `${color}cc` }}
                title={`${new Date(d.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}: ${total}/25`}
              />
            )
          })}
        </div>
        <p style={{ color: P.inkDim, fontSize: 11, lineHeight: 1.5 }}>
          Dagelijkse check-ins (slaap, spierpijn, vermoeidheid, stemming, stress) van de laatste
          14 ingevulde dagen. Lage scores bij een diepe vorm-dip versterken het overbelasting-signaal.
        </p>
      </div>
    </section>
  )
}

export default function PatientProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const portal = usePortal()
  const { id } = use(params)
  const { data: patient } = trpc.patients.get.useQuery({ id })
  const { data: progress, isLoading } = trpc.patients.getProgress.useQuery({ patientId: id })
  const { data: loadCurve } = trpc.patients.loadCurve.useQuery({ patientId: id, days: 120 })
  const { data: wellness } = trpc.wellness.forPatient.useQuery({ patientId: id })
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [showAllExercises, setShowAllExercises] = useState(false)
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
  const activePoints = activeEx ? (oneRmByExercise[activeEx] ?? []) : []
  const oneRmData = activePoints.map(p => ({
    date: new Date(p.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
    '1RM (kg)': p.oneRm,
  }))
  // Zwaarste set die echt is gedaan + de geschatte 1RM (Epley, beste schatting)
  // en 3RM (≈ 1RM ÷ 1.1, Epley-inverse voor 3 herhalingen).
  const heaviestSet = activePoints.reduce<typeof activePoints[number] | null>(
    (best, p) => (!best || p.weight > best.weight || (p.weight === best.weight && p.oneRm > best.oneRm) ? p : best),
    null,
  )
  const best1Rm = activePoints.reduce((m, p) => Math.max(m, p.oneRm), 0)
  const est3Rm = best1Rm > 0 ? Math.round(best1Rm / 1.1) : 0
  const oneRmStart = oneRmData[0]?.['1RM (kg)'] ?? 0
  const oneRmDiff = best1Rm - oneRmStart

  // Oefening-selector: zoeken + cap met "zie meer" om stapeling te voorkomen.
  const filteredExerciseNames = exerciseSearch.trim()
    ? exerciseNames.filter(n => n.toLowerCase().includes(exerciseSearch.trim().toLowerCase()))
    : exerciseNames
  const EXERCISE_CAP = 10
  const isSearching = exerciseSearch.trim().length > 0
  const visibleExerciseNames =
    isSearching || showAllExercises ? filteredExerciseNames : filteredExerciseNames.slice(0, EXERCISE_CAP)
  const hiddenExerciseCount = filteredExerciseNames.length - visibleExerciseNames.length

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
      <div className="min-h-screen" style={{ background: P.flatBg, color: P.ink }}>
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
    <div className="min-h-screen" style={{ background: P.flatBg, color: P.ink }}>
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-8 space-y-5">
        {/* Back */}
        <Link
          href={`${portal.patients}/${id}`}
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
          <DialogContent aria-describedby={undefined}
            style={{...CARD, borderRadius: '16px',
              color: P.ink,}}
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
          <div className="py-12 text-center">
            <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>Nog geen sessies</p>
            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 6 }}>
              Zodra de patiënt sessies afrondt verschijnen hier de gegevens.
            </p>
          </div>
        ) : (
          <Tabs defaultValue={defaultTab} className="space-y-4">
            <TabsList
              className="w-full grid grid-cols-5 rounded-xl"
              style={{...CARD }}
            >
              <TabsTrigger value="belasting" className="text-xs">Belasting</TabsTrigger>
              <TabsTrigger value="sessies" className="text-xs">Sessies</TabsTrigger>
              <TabsTrigger value="cardio" className="text-xs">Cardio</TabsTrigger>
              <TabsTrigger value="krachtopbouw" className="text-xs">1RM</TabsTrigger>
              <TabsTrigger value="klachten" className="text-xs">Klachten</TabsTrigger>
            </TabsList>

            {/* ── Belasting tab: fitness-fatigue curve (kracht + cardio) ── */}
            <TabsContent value="belasting" className="space-y-4">
              {loadCurve ? (
                <LoadCurveChart data={loadCurve} frameless />
              ) : (
                <div className="py-8 text-center">
                    <MetaLabel>BELASTING LADEN…</MetaLabel>
                  </div>
              )}
              {/* Subjectief herstel naast de objectieve belasting */}
              {wellness && wellness.length > 0 && (
                <WellnessReadinessStrip checks={wellness} />
              )}
            </TabsContent>

            {/* ── Sessies tab ── */}
            <TabsContent value="sessies" className="space-y-4">
              {sessionChartData.some(s => s.Pijn !== null) && (
                <ChartCard title="Pijn per sessie (NRS 0-10)">
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
                <ChartCard title="Inspanning per sessie (RPE 0-10)">
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
                <div className="py-8 text-center">
                    <p style={{ color: P.inkMuted, fontSize: 13 }}>Nog geen cardio gelogd</p>
                  </div>
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
                        <div className="flex w-full h-3 rounded-full overflow-hidden" style={{ background: P.track }}>
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
                    <ChartCard title="Tempo per sessie (min/km, lager = sneller)">
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
                    <ChartCard title="Inspanning per cardio-sessie (RPE 0-10)">
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
                              {(() => { const Icon = CARDIO_ICON_MAP[s.activity as CardioActivityKey]; return Icon ? <Icon size={13} /> : act?.icon })()} {cardioLabel(s.activity, 'nl', s.sourceActivity)}
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

            {/* ── 1RM tab ── */}
            <TabsContent value="krachtopbouw" className="space-y-4">
              {exerciseNames.length === 0 ? (
                <div className="py-8 text-center">
                    <p style={{ color: P.inkMuted, fontSize: 13 }}>Nog geen gewichtsdata gelogd</p>
                  </div>
              ) : (
                <>
                  {/* Exercise selector — zoeken + cap met "zie meer" */}
                  <div className="space-y-2">
                    {exerciseNames.length > 6 && (
                      <input
                        type="text"
                        value={exerciseSearch}
                        onChange={e => { setExerciseSearch(e.target.value); setShowAllExercises(false) }}
                        placeholder="Zoek oefening…"
                        className="athletic-mono w-full px-3 py-2 rounded-lg text-xs"
                        style={{
                          background: P.field,
                          color: P.ink,
                          border: `1px solid ${P.lineStrong}`,
                          letterSpacing: '0.04em',
                        }}
                      />
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {visibleExerciseNames.map(name => (
                        <button
                          key={name}
                          onClick={() => setSelectedExercise(name)}
                          className="athletic-tap athletic-mono text-xs px-3 py-1.5 rounded-full font-bold transition-all"
                          style={{
                            background: activeEx === name ? P.ink : P.control,
                            color: activeEx === name ? P.bg : P.inkMuted,
                            border: `1px solid ${activeEx === name ? P.ink : P.lineStrong}`,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {name}
                        </button>
                      ))}
                      {!isSearching && !showAllExercises && hiddenExerciseCount > 0 && (
                        <button
                          onClick={() => setShowAllExercises(true)}
                          className="athletic-tap athletic-mono text-xs px-3 py-1.5 rounded-full font-bold transition-all"
                          style={{
                            background: 'transparent',
                            color: P.brand,
                            border: `1px dashed ${P.lineStrong}`,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                          }}
                        >
                          + {hiddenExerciseCount} meer
                        </button>
                      )}
                      {!isSearching && showAllExercises && exerciseNames.length > EXERCISE_CAP && (
                        <button
                          onClick={() => setShowAllExercises(false)}
                          className="athletic-tap athletic-mono text-xs px-3 py-1.5 rounded-full font-bold transition-all"
                          style={{
                            background: 'transparent',
                            color: P.inkMuted,
                            border: `1px dashed ${P.lineStrong}`,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                          }}
                        >
                          Toon minder
                        </button>
                      )}
                    </div>
                    {isSearching && filteredExerciseNames.length === 0 && (
                      <p style={{ color: P.inkMuted, fontSize: 12 }}>Geen oefening gevonden voor &ldquo;{exerciseSearch.trim()}&rdquo;</p>
                    )}
                  </div>
                  {activeEx && oneRmData.length > 0 && (
                    <ChartCard title={`${activeEx}. Geschat 1RM (kg)`}>
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
                            {heaviestSet ? `${heaviestSet.weight}` : '—'}
                            <span style={{ fontSize: 12, color: P.inkMuted }}> kg</span>
                          </p>
                          <MetaLabel>Zwaarst gedaan</MetaLabel>
                          <p style={{ color: P.inkDim, fontSize: 10, marginTop: 2 }}>
                            {heaviestSet?.reps ? `× ${heaviestSet.reps} reps` : 'gewicht'}
                          </p>
                        </div>
                        <div>
                          <p
                            className="athletic-display"
                            style={{ color: P.lime, fontSize: 22, lineHeight: '26px' }}
                          >
                            {best1Rm > 0 ? `${best1Rm}` : '—'}
                            <span style={{ fontSize: 12, color: P.inkMuted }}> kg</span>
                          </p>
                          <MetaLabel>Geschat 1RM</MetaLabel>
                          <p
                            style={{ color: oneRmDiff >= 0 ? P.lime : P.danger, fontSize: 10, marginTop: 2 }}
                          >
                            {oneRmDiff >= 0 ? '+' : ''}{oneRmDiff} kg sinds start
                          </p>
                        </div>
                        <div>
                          <p
                            className="athletic-display"
                            style={{ color: P.ink, fontSize: 22, lineHeight: '26px' }}
                          >
                            {est3Rm > 0 ? `${est3Rm}` : '—'}
                            <span style={{ fontSize: 12, color: P.inkMuted }}> kg</span>
                          </p>
                          <MetaLabel>Geschat 3RM</MetaLabel>
                          <p style={{ color: P.inkDim, fontSize: 10, marginTop: 2 }}>≈ 1RM ÷ 1.1</p>
                        </div>
                      </div>
                    </ChartCard>
                  )}
                </>
              )}
            </TabsContent>

            {/* ── Klachten tab: #hashtags met episodes ── */}
            <TabsContent value="klachten" className="space-y-4">
              <PatientTagsPanel patientId={id} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
