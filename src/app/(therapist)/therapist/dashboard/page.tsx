'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { trpc } from '@/lib/trpc/client'
import { Users, ClipboardList, TrendingUp, ChevronRight, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function TherapistDashboard() {
  const router = useRouter()

  const { data: patients = [], isLoading: patientsLoading } = trpc.patients.list.useQuery()
  const { data: programsRaw = [], isLoading: programsLoading } = trpc.programs.list.useQuery()
  const programs = programsRaw as Array<{ status: string; isTemplate: boolean }>

  const activePatients = patients.filter(p => p.programStatus === 'ACTIVE')
  const activePrograms = programs.filter(p => p.status === 'ACTIVE' && !p.isTemplate)

  function weeksCurrent(startDate: Date | string | null | undefined): number {
    if (!startDate) return 1
    const diff = Date.now() - new Date(startDate).getTime()
    return Math.max(1, Math.ceil(diff / (7 * 24 * 60 * 60 * 1000)))
  }

  const isLoading = patientsLoading || programsLoading

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Goedemorgen — hier is je overzicht van vandaag.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={<Users className="w-4 h-4" style={{ color: '#4ECDC4' }} />} value={isLoading ? '…' : activePatients.length} label="Actieve patiënten" />
        <StatCard icon={<ClipboardList className="w-4 h-4" style={{ color: '#60a5fa' }} />} value={isLoading ? '…' : activePrograms.length} label="Actieve programma's" />
        <StatCard icon={<TrendingUp className="w-4 h-4" style={{ color: '#a78bfa' }} />} value={isLoading ? '…' : patients.length} label="Totaal patiënten" />
      </div>

      {/* Active patients */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Actieve patiënten</h2>
          <Link href="/therapist/patients" className="text-xs flex items-center gap-0.5" style={{ color: '#4ECDC4' }}>
            Alles <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-2">
          {isLoading && (
            <p className="text-sm text-muted-foreground py-2">Laden…</p>
          )}
          {!isLoading && activePatients.length === 0 && (
            <Card style={{ borderRadius: '12px' }}>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">Geen actieve patiënten</p>
              </CardContent>
            </Card>
          )}
          {activePatients.slice(0, 3).map(p => {
            const current = weeksCurrent(p.startDate)
            const total = p.weeksTotal || 1
            return (
              <Link key={p.id} href={`/therapist/patients/${p.id}`} className="block">
                <Card style={{ borderRadius: '12px' }} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0" style={{ background: '#1A3A3A' }}>
                        {p.avatarInitials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.programName ?? 'Geen programma'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Progress value={(Math.min(current, total) / total) * 100} className="h-1 flex-1" />
                          <span className="text-xs text-muted-foreground shrink-0">W{Math.min(current, total)}/{total}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="font-semibold text-sm mb-3">Snelle acties</h2>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-12 gap-2 justify-start" onClick={() => router.push('/therapist/programs/new')}>
            <Plus className="w-4 h-4" style={{ color: '#4ECDC4' }} />
            Nieuw programma
          </Button>
          <Button variant="outline" className="h-12 gap-2 justify-start" onClick={() => router.push('/therapist/exercises/new')}>
            <Plus className="w-4 h-4" style={{ color: '#60a5fa' }} />
            Nieuwe oefening
          </Button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <Card style={{ borderRadius: '12px' }}>
      <CardContent className="px-3 py-3">
        <div className="mb-1">{icon}</div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
