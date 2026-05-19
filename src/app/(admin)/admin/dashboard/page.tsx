'use client'

import { ActionTile, Kicker, MetaLabel, MetricTile, P } from '@/components/dark-ui'
import { trpc } from '@/lib/trpc/client'

const quickLinks = [
  { href: '/admin/users', label: 'Users & rollen', description: 'Wijs rollen toe + koppel aan praktijk', bar: P.brand },
  { href: '/admin/practices', label: 'Praktijken', description: 'Multi-tenant groepen beheren', bar: P.ice },
  { href: '/admin/rehab-protocols', label: 'Revalidatie-protocollen', description: 'Protocol-catalog + criteria bewerken', bar: P.purple },
  { href: '/admin/education', label: 'Educatie', description: "Video's en PDF's voor patiënten (bv. ACL-traject)", bar: P.ice },
  { href: '/admin/cohort', label: 'Cohort analytics', description: 'Platform-aggregaten — alleen patiënten die expliciet toestemming hebben gegeven', bar: P.brand },
  { href: '/therapist/patients', label: 'Patiënten', description: 'Beheer patiënten en hun programma\'s', bar: P.purple },
  { href: '/therapist/exercises', label: 'Oefeningen', description: 'Oefeningenbibliotheek beheren', bar: P.gold },
  { href: '/therapist/programs', label: "Programma's", description: "Revalidatieprogramma's beheren", bar: P.ice },
  { href: '/admin/research', label: 'Research data', description: 'Geanonimiseerde onderzoeksdata & export', bar: P.danger },
  { href: '/admin/shop', label: 'Shop', description: "Consumenten-producten: schema's verkopen + publiceren", bar: P.gold },
]

export default function AdminDashboard() {
  const stats = trpc.admin.getStats.useQuery()

  const display = (n: number | undefined) =>
    stats.isLoading ? '…' : n != null ? n.toLocaleString('nl-NL') : '—'

  const tiles = [
    { label: 'Total Users', value: display(stats.data?.totalUsers), tint: P.brand },
    { label: 'Sessions (7d)', value: display(stats.data?.sessionsThisWeek), tint: P.ice },
    { label: 'MFA Enabled', value: display(stats.data?.mfaEnabled), tint: P.gold },
    { label: 'System Status', value: 'OK', tint: P.lime },
  ]

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
        {tiles.map((stat) => (
          <MetricTile key={stat.label} label={stat.label} value={stat.value} tint={stat.tint} />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Kicker>Snelkoppelingen</Kicker>
        {quickLinks.map(({ href, label, description, bar }) => (
          <ActionTile key={href} href={href} label={label} sub={description} bar={bar} />
        ))}
      </div>
    </div>
  )
}
