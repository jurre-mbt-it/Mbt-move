'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  MOCK_PATIENT,
  MOCK_SESSION_HISTORY,
  getTodayExercises,
  getWeekSchedule,
  getMockRecoverySessions,
  DAY_NAMES,
  TODAY_DAY,
} from '@/lib/patient-constants'
import { RecoveryPanel } from '@/components/recovery/RecoveryPanel'
import { WorkloadPanel } from '@/components/workload/WorkloadPanel'
import { getMockWorkloadSessions } from '@/lib/workload-monitoring'
import { Play, CheckCircle2, Flame, TrendingUp, Calendar, ChevronRight, Plus, Dumbbell } from 'lucide-react'
import { DAY_LABELS } from '@/lib/program-constants'
import { Progress } from '@/components/ui/progress'

export default function AthleteDashboard() {
  const todayExercises = getTodayExercises()
  const weekSchedule = getWeekSchedule()
  const recoverySessions = getMockRecoverySessions()
  const workloadSessions = getMockWorkloadSessions()
  const activeDays = Object.keys(weekSchedule).map(Number).sort()

  const lastSession = MOCK_SESSION_HISTORY[0]
  const streak = 5
  const weekTotal = activeDays.length
  const weekCompleted = Math.min(MOCK_SESSION_HISTORY.filter(s => s.week === 1).length, weekTotal)
  const weekProgress = weekTotal > 0 ? (weekCompleted / weekTotal) * 100 : 0

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond'

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-8" style={{ background: '#1A3A3A' }}>
        <p className="text-zinc-400 text-sm">{greeting}</p>
        <h1 className="text-white text-2xl font-bold mt-0.5">{MOCK_PATIENT.name.split(' ')[0]} 💪</h1>
        <p className="text-zinc-400 text-xs mt-1">Atleet Dashboard</p>
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<Flame className="w-4 h-4" style={{ color: '#f97316' }} />} value={streak} label="Streak" />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" style={{ color: '#4ECDC4' }} />} value={MOCK_SESSION_HISTORY.length} label="Sessies" />
          <StatCard icon={<TrendingUp className="w-4 h-4" style={{ color: '#6366f1' }} />} value={`${Math.round(weekProgress)}%`} label="Deze week" />
        </div>

        {/* Quick actions for athletes */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/athlete/programs/new">
            <Card style={{ borderRadius: '14px' }} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#4ECDC420' }}>
                  <Plus className="w-5 h-5" style={{ color: '#4ECDC4' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Programma</p>
                  <p className="text-xs text-muted-foreground">Eigen schema maken</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/athlete/exercises">
            <Card style={{ borderRadius: '14px' }} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#6366f120' }}>
                  <Dumbbell className="w-5 h-5" style={{ color: '#6366f1' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Oefeningen</p>
                  <p className="text-xs text-muted-foreground">Toevoegen & beheren</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Today's session */}
        {todayExercises.length > 0 && (
          <Card style={{ borderRadius: '14px', overflow: 'hidden' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#4ECDC4' }}>
              <div>
                <p className="text-white text-xs font-medium opacity-80">Vandaag · {DAY_NAMES[TODAY_DAY - 1]}</p>
                <p className="text-white font-bold text-base">{todayExercises.length} oefeningen</p>
              </div>
              <Link href="/athlete/session">
                <Button size="sm" className="bg-white gap-1.5 font-semibold text-xs" style={{ color: '#0D6B6E' }}>
                  <Play className="w-3 h-3 fill-current" /> Start
                </Button>
              </Link>
            </div>
            <CardContent className="px-4 py-3 space-y-2.5">
              {todayExercises.slice(0, 3).map(e => (
                <div key={e.uid} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm" style={{ background: '#f4f4f5' }}>
                    💪
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.sets} x {e.reps} {e.repUnit}</p>
                  </div>
                </div>
              ))}
              {todayExercises.length > 3 && (
                <p className="text-xs text-muted-foreground pt-0.5">+{todayExercises.length - 3} meer</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Week overview */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm">Week 1 voortgang</p>
              <span className="text-xs text-muted-foreground">{weekCompleted}/{weekTotal} sessies</span>
            </div>
            <Progress value={weekProgress} className="h-1.5 mb-4" />
            <div className="flex gap-1.5 justify-between">
              {DAY_LABELS.map((label, i) => {
                const dayNum = i + 1
                const hasSession = activeDays.includes(dayNum)
                const isDone = dayNum < TODAY_DAY && hasSession
                const isToday = dayNum === TODAY_DAY
                return (
                  <div key={label} className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className="w-full aspect-square rounded-full flex items-center justify-center text-xs font-medium max-w-[36px]"
                      style={
                        isDone ? { background: '#4ECDC4', color: 'white' }
                          : isToday ? { background: '#1A3A3A', color: 'white' }
                            : hasSession ? { background: '#f4f4f5', color: '#52525b' }
                              : { background: 'transparent', color: '#d4d4d8' }
                      }
                    >
                      {isDone ? '✓' : label.slice(0, 2)}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recovery panel */}
        <RecoveryPanel sessions={recoverySessions} />

        {/* ACWR workload monitoring */}
        <WorkloadPanel sessions={workloadSessions} />

        {/* Last session recap */}
        {lastSession && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm">Laatste sessie</p>
                <Link href="/athlete/history" className="text-xs flex items-center gap-0.5" style={{ color: '#4ECDC4' }}>
                  Alles <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#f0fdfa' }}>
                  <Calendar className="w-5 h-5" style={{ color: '#4ECDC4' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{lastSession.dayLabel} · W{lastSession.week + 1}D{lastSession.day}</p>
                  <p className="text-xs text-muted-foreground">{lastSession.exercisesCompleted}/{lastSession.exercisesTotal} oefeningen · {lastSession.duration} min</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <Card style={{ borderRadius: '14px' }}>
      <CardContent className="px-3 py-3">
        <div className="mb-1">{icon}</div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
