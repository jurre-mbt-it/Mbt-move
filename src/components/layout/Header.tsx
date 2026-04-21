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
import { Bell, Settings, LogOut, User, UserCog, Activity } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
  const isInTherapist = pathname?.startsWith('/therapist') ?? false

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
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
        <div className="flex items-baseline gap-2">
          <span
            className="athletic-display"
            style={{ color: P.ink, fontSize: 18, letterSpacing: '-0.04em', fontWeight: 900 }}
          >
            MBT
          </span>
          <span
            className="athletic-mono"
            style={{ color: P.lime, fontSize: 11, fontWeight: 900, letterSpacing: '0.2em' }}
          >
            GYM
          </span>
        </div>
      </div>
      {title && (
        <h1
          className="hidden md:block athletic-mono"
          style={{ color: P.ink, fontSize: 12, letterSpacing: '0.18em', fontWeight: 800 }}
        >
          {title.toUpperCase()}
        </h1>
      )}
      <div className="flex items-center gap-3 ml-auto">
        {/* Notificaties */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="athletic-tap relative p-2 rounded-lg transition-colors"
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
              style={{ '--tw-ring-color': P.lime } as React.CSSProperties}
            >
              <Avatar className="w-8 h-8">
                {userAvatar && <AvatarImage src={userAvatar} alt={userName} />}
                <AvatarFallback style={{ background: P.lime, color: P.bg, fontWeight: 800 }}>
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
            <DropdownMenuSeparator />
            {/* Role-switch: therapeut kan eigen patient-view bekijken en andersom. */}
            <DropdownMenuItem asChild>
              <Link
                href={isInTherapist ? '/patient/dashboard' : '/therapist/dashboard'}
                className="flex items-center gap-2 cursor-pointer"
              >
                {isInTherapist ? <Activity className="w-4 h-4" /> : <UserCog className="w-4 h-4" />}
                {isInTherapist ? 'Bekijk als patient' : 'Bekijk als therapeut'}
              </Link>
            </DropdownMenuItem>
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
