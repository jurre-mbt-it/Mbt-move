'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { trpc } from '@/lib/trpc/client'
import {
  Flame, TrendingUp, TrendingDown, CheckCircle2,
  Target, Calendar, BarChart3, Plus, Trophy, Activity,
} from 'lucide-react'

// ─── Mock 1RM progression data ────────────────────────────────────────────────
const MOCK_1RM_DATA = [
  {
    exerciseId: '1',
    name: 'Bulgarian Split Squat',
    data: [
      { session: 1, date: '2026-01-10', value: 75 },
      { session: 2, date: '2026-01-17', value: 78 },
      { session: 3, date: '2026-01-24', value: 80 },
      { session: 4, date: '2026-01-31', value: 83 },
      { session: 5, date: '2026-02-07', value: 88 },
      { session: 6, date: '2026-02-14', value: 88 },
      { session: 7, date: '2026-02-21', value: 92 },
    ],
  },
  {
    exerciseId: '4',
    name: 'Single Leg Deadlift',
    data: [
      { session: 1, date: '2026-01-10', value: 50 },
      { session: 2, date: '2026-01-17', value: 53 },
      { session: 3, date: '2026-01-24', value: 55 },
      { session: 4, date: '2026-01-31', value: 55 },
      { session: 5, date: '2026-02-07', value: 58 },
      { session: 6, date: '2026-02-14', value: 60 },
      { session: 7, date: '2026-02-21', value: 65 },
    ],
  },
]

// ─── Mock tendinopathy pain data ───────────────────────────────────────────────
const MOCK_TENDINOPATHY_DATA = [
  { session: 1, date: '2026-01-10', painDuring: 3, painAfter24h: 4, morningStiffness: 3 },
  { session: 2, date: '2026-01-17', painDuring: 4, painAfter24h: 4, morningStiffness: 3 },
  { session: 3, date: '2026-01-24', painDuring: 3, painAfter24h: 3, morningStiffness: 2 },
  { session: 4, date: '2026-01-31', painDuring: 3, painAfter24h: 2, morningStiffness: 2 },
  { session: 5, date: '2026-02-07', painDuring: 2, painAfter24h: 2, morningStiffness: 1 },
  { session: 6, date: '2026-02-14', painDuring: 2, painAfter24h: 1, morningStiffness: 1 },
  { session: 7, date: '2026-02-21', painDuring: 2, painAfter24h: 1, morningStiffness: 1 },
]

const DAY_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

export default function ProgressPage() {
  const { data: sessions } = trpc.patient.getSessionHistory.useQuery({ limit: 50 })
  const { data: program } = trpc.patient.getActiveProgram.useQuery()

  const history = sessions ?? []
  const streak = 5 // TODO: compute from consecutive days

  const avgPain = history.filter(s => s.painLevel !== null).length > 0
    ? history.filter(s => s.painLevel !== null).reduce((sum, s) => sum + (s.painLevel ?? 0), 0) / history.filter(s => s.painLevel !== null).length
    : null

  const totalSessionsPlanned = program ? program.weeks * program.daysPerWeek : 0
  const adherence = totalSessionsPlanned > 0
    ? Math.min(Math.round((history.length / totalSessionsPlanned) * 100), 100)
    : 0

  // Pain trend: recent 3 vs older
  const painSessions = history.filter(s => s.painLevel !== null)
  const recentPain = painSessions.slice(0, 3).reduce((a, b) => a + (b.painLevel ?? 0), 0) / Math.max(painSessions.slice(0, 3).length, 1)
  const olderPain = painSessions.slice(3).reduce((a, b) => a + (b.painLevel ?? 0), 0) / Math.max(painSessions.slice(3).length, 1)
  const painImproving = painSessions.length >= 4 && recentPain < olderPain

  // Volume per week from session history
  const weeklyVolume: { week: number; volume: number; label: string }[] = []
  if (program) {
    for (let w = 1; w <= program.currentWeek; w++) {
      weeklyVolume.push({ week: w, volume: 0, label: `W${w}` })
    }
    history.forEach(s => {
      // Estimate week from completedAt vs program startDate
      if (program.startDate) {
        const start = new Date(program.startDate)
        const completed = new Date(s.completedAt)
        const daysSince = Math.max(0, Math.floor((completed.getTime() - start.getTime()) / 86_400_000))
        const weekIdx = Math.min(Math.floor(daysSince / 7), weeklyVolume.length - 1)
        if (weeklyVolume[weekIdx]) {
          weeklyVolume[weekIdx].volume += s.durationMinutes
        }
      }
    })
  }
  const maxVolume = Math.max(...weeklyVolume.map(w => w.volume), 1)

  // This week's sessions
  const today = new Date().getDay()
  const todayDayNum = today === 0 ? 7 : today
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
  weekStart.setHours(0, 0, 0, 0)
  const thisWeekSessions = history.filter(s => new Date(s.completedAt) >= weekStart)
  const daysWithSessions = new Set(thisWeekSessions.map(s => {
    const d = new Date(s.completedAt).getDay()
    return d === 0 ? 7 : d
  }))

  return (
    <div className="min-h-screen pb-6" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-5" style={{ background: '#1A3A3A' }}>
        <h1 className="text-white text-xl font-bold">Voortgang</h1>
        {program && <p className="text-zinc-400 text-xs mt-0.5">{program.name}</p>}
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Top stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Flame className="w-5 h-5" style={{ color: '#f97316' }} />}
            value={streak}
            unit="dagen"
            label="Streak"
            bg="#fff7ed"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" style={{ color: '#4ECDC4' }} />}
            value={history.length}
            unit="sessies"
            label="Voltooid"
            bg="#f0fdfa"
          />
        </div>

        {/* Adherence */}
        {totalSessionsPlanned > 0 && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <p className="font-semibold text-sm">Adherentie</p>
                </div>
                <span className="text-sm font-bold" style={{ color: '#4ECDC4' }}>{adherence}%</span>
              </div>
              <Progress value={adherence} className="h-2.5 mb-2" />
              <p className="text-xs text-muted-foreground">
                {history.length} van {totalSessionsPlanned} geplande sessies gedaan
              </p>
            </CardContent>
          </Card>
        )}

        {/* Pain trend */}
        {painSessions.length > 0 && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-4">
              <div className="flex items-center gap-2 mb-3">
                {painImproving
                  ? <TrendingDown className="w-4 h-4" style={{ color: '#4ECDC4' }} />
                  : <TrendingUp className="w-4 h-4" style={{ color: '#f97316' }} />}
                <p className="font-semibold text-sm">Pijnverloop</p>
                {avgPain !== null && (
                  <span className="text-xs ml-auto text-muted-foreground">
                    gem. {Math.round(avgPain * 10) / 10}/10
                  </span>
                )}
              </div>
              <div className="flex items-end gap-1.5 h-20 mb-2">
                {[...history].reverse().slice(0, 10).map((s, i) => {
                  const pain = s.painLevel ?? 0
                  const heightPct = (pain / 10) * 100
                  const color = pain <= 3 ? '#4ECDC4' : pain <= 6 ? '#f97316' : '#ef4444'
                  return (
                    <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-md transition-all relative"
                        style={{ height: `${heightPct}%`, background: color, minHeight: 4 }}
                      >
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold"
                          style={{ color }}>
                          {pain}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400">S{i + 1}</span>
                    </div>
                  )
                })}
              </div>
              {painImproving && (
                <p className="text-xs" style={{ color: '#0D6B6E' }}>
                  ↓ Je pijn verbetert de laatste 3 sessies — goed bezig!
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Volume per week */}
        {weeklyVolume.length > 0 && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <p className="font-semibold text-sm">Volume per week</p>
                <span className="text-xs ml-auto text-muted-foreground">minuten</span>
              </div>
              <div className="flex items-end gap-2 h-24">
                {weeklyVolume.map(w => {
                  const heightPct = (w.volume / maxVolume) * 100
                  const isCurrent = w.week === program?.currentWeek
                  return (
                    <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-semibold"
                        style={{ color: isCurrent ? '#4ECDC4' : '#71717a' }}>
                        {w.volume}
                      </span>
                      <div
                        className="w-full rounded-t-lg"
                        style={{
                          height: `${heightPct}%`,
                          background: isCurrent ? '#4ECDC4' : '#e4e4e7',
                          minHeight: 4,
                        }}
                      />
                      <span className="text-[10px] text-zinc-400">{w.label}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* This week calendar */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <p className="font-semibold text-sm">Sessies deze week</p>
            </div>
            <div className="flex gap-1.5">
              {DAY_SHORT.map((d, i) => {
                const dayNum = i + 1
                const hadSession = daysWithSessions.has(dayNum)
                const isToday = dayNum === todayDayNum
                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full aspect-square rounded-xl flex items-center justify-center text-xs font-semibold max-w-[36px]"
                      style={
                        hadSession ? { background: '#4ECDC4', color: 'white' }
                          : isToday ? { background: '#1A3A3A', color: 'white' }
                            : { background: '#f4f4f5', color: '#d4d4d8' }
                      }
                    >
                      {hadSession ? '✓' : d.slice(0, 1)}
                    </div>
                    <span className="text-[10px] text-zinc-400">{d}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── 1RM Progressie ─────────────────────────────────────────────── */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4" style={{ color: '#3ECF6A' }} />
              <p className="font-semibold text-sm">1RM Progressie</p>
            </div>
            <div className="space-y-4">
              {MOCK_1RM_DATA.map(ex => {
                const first = ex.data[0]?.value ?? 0
                const last = ex.data[ex.data.length - 1]?.value ?? 0
                const pctChange = first > 0 ? Math.round(((last - first) / first) * 100) : 0
                const maxVal = Math.max(...ex.data.map(d => d.value))
                const minVal = Math.min(...ex.data.map(d => d.value))
                const range = maxVal - minVal || 1
                // Auto-regulatie suggestie
                const last3 = ex.data.slice(-3).map(d => d.value)
                const isStagnant = last3.length === 3 && last3[2] <= last3[0]
                const suggestion = isStagnant
                  ? '⚠️ Deload aanbevolen — 3 sessies geen progressie'
                  : `💡 Volgende sessie: probeer ${last + 2.5} kg`
                return (
                  <div key={ex.exerciseId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{ex.name}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold">{last} kg</span>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{
                            background: pctChange >= 0 ? '#3ECF6A22' : '#fef2f2',
                            color: pctChange >= 0 ? '#3ECF6A' : '#dc2626',
                          }}
                        >
                          {pctChange >= 0 ? '+' : ''}{pctChange}%
                        </span>
                      </div>
                    </div>
                    {/* Mini line chart using SVG */}
                    <svg viewBox={`0 0 ${ex.data.length * 30} 40`} className="w-full" style={{ height: 40 }}>
                      <polyline
                        fill="none"
                        stroke="#3ECF6A"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={ex.data.map((d, i) => {
                          const x = i * 30 + 5
                          const y = 35 - ((d.value - minVal) / range) * 30
                          return `${x},${y}`
                        }).join(' ')}
                      />
                      {ex.data.map((d, i) => {
                        const x = i * 30 + 5
                        const y = 35 - ((d.value - minVal) / range) * 30
                        const isLast = i === ex.data.length - 1
                        return (
                          <circle key={i} cx={x} cy={y} r={isLast ? 4 : 2.5}
                            fill={isLast ? '#3ECF6A' : 'white'}
                            stroke="#3ECF6A" strokeWidth="1.5"
                          />
                        )
                      })}
                    </svg>
                    <p className="text-[10px] text-muted-foreground">{suggestion}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Tendinopathie monitor ──────────────────────────────────────── */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <p className="font-semibold text-sm">Tendinopathie monitor</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Pijn tijdens · 24u na · Ochtend stijfheid</p>

            {/* Silbernagel status */}
            {(() => {
              const last3 = MOCK_TENDINOPATHY_DATA.slice(-3).map(d => d.painDuring)
              const latestPain = MOCK_TENDINOPATHY_DATA[MOCK_TENDINOPATHY_DATA.length - 1]?.painDuring ?? 0
              const rising = last3.length === 3 && last3[2] > last3[0] + 1
              let status: 'green' | 'yellow' | 'red' = 'green'
              if (latestPain > 7 || rising) status = 'red'
              else if (latestPain > 5) status = 'yellow'
              const statusConfig = {
                green:  { label: 'Groen — belasting OK', bg: '#f0fdf4', color: '#166534', dot: '#3ECF6A' },
                yellow: { label: 'Geel — verhoogde pijn, monitor', bg: '#fffbeb', color: '#92400e', dot: '#f97316' },
                red:    { label: 'Rood — stop, consult therapeut', bg: '#fef2f2', color: '#991b1b', dot: '#ef4444' },
              }[status]
              return (
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3 text-xs font-semibold"
                  style={{ background: statusConfig.bg, color: statusConfig.color }}
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: statusConfig.dot }} />
                  Silbernagel: {statusConfig.label}
                </div>
              )
            })()}

            {/* Multi-line mini chart */}
            {(() => {
              const data = MOCK_TENDINOPATHY_DATA
              const n = data.length
              return (
                <div className="space-y-1">
                  <svg viewBox={`0 0 ${n * 30} 50`} className="w-full" style={{ height: 50 }}>
                    {/* painDuring — oranje */}
                    <polyline fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      points={data.map((d, i) => `${i * 30 + 5},${45 - (d.painDuring / 10) * 40}`).join(' ')} />
                    {/* painAfter24h — blauw */}
                    <polyline fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      points={data.map((d, i) => `${i * 30 + 5},${45 - ((d.painAfter24h ?? 0) / 10) * 40}`).join(' ')} />
                    {/* morningStiffness — paars */}
                    <polyline fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      points={data.map((d, i) => `${i * 30 + 5},${45 - ((d.morningStiffness ?? 0) / 10) * 40}`).join(' ')} />
                  </svg>
                  <div className="flex gap-3 text-[10px]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#f97316' }} />Tijdens</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#60a5fa' }} />24u na</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#a78bfa' }} />Ochtend</span>
                  </div>
                  <Link href="/patient/follow-up" className="inline-flex items-center gap-1 text-[11px] font-medium mt-1" style={{ color: '#3ECF6A' }}>
                    <Plus className="w-3 h-3" />
                    24u follow-up invullen
                  </Link>
                </div>
              )
            })()}
          </CardContent>
        </Card>

        {/* Pain report CTA */}
        <Link
          href="/patient/pain"
          className="flex items-center gap-3 p-4 rounded-2xl border bg-white"
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#fef2f2' }}>
            <Plus className="w-5 h-5" style={{ color: '#ef4444' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Pijn rapporteren</p>
            <p className="text-xs text-muted-foreground">Los van een sessie</p>
          </div>
        </Link>
      </div>
    </div>
  )
}

function StatCard({
  icon, value, unit, label, bg,
}: {
  icon: React.ReactNode
  value: number
  unit: string
  label: string
  bg: string
}) {
  return (
    <Card style={{ borderRadius: '14px' }}>
      <CardContent className="px-4 py-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: bg }}>
          {icon}
        </div>
        <p className="text-2xl font-bold leading-none">
          {value}<span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  )
}
