import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, Flame, CheckCircle, Trophy } from 'lucide-react'

export const metadata = {
  title: 'Home – MBT Move',
}

export default function PatientDashboard() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">Good morning</p>
          <h1 className="text-2xl font-bold">Let&apos;s move 💪</h1>
        </div>
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg"
          style={{ background: '#3ECF6A' }}
        >
          ?
        </div>
      </div>

      {/* Streak / stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Flame, label: 'Streak', value: '—', color: '#f59e0b' },
          { icon: CheckCircle, label: 'Done', value: '—', color: '#3ECF6A' },
          { icon: Trophy, label: 'Score', value: '—', color: '#a78bfa' },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label} style={{ borderRadius: '12px' }}>
            <CardContent className="p-4 text-center">
              <Icon className="w-5 h-5 mx-auto mb-1" style={{ color }} />
              <p className="text-xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today's program */}
      <Card style={{ borderRadius: '12px' }}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Today&apos;s Program</CardTitle>
            <Badge variant="secondary">
              <Activity className="w-3 h-3 mr-1" />
              Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
            No program assigned yet. Your therapist will set one up for you.
          </div>
        </CardContent>
      </Card>

      {/* Recent sessions */}
      <Card style={{ borderRadius: '12px' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
            No sessions logged yet.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
