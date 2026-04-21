'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CalendarDays, Zap, User, Menu, X, Dumbbell, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { P } from '@/components/dark-ui'

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
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Side drawer */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 w-72 shadow-2xl flex flex-col transition-transform duration-300"
        style={{
          background: P.surface,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
          borderLeft: `1px solid ${P.lineStrong}`,
        }}
      >
        <div
          className="px-5 pt-14 pb-4 border-b"
          style={{ background: P.bg, borderColor: P.lineStrong }}
        >
          <div className="flex items-center justify-between">
            <p
              className="athletic-mono"
              style={{ color: P.ink, fontSize: 14, fontWeight: 900, letterSpacing: '0.16em' }}
            >
              MENU
            </p>
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-1"
              style={{ color: P.inkMuted }}
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {DRAWER_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className="athletic-tap flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
                style={{
                  background: active ? P.surfaceHi : 'transparent',
                  color: active ? P.lime : P.ink,
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: active ? P.surfaceLow : P.bg }}
                >
                  <Icon
                    className="w-4.5 h-4.5"
                    style={{ color: active ? P.lime : P.inkMuted }}
                  />
                </div>
                <div className="flex-1">
                  <p style={{ fontSize: 14, fontWeight: 700 }}>{item.label}</p>
                  <p style={{ color: P.inkMuted, fontSize: 11 }}>{item.description}</p>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color: P.inkDim }} />
              </Link>
            )
          })}
        </div>
      </div>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t"
        style={{ background: P.bg, borderColor: P.lineStrong }}
      >
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {MAIN_NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn('flex flex-col items-center gap-1 flex-1 py-2 athletic-mono transition-colors')}
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
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center gap-1 flex-1 py-2 athletic-mono transition-colors"
            style={{ color: P.inkMuted, fontSize: 9, letterSpacing: '0.14em' }}
            type="button"
          >
            <Menu className="w-5 h-5" />
            <span>Meer</span>
          </button>
        </div>
      </nav>
    </>
  )
}
