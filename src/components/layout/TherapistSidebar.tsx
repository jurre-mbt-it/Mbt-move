'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Dumbbell,
  CalendarDays,
  Library,
  AlertCircle,
  Activity,
  Shield,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { trpc } from '@/lib/trpc/client'
import { P } from '@/components/dark-ui'

const navItems = [
  { href: '/therapist/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/therapist/patients', label: 'Patiënten', icon: Users },
  { href: '/therapist/signals', label: 'Signalen', icon: AlertCircle },
  { href: '/therapist/programs', label: "Programma's", icon: ClipboardList },
  { href: '/therapist/week-planner', label: 'Weekschema', icon: CalendarDays },
  { href: '/therapist/exercises', label: 'Oefeningen', icon: Dumbbell },
  { href: '/therapist/programs/library', label: "Schema's", icon: Library },
]

export function TherapistSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { data: me } = trpc.auth.getMe.useQuery()
  const { data: assessmentAccess } = trpc.assessments.hasAccess.useQuery()
  const isAdmin = me?.role === 'ADMIN'
  const canUseAssessment = !!assessmentAccess?.hasAccess

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className="w-64 min-h-screen flex flex-col shrink-0 border-r"
      style={{ background: P.bg, color: P.ink, borderColor: P.lineStrong }}
    >
      {/* Logo */}
      <div className="px-6 py-5 border-b" style={{ borderColor: P.lineStrong }}>
        <div className="flex items-baseline gap-2">
          <span
            className="athletic-display"
            style={{ color: P.ink, fontSize: 22, letterSpacing: '-0.04em', fontWeight: 900 }}
          >
            MBT
          </span>
          <span
            className="athletic-mono"
            style={{ color: P.lime, fontSize: 13, fontWeight: 900, letterSpacing: '0.2em' }}
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
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 flex flex-col gap-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                'athletic-tap',
              )}
              style={{
                backgroundColor: active ? P.surfaceHi : 'transparent',
                color: active ? P.lime : P.inkMuted,
                fontWeight: active ? 800 : 600,
                letterSpacing: active ? '0.04em' : undefined,
                borderLeft: active ? `2px solid ${P.lime}` : '2px solid transparent',
              }}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {label}
            </Link>
          )
        })}
        {canUseAssessment && (
          <Link
            href="/therapist/assessments"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              'athletic-tap',
            )}
            style={{
              backgroundColor: pathname.startsWith('/therapist/assessments') ? P.surfaceHi : 'transparent',
              color: pathname.startsWith('/therapist/assessments') ? P.lime : P.inkMuted,
              fontWeight: pathname.startsWith('/therapist/assessments') ? 800 : 600,
              letterSpacing: pathname.startsWith('/therapist/assessments') ? '0.04em' : undefined,
              borderLeft: pathname.startsWith('/therapist/assessments')
                ? `2px solid ${P.lime}`
                : '2px solid transparent',
            }}
          >
            <Activity className="w-4.5 h-4.5 shrink-0" />
            Assessment
          </Link>
        )}
      </nav>

      {/* Footer */}
      <div
        className="p-3 flex flex-col gap-1 border-t"
        style={{ borderColor: P.lineStrong }}
      >
        {isAdmin && (
          <Link
            href="/admin/dashboard"
            className="athletic-tap flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
            style={{ color: P.lime, fontWeight: 700 }}
          >
            <Shield className="w-4.5 h-4.5 shrink-0" />
            Admin
          </Link>
        )}
        <Link
          href="/therapist/settings"
          className="athletic-tap flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
          style={{ color: P.inkMuted }}
        >
          <Settings className="w-4.5 h-4.5 shrink-0" />
          Instellingen
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="athletic-tap w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
          style={{ color: P.inkMuted }}
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          Uitloggen
        </button>
      </div>
    </aside>
  )
}
