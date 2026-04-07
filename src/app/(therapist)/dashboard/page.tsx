import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, ClipboardList, Calendar, TrendingUp } from 'lucide-react'

export const metadata = {
  title: 'Dashboard – MBT Move',
}

const stats = [
  { label: 'Active Patients', value: '—', icon: Users, color: '#3ECF6A' },
  { label: 'Active Programs', value: '—', icon: ClipboardList, color: '#60a5fa' },
  { label: 'Today\'s Appointments', value: '—', icon: Calendar, color: '#f59e0b' },
  { label: 'Avg. Adherence', value: '—', icon: TrendingUp, color: '#a78bfa' },
]

export default function TherapistDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back. Here&apos;s what&apos;s happening today.</p>
      </div>

      {/* Stats grid */}
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
                  style={{ background: `${stat.color}20` }}
                >
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card style={{ borderRadius: '12px' }}>
          <CardHeader>
            <CardTitle>Recent Patients</CardTitle>
            <CardDescription>Your most recently active patients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              No patients yet. Connect to Supabase to get started.
            </div>
          </CardContent>
        </Card>

        <Card style={{ borderRadius: '12px' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Upcoming Appointments
              <Badge variant="secondary">Today</Badge>
            </CardTitle>
            <CardDescription>Your schedule for today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              No appointments scheduled.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
