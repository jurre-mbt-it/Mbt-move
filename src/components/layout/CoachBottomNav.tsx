'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, AlertCircle, CalendarDays, Dumbbell, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { P } from '@/components/dark-ui'

// Mobiele nav van het coach-portaal. Korte labels; de volle staan in de
// desktop-zijbalk. Zelfde opbouw als TherapistBottomNav, andere bestemmingen.
const navItems = [
  { href: '/coach/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/coach/athletes', label: 'Atleet', icon: Users },
  { href: '/coach/signals', label: 'Signaal', icon: AlertCircle },
  { href: '/coach/week-planner', label: 'Week', icon: CalendarDays },
  { href: '/coach/exercises', label: 'Oefen', icon: Dumbbell },
  { href: '/coach/settings', label: 'Instel', icon: Settings },
]

export function CoachBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t md:hidden"
      style={{ background: P.bg, borderColor: P.lineStrong }}
    >
      <div className="mbt-stagger flex items-stretch h-16 px-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'athletic-tap flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-2 athletic-label transition-colors',
              )}
              style={{
                color: active ? P.brand : P.inkMuted,
                fontSize: 10.5,
                letterSpacing: 0,
              }}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="w-full text-center truncate px-0.5">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
