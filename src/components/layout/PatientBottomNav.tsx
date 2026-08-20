'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  CalendarDays,
  Dumbbell,
  Settings,
  Plus,
  Heart,
  Activity,
  Clock,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { P } from '@/components/dark-ui'
import { trpc } from '@/lib/trpc/client'

// 5 tabs: HOME / SCHEMA / + (quick-log sheet) / TRAINING / INSTELLINGEN
const NAV_ITEMS = [
  { href: '/patient/dashboard', label: 'HOME', icon: Home },
  { href: '/patient/schedule', label: 'SCHEMA', icon: CalendarDays },
  { href: '/patient/training', label: 'TRAINING', icon: Dumbbell },
  { href: '/patient/settings', label: 'INSTELLINGEN', icon: Settings },
]

type QuickAction = {
  href: string
  label: string
  sub: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color: string
  /** Only show if the patient has at least one ACTIVE program with tendinopathyMode on. */
  tendinopathyOnly?: boolean
}

const QUICK_ACTIONS: QuickAction[] = [
  { href: '/patient/wellness', label: 'Wellness check', sub: 'Slaap, energie, stemming', icon: Activity, color: P.ice },
  { href: '/patient/pain', label: 'Pijn rapporteren', sub: 'Los van een sessie', icon: Heart, color: P.danger },
  // Cardio is alleen voor sporters/atleten — niet in de patiënt-quicklog.
  { href: '/patient/follow-up', label: '24u follow-up', sub: 'Pijn na sessie checken', icon: Clock, color: P.gold, tendinopathyOnly: true },
]

export function PatientBottomNav() {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)
  const { data: hasTendinopathy = false } = trpc.patient.hasTendinopathyProgram.useQuery()
  const quickActions = QUICK_ACTIONS.filter(a => !a.tendinopathyOnly || hasTendinopathy)

  // Render exact 5 cells: 2 left tabs, FAB+, 2 right tabs.
  return (
    <>
      {/* Quick-log sheet */}
      {sheetOpen && (
        <div
          className="mbt-backdrop fixed inset-0 z-50 flex items-end justify-center"
          onClick={() => setSheetOpen(false)}
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <div
            className="mbt-sheet w-full max-w-lg rounded-t-3xl px-4 pt-4 pb-8"
            style={{
              background: P.surface,
              borderTop: `1px solid ${P.lineStrong}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="athletic-label"
                style={{
                  color: P.inkMuted,
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  fontWeight: 700,
                }}
              >
                SNEL LOGGEN
              </span>
              <button
                onClick={() => setSheetOpen(false)}
                className="athletic-tap p-1"
                style={{ color: P.inkMuted }}
                aria-label="Sluiten"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mbt-stagger flex flex-col gap-2">
              {quickActions.map(({ href, label, sub, icon: Icon, color }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setSheetOpen(false)}
                  className="athletic-tap mbt-nav-hover flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={{
                    background: P.surfaceHi,
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color }} />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span
                      className="athletic-label"
                      style={{
                        color: P.ink,
                        fontSize: 13,
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {label}
                    </span>
                    <span style={{ color: P.inkMuted, fontSize: 11 }}>{sub}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t"
        style={{ background: P.bg, borderColor: P.lineStrong }}
      >
        <div className="mbt-stagger grid grid-cols-5 items-center h-16 max-w-lg mx-auto px-2">
          {/* First two tabs */}
          {NAV_ITEMS.slice(0, 2).map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn('athletic-tap flex flex-col items-center gap-1 py-2 transition-colors')}
                style={{ color: active ? P.brand : P.inkMuted }}
              >
                <Icon className="w-5 h-5" />
                <span
                  className="athletic-label"
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    fontWeight: active ? 900 : 700,
                  }}
                >
                  {label}
                </span>
              </Link>
            )
          })}

          {/* Center + button — opens quick-log sheet */}
          <button
            onClick={() => setSheetOpen(true)}
            className="athletic-tap flex flex-col items-center justify-center"
            aria-label="Snel loggen"
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                background: P.brand,
                color: P.bg,
                width: 44,
                height: 44,
                marginTop: -10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              <Plus className="w-6 h-6" strokeWidth={3} />
            </span>
            <span
              className="athletic-label"
              style={{
                color: P.inkMuted,
                fontSize: 9,
                letterSpacing: '0.14em',
                fontWeight: 700,
                marginTop: 1,
              }}
            >
              LOG
            </span>
          </button>

          {/* Last two tabs */}
          {NAV_ITEMS.slice(2).map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn('athletic-tap flex flex-col items-center gap-1 py-2 transition-colors')}
                style={{ color: active ? P.brand : P.inkMuted }}
              >
                <Icon className="w-5 h-5" />
                <span
                  className="athletic-label"
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    fontWeight: active ? 900 : 700,
                  }}
                >
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
