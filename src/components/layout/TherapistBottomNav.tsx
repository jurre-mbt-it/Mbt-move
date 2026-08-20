'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, AlertCircle, ClipboardList, Dumbbell, Settings, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { P } from '@/components/dark-ui'

// Korte labels voor de mobile bottom nav. Volle labels staan in de
// desktop sidebar en in <Header />.
const baseNavItems = [
  { href: '/therapist/dashboard', label: 'Home',     icon: LayoutDashboard },
  { href: '/therapist/patients',  label: 'Patiënt',  icon: Users },
  { href: '/therapist/signals',   label: 'Signaal',  icon: AlertCircle },
  { href: '/therapist/programs',  label: 'Program',  icon: ClipboardList },
  { href: '/therapist/exercises', label: 'Oefen',    icon: Dumbbell },
  { href: '/therapist/settings',  label: 'Instel',   icon: Settings },
]

export function TherapistBottomNav() {
  const pathname = usePathname()
  const { data: me } = trpc.auth.getMe.useQuery()
  const navItems = me?.role === 'ADMIN'
    ? [...baseNavItems, { href: '/admin/dashboard', label: 'Admin', icon: Shield }]
    : baseNavItems

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
