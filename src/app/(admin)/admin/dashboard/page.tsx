import { ActionTile, Kicker, MetaLabel, MetricTile, P, Tile } from '@/components/dark-ui'

export const metadata = {
  title: 'Admin Dashboard – MBT Gym',
}

const stats = [
  { label: 'Total Users', value: '—', tint: P.lime },
  { label: 'Active Sessions', value: '—', tint: P.ice },
  { label: 'MFA Enabled', value: '—', tint: P.gold },
  { label: 'System Status', value: 'OK', tint: P.lime },
]

const quickLinks = [
  { href: '/admin/users', label: 'Users & rollen', description: 'Wijs rollen toe + koppel aan praktijk', bar: P.lime },
  { href: '/admin/practices', label: 'Praktijken', description: 'Multi-tenant groepen beheren', bar: P.ice },
  { href: '/therapist/patients', label: 'Patiënten', description: 'Beheer patiënten en hun programma\'s', bar: P.purple },
  { href: '/therapist/exercises', label: 'Oefeningen', description: 'Oefeningenbibliotheek beheren', bar: P.gold },
  { href: '/therapist/programs', label: "Programma's", description: "Revalidatieprogramma's beheren", bar: P.ice },
  { href: '/admin/research', label: 'Research data', description: 'Geanonimiseerde onderzoeksdata & export', bar: P.danger },
]

export default function AdminDashboard() {
  return (
    <div className="max-w-5xl w-full flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Kicker>Beheer</Kicker>
        <h1
          className="athletic-display"
          style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
        >
          ADMIN DASHBOARD
        </h1>
        <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
          Manage users, roles, and system settings.
        </MetaLabel>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <MetricTile key={stat.label} label={stat.label} value={stat.value} tint={stat.tint} />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Kicker>Snelkoppelingen</Kicker>
        {quickLinks.map(({ href, label, description, bar }) => (
          <ActionTile key={href} href={href} label={label} sub={description} bar={bar} />
        ))}
      </div>

      <Tile>
        <MetaLabel>User Management</MetaLabel>
        <div
          className="flex items-center justify-center h-32"
          style={{ color: P.inkMuted, fontSize: 13 }}
        >
          Connect Supabase to manage users here.
        </div>
      </Tile>
    </div>
  )
}
