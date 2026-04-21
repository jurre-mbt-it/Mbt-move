'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CalendarDays, Dumbbell, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { P } from '@/components/dark-ui'

// iOS-parity: 4 tabs, uppercase mono labels. Wellness is accessible via
// dashboard-tile, niet als eigen tab.
const NAV_ITEMS = [
  { href: '/patient/dashboard', label: 'HOME', icon: Home },
  { href: '/patient/schedule', label: 'SCHEMA', icon: CalendarDays },
  { href: '/patient/session', label: 'TRAINING', icon: Dumbbell },
  { href: '/patient/profile', label: 'PROFIEL', icon: User },
]

export function PatientBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t"
      style={{ background: P.bg, borderColor: P.lineStrong }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn('flex flex-col items-center gap-1 flex-1 py-2 transition-colors')}
              style={{
                color: active ? P.lime : P.inkMuted,
              }}
            >
              <Icon className="w-5 h-5" />
              <span
                className="athletic-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  fontWeight: active ? 900 : 700,
                }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
