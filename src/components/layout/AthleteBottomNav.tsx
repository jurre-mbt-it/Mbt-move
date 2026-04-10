'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CalendarDays, Zap, User, Menu, X, Dumbbell, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAIN_NAV = [
  { href: '/athlete/dashboard', label: 'Home', icon: Home },
  { href: '/athlete/schedule', label: 'Schema', icon: CalendarDays },
  { href: '/athlete/workouts', label: 'Workout', icon: Zap },
  { href: '/athlete/profile', label: 'Profiel', icon: User },
]

const DRAWER_ITEMS = [
  { href: '/athlete/exercises', label: 'Oefeningen', icon: Dumbbell, description: 'Oefeningen bibliotheek' },
]

export function AthleteBottomNav() {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      {/* Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Side drawer */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 w-72 bg-white shadow-2xl flex flex-col transition-transform duration-300"
        style={{ transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)' }}
      >
        <div className="px-5 pt-14 pb-4 border-b" style={{ background: '#1A3A3A' }}>
          <div className="flex items-center justify-between">
            <p className="text-white font-bold text-lg">Menu</p>
            <button onClick={() => setDrawerOpen(false)} className="text-zinc-400 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {DRAWER_ITEMS.map(item => {
            const active = pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors"
                style={active ? { background: '#4ECDC415', color: '#4ECDC4' } : { color: '#1A3A3A' }}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: active ? '#4ECDC420' : '#f4f4f5' }}>
                  <Icon className="w-4.5 h-4.5" style={{ color: active ? '#4ECDC4' : '#71717a' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-300" />
              </Link>
            )
          })}
        </div>
      </div>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t"
        style={{ background: '#FFFFFF', borderColor: '#E4E4E7' }}
      >
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {MAIN_NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn('flex flex-col items-center gap-1 flex-1 py-2 text-xs font-medium transition-colors', active ? '' : 'text-zinc-400')}
                style={active ? { color: '#4ECDC4' } : {}}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            )
          })}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center gap-1 flex-1 py-2 text-xs font-medium text-zinc-400 transition-colors"
          >
            <Menu className="w-5 h-5" />
            <span>Meer</span>
          </button>
        </div>
      </nav>
    </>
  )
}
