'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { User, Mail, Phone, Building2, ChevronLeft, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ProfilePage() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="space-y-5 max-w-lg">
      <Link
        href="/therapist/settings"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Instellingen
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Profiel</h1>
        <p className="text-muted-foreground text-sm">Persoonlijke gegevens en accountinformatie</p>
      </div>

      <Card style={{ borderRadius: '12px' }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Accountgegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoRow icon={<User className="w-4 h-4" />} label="Naam" value="—" />
          <InfoRow icon={<Mail className="w-4 h-4" />} label="E-mail" value="—" />
          <InfoRow icon={<Phone className="w-4 h-4" />} label="Telefoon" value="—" />
          <InfoRow icon={<Building2 className="w-4 h-4" />} label="Praktijk" value="—" />
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
