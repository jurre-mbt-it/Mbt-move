'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CalendarDays, MessageSquare, TrendingUp, User, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { P } from '@/components/dark-ui'

const NAV_ITEMS = [
  { href: '/patient/dashboard', label: 'Home', icon: Home },
  { href: '/patient/schedule', label: 'Schema', icon: CalendarDays },
  { href: '/patient/wellness', label: 'Check-in', icon: Activity },
  { href: '/patient/history', label: 'Voortgang', icon: TrendingUp },
  { href: '/patient/profile', label: 'Profiel', icon: User },
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
              className={cn(
                'flex flex-col items-center gap-1 flex-1 py-2 athletic-mono transition-colors',
              )}
              style={{
                color: active ? P.lime : P.inkMuted,
                fontSize: 9,
                letterSpacing: '0.14em',
              }}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
