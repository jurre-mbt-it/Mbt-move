import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Activity, ShieldCheck, Server } from 'lucide-react'

export const metadata = {
  title: 'Admin Dashboard – MBT Move',
}

const stats = [
  { label: 'Total Users', value: '—', icon: Users },
  { label: 'Active Sessions', value: '—', icon: Activity },
  { label: 'MFA Enabled', value: '—', icon: ShieldCheck },
  { label: 'System Status', value: 'OK', icon: Server },
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
