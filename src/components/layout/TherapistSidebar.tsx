'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Dumbbell,
  Calendar,
  MessageSquare,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/therapist/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/therapist/patients', label: 'Patients', icon: Users },
  { href: '/therapist/programs', label: 'Programs', icon: ClipboardList },
  { href: '/therapist/exercises', label: 'Exercises', icon: Dumbbell },
  { href: '/therapist/appointments', label: 'Appointments', icon: Calendar },
  { href: '/therapist/messages', label: 'Messages', icon: MessageSquare },
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
      className="w-64 min-h-screen flex flex-col"
      style={{ background: '#1A1A1A', color: '#FAFAFA' }}
    >
      {/* Logo */}
      <div className="p-6 border-b" style={{ borderColor: '#2A2A2A' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-lg"
            style={{ background: '#3ECF6A' }}
          >
            M
          </div>
          <div>
            <p className="font-bold text-white text-lg leading-none">MBT Move</p>
            <p className="text-xs mt-0.5" style={{ color: '#71717A' }}>Clinician Portal</p>
          </div>
        </div>
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
              style={active ? { background: '#3ECF6A', color: '#FFFFFF' } : {}}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 space-y-1 border-t" style={{ borderColor: '#2A2A2A' }}>
        <Link
          href="/therapist/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Settings className="w-5 h-5 shrink-0" />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
