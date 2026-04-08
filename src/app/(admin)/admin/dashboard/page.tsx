import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Activity, ShieldCheck, Server, ClipboardList, Dumbbell, ChevronRight } from 'lucide-react'

export const metadata = {
  title: 'Admin Dashboard – MBT Gym',
}

const stats = [
  { label: 'Total Users', value: '—', icon: Users },
  { label: 'Active Sessions', value: '—', icon: Activity },
  { label: 'MFA Enabled', value: '—', icon: ShieldCheck },
  { label: 'System Status', value: 'OK', icon: Server },
]

const quickLinks = [
  { href: '/therapist/patients', icon: Users, label: 'Patiënten', description: 'Beheer patiënten en hun programma\'s' },
  { href: '/therapist/exercises', icon: Dumbbell, label: 'Oefeningen', description: 'Oefeningenbibliotheek beheren' },
  { href: '/therapist/programs', icon: ClipboardList, label: "Programma's", description: "Revalidatieprogramma's beheren" },
]

export default function AdminDashboard() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage users, roles, and system settings.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} style={{ borderRadius: '12px' }}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: '#3ECF6A20' }}
                >
                  <stat.icon className="w-5 h-5" style={{ color: '#3ECF6A' }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {quickLinks.map(({ href, icon: Icon, label, description }) => (
          <Link key={href} href={href}>
            <Card style={{ borderRadius: '12px' }} className="hover:shadow-sm transition-shadow cursor-pointer h-full">
              <CardContent className="p-5 flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: '#f4f4f5' }}
                >
                  <Icon className="w-5 h-5 text-zinc-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card style={{ borderRadius: '12px' }}>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Connect Supabase to manage users here.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
