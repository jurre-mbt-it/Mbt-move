import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { User, Mail, Phone, Building2 } from 'lucide-react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export const metadata = {
  title: 'Profiel – MBT Gym',
}

export default function ProfilePage() {
  return (
    <div className="space-y-5 max-w-lg">
      <Link
        href="/therapist/settings"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Instellingen
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Profiel</h1>
        <p className="text-muted-foreground text-sm">Persoonlijke gegevens en accountinformatie</p>
      </div>

      <Card style={{ borderRadius: '12px' }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Accountgegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoRow icon={<User className="w-4 h-4" />} label="Naam" value="—" />
          <InfoRow icon={<Mail className="w-4 h-4" />} label="E-mail" value="—" />
          <InfoRow icon={<Phone className="w-4 h-4" />} label="Telefoon" value="—" />
          <InfoRow icon={<Building2 className="w-4 h-4" />} label="Praktijk" value="—" />
        </CardContent>
      </Card>

      <Card style={{ borderRadius: '12px' }}>
        <CardContent className="flex items-center justify-center py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Profielbewerking beschikbaar zodra de database is gekoppeld.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-zinc-400" style={{ background: '#f4f4f5' }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
