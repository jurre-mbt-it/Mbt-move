'use client'

import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Bell, Settings, LogOut, User, Dumbbell, ArrowLeftRight } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { trpc } from '@/lib/trpc/client'
import { setPersonalMode } from '@/lib/personal-mode-client'
import Link from 'next/link'
import { P } from '@/components/dark-ui'

interface HeaderProps {
  title?: string
  userName?: string
  userEmail?: string
  userAvatar?: string
  settingsBase?: string
}

export function Header({ title, userName, userEmail, userAvatar, settingsBase = '/therapist/settings' }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  // Header rendert in de therapeut-, coach- en admin-shell, dus iedereen die
  // hem ziet is THERAPIST/COACH/ADMIN. De persoonlijke-modus-switch tonen we
  // op padbasis, zodat die niet op een getMe-response hoeft te wachten.
  const isInTherapist = pathname?.startsWith('/therapist') ?? false
  const isInCoach = pathname?.startsWith('/coach') ?? false

  // Portaal-switch voor admins. Op mobiel is de zijbalk verborgen, dus dit is
  // daar de enige uitgang uit de coach-shell terug naar het therapeut-portaal
  // (en andersom). Alleen admins zien beide portalen; een echte coach of
  // therapeut wordt door de role-guard toch teruggestuurd.
  const { data: me } = trpc.auth.getMe.useQuery()
  const otherPortal =
    me?.role !== 'ADMIN'
      ? null
      : isInCoach
        ? { href: '/therapist/dashboard', label: 'Therapeut-portaal' }
        : isInTherapist
          ? { href: '/coach/dashboard', label: 'Coach-portaal' }
          : null

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

  const initials = userName
    ? userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <header
      className="h-14 flex items-center justify-between px-4 md:px-6 border-b shrink-0"
      style={{ background: P.bg, borderColor: P.lineStrong, color: P.ink }}
    >
      {/* Logo op mobiel (sidebar is verborgen) */}
      <div className="flex items-center md:hidden">
        <span
          className="athletic-display"
          style={{ color: P.ink, fontSize: 18, letterSpacing: '0.18em', fontWeight: 900 }}
        >
          BASE
        </span>
      </div>
      {title && (
        <h1
          className="hidden md:block athletic-mono"
          style={{ color: P.ink, fontSize: 12, letterSpacing: '0.18em', fontWeight: 800 }}
        >
          {title}
        </h1>
      )}
      <div className="flex items-center gap-3 ml-auto">
        {/* Notificaties */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="athletic-tap relative p-2 rounded-lg transition-colors hover:bg-[rgba(212,232,230,0.06)]"
              style={{ color: P.inkMuted }}
            >
              <Bell className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Notificaties</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <Bell className="w-7 h-7 mb-2" style={{ color: P.inkDim }} />
              <p className="text-sm" style={{ color: P.inkMuted }}>Geen nieuwe notificaties</p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Gebruikersmenu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{ '--tw-ring-color': P.brand } as React.CSSProperties}
            >
              <Avatar className="w-8 h-8">
                {userAvatar && <AvatarImage src={userAvatar} alt={userName} />}
                <AvatarFallback style={{ background: P.brand, color: P.bg, fontWeight: 800 }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="font-medium">{userName || 'User'}</p>
              {userEmail && <p className="text-xs" style={{ color: P.inkMuted }}>{userEmail}</p>}
            </DropdownMenuLabel>
            {/* Persoonlijke trainingsmodus: therapeut traint als zichzelf in de
                atleet-shell. Alleen binnen de therapeut-shell. */}
            {isInTherapist && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={enterPersonalMode}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Dumbbell className="w-4 h-4" />
                  Persoonlijke training
                </DropdownMenuItem>
              </>
            )}
            {otherPortal && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={otherPortal.href} className="flex items-center gap-2 cursor-pointer">
                    <ArrowLeftRight className="w-4 h-4" />
                    {otherPortal.label}
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`${settingsBase}/profile`} className="flex items-center gap-2 cursor-pointer">
                <User className="w-4 h-4" />
                Profiel
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={settingsBase} className="flex items-center gap-2 cursor-pointer">
                <Settings className="w-4 h-4" />
                Instellingen
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Uitloggen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
