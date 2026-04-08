'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ClipboardList, CalendarDays, MessageSquare, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOCK_PATIENT } from '@/lib/patient-constants'

function getNavItems() {
  return [
    { href: '/patient/dashboard', label: 'Home', icon: Home },
    { href: '/patient/schedule', label: 'Schema', icon: CalendarDays },
    { href: `/patient/program/${MOCK_PATIENT.programId}`, label: 'Programma', icon: ClipboardList },
    { href: '/patient/history', label: 'Geschiedenis', icon: MessageSquare },
    { href: '/patient/profile', label: 'Profiel', icon: User },
  ]
}

export function PatientBottomNav() {
  const pathname = usePathname()
  const navItems = getNavItems()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t"
      style={{ background: '#FFFFFF', borderColor: '#E4E4E7' }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 flex-1 py-2 text-xs font-medium transition-colors',
                active ? '' : 'text-zinc-400'
              )}
              style={active ? { color: '#3ECF6A' } : {}}
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
