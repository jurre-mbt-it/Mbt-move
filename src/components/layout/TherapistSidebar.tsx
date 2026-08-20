'use client'

import { useRef, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
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
  MessageSquare,
  PanelLeftClose,
  ArrowLeftRight,
  Rocket,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { trpc } from '@/lib/trpc/client'
import { setPersonalMode } from '@/lib/personal-mode-client'
import { P } from '@/components/dark-ui'

export type SidebarNavItem = { href: string; label: string; icon: LucideIcon }

const THERAPIST_NAV: SidebarNavItem[] = [
  { href: '/therapist/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/therapist/patients', label: 'Patiënten', icon: Users },
  { href: '/therapist/messages', label: 'Berichten', icon: MessageSquare },
  { href: '/therapist/signals', label: 'Signalen', icon: AlertCircle },
  { href: '/therapist/programs', label: "Programma's", icon: ClipboardList },
  { href: '/therapist/programs/new', label: 'Builder', icon: Blocks },
  { href: '/therapist/week-planner', label: 'Weekschema', icon: CalendarDays },
  { href: '/therapist/plans', label: 'Trainingsplannen', icon: FileText },
  { href: '/therapist/exercises', label: 'Oefeningen', icon: Dumbbell },
  { href: '/therapist/tests', label: 'Tests', icon: Stethoscope },
  { href: '/therapist/test-reports', label: 'Testrapport', icon: FileText },
  { href: '/therapist/cohort', label: 'Cohort', icon: BarChart3 },
]

/**
 * Coach-variant: dezelfde shell, zonder de klinische onderdelen (tests,
 * testrapporten, assessment, cohort). Zie docs/plan-coach-role-20260721.md.
 */
const COACH_NAV: SidebarNavItem[] = [
  { href: '/coach/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/coach/athletes', label: 'Atleten', icon: Users },
  { href: '/coach/messages', label: 'Berichten', icon: MessageSquare },
  { href: '/coach/signals', label: 'Signalen', icon: AlertCircle },
  { href: '/coach/programs', label: "Programma's", icon: ClipboardList },
  { href: '/coach/programs/new', label: 'Builder', icon: Blocks },
  { href: '/coach/week-planner', label: 'Weekschema', icon: CalendarDays },
  { href: '/coach/plans', label: 'Trainingsplannen', icon: FileText },
  { href: '/coach/exercises', label: 'Oefeningen', icon: Dumbbell },
]

/**
 * Nav + labels per portaal. De coach-shell hergebruikt deze zijbalk.
 *
 * `otherPortal` is de heen-én-terugschakelaar voor admins, die in beide
 * shells mag meekijken. Zonder die regel kom je vanuit /coach alleen terug
 * via het admin-dashboard, of op mobiel helemaal niet.
 */
export const SIDEBAR_VARIANTS = {
  therapist: {
    nav: THERAPIST_NAV,
    portalLabel: 'CLINICIAN PORTAL',
    messagesHref: '/therapist/messages',
    programsNewHref: '/therapist/programs/new',
    settingsHref: '/therapist/settings',
    showAssessment: true,
    otherPortal: { href: '/coach/dashboard', label: 'Coach-portaal' },
  },
  coach: {
    nav: COACH_NAV,
    portalLabel: 'COACH PORTAL',
    messagesHref: '/coach/messages',
    programsNewHref: '/coach/programs/new',
    settingsHref: '/coach/settings',
    showAssessment: false,
    otherPortal: { href: '/therapist/dashboard', label: 'Therapeut-portaal' },
  },
} as const

export type SidebarVariant = keyof typeof SIDEBAR_VARIANTS

// Ingeklapt-voorkeur als externe store (localStorage) via
// useSyncExternalStore — SSR rendert uitgeklapt (server-snapshot), client
// pakt de opgeslagen stand op zonder hydration-mismatch.
//
// Interactie-model:
//   • klik ergens in de CONTENT (buiten de zijbalk) → balk klapt in
//   • klik op een icoon in de INGEKLAPTE balk → balk klapt uit (navigeert
//     niet — eerste klik opent het menu, daarna kies je)
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
  if (getCollapsedSnapshot() === v) return
  localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
  collapseListeners.forEach(l => l())
}

export function TherapistSidebar({ variant = 'therapist' }: { variant?: SidebarVariant } = {}) {
  const cfg = SIDEBAR_VARIANTS[variant]
  const navItems = cfg.nav
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const asideRef = useRef<HTMLElement>(null)
  const { data: me } = trpc.auth.getMe.useQuery()
  const { data: assessmentAccess } = trpc.assessments.hasAccess.useQuery()
  // Ongelezen patiënt-berichten — badge op de Berichten-rij.
  const { data: unreadMessages = 0 } = trpc.messages.unreadTotal.useQuery(undefined, {
    refetchInterval: 60_000,
  })
  const isAdmin = me?.role === 'ADMIN'
  const canUseAssessment = cfg.showAssessment && !!assessmentAccess?.hasAccess

  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, () => false)

  // Handmatig in-/uitklappen via de toggle-knop bovenin. Bewust géén
  // auto-inklappen meer bij klikken in de content — dat was hinderlijk tijdens
  // het werken. De voorkeur blijft in localStorage bewaard.
  function toggleCollapsed() {
    storeCollapsed(!collapsed)
  }

  /** Ingeklapt: eerste klik op het logo/een item klapt alleen het menu uit. */
  function expandGuard(e: React.MouseEvent): boolean {
    if (!collapsed) return false
    e.preventDefault()
    storeCollapsed(false)
    return true
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
      ref={asideRef}
      className="h-screen flex flex-col shrink-0 border-r transition-[width] duration-300"
      style={{
        width: collapsed ? 64 : 256,
        background: P.bg,
        color: P.ink,
        borderColor: P.lineStrong,
      }}
    >
      {/* Logo + handmatige inklap-toggle. Ingeklapt blijft alleen MBT over;
          klik op het logo klapt dan uit. Uitgeklapt staat rechtsboven een
          knopje om te minimaliseren. */}
      <div className="relative">
      {!collapsed && (
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Menu inklappen"
          aria-label="Menu inklappen"
          className="mbt-btn-hover athletic-tap absolute right-3 top-4 z-10 rounded-lg p-1.5 text-[var(--p-ink-muted)] hover:text-[var(--p-ink)]"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={(e) => { expandGuard(e) }}
        className={cn(
          'w-full border-b text-left',
          collapsed ? 'athletic-tap px-0 py-5 cursor-pointer' : 'px-6 py-5 cursor-default',
        )}
        style={{ borderColor: P.lineStrong }}
        title={collapsed ? 'Menu uitklappen' : undefined}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Menu uitklappen' : 'BASE'}
        tabIndex={collapsed ? 0 : -1}
      >
        {collapsed ? (
          <div className="flex justify-center">
            <span
              className="athletic-display"
              style={{ color: P.ink, fontSize: 14, letterSpacing: '0.06em', fontWeight: 900 }}
            >
              BASE
            </span>
          </div>
        ) : (
          <>
            <span
              className="athletic-display"
              style={{ color: P.ink, fontSize: 22, letterSpacing: '0.18em', fontWeight: 900 }}
            >
              BASE
            </span>
            <p
              className="athletic-mono mt-2"
              style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.2em' }}
            >
              {cfg.portalLabel}
            </p>
          </>
        )}
      </button>
      </div>

      {/* Navigation */}
      {/* Alles onder het logo schuift mee. Zonder dit is de onderkant van het
          menu onbereikbaar op een laag scherm — de layout eromheen staat op
          overflow-hidden, dus er valt niets terug te scrollen. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      <nav className={cn('p-3 flex flex-col gap-1 mbt-stagger', collapsed && 'px-2')}>
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
              onClick={expandGuard}
              className={rowClass()}
              title={collapsed ? label : undefined}
              style={{
                backgroundColor: active ? P.control : undefined,
                color: active ? P.brand : P.inkMuted,
                fontWeight: active ? 800 : 600,
                letterSpacing: active && !collapsed ? '0.04em' : undefined,
                borderLeft: active ? `2px solid ${P.brand}` : '2px solid transparent',
              }}
            >
              <span className="relative shrink-0 inline-flex">
                <Icon className="w-4.5 h-4.5" />
                {href === cfg.messagesHref && unreadMessages > 0 && collapsed && (
                  <span
                    aria-hidden
                    className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                    style={{ background: P.brand }}
                  />
                )}
              </span>
              {!collapsed && label}
              {href === cfg.messagesHref && unreadMessages > 0 && !collapsed && (
                <span
                  className="athletic-mono ml-auto rounded-full flex items-center justify-center"
                  style={{ minWidth: 20, height: 20, padding: '0 6px', background: P.brand, color: P.bg, fontSize: 10, fontWeight: 900 }}
                >
                  {unreadMessages}
                </span>
              )}
            </Link>
          )
          })
        })()}
        {canUseAssessment && (
          <Link
            href="/therapist/assessments"
            onClick={expandGuard}
            className={rowClass()}
            title={collapsed ? 'Assessment' : undefined}
            style={{
              backgroundColor: pathname.startsWith('/therapist/assessments') ? P.control : undefined,
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
          <>
            <Link
              href={cfg.otherPortal.href}
              onClick={expandGuard}
              className={rowClass()}
              title={collapsed ? cfg.otherPortal.label : undefined}
              style={{ color: P.inkMuted, fontWeight: 700 }}
            >
              <ArrowLeftRight className="w-4.5 h-4.5 shrink-0" />
              {!collapsed && cfg.otherPortal.label}
            </Link>
            <Link
              href="/admin/dashboard"
              onClick={expandGuard}
              className={rowClass()}
              title={collapsed ? 'Admin' : undefined}
              style={{ color: P.brand, fontWeight: 700 }}
            >
              <Shield className="w-4.5 h-4.5 shrink-0" />
              {!collapsed && 'Admin'}
            </Link>
          </>
        )}
        {/* Mijn training: therapeut kan zijn eigen schema's loggen en plannen. */}
        <button
          type="button"
          onClick={(e) => { if (!expandGuard(e)) enterPersonalMode() }}
          className={cn(rowClass(), 'w-full')}
          title={collapsed ? 'Persoonlijke training' : undefined}
          style={{ color: P.ink, fontWeight: 700 }}
        >
          <Dumbbell className="w-4.5 h-4.5 shrink-0" style={{ color: P.brand }} />
          {!collapsed && 'Persoonlijke training'}
        </button>
        {me?.id && (
          <Link
            href={`${cfg.programsNewHref}?patientId=${me.id}`}
            onClick={expandGuard}
            className={rowClass()}
            title={collapsed ? 'Nieuw schema voor mezelf' : undefined}
            style={{ color: P.inkMuted }}
          >
            <Blocks className="w-4.5 h-4.5 shrink-0" />
            {!collapsed && 'Nieuw schema voor mezelf'}
          </Link>
        )}
        {variant === 'therapist' && (
          <>
            <Link
              href="/therapist/quick-start"
              onClick={expandGuard}
              className={rowClass()}
              title={collapsed ? 'Quick start' : undefined}
              style={{ color: P.inkMuted }}
            >
              <Rocket className="w-4.5 h-4.5 shrink-0" />
              {!collapsed && 'Quick start'}
            </Link>
            <Link
              href="/therapist/release-notes"
              onClick={expandGuard}
              className={rowClass()}
              title={collapsed ? 'Wat is nieuw' : undefined}
              style={{ color: P.inkMuted }}
            >
              <Sparkles className="w-4.5 h-4.5 shrink-0" />
              {!collapsed && 'Wat is nieuw'}
            </Link>
          </>
        )}
        <Link
          href={cfg.settingsHref}
          onClick={expandGuard}
          className={rowClass()}
          title={collapsed ? 'Instellingen' : undefined}
          style={{ color: P.inkMuted }}
        >
          <Settings className="w-4.5 h-4.5 shrink-0" />
          {!collapsed && 'Instellingen'}
        </Link>
        <button
          type="button"
          onClick={(e) => { if (!expandGuard(e)) handleSignOut() }}
          className={cn(rowClass(), 'w-full')}
          title={collapsed ? 'Uitloggen' : undefined}
          style={{ color: P.inkMuted }}
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          {!collapsed && 'Uitloggen'}
        </button>
      </div>
      </div>
    </aside>
  )
}
