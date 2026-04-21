'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { trpc } from '@/lib/trpc/client'
import {
  ArrowLeft, TrendingUp, TrendingDown, Activity,
  CheckCircle2, Clock, Zap,
} from 'lucide-react'

const G = '#BEF264'
const DARK = '#F5F7F6'
const SURFACE_HI = '#1C2425'

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card style={{ borderRadius: '12px' }}>
      <CardContent className="p-4">
        <p className="text-sm font-semibold mb-4">{title}</p>
        {children}
      </CardContent>
    </Card>
  )
}

function StatChip({ label, value, sub, trend }: {
  label: string; value: string | number; sub?: string; trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <div className="bg-[#141A1B] rounded-xl p-4 border" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
      <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: '#7B8889' }}>{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-bold" style={{ color: DARK }}>{value}</span>
        {sub && <span className="text-sm" style={{ color: '#7B8889' }}>{sub}</span>}
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-1">
          {trend === 'up'      && <TrendingUp  className="w-3.5 h-3.5" style={{ color: G }} />}
          {trend === 'down'    && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
        </div>
      )}
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
          <div key={d} className="text-center text-xs text-muted-foreground font-medium">{d}</div>
        ))}
      </div>
      {weekRows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-7 gap-1.5 mb-1.5">
          {row.map((day, di) => {
            if (!day) return <div key={di} className="aspect-square rounded-md" />
            const bg = day.isFuture ? '#f8fafc'
              : day.completed ? 'rgba(190,242,100,0.12)' : 'rgba(255,255,255,0.06)'
            const border = day.isFuture ? '#e2e8f0'
              : day.completed ? G : '#4A5454'
            return (
              <div
                key={di}
                className="aspect-square rounded-md border-2"
                style={{ background: bg, borderColor: border }}
                title={`${day.date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}${day.completed ? ': Sessie' : ''}`}
              />
            )
          })}
        </div>
      ))}
      <div className="flex items-center gap-4 mt-3">
        {[
          { color: 'rgba(190,242,100,0.12)', border: G,       label: 'Sessie' },
          { color: 'rgba(255,255,255,0.06)', border: '#4A5454', label: 'Geen sessie' },
        ].map(({ color, border, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded border-2" style={{ background: color, borderColor: border }} />
            <span className="text-xs text-muted-foreground">{label}</span>
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
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)

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

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl animate-pulse">
        <div className="h-5 w-32 bg-[#1C2425] rounded" />
        <div className="h-24 bg-[#1C2425] rounded-xl" />
        <div className="h-48 bg-[#1C2425] rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Back */}
      <Link
        href={`/therapist/patients/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {patient?.name ?? 'Patiënt'}
      </Link>

      <div>
        <h1 className="text-xl font-bold">Voortgangsrapport</h1>
        <p className="text-sm text-muted-foreground">Laatste 90 dagen · {sessions.length} sessies</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip label="Sessies" value={progress?.totalSessions ?? 0}
          icon={<CheckCircle2 className="w-4 h-4" />} />
        <StatChip label="Gem. pijn" value={progress?.avgPain !== null && progress?.avgPain !== undefined ? `${progress.avgPain}/10` : '—'}
          trend={painTrend === 'down' ? 'up' : painTrend === 'up' ? 'down' : 'neutral'} />
        <StatChip label="Gem. RPE" value={progress?.avgExertion !== null && progress?.avgExertion !== undefined ? `${progress.avgExertion}/10` : '—'} />
        <StatChip label="Oefeningen" value={exerciseNames.length} sub="met 1RM" />
      </div>

      {sessions.length === 0 ? (
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="py-12 text-center">
            <Activity className="w-10 h-10 mx-auto mb-3 text-zinc-300" />
            <p className="font-semibold text-sm">Nog geen sessies</p>
            <p className="text-xs text-muted-foreground mt-1">Zodra de patiënt sessies afrondt verschijnen hier de gegevens.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="sessies" className="space-y-4">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="sessies" className="text-xs">Sessies</TabsTrigger>
            <TabsTrigger value="kalender" className="text-xs">Kalender</TabsTrigger>
            <TabsTrigger value="krachtopbouw" className="text-xs">1RM</TabsTrigger>
          </TabsList>

          {/* ── Sessies tab ── */}
          <TabsContent value="sessies" className="space-y-4">
            {sessionChartData.some(s => s.Pijn !== null) && (
              <ChartCard title="Pijn per sessie (NRS 0–10)">
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={sessionChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="Pijn" stroke="#f87171" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            {sessionChartData.some(s => s.Inspanning !== null) && (
              <ChartCard title="Inspanning per sessie (RPE 0–10)">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={sessionChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="Inspanning" stroke={G} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            <ChartCard title="Sessieduur (minuten)">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={sessionChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="Duur" fill={G} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </TabsContent>

          {/* ── Kalender tab ── */}
          <TabsContent value="kalender">
            <Card style={{ borderRadius: '12px' }}>
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-4">Sessie-aanwezigheid (laatste 8 weken)</p>
                <SessionCalendar sessions={sessions} />
                <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold">{sessions.length}</p>
                    <p className="text-xs text-muted-foreground">Sessies</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{sessions.filter(s => s.durationMinutes > 0).reduce((s, l) => s + l.durationMinutes, 0)}</p>
                    <p className="text-xs text-muted-foreground">Totaal min.</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{progress?.avgExertion !== null && progress?.avgExertion !== undefined ? progress.avgExertion : '—'}</p>
                    <p className="text-xs text-muted-foreground">Gem. RPE</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 1RM tab ── */}
          <TabsContent value="krachtopbouw" className="space-y-4">
            {exerciseNames.length === 0 ? (
              <Card style={{ borderRadius: '14px' }}>
                <CardContent className="py-8 text-center">
                  <Zap className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
                  <p className="text-sm text-muted-foreground">Nog geen gewichtsdata gelogd</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Exercise selector */}
                <div className="flex gap-2 flex-wrap">
                  {exerciseNames.map(name => (
                    <button
                      key={name}
                      onClick={() => setSelectedExercise(name)}
                      className="text-xs px-3 py-1.5 rounded-full border font-medium transition-all"
                      style={{
                        background: (activeEx === name) ? G : SURFACE_HI,
                        color: (activeEx === name) ? '#0A0E0F' : '#7B8889',
                        borderColor: (activeEx === name) ? G : 'rgba(255,255,255,0.12)',
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="1RM (kg)" stroke={G} strokeWidth={2.5} dot={{ r: 4, fill: G }} />
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-center pt-3 border-t">
                      <div>
                        <p className="text-lg font-bold">{oneRmData[0]?.['1RM (kg)'] ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">Start</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{oneRmData[oneRmData.length - 1]?.['1RM (kg)'] ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">Huidig</p>
                      </div>
                      <div>
                        {(() => {
                          const start = oneRmData[0]?.['1RM (kg)'] ?? 0
                          const current = oneRmData[oneRmData.length - 1]?.['1RM (kg)'] ?? 0
                          const diff = current - start
                          return (
                            <>
                              <p className="text-lg font-bold" style={{ color: diff >= 0 ? G : '#f87171' }}>
                                {diff >= 0 ? '+' : ''}{diff} kg
                              </p>
                              <p className="text-xs text-muted-foreground">Verschil</p>
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
  )
}
