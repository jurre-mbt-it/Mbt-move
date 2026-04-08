'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { MOCK_PATIENTS } from '@/lib/therapist-constants'
import { MOCK_PROGRAMS } from '@/lib/program-constants'
import { Users, ClipboardList, TrendingUp, AlertCircle, ChevronRight, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function TherapistDashboard() {
  const router = useRouter()

  const activePatients = MOCK_PATIENTS.filter(p => p.programStatus === 'ACTIVE')
  const activePrograms = MOCK_PROGRAMS.filter(p => p.status === 'ACTIVE' && !p.isTemplate)
  const avgCompliance = Math.round(
    MOCK_PATIENTS.filter(p => p.compliance > 0).reduce((sum, p) => sum + p.compliance, 0) /
    MOCK_PATIENTS.filter(p => p.compliance > 0).length
  )
  const alertPatients = MOCK_PATIENTS.filter(p =>
    p.lastSessionDate && new Date(p.lastSessionDate) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  )

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Goedemorgen — hier is je overzicht van vandaag.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={<Users className="w-4 h-4" style={{ color: '#4ECDC4' }} />} value={activePatients.length} label="Actieve patiënten" />
        <StatCard icon={<ClipboardList className="w-4 h-4" style={{ color: '#60a5fa' }} />} value={activePrograms.length} label="Actieve programma's" />
        <StatCard icon={<TrendingUp className="w-4 h-4" style={{ color: '#a78bfa' }} />} value={`${avgCompliance}%`} label="Gem. compliance" />
      </div>

      {/* Alerts */}
      {alertPatients.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: '#fff7ed', color: '#c2410c' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p><strong>{alertPatients.length} patiënt{alertPatients.length > 1 ? 'en' : ''}</strong> heeft al meer dan 7 dagen geen sessie gelogd.</p>
        </div>
      )}

      {/* Active patients */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Actieve patiënten</h2>
          <Link href="/therapist/patients" className="text-xs flex items-center gap-0.5" style={{ color: '#4ECDC4' }}>
            Alles <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-2">
          {activePatients.slice(0, 3).map(p => (
            <Link key={p.id} href={`/therapist/patients/${p.id}`} className="block">
            <Card style={{ borderRadius: '12px' }} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0" style={{ background: '#1A3A3A' }}>
                    {p.avatarInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.programName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={(p.weeksCurrent / p.weeksTotal) * 100} className="h-1 flex-1" />
                      <span className="text-xs text-muted-foreground shrink-0">{p.compliance}%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            </Link>
          ))}
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
