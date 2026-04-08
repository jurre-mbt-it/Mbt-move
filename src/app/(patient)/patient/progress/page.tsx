'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { MOCK_SESSION_HISTORY, MOCK_PATIENT } from '@/lib/patient-constants'
import {
  Flame, TrendingUp, TrendingDown, CheckCircle2,
  Target, Calendar, BarChart3, Plus,
} from 'lucide-react'

// ─── Mock adherence data ──────────────────────────────────────────────────────
const TOTAL_SESSIONS_PLANNED = 12 // 4 weeks × 3/week
const STREAK = 5
const ADHERENCE = Math.round((MOCK_SESSION_HISTORY.length / TOTAL_SESSIONS_PLANNED) * 100)

// Simple weekly volume mock (sets × reps per week)
const WEEKLY_VOLUME = [
  { week: 1, volume: 180, label: 'W1' },
  { week: 2, volume: 210, label: 'W2' },
  { week: 3, volume: 230, label: 'W3' },
  { week: 4, volume: 195, label: 'W4 (huidig)' },
]
const maxVolume = Math.max(...WEEKLY_VOLUME.map(w => w.volume))

export default function ProgressPage() {
  const avgPain = MOCK_SESSION_HISTORY
    .filter(s => s.painLevel !== null)
    .reduce((sum, s, _, arr) => sum + (s.painLevel ?? 0) / arr.length, 0)

  const painTrend = MOCK_SESSION_HISTORY.slice(0, 3).reduce((a, b) => a + (b.painLevel ?? 0), 0) / 3
  const painOlder = MOCK_SESSION_HISTORY.slice(3).reduce((a, b) => a + (b.painLevel ?? 0), 0) / Math.max(MOCK_SESSION_HISTORY.slice(3).length, 1)
  const painImproving = painTrend < painOlder

  return (
    <div className="min-h-screen pb-6" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-5" style={{ background: '#1A3A3A' }}>
        <h1 className="text-white text-xl font-bold">Voortgang</h1>
        <p className="text-zinc-400 text-xs mt-0.5">{MOCK_PATIENT.programName}</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Top stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Flame className="w-5 h-5" style={{ color: '#f97316' }} />}
            value={STREAK}
            unit="dagen"
            label="Streak"
            bg="#fff7ed"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" style={{ color: '#4ECDC4' }} />}
            value={MOCK_SESSION_HISTORY.length}
            unit="sessies"
            label="Voltooid"
            bg="#f0fdfa"
          />
        </div>

        {/* Adherence */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <p className="font-semibold text-sm">Adherentie</p>
              </div>
              <span className="text-sm font-bold" style={{ color: '#4ECDC4' }}>{ADHERENCE}%</span>
            </div>
            <Progress value={ADHERENCE} className="h-2.5 mb-2" />
            <p className="text-xs text-muted-foreground">
              {MOCK_SESSION_HISTORY.length} van {TOTAL_SESSIONS_PLANNED} geplande sessies gedaan
            </p>
          </CardContent>
        </Card>

        {/* Pain trend */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              {painImproving
                ? <TrendingDown className="w-4 h-4" style={{ color: '#4ECDC4' }} />
                : <TrendingUp className="w-4 h-4" style={{ color: '#f97316' }} />}
              <p className="font-semibold text-sm">Pijnverloop</p>
              <span className="text-xs ml-auto text-muted-foreground">
                gem. {Math.round(avgPain * 10) / 10}/10
              </span>
            </div>
            <div className="flex items-end gap-1.5 h-20 mb-2">
              {[...MOCK_SESSION_HISTORY].reverse().map((s, i) => {
                const pain = s.painLevel ?? 0
                const heightPct = (pain / 10) * 100
                const color = pain <= 3 ? '#4ECDC4' : pain <= 6 ? '#f97316' : '#ef4444'
                return (
                  <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-md transition-all relative group"
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

        {/* Volume per week */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <p className="font-semibold text-sm">Volume per week</p>
              <span className="text-xs ml-auto text-muted-foreground">sets × reps</span>
            </div>
            <div className="flex items-end gap-2 h-24">
              {WEEKLY_VOLUME.map(w => {
                const heightPct = (w.volume / maxVolume) * 100
                const isCurrent = w.label.includes('huidig')
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
                    <span className="text-[10px] text-zinc-400">{w.label.replace(' (huidig)', '')}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Weekly calendar */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <p className="font-semibold text-sm">Sessies week 4</p>
            </div>
            <div className="flex gap-1.5">
              {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map((d, i) => {
                // Mock: week 4 has sessions on Ma, Wo, Vr (indices 0, 2, 4)
                const hadSession = [0, 2].includes(i)
                const isToday = i === 1 // Di
                const isPlanned = [0, 2, 4].includes(i)
                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full aspect-square rounded-xl flex items-center justify-center text-xs font-semibold max-w-[36px]"
                      style={
                        hadSession ? { background: '#4ECDC4', color: 'white' }
                          : isToday ? { background: '#1A3A3A', color: 'white' }
                            : isPlanned ? { background: '#f4f4f5', color: '#4ECDC4' }
                              : { background: '#f9f9f9', color: '#d4d4d8' }
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
