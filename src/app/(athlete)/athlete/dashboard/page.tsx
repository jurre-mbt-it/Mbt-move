'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { trpc } from '@/lib/trpc/client'
import { RecoveryPanel } from '@/components/recovery/RecoveryPanel'
import { WorkloadPanel } from '@/components/workload/WorkloadPanel'
import { Play, CheckCircle2, Flame, TrendingUp, Calendar, ChevronRight, Plus, Dumbbell, Zap } from 'lucide-react'
import { IconStrength, IconCelebration } from '@/components/icons'
import { DAY_LABELS } from '@/lib/program-constants'
import { Progress } from '@/components/ui/progress'
import { createClient } from '@/lib/supabase/client'

const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

export default function AthleteDashboard() {
  const [userName, setUserName] = useState('')

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserName(user.user_metadata?.name || user.email?.split('@')[0] || '')
      }
    }
    loadUser()
  }, [])

  const { data: sessionData } = trpc.patient.getTodayExercises.useQuery()
  const { data: activeProgram } = trpc.patient.getActiveProgram.useQuery()
  const { data: sessionHistory } = trpc.patient.getSessionHistory.useQuery({ limit: 20 })
  const { data: rawWorkloadSessions } = trpc.patient.getWorkloadSessions.useQuery()
  const { data: rawRecoverySessions } = trpc.patient.getRecoverySessions.useQuery()

  const workloadSessions = rawWorkloadSessions?.map(s => ({ ...s, date: new Date(s.date) })) ?? []
  const recoverySessions = rawRecoverySessions?.map(s => ({ ...s, completedAt: new Date(s.completedAt) })) ?? []

  const todayExercises = sessionData?.exercises ?? []
  const program = sessionData?.program ?? null
  const lastSession = sessionHistory?.[0] ?? null
  const streak = 5
  const completedToday = sessionHistory?.some(s =>
    new Date(s.completedAt).toDateString() === new Date().toDateString()
  ) ?? false

  const today = new Date().getDay()
  const todayDayNum = today === 0 ? 7 : today

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
  weekStart.setHours(0, 0, 0, 0)
  const weekCompleted = sessionHistory?.filter(s => new Date(s.completedAt) >= weekStart).length ?? 0
  const weekTotal = activeProgram?.daysPerWeek ?? 0
  const weekProgress = weekTotal > 0 ? Math.min((weekCompleted / weekTotal) * 100, 100) : 0

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond'

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-8" style={{ background: '#1C2425' }}>
        <p className="text-[#7B8889] text-sm">{greeting}</p>
        <h1 className="text-white text-2xl font-bold mt-0.5">{userName ? userName.split(' ')[0] : ''}</h1>
        <p className="text-[#7B8889] text-xs mt-1">Atleet Dashboard</p>
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard icon={<Flame className="w-4 h-4" style={{ color: '#f97316' }} />} value={streak} label="Streak" />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" style={{ color: '#BEF264' }} />} value={sessionHistory?.length ?? 0} label="Sessies" />
          <StatCard icon={<TrendingUp className="w-4 h-4" style={{ color: '#6366f1' }} />} value={`${Math.round(weekProgress)}%`} label="Deze week" />
        </div>

        {/* Quick workout action */}
        <Link href="/athlete/session?mode=quick">
          <Card style={{ borderRadius: '14px', borderLeft: '3px solid #BEF264' }} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#BEF26420' }}>
                <Zap className="w-6 h-6" style={{ color: '#BEF264' }} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-base">Quick Workout</p>
                <p className="text-xs text-muted-foreground">Start een eigen workout</p>
              </div>
              <ChevronRight className="w-5 h-5 text-zinc-300" />
            </CardContent>
          </Card>
        </Link>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/athlete/programs/new">
            <Card style={{ borderRadius: '14px' }} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#BEF26420' }}>
                  <Plus className="w-5 h-5" style={{ color: '#BEF264' }} />
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
        {(todayExercises.length > 0 || completedToday) && (
          <Card style={{ borderRadius: '14px', overflow: 'hidden' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#BEF264' }}>
              <div>
                <p className="text-white text-xs font-medium opacity-80">Vandaag · {DAY_NAMES[todayDayNum - 1]}</p>
                <p className="text-white font-bold text-base">
                  {completedToday ? <span className="inline-flex items-center gap-1">Klaar voor vandaag! <IconCelebration size={16} /></span> : `${todayExercises.length} oefeningen`}
                </p>
              </div>
              {!completedToday && (
                <Link href="/athlete/session">
                  <Button size="sm" className="bg-[#141A1B] gap-1.5 font-semibold text-xs" style={{ color: '#BEF264' }}>
                    <Play className="w-3 h-3 fill-current" /> Start
                  </Button>
                </Link>
              )}
            </div>
            <CardContent className="px-4 py-3 space-y-2.5">
              {completedToday ? (
                <div className="py-2 text-center space-y-1">
                  <p className="text-sm font-semibold">Lekker bezig!</p>
                  <p className="text-xs text-muted-foreground">Alle trainingen voor vandaag zijn afgerond</p>
                </div>
              ) : (
                <>
                  {todayExercises.slice(0, 3).map(e => (
                    <div key={e.uid} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm" style={{ background: '#1C2425' }}>
                        <IconStrength size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.sets} × {e.reps} {e.repUnit}</p>
                      </div>
                    </div>
                  ))}
                  {todayExercises.length > 3 && (
                    <p className="text-xs text-muted-foreground pt-0.5">+{todayExercises.length - 3} meer</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Week overview */}
        {weekTotal > 0 && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm">Week {program?.currentWeek ?? 1} voortgang</p>
                <span className="text-xs text-muted-foreground">{weekCompleted}/{weekTotal} sessies</span>
              </div>
              <Progress value={weekProgress} className="h-1.5 mb-4" />
              <div className="flex gap-1.5 justify-between">
                {DAY_LABELS.map((label, i) => {
                  const dayNum = i + 1
                  const isToday = dayNum === todayDayNum
                  const isDone = sessionHistory?.some(s => {
                    const d = new Date(s.completedAt)
                    const day = d.getDay() === 0 ? 7 : d.getDay()
                    return day === dayNum && d >= weekStart
                  }) ?? false
                  return (
                    <div key={label} className="flex flex-col items-center gap-1 flex-1">
                      <div
                        className="w-full aspect-square rounded-full flex items-center justify-center text-xs font-medium max-w-[36px]"
                        style={
                          isDone ? { background: '#BEF264', color: 'white' }
                            : isToday ? { background: '#1C2425', color: 'white' }
                              : { background: 'transparent', color: '#4A5454' }
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
        )}

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
                <Link href="/athlete/history" className="text-xs flex items-center gap-0.5" style={{ color: '#BEF264' }}>
                  Alles <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(190,242,100,0.10)' }}>
                  <Calendar className="w-5 h-5" style={{ color: '#BEF264' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {new Date(lastSession.completedAt).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' })}
                    {lastSession.programName ? ` · ${lastSession.programName}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lastSession.exerciseCount} oefeningen · {lastSession.durationMinutes} min
                  </p>
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
