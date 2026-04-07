'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ClipboardList, Activity, MessageSquare, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/patient/dashboard', label: 'Home', icon: Home },
  { href: '/patient/program', label: 'Program', icon: ClipboardList },
  { href: '/patient/sessions', label: 'Sessions', icon: Activity },
  { href: '/patient/messages', label: 'Messages', icon: MessageSquare },
  { href: '/patient/profile', label: 'Profile', icon: User },
]

export function PatientBottomNav() {
  const pathname = usePathname()

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
