import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { User, SlidersHorizontal, ChevronRight } from 'lucide-react'

export const metadata = {
  title: 'Instellingen – MBT Gym',
}

const sections = [
  {
    href: '/therapist/settings/profile',
    icon: User,
    label: 'Profiel',
    description: 'Persoonlijke gegevens en accountinformatie',
  },
  {
    href: '/therapist/settings/parameters',
    icon: SlidersHorizontal,
    label: 'Parameters',
    description: 'Aangepaste meetparameters voor programma\'s',
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Instellingen</h1>
        <p className="text-muted-foreground text-sm">Beheer je account en voorkeuren</p>
      </div>

      <div className="space-y-2">
        {sections.map(({ href, icon: Icon, label, description }) => (
          <Link key={href} href={href}>
            <Card style={{ borderRadius: '12px' }} className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="px-4 py-4 flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: '#f4f4f5' }}
                >
                  <Icon className="w-5 h-5 text-zinc-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
