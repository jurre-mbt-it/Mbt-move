'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Dumbbell,
  CalendarDays,
  Library,
  MessageSquare,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/therapist/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/therapist/patients', label: 'Patiënten', icon: Users },
  { href: '/therapist/programs', label: "Programma's", icon: ClipboardList },
  { href: '/therapist/week-planner', label: 'Weekschema', icon: CalendarDays },
  { href: '/therapist/exercises', label: 'Oefeningen', icon: Dumbbell },
  { href: '/therapist/programs/library', label: 'Bibliotheek', icon: Library },
  { href: '/therapist/messages', label: 'Berichten', icon: MessageSquare },
]

export function TherapistSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className="w-64 min-h-screen flex flex-col shrink-0"
      style={{ background: '#1A3A3A', color: '#FAFAFA' }}
    >
      {/* Logo */}
      <div className="p-6 border-b" style={{ borderColor: '#2A4A4A' }}>
        <div className="flex items-center gap-3">
          <img
            src="/Logo.jpg"
            alt="MBT Gym"
            className="h-8 w-auto"
            style={{ filter: 'invert(1)' }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: '#71717A' }}>Clinician Portal</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              )}
              style={active ? { background: '#4ECDC4', color: '#FFFFFF' } : {}}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 space-y-1 border-t" style={{ borderColor: '#2A4A4A' }}>
        <Link
          href="/therapist/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Settings className="w-5 h-5 shrink-0" />
          Instellingen
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          Uitloggen
        </button>
      </div>
    </aside>
  )
}
