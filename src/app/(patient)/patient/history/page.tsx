'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MOCK_SESSION_HISTORY } from '@/lib/patient-constants'
import { CheckCircle2, Clock, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react'

function PainDot({ level }: { level: number }) {
  const color = level <= 3 ? '#22c55e' : level <= 6 ? '#f97316' : '#ef4444'
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color }}>
      <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
      {level}/10
    </span>
  )
}

export default function HistoryPage() {
  const [expanded, setExpanded] = useState<string | null>(null)

  const avgPain = MOCK_SESSION_HISTORY
    .filter(s => s.painLevel !== null)
    .reduce((sum, s, _, arr) => sum + (s.painLevel ?? 0) / arr.length, 0)

  const totalMin = MOCK_SESSION_HISTORY.reduce((sum, s) => sum + s.duration, 0)
  const compliance = Math.round(
    (MOCK_SESSION_HISTORY.reduce((sum, s) => sum + s.exercisesCompleted / s.exercisesTotal, 0) /
      MOCK_SESSION_HISTORY.length) * 100
  )

  return (
    <div className="min-h-screen pb-6" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-5" style={{ background: '#1A1A1A' }}>
        <h1 className="text-white text-xl font-bold">Sessiegeschiedenis</h1>
        <p className="text-zinc-400 text-xs mt-0.5">{MOCK_SESSION_HISTORY.length} sessies gelogd</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatTile value={`${Math.round(avgPain * 10) / 10}`} label="Gem. pijn" sub="/10" color="#f97316" />
          <StatTile value={`${totalMin}`} label="Totaal" sub="min" color="#6366f1" />
          <StatTile value={`${compliance}%`} label="Compliance" sub="" color="#3ECF6A" />
        </div>

        {/* Pain trend (simple visual) */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4" style={{ color: '#3ECF6A' }} />
              <p className="font-semibold text-sm">Pijnverloop</p>
            </div>
            <div className="flex items-end gap-1 h-16">
              {[...MOCK_SESSION_HISTORY].reverse().map((s, i) => {
                const pain = s.painLevel ?? 0
                const heightPct = (pain / 10) * 100
                const color = pain <= 3 ? '#3ECF6A' : pain <= 6 ? '#f97316' : '#ef4444'
                return (
                  <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-sm transition-all"
                      style={{ height: `${heightPct}%`, background: color, minHeight: 4 }}
                    />
                    <span className="text-xs text-zinc-400">S{i + 1}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Session list */}
        <div className="space-y-2">
          {MOCK_SESSION_HISTORY.map(session => {
            const isOpen = expanded === session.id
            const completion = Math.round((session.exercisesCompleted / session.exercisesTotal) * 100)
            const date = new Date(session.date)
            const dateStr = date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })

            return (
              <Card key={session.id} style={{ borderRadius: '14px' }}>
                <CardContent className="px-4 py-3">
                  <button
                    className="w-full flex items-center gap-3 text-left"
                    onClick={() => setExpanded(isOpen ? null : session.id)}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                      style={{ background: completion === 100 ? '#f0fdf4' : '#f4f4f5', color: completion === 100 ? '#3ECF6A' : '#52525b' }}
                    >
                      {completion === 100 ? '✓' : `${completion}%`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{session.dayLabel}</p>
                      <p className="text-xs text-muted-foreground">W{session.week + 1}D{session.day} · {dateStr}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {session.painLevel !== null && <PainDot level={session.painLevel} />}
                      {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-sm font-semibold">{session.exercisesCompleted}/{session.exercisesTotal}</p>
                          <p className="text-xs text-muted-foreground">Oefeningen</p>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <p className="text-sm font-semibold">{session.duration}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">Minuten</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{session.exertionLevel ?? '—'}/10</p>
                          <p className="text-xs text-muted-foreground">Inspanning</p>
                        </div>
                      </div>
                      {session.notes ? (
                        <p className="text-xs text-muted-foreground italic bg-zinc-50 rounded-lg px-3 py-2">
                          &ldquo;{session.notes}&rdquo;
                        </p>
                      ) : null}
                      {completion < 100 && (
                        <Badge variant="outline" className="text-xs" style={{ color: '#f97316', borderColor: '#fed7aa' }}>
                          Niet volledig afgerond
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatTile({ value, label, sub, color }: { value: string; label: string; sub: string; color: string }) {
  return (
    <Card style={{ borderRadius: '14px' }}>
      <CardContent className="px-3 py-3 text-center">
        <p className="text-xl font-bold" style={{ color }}>{value}<span className="text-xs font-normal text-muted-foreground ml-0.5">{sub}</span></p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  )
}
