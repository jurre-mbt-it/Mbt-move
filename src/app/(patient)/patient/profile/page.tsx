'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { User, Mail, Stethoscope, ClipboardList, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function PatientProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser({
          name: user.user_metadata?.name || user.email?.split('@')[0] || '',
          email: user.email || '',
        })
      }
    }
    loadUser()
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '...'

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-8" style={{ background: '#1A3A3A' }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl text-white"
            style={{ background: '#4ECDC4' }}
          >
            {initials}
          </div>
          <div className="text-center">
            <h1 className="text-white text-xl font-bold">{user?.name || '...'}</h1>
            <p className="text-zinc-400 text-sm mt-0.5">{user?.email || ''}</p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-6">
        <Card style={{ borderRadius: '14px' }}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Mijn gegevens</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <InfoRow icon={<User className="w-4 h-4" />} label="Naam" value={user?.name || '—'} />
            <InfoRow icon={<Mail className="w-4 h-4" />} label="E-mail" value={user?.email || '—'} />
          </CardContent>
        </Card>

        <Button
          variant="outline"
          className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4" />
          Uitloggen
        </Button>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-zinc-400" style={{ background: '#f4f4f5' }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
