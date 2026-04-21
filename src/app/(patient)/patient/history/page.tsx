'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { trpc } from '@/lib/trpc/client'
import { CheckCircle2, Clock, ChevronDown, ChevronUp, Flame, TrendingUp } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

function PainDot({ level }: { level: number }) {
  const color = level <= 3 ? '#BEF264' : level <= 6 ? '#f97316' : '#ef4444'
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
    <div className="rounded-xl px-3 py-2 shadow-lg text-xs" style={{ background: '#1A1A1A', color: '#fff' }}>
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

  const { data: sessions = [], isLoading } = trpc.patient.getSessionHistory.useQuery({ limit: 50 })

  const totalMin = sessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  const avgPain = sessions.filter(s => s.painLevel !== null).length > 0
    ? sessions.filter(s => s.painLevel !== null)
        .reduce((sum, s, _, arr) => sum + (s.painLevel ?? 0) / arr.length, 0)
    : null

  const chartData = [...sessions].reverse().map((s, i) => ({
    name: new Date(s.completedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
    sessieNr: i + 1,
    duur: s.durationMinutes,
    pain: s.painLevel ?? 0,
  }))

  return (
    <div className="min-h-screen pb-6" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-5" style={{ background: '#1A1A1A' }}>
        <h1 className="text-white text-xl font-bold">Voortgang</h1>
        <p className="text-[#7B8889] text-xs mt-0.5">{sessions.length} sessies afgerond</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-3 py-3 text-center">
              <div className="flex justify-center mb-1">
                <Flame className="w-4 h-4" style={{ color: '#f97316' }} />
              </div>
              <p className="text-xl font-bold" style={{ color: '#f97316' }}>{sessions.length}</p>
              <p className="text-xs text-muted-foreground">Totaal</p>
            </CardContent>
          </Card>
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-3 py-3 text-center">
              <div className="flex justify-center mb-1">
                <CheckCircle2 className="w-4 h-4" style={{ color: '#BEF264' }} />
              </div>
              <p className="text-xl font-bold" style={{ color: '#BEF264' }}>
                {avgPain !== null ? avgPain.toFixed(1) : '—'}
              </p>
              <p className="text-xs text-muted-foreground">Gem. pijn</p>
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

        {/* Chart */}
        {chartData.length > 0 && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" style={{ color: '#BEF264' }} />
                  <p className="font-semibold text-sm">Grafiek</p>
                </div>
                <div className="flex rounded-xl overflow-hidden border text-xs font-semibold">
                  <button
                    onClick={() => setActiveChart('volume')}
                    className="px-3 py-1.5 transition-all"
                    style={{
                      background: activeChart === 'volume' ? '#1A1A1A' : 'transparent',
                      color: activeChart === 'volume' ? '#fff' : '#7B8889',
                    }}
                  >
                    Volume
                  </button>
                  <button
                    onClick={() => setActiveChart('pain')}
                    className="px-3 py-1.5 transition-all"
                    style={{
                      background: activeChart === 'pain' ? '#1A1A1A' : 'transparent',
                      color: activeChart === 'pain' ? '#fff' : '#7B8889',
                    }}
                  >
                    Pijn
                  </button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1C2425' }} />
                  <Bar
                    dataKey={activeChart === 'volume' ? 'duur' : 'pain'}
                    name={activeChart === 'volume' ? 'Duur (min)' : 'Pijn (/10)'}
                    radius={[4, 4, 0, 0]}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          activeChart === 'volume'
                            ? '#BEF264'
                            : entry.pain <= 3 ? '#BEF264' : entry.pain <= 6 ? '#f97316' : '#ef4444'
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

        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">Laden…</p>
        )}

        {!isLoading && sessions.length === 0 && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Nog geen sessies voltooid</p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {sessions.map(session => {
            const isOpen = expanded === session.id
            const date = new Date(session.completedAt)
            const dateStr = date.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })

            return (
              <Card key={session.id} style={{ borderRadius: '14px', overflow: 'hidden' }}>
                <CardContent className="px-4 py-3">
                  <button
                    className="w-full flex items-center gap-3 text-left"
                    onClick={() => setExpanded(isOpen ? null : session.id)}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                      style={{ background: 'rgba(190,242,100,0.10)', color: '#BEF264' }}
                    >
                      ✓
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{dateStr}</p>
                      <p className="text-xs text-muted-foreground">
                        {session.exerciseCount} oefeningen · {session.durationMinutes} min
                        {session.programName ? ` · ${session.programName}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {session.painLevel !== null && <PainDot level={session.painLevel} />}
                      {isOpen ? <ChevronUp className="w-4 h-4 text-[#7B8889]" /> : <ChevronDown className="w-4 h-4 text-[#7B8889]" />}
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
                          <p className="text-sm font-semibold">{session.exertionLevel !== null ? `${session.exertionLevel}/10` : '—'}</p>
                          <p className="text-xs text-muted-foreground">Inspanning</p>
                        </div>
                      </div>
                      {session.notes && (
                        <p className="text-xs text-muted-foreground italic bg-[#1C2425] rounded-lg px-3 py-2">
                          &ldquo;{session.notes}&rdquo;
                        </p>
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
