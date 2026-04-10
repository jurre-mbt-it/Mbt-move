'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight, ShieldCheck, User, FileText } from 'lucide-react'

const SETTINGS_ITEMS = [
  {
    href: '/patient/settings/privacy',
    icon: ShieldCheck,
    label: 'Privacy & onderzoeksdata',
    description: 'Beheer je toestemming voor geanonimiseerde dataverzameling',
    iconBg: '#f0fdfa',
    iconColor: '#4ECDC4',
  },
  {
    href: '/patient/legal/dpa',
    icon: FileText,
    label: 'Verwerkingsovereenkomst',
    description: 'Bekijk hoe wij uw persoonsgegevens verwerken (AVG/DPA)',
    iconBg: '#eff6ff',
    iconColor: '#3b82f6',
  },
  {
    href: '/patient/profile',
    icon: User,
    label: 'Mijn profiel',
    description: 'Bekijk je profielgegevens',
    iconBg: '#f4f4f5',
    iconColor: '#52525b',
  },
]

export default function PatientSettingsPage() {
  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-6" style={{ background: '#1A3A3A' }}>
        <h1 className="text-white text-xl font-bold">Instellingen</h1>
        <p className="text-zinc-400 text-sm mt-0.5">Beheer je voorkeuren en privacy</p>
      </div>

      <div className="px-4 -mt-3 pb-6 space-y-3">
        {SETTINGS_ITEMS.map(({ href, icon: Icon, label, description, iconBg, iconColor }) => (
          <Link key={href} href={href}>
            <Card style={{ borderRadius: '14px' }} className="hover:shadow-sm transition-shadow">
              <CardContent className="px-4 py-4 flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: iconBg }}
                >
                  <Icon className="w-5 h-5" style={{ color: iconColor }} />
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
    </div>
  )
}
