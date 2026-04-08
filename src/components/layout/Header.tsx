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
import { Bell, Settings, LogOut, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface HeaderProps {
  title?: string
  userName?: string
  userEmail?: string
  userAvatar?: string
  settingsBase?: string
}

export function Header({ title, userName, userEmail, userAvatar, settingsBase = '/therapist/settings' }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

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
      style={{ background: '#FFFFFF', borderColor: '#E4E4E7' }}
    >
      {/* Logo op mobiel (sidebar is verborgen) */}
      <div className="flex items-center md:hidden">
        <img src="/Logo.jpg" alt="MBT Gym" className="h-7 w-auto" />
      </div>
      {title && (
        <h1 className="hidden md:block font-semibold text-lg">{title}</h1>
      )}
      <div className="flex items-center gap-3 ml-auto">
        {/* Notificaties */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative p-2 rounded-lg hover:bg-zinc-100 transition-colors">
              <Bell className="w-5 h-5 text-zinc-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Notificaties</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <Bell className="w-7 h-7 text-zinc-200 mb-2" />
              <p className="text-sm text-muted-foreground">Geen nieuwe notificaties</p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Gebruikersmenu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2" style={{ '--tw-ring-color': '#4ECDC4' } as React.CSSProperties}>
              <Avatar className="w-8 h-8">
                {userAvatar && <AvatarImage src={userAvatar} alt={userName} />}
                <AvatarFallback style={{ background: '#4ECDC4', color: '#FFFFFF' }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="font-medium">{userName || 'User'}</p>
              {userEmail && <p className="text-xs text-muted-foreground truncate">{userEmail}</p>}
            </DropdownMenuLabel>
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
