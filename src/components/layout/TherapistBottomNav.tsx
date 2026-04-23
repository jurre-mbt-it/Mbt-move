'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, AlertCircle, ClipboardList, Dumbbell, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { P } from '@/components/dark-ui'

const navItems = [
  { href: '/therapist/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/therapist/patients', label: 'Patiënten', icon: Users },
  { href: '/therapist/signals', label: 'Signalen', icon: AlertCircle },
  { href: '/therapist/programs', label: "Programma's", icon: ClipboardList },
  { href: '/therapist/exercises', label: 'Oefeningen', icon: Dumbbell },
  { href: '/therapist/settings', label: 'Instellingen', icon: Settings },
]

export function TherapistBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t md:hidden"
      style={{ background: P.bg, borderColor: P.lineStrong }}
    >
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 flex-1 py-2 athletic-mono transition-colors',
              )}
              style={{
                color: active ? P.lime : P.inkMuted,
                fontSize: 9,
                letterSpacing: '0.12em',
              }}
            >
              <Icon className="w-5 h-5" />
              <span>{label.split("'")[0]}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
