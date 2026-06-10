'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Dumbbell,
  CalendarDays,
  AlertCircle,
  Activity,
  BarChart3,
  Shield,
  Settings,
  LogOut,
  Sparkles,
  Stethoscope,
  Blocks,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { trpc } from '@/lib/trpc/client'
import { setPersonalMode } from '@/lib/personal-mode-client'
import { P } from '@/components/dark-ui'

const navItems = [
  { href: '/therapist/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/therapist/patients', label: 'Patiënten', icon: Users },
  { href: '/therapist/signals', label: 'Signalen', icon: AlertCircle },
  { href: '/therapist/programs', label: "Programma's", icon: ClipboardList },
  { href: '/therapist/programs/new', label: 'Builder', icon: Blocks },
  { href: '/therapist/week-planner', label: 'Weekschema', icon: CalendarDays },
  { href: '/therapist/exercises', label: 'Oefeningen', icon: Dumbbell },
  { href: '/therapist/tests', label: 'Tests', icon: Stethoscope },
  { href: '/therapist/test-reports', label: 'Testrapport', icon: FileText },
  { href: '/therapist/cohort', label: 'Cohort', icon: BarChart3 },
  { href: '/therapist/dpa', label: 'DPA-status', icon: Shield },
]

// Voorkeursleutel: ingeklapt blijft ingeklapt over pagina's/sessies heen.
// localStorage als externe store via useSyncExternalStore — SSR rendert
// uitgeklapt (server-snapshot), client pakt de opgeslagen voorkeur op
// zonder hydration-mismatch of setState-in-effect.
const COLLAPSE_KEY = 'mbt-sidebar-collapsed'
const collapseListeners = new Set<() => void>()
function subscribeCollapsed(cb: () => void) {
  collapseListeners.add(cb)
  return () => { collapseListeners.delete(cb) }
}
function getCollapsedSnapshot() {
  return localStorage.getItem(COLLAPSE_KEY) === '1'
}
function storeCollapsed(v: boolean) {
  localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
  collapseListeners.forEach(l => l())
}

export function TherapistSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { data: me } = trpc.auth.getMe.useQuery()
  const { data: assessmentAccess } = trpc.assessments.hasAccess.useQuery()
  const isAdmin = me?.role === 'ADMIN'
  const canUseAssessment = !!assessmentAccess?.hasAccess

  // Ingeklapt = alleen iconen. Toggle door op het logo te KLIKKEN (bewust
  // geen hover-gedrag).
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, () => false)
  function toggleCollapsed() {
    storeCollapsed(!collapsed)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function enterPersonalMode() {
    await setPersonalMode(true)
    router.push('/athlete/dashboard')
    router.refresh()
  }

  // Gedeelde stijl voor één nav-rij; ingeklapt → alleen gecentreerd icoon
  // met de label als title-tooltip.
  function rowClass() {
    return cn(
      'flex items-center gap-3 py-2.5 rounded-lg text-sm transition-colors',
      'athletic-tap mbt-nav-hover',
      collapsed ? 'justify-center px-0' : 'px-3',
    )
  }

  return (
    <aside
      className="min-h-screen flex flex-col shrink-0 border-r transition-[width] duration-300"
      style={{
        width: collapsed ? 64 : 256,
        background: P.bg,
        color: P.ink,
        borderColor: P.lineStrong,
      }}
    >
      {/* Logo — klik om het menu in/uit te klappen */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className={cn('athletic-tap w-full border-b text-left cursor-pointer', collapsed ? 'px-0 py-5' : 'px-6 py-5')}
        style={{ borderColor: P.lineStrong }}
        title={collapsed ? 'Menu uitklappen' : 'Menu inklappen'}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Menu uitklappen' : 'Menu inklappen'}
      >
        {collapsed ? (
          <div className="flex justify-center items-baseline">
            <span
              className="athletic-display"
              style={{ color: P.ink, fontSize: 20, letterSpacing: '-0.04em', fontWeight: 900 }}
            >
              M
            </span>
            <span
              className="athletic-mono"
              style={{ color: P.brand, fontSize: 11, fontWeight: 900 }}
            >
              G
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span
                className="athletic-display"
                style={{ color: P.ink, fontSize: 22, letterSpacing: '-0.04em', fontWeight: 900 }}
              >
                MBT
              </span>
              <span
                className="athletic-mono"
                style={{ color: P.brand, fontSize: 13, fontWeight: 900, letterSpacing: '0.2em' }}
              >
                GYM
              </span>
            </div>
            <p
              className="athletic-mono mt-2"
              style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.2em' }}
            >
              CLINICIAN PORTAL
            </p>
          </>
        )}
      </button>

      {/* Navigation */}
      <nav className={cn('flex-1 p-3 flex flex-col gap-1 mbt-stagger', collapsed && 'px-2')}>
        {(() => {
          // Langste matchende href wint, zodat op /therapist/programs/new
          // alleen "Builder" oplicht en niet ook "Programma's".
          const matchedHref = navItems
            .map(i => i.href)
            .filter(h => pathname === h || pathname.startsWith(h + '/'))
            .sort((a, b) => b.length - a.length)[0]
          return navItems.map(({ href, label, icon: Icon }) => {
          const active = href === matchedHref
          return (
            <Link
              key={href}
              href={href}
              className={rowClass()}
              title={collapsed ? label : undefined}
              style={{
                backgroundColor: active ? P.surfaceHi : undefined,
                color: active ? P.brand : P.inkMuted,
                fontWeight: active ? 800 : 600,
                letterSpacing: active && !collapsed ? '0.04em' : undefined,
                borderLeft: active ? `2px solid ${P.brand}` : '2px solid transparent',
              }}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {!collapsed && label}
            </Link>
          )
          })
        })()}
        {canUseAssessment && (
          <Link
            href="/therapist/assessments"
            className={rowClass()}
            title={collapsed ? 'Assessment' : undefined}
            style={{
              backgroundColor: pathname.startsWith('/therapist/assessments') ? P.surfaceHi : undefined,
              color: pathname.startsWith('/therapist/assessments') ? P.brand : P.inkMuted,
              fontWeight: pathname.startsWith('/therapist/assessments') ? 800 : 600,
              letterSpacing: pathname.startsWith('/therapist/assessments') && !collapsed ? '0.04em' : undefined,
              borderLeft: pathname.startsWith('/therapist/assessments')
                ? `2px solid ${P.brand}`
                : '2px solid transparent',
            }}
          >
            <Activity className="w-4.5 h-4.5 shrink-0" />
            {!collapsed && 'Assessment'}
          </Link>
        )}
      </nav>

      {/* Footer */}
      <div
        className={cn('p-3 flex flex-col gap-1 border-t', collapsed && 'px-2')}
        style={{ borderColor: P.lineStrong }}
      >
        {isAdmin && (
          <Link
            href="/admin/dashboard"
            className={rowClass()}
            title={collapsed ? 'Admin' : undefined}
            style={{ color: P.brand, fontWeight: 700 }}
          >
            <Shield className="w-4.5 h-4.5 shrink-0" />
            {!collapsed && 'Admin'}
          </Link>
        )}
        {/* Mijn training: therapeut kan zijn eigen schema's loggen en plannen. */}
        <button
          type="button"
          onClick={enterPersonalMode}
          className={cn(rowClass(), 'w-full')}
          title={collapsed ? 'Persoonlijke training' : undefined}
          style={{ color: P.ink, fontWeight: 700 }}
        >
          <Dumbbell className="w-4.5 h-4.5 shrink-0" style={{ color: P.brand }} />
          {!collapsed && 'Persoonlijke training'}
        </button>
        {me?.id && (
          <Link
            href={`/therapist/programs/new?patientId=${me.id}`}
            className={rowClass()}
            title={collapsed ? 'Nieuw schema voor mezelf' : undefined}
            style={{ color: P.inkMuted }}
          >
            <Blocks className="w-4.5 h-4.5 shrink-0" />
            {!collapsed && 'Nieuw schema voor mezelf'}
          </Link>
        )}
        <Link
          href="/therapist/release-notes"
          className={rowClass()}
          title={collapsed ? 'Wat is nieuw' : undefined}
          style={{ color: P.inkMuted }}
        >
          <Sparkles className="w-4.5 h-4.5 shrink-0" />
          {!collapsed && 'Wat is nieuw'}
        </Link>
        <Link
          href="/therapist/settings"
          className={rowClass()}
          title={collapsed ? 'Instellingen' : undefined}
          style={{ color: P.inkMuted }}
        >
          <Settings className="w-4.5 h-4.5 shrink-0" />
          {!collapsed && 'Instellingen'}
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className={cn(rowClass(), 'w-full')}
          title={collapsed ? 'Uitloggen' : undefined}
          style={{ color: P.inkMuted }}
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          {!collapsed && 'Uitloggen'}
        </button>
      </div>
    </aside>
  )
}
