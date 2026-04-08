'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, ClipboardList, Dumbbell, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/therapist/dashboard',  label: 'Dashboard', icon: LayoutDashboard },
  { href: '/therapist/patients',   label: 'Patiënten', icon: Users },
  { href: '/therapist/programs',   label: "Programma's", icon: ClipboardList },
  { href: '/therapist/exercises',  label: 'Oefeningen', icon: Dumbbell },
  { href: '/therapist/settings', label: 'Instellingen', icon: Settings },
]

export function TherapistBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t md:hidden"
      style={{ background: '#1A1A1A', borderColor: '#2A2A2A' }}
    >
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 flex-1 py-2 text-xs font-medium transition-colors',
                active ? '' : 'text-zinc-500'
              )}
              style={active ? { color: '#3ECF6A' } : {}}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px]">{label.split("'")[0]}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
