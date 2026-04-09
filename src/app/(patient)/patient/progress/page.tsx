'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { trpc } from '@/lib/trpc/client'
import {
  Flame, TrendingUp, TrendingDown, CheckCircle2,
  Target, Calendar, BarChart3, Plus,
} from 'lucide-react'

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
