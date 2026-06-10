'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, CalendarDays, Zap, User, Menu, X, Dumbbell, ChevronRight, Plus, Stethoscope, Loader2, Smile, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setPersonalMode } from '@/lib/personal-mode-client'
import { IconStrength, IconCardio } from '@/components/icons'
import { P } from '@/components/dark-ui'

// 5 cells: 2 left tabs, center FAB (actie-sheet), 1 right tab, MEER drawer.
const MAIN_NAV = [
  { href: '/athlete/dashboard', label: 'HOME', icon: Home },
  { href: '/athlete/schedule', label: 'SCHEMA', icon: CalendarDays },
  { href: '/athlete/profile', label: 'PROFIEL', icon: User },
]

// Acties achter de centrale +: trainen of een check-in loggen.
const QUICK_ACTIONS = [
  {
    href: '/athlete/session?mode=quick',
    label: 'Snelle training',
    description: 'Stel zelf je workout samen en start direct',
    color: P.brand,
    icon: <IconStrength size={20} />,
  },
  {
    href: '/athlete/cardio/new',
    label: 'Cardio loggen',
    description: 'Hardlopen, fietsen, roeien — tijd, tempo & zones',
    color: P.ice,
    icon: <IconCardio size={20} />,
  },
  {
    href: '/athlete/wellness',
    label: 'Welzijn-check',
    description: 'Hoe voel je je vandaag? 5 korte vragen',
    color: P.lime,
    icon: <Smile className="w-5 h-5" />,
  },
  {
    href: '/athlete/pain',
    label: 'Pijn melden',
    description: 'Registreer pijn voor je therapeut',
    color: P.danger,
    icon: <Activity className="w-5 h-5" />,
  },
]

const DRAWER_ITEMS = [
  { href: '/athlete/workouts', label: 'Mijn workouts', icon: Zap, description: 'Opgeslagen workouts & templates' },
  { href: '/athlete/exercises', label: 'Oefeningen', icon: Dumbbell, description: 'Oefeningen bibliotheek' },
]

export function AthleteBottomNav({ personalMode = false }: { personalMode?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

  async function exitPersonalMode() {
    setLeaving(true)
    await setPersonalMode(false)
    router.push('/therapist/dashboard')
    router.refresh()
  }

  return (
    <>
      {/* Overlay */}
      {drawerOpen && (
        <div
          className="mbt-backdrop fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
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
        <div
          key={drawerOpen ? 'open' : 'closed'}
          className="flex-1 overflow-y-auto p-3 flex flex-col gap-1 mbt-stagger"
        >
          {DRAWER_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className="athletic-tap mbt-nav-hover flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
                style={{
                  background: active ? P.surfaceHi : undefined,
                  color: active ? P.brand : P.ink,
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: active ? P.surfaceLow : P.bg }}
                >
                  <Icon
                    className="w-4.5 h-4.5"
                    style={{ color: active ? P.brand : P.inkMuted }}
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

          {/* Persoonlijke modus: terug naar de therapeut-shell. */}
          {personalMode && (
            <button
              type="button"
              onClick={exitPersonalMode}
              disabled={leaving}
              className="athletic-tap mbt-nav-hover mt-1 flex items-center gap-3 px-3 py-3 rounded-xl transition-colors disabled:opacity-60"
              style={{ color: P.ink }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: P.bg }}
              >
                {leaving
                  ? <Loader2 className="w-4.5 h-4.5 animate-spin" style={{ color: P.brand }} />
                  : <Stethoscope className="w-4.5 h-4.5" style={{ color: P.brand }} />}
              </div>
              <div className="flex-1 text-left">
                <p style={{ fontSize: 14, fontWeight: 700 }}>Therapeut-modus</p>
                <p style={{ color: P.inkMuted, fontSize: 11 }}>Terug naar je therapeut-account</p>
              </div>
              <ChevronRight className="w-4 h-4" style={{ color: P.inkDim }} />
            </button>
          )}
        </div>
      </div>

      {/* Actie-sheet achter de centrale + (trainen / cardio / welzijn / pijn) */}
      {quickOpen && (
        <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-label="Snel loggen">
          <div
            className="mbt-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setQuickOpen(false)}
          />
          <div
            className="mbt-sheet relative w-full rounded-t-3xl pb-[max(env(safe-area-inset-bottom),16px)]"
            style={{
              background: P.surface,
              borderTop: `1px solid ${P.lineStrong}`,
              maxWidth: 480,
              margin: '0 auto',
            }}
          >
            <div className="px-5 pt-4 pb-2">
              <div
                className="w-10 h-1 rounded-full mx-auto mb-3"
                style={{ background: P.lineStrong }}
              />
              <div className="flex items-center justify-between">
                <p
                  className="athletic-mono"
                  style={{ color: P.ink, fontSize: 13, fontWeight: 900, letterSpacing: '0.16em' }}
                >
                  SNEL LOGGEN
                </p>
                <button
                  type="button"
                  onClick={() => setQuickOpen(false)}
                  className="athletic-tap p-1 rounded-lg"
                  style={{ color: P.inkMuted }}
                  aria-label="Sluiten"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="mbt-stagger px-3 pt-1 flex flex-col gap-1">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  onClick={() => setQuickOpen(false)}
                  className="athletic-tap mbt-nav-hover flex items-center gap-3 px-3 py-3 rounded-xl"
                  style={{ color: P.ink }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: `${action.color}1A`,
                      border: `1px solid ${action.color}40`,
                      color: action.color,
                    }}
                  >
                    {action.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 14, fontWeight: 800 }}>{action.label}</p>
                    <p style={{ color: P.inkMuted, fontSize: 11, marginTop: 1 }}>{action.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: P.inkDim }} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav — 5 cells: 2 left tabs, center FAB, 1 right tab, MEER drawer */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t"
        style={{ background: P.bg, borderColor: P.lineStrong }}
      >
        <div className="mbt-stagger grid grid-cols-5 items-center h-16 max-w-lg mx-auto px-2">
          {MAIN_NAV.slice(0, 2).map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn('athletic-tap flex flex-col items-center gap-1 py-2 athletic-mono transition-colors')}
                style={{
                  color: active ? P.brand : P.inkMuted,
                  fontSize: 9,
                  letterSpacing: '0.14em',
                }}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            )
          })}

          {/* Center + button — opent de actie-sheet */}
          <button
            type="button"
            onClick={() => setQuickOpen(o => !o)}
            className="athletic-tap flex flex-col items-center justify-center"
            aria-label="Snel loggen"
            aria-expanded={quickOpen}
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
                transform: quickOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <Plus className="w-6 h-6" strokeWidth={3} />
            </span>
            <span
              className="athletic-mono"
              style={{
                color: P.inkMuted,
                fontSize: 9,
                letterSpacing: '0.14em',
                fontWeight: 700,
                marginTop: 1,
              }}
            >
              SNEL
            </span>
          </button>

          {MAIN_NAV.slice(2).map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn('athletic-tap flex flex-col items-center gap-1 py-2 athletic-mono transition-colors')}
                style={{
                  color: active ? P.brand : P.inkMuted,
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
            className="athletic-tap flex flex-col items-center gap-1 py-2 athletic-mono transition-colors"
            style={{ color: P.inkMuted, fontSize: 9, letterSpacing: '0.14em' }}
            type="button"
          >
            <Menu className="w-5 h-5" />
            <span>MEER</span>
          </button>
        </div>
      </nav>
    </>
  )
}
