'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { trpc } from '@/lib/trpc/client'
import { CheckCircle2, Clock, ChevronDown, ChevronUp, Flame, TrendingUp } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

function PainDot({ level }: { level: number }) {
  const color = level <= 3 ? '#14B8A6' : level <= 6 ? '#f97316' : '#ef4444'
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color }}>
      <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
      {level}/10
    </span>
  )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{value: number; name: string}>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 shadow-lg text-xs" style={{ background: '#1A3A3A', color: '#fff' }}>
      <p className="font-semibold mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name}>{p.name}: <span className="font-bold">{p.value}</span></p>
      ))}
    </div>
  )
}

export default function HistoryPage() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activeChart, setActiveChart] = useState<'volume' | 'pain'>('volume')

  const { data: sessions, isLoading } = trpc.patient.getSessionHistory.useQuery({ limit: 50 })
  const { data: programData } = trpc.patient.getActiveProgram.useQuery()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAFA' }}>
        <p className="text-muted-foreground text-sm">Laden…</p>
      </div>
    )
  }

  const history = sessions ?? []

  const avgPain = history.filter(s => s.painLevel !== null).length > 0
    ? history.filter(s => s.painLevel !== null).reduce((sum, s) => sum + (s.painLevel ?? 0), 0) / history.filter(s => s.painLevel !== null).length
    : null

  const totalMin = history.reduce((sum, s) => sum + s.durationMinutes, 0)
  const streak = 5 // TODO: compute from consecutive days

  const chartData = [...history].reverse().map(s => ({
    name: new Date(s.completedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
    duur: s.durationMinutes,
    pain: s.painLevel ?? 0,
    volume: s.durationMinutes,
  }))

  return (
    <div className="min-h-screen pb-6" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-5" style={{ background: '#1A3A3A' }}>
        <h1 className="text-white text-xl font-bold">Voortgang</h1>
        <p className="text-zinc-400 text-xs mt-0.5">
          {history.length} sessies
          {programData ? ` · Week ${programData.currentWeek} van ${programData.weeks}` : ''}
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-3 py-3 text-center">
              <div className="flex justify-center mb-1">
                <Flame className="w-4 h-4" style={{ color: '#f97316' }} />
              </div>
              <p className="text-xl font-bold" style={{ color: '#f97316' }}>{streak}</p>
              <p className="text-xs text-muted-foreground">Streak</p>
            </CardContent>
          </Card>
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-3 py-3 text-center">
              <div className="flex justify-center mb-1">
                <CheckCircle2 className="w-4 h-4" style={{ color: '#4ECDC4' }} />
              </div>
              <p className="text-xl font-bold" style={{ color: '#4ECDC4' }}>{history.length}</p>
              <p className="text-xs text-muted-foreground">Sessies</p>
            </CardContent>
          </Card>
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-3 py-3 text-center">
              <div className="flex justify-center mb-1">
                <Clock className="w-4 h-4" style={{ color: '#6366f1' }} />
              </div>
              <p className="text-xl font-bold" style={{ color: '#6366f1' }}>{totalMin}</p>
              <p className="text-xs text-muted-foreground">Minuten</p>
            </CardContent>
          </Card>
        </div>

        {/* Program progress */}
        {programData && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" style={{ color: '#4ECDC4' }} />
                  <p className="font-semibold text-sm">Programma voortgang</p>
                </div>
                <span className="text-xs text-muted-foreground">W{programData.currentWeek}/{programData.weeks}</span>
              </div>
              <div className="w-full h-2 rounded-full" style={{ background: '#f4f4f5' }}>
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${(programData.currentWeek / programData.weeks) * 100}%`,
                    background: '#4ECDC4'
                  }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{history.length} sessies voltooid</span>
                <span>Week {programData.currentWeek} van {programData.weeks}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chart */}
        {chartData.length > 0 && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm">Grafiek</p>
                <div className="flex rounded-xl overflow-hidden border text-xs font-semibold">
                  <button
                    onClick={() => setActiveChart('volume')}
                    className="px-3 py-1.5 transition-all"
                    style={{
                      background: activeChart === 'volume' ? '#1A3A3A' : 'transparent',
                      color: activeChart === 'volume' ? '#fff' : '#71717a',
                    }}
                  >
                    Volume
                  </button>
                  <button
                    onClick={() => setActiveChart('pain')}
                    className="px-3 py-1.5 transition-all"
                    style={{
                      background: activeChart === 'pain' ? '#1A3A3A' : 'transparent',
                      color: activeChart === 'pain' ? '#fff' : '#71717a',
                    }}
                  >
                    Pijn
                  </button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f4f4f5' }} />
                  <Bar
                    dataKey={activeChart === 'volume' ? 'volume' : 'pain'}
                    name={activeChart === 'volume' ? 'Volume (min)' : 'Pijn (/10)'}
                    radius={[4, 4, 0, 0]}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          activeChart === 'volume'
                            ? '#4ECDC4'
                            : entry.pain <= 3 ? '#4ECDC4' : entry.pain <= 6 ? '#f97316' : '#ef4444'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Session list */}
        <p className="font-semibold text-sm px-1">Sessiegeschiedenis</p>
        {history.length === 0 ? (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-6 text-center">
              <p className="text-muted-foreground text-sm">Nog geen sessies voltooid</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.map(session => {
              const isOpen = expanded === session.id
              const date = new Date(session.completedAt)
              const dateStr = date.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })

              return (
                <Card key={session.id} style={{ borderRadius: '14px' }}>
                  <CardContent className="px-4 py-3">
                    <button
                      className="w-full flex items-center gap-3 text-left"
                      onClick={() => setExpanded(isOpen ? null : session.id)}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                        style={{ background: '#f0fdfa', color: '#4ECDC4' }}
                      >
                        ✓
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{dateStr}</p>
                        <p className="text-xs text-muted-foreground">
                          {session.programName ? `${session.programName} · ` : ''}{session.durationMinutes} min · {session.exerciseCount} oefeningen
                        </p>
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
                            <p className="text-sm font-semibold">{session.exerciseCount}</p>
                            <p className="text-xs text-muted-foreground">Oefeningen</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{session.durationMinutes} min</p>
                            <p className="text-xs text-muted-foreground">Duur</p>
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
                        {avgPain !== null && avgPain > 5 && (
                          <Badge variant="outline" className="text-xs" style={{ color: '#f97316', borderColor: '#fed7aa' }}>
                            Hoge pijnscore
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
