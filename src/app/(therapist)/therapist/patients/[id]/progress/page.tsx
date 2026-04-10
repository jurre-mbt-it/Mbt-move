'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Info,
  Activity, Dumbbell, Heart,
} from 'lucide-react'
import {
  getPatientById, getSessionsByPatient, getCardioLogsByPatient, MockSessionLog, MockCardioLog,
} from '@/lib/mock-data'
import {
  calculateACWR, calculateSRPE, ACWR_ZONE_CONFIG, SessionWorkload,
} from '@/lib/workload-monitoring'
import { calculateCardioSRPE, CARDIO_ACTIVITIES, HR_ZONES } from '@/lib/cardio-constants'
import { notFound } from 'next/navigation'

const MBT_GREEN = '#3ECF6A'
const MBT_TEAL = '#4ECDC4'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function weekLabel(iso: string) {
  const d = new Date(iso)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return `${monday.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`
}

function getISOWeekKey(iso: string) {
  const d = new Date(iso)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

// ── Workload ratio per week ───────────────────────────────────────────────────

interface WeekWorkload {
  weekKey: string
  weekLabel: string
  strengthSRPE: number
  cardioSRPE: number
  total: number
  strengthPct: number
  cardioPct: number
  strengthSessions: number
  cardioSessions: number
}

function computeWeeklyWorkloads(
  strengthLogs: MockSessionLog[],
  cardioLogs: MockCardioLog[],
): WeekWorkload[] {
  const weekMap = new Map<string, WeekWorkload>()

  const ensureWeek = (key: string, label: string) => {
    if (!weekMap.has(key)) {
      weekMap.set(key, {
        weekKey: key, weekLabel: label,
        strengthSRPE: 0, cardioSRPE: 0, total: 0,
        strengthPct: 0, cardioPct: 0,
        strengthSessions: 0, cardioSessions: 0,
      })
    }
    return weekMap.get(key)!
  }

  for (const s of strengthLogs) {
    const key = getISOWeekKey(s.date)
    const label = weekLabel(s.date)
    const w = ensureWeek(key, label)
    const srpe = calculateSRPE(s.rpe, s.duration)
    w.strengthSRPE += srpe
    w.strengthSessions++
  }

  for (const c of cardioLogs) {
    const key = getISOWeekKey(c.date)
    const label = weekLabel(c.date)
    const w = ensureWeek(key, label)
    const durationMin = c.durationSec / 60
    const srpe = c.rpe ? calculateCardioSRPE(c.rpe, durationMin) : durationMin * 4 // default rpe 4
    w.cardioSRPE += srpe
    w.cardioSessions++
  }

  // Bereken percentages
  for (const w of weekMap.values()) {
    w.total = w.strengthSRPE + w.cardioSRPE
    w.strengthPct = w.total > 0 ? Math.round((w.strengthSRPE / w.total) * 100) : 0
    w.cardioPct = w.total > 0 ? Math.round((w.cardioSRPE / w.total) * 100) : 0
  }

  return Array.from(weekMap.values()).sort((a, b) => a.weekKey.localeCompare(b.weekKey))
}

// ── Stacked bar chart ─────────────────────────────────────────────────────────

function StackedWorkloadBar({ week, maxTotal }: { week: WeekWorkload; maxTotal: number }) {
  const strengthW = maxTotal > 0 ? (week.strengthSRPE / maxTotal) * 100 : 0
  const cardioW = maxTotal > 0 ? (week.cardioSRPE / maxTotal) * 100 : 0

  return (
    <div className="flex flex-col gap-1">
      <div className="h-24 flex items-end gap-1">
        <div className="flex-1 flex flex-col justify-end h-full">
          <div className="w-full flex flex-col justify-end" style={{ height: `${strengthW + cardioW}%`, minHeight: week.total > 0 ? '4px' : 0 }}>
            <div className="w-full rounded-t" style={{ height: `${cardioW / (strengthW + cardioW) * 100}%`, minHeight: week.cardioSRPE > 0 ? '4px' : 0, background: MBT_TEAL }} />
            <div className="w-full" style={{ height: `${strengthW / (strengthW + cardioW) * 100}%`, minHeight: week.strengthSRPE > 0 ? '4px' : 0, background: MBT_GREEN }} />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center leading-tight">{week.weekLabel.split('–')[0]}</p>
    </div>
  )
}

// ── ACWR card ─────────────────────────────────────────────────────────────────

function ACWRCard({ sessions }: { sessions: SessionWorkload[] }) {
  const result = calculateACWR(sessions)
  const zone = ACWR_ZONE_CONFIG[result.zone]
  const noData = sessions.length === 0

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Acute:Chronic Workload Ratio</h3>
          <span className="text-xs text-muted-foreground">Gabbett 2016</span>
        </div>

        {noData ? (
          <p className="text-sm text-muted-foreground py-2">Geen sessiedata beschikbaar.</p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-4xl font-bold" style={{ color: zone.color }}>{result.acwr.toFixed(2)}</p>
                <div className="mt-1 px-2 py-0.5 rounded-full text-xs font-semibold inline-block" style={{ background: zone.bg, color: zone.color }}>
                  {zone.label}
                </div>
              </div>
              <div className="flex-1 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Acuut (week):</span>
                  <span className="font-medium">{result.acuteWorkload}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chronisch (4w gem):</span>
                  <span className="font-medium">{result.chronicWorkload}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Week-over-week:</span>
                  <span className="font-medium flex items-center gap-1">
                    {result.weekOverWeekChange > 0 ? <TrendingUp className="w-3 h-3 text-amber-500" /> : result.weekOverWeekChange < 0 ? <TrendingDown className="w-3 h-3 text-blue-500" /> : <Minus className="w-3 h-3" />}
                    {result.weekOverWeekChange > 0 ? '+' : ''}{result.weekOverWeekChange}%
                  </span>
                </div>
              </div>
            </div>

            <div className="p-2 rounded-lg text-xs" style={{ background: zone.bg, color: zone.color }}>
              {zone.description}
            </div>

            {/* ACWR schaal */}
            <div className="space-y-1">
              <div className="relative h-3 rounded-full overflow-hidden flex">
                <div className="flex-1 bg-blue-200" title="Onderbelast (<0.8)" />
                <div className="flex-[2] bg-green-200" title="Optimaal (0.8-1.3)" />
                <div className="flex-1 bg-amber-200" title="Verhoogd risico (1.3-1.5)" />
                <div className="flex-1 bg-red-200" title="Hoog risico (>1.5)" />
                {/* Indicator */}
                <div
                  className="absolute top-0 bottom-0 w-1.5 rounded-full bg-gray-800 -translate-x-1/2"
                  style={{ left: `${Math.min(Math.max((result.acwr / 2) * 100, 0), 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0</span><span>0.8</span><span>1.3</span><span>1.5</span><span>2.0</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'workload'

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

export default function PatientProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [tab, setTab] = useState<Tab>('overview')

  const patient = getPatientById(id)
  if (!patient) notFound()

  const strengthLogs = getSessionsByPatient(id)
  const cardioLogs = getCardioLogsByPatient(id)

  const weeklyWorkloads = computeWeeklyWorkloads(strengthLogs, cardioLogs)
  const maxTotal = Math.max(...weeklyWorkloads.map(w => w.total), 1)

  // ACWR data alleen op basis van alle sessies (strength + cardio gecombineerd)
  const allWorkloadSessions: SessionWorkload[] = [
    ...strengthLogs.map(s => ({
      date: new Date(s.date),
      durationMinutes: s.duration,
      rpe: s.rpe,
      sRPE: calculateSRPE(s.rpe, s.duration),
    })),
    ...cardioLogs.map(c => ({
      date: new Date(c.date),
      durationMinutes: c.durationSec / 60,
      rpe: c.rpe ?? 4,
      sRPE: calculateCardioSRPE(c.rpe ?? 4, c.durationSec / 60),
    })),
  ]

  // Laatste cardio logs voor tabel
  const recentCardio = cardioLogs.slice(0, 6)
  const recentStrength = strengthLogs.slice(0, 6)

  // Totaal km lopend (10%-regel)
  const runningLogs = cardioLogs.filter(c => c.activity === 'RUNNING' && c.distanceM)
  const lastWeekKey = weeklyWorkloads[weeklyWorkloads.length - 1]?.weekKey
  const prevWeekKey = weeklyWorkloads[weeklyWorkloads.length - 2]?.weekKey
  const lastWeekKm = runningLogs.filter(c => getISOWeekKey(c.date) === lastWeekKey).reduce((s, c) => s + (c.distanceM ?? 0), 0) / 1000
  const prevWeekKm = runningLogs.filter(c => getISOWeekKey(c.date) === prevWeekKey).reduce((s, c) => s + (c.distanceM ?? 0), 0) / 1000
  const kmIncreasePct = prevWeekKm > 0 ? ((lastWeekKm - prevWeekKm) / prevWeekKm) * 100 : 0

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/therapist/patients/${id}`}>
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Voortgang — {patient.name}</h1>
          <p className="text-sm text-muted-foreground">{patient.diagnosis.slice(0, 50)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl">
        {([
          { key: 'overview', label: 'Overzicht', icon: Activity },
          { key: 'workload', label: 'Workload Ratio', icon: Dumbbell },
        ] as { key: Tab; label: string; icon: typeof Activity }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === key ? { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: '#6b7280' }}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overzicht ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold" style={{ color: MBT_GREEN }}>{strengthLogs.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Kracht sessies</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold" style={{ color: MBT_TEAL }}>{cardioLogs.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cardio sessies</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">{patient.compliance}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">Compliance</p>
              </CardContent>
            </Card>
          </div>

          {/* Recente strength sessies */}
          {recentStrength.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Dumbbell className="w-4 h-4" style={{ color: MBT_GREEN }} />
                  Recente krachtsessies
                </h3>
                <div className="space-y-2">
                  {recentStrength.map(s => (
                    <div key={s.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                      <div className="w-16 text-xs text-muted-foreground shrink-0">{fmtDate(s.date)}</div>
                      <div className="flex-1">
                        <span className="text-xs">Week {s.week}, dag {s.day}</span>
                        {s.notes && <p className="text-xs text-muted-foreground truncate">{s.notes}</p>}
                      </div>
                      <Badge variant="outline" className="text-xs">RPE {s.rpe}</Badge>
                      <Badge variant="outline" className="text-xs" style={s.pain >= 5 ? { borderColor: '#ef4444', color: '#ef4444' } : {}}>
                        Pijn {s.pain}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recente cardio sessies */}
          {recentCardio.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Heart className="w-4 h-4" style={{ color: MBT_TEAL }} />
                  Recente cardiosessies
                </h3>
                <div className="space-y-2">
                  {recentCardio.map(c => {
                    const act = CARDIO_ACTIVITIES[c.activity as keyof typeof CARDIO_ACTIVITIES]
                    return (
                      <div key={c.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                        <div className="w-16 text-xs text-muted-foreground shrink-0">{fmtDate(c.date)}</div>
                        <span className="text-base">{act?.icon ?? '🏃'}</span>
                        <div className="flex-1">
                          <span className="text-xs font-medium">{act?.label ?? c.activity}</span>
                          <p className="text-xs text-muted-foreground">
                            {Math.round(c.durationSec / 60)} min
                            {c.distanceM ? ` · ${(c.distanceM / 1000).toFixed(1)} km` : ''}
                            {c.avgHeartRate ? ` · ${c.avgHeartRate} bpm` : ''}
                          </p>
                        </div>
                        {c.zone && (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: HR_ZONES[c.zone as 1 | 2 | 3 | 4 | 5]?.color }}>
                            {c.zone}
                          </div>
                        )}
                        {c.painLevel !== undefined && c.painLevel >= 5 && (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {strengthLogs.length === 0 && cardioLogs.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>Nog geen sessiedata beschikbaar.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Tab: Workload Ratio ── */}
      {tab === 'workload' && (
        <div className="space-y-4">
          {/* ACWR */}
          <ACWRCard sessions={allWorkloadSessions} />

          {/* 10% regel lopen */}
          {runningLogs.length > 0 && (
            <Card className={kmIncreasePct > 10 ? 'border-amber-300' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span>🏃</span>
                  <h3 className="font-semibold text-sm">10%-regel Hardlopen</h3>
                  {kmIncreasePct > 10 && (
                    <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50 ml-auto">
                      ⚠️ Grens overschreden
                    </Badge>
                  )}
                  {kmIncreasePct <= 10 && lastWeekKm > 0 && (
                    <Badge variant="outline" className="text-xs border-green-400 text-green-700 bg-green-50 ml-auto">
                      ✓ Veilig
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-xl font-bold">{prevWeekKm.toFixed(1)} km</p>
                    <p className="text-xs text-muted-foreground">Vorige week</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-xl font-bold" style={{ color: kmIncreasePct > 10 ? '#f59e0b' : MBT_GREEN }}>{lastWeekKm.toFixed(1)} km</p>
                    <p className="text-xs text-muted-foreground">Deze week</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-xl font-bold" style={{ color: kmIncreasePct > 10 ? '#ef4444' : MBT_GREEN }}>
                      {kmIncreasePct > 0 ? '+' : ''}{kmIncreasePct.toFixed(0)}%
                    </p>
                    <p className="text-xs text-muted-foreground">Stijging</p>
                  </div>
                </div>
                {kmIncreasePct > 10 && (
                  <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Weekvolume stijgt meer dan 10%. Overweeg het trainingsvolume terug te schalen om overbelasting te voorkomen.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Stacked bar chart */}
          {weeklyWorkloads.length > 0 ? (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">Workload per week</h3>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ background: MBT_GREEN }} />
                      Kracht
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ background: MBT_TEAL }} />
                      Cardio
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 items-end min-h-[120px]">
                  {weeklyWorkloads.map(w => (
                    <div key={w.weekKey} className="flex-1 flex flex-col gap-1">
                      <StackedWorkloadBar week={w} maxTotal={maxTotal} />
                    </div>
                  ))}
                </div>

                {/* Ratio tabel */}
                <div className="mt-4 space-y-2 border-t pt-4">
                  {weeklyWorkloads.slice(-4).map(w => (
                    <div key={w.weekKey}>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{w.weekLabel}</span>
                        <span>{w.strengthSessions > 0 ? `${w.strengthSessions} kracht` : ''}
                          {w.strengthSessions > 0 && w.cardioSessions > 0 ? ' · ' : ''}
                          {w.cardioSessions > 0 ? `${w.cardioSessions} cardio` : ''}
                        </span>
                      </div>
                      <div className="h-3 rounded-full overflow-hidden flex">
                        <div
                          className="h-full transition-all"
                          style={{ width: `${w.strengthPct}%`, background: MBT_GREEN }}
                        />
                        <div
                          className="h-full transition-all"
                          style={{ width: `${w.cardioPct}%`, background: MBT_TEAL }}
                        />
                      </div>
                      <div className="flex justify-between text-xs mt-0.5">
                        <span style={{ color: MBT_GREEN }}>{w.strengthPct}% kracht</span>
                        <span style={{ color: MBT_TEAL }}>{w.cardioPct}% cardio</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>Nog geen workload data — sessies worden hier weergegeven zodra de patiënt start.</p>
              </CardContent>
            </Card>
          )}

          {/* Uitleg */}
          <Card className="border-muted bg-muted/20">
            <CardContent className="p-4">
              <div className="flex gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>sRPE methode (Foster 2001):</strong> Workload = RPE × duur (min). Vergelijkbaar voor kracht en cardio.</p>
                  <p><strong>ACWR (Gabbett 2016):</strong> Acuut (huidige week) / Chronisch (4-weeks gemiddelde). Optimaal: 0.8–1.3.</p>
                  <p><strong>10%-regel:</strong> Weekvolume hardlopen mag maximaal 10% stijgen om overbelasting te voorkomen.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
