'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { User, Mail, Dumbbell, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AthleteProfilePage() {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-8" style={{ background: '#1A3A3A' }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl text-white"
            style={{ background: '#4ECDC4' }}
          >
            AT
          </div>
          <div className="text-center">
            <h1 className="text-white text-xl font-bold">Atleet</h1>
            <p className="text-zinc-400 text-sm mt-0.5">Atleet Dashboard</p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-6">
        <Card style={{ borderRadius: '14px' }}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Profiel</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Rol</p>
                <p className="text-sm font-medium">Atleet</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Dumbbell className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Modus</p>
                <p className="text-sm font-medium">Zelfstandig trainen</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4" />
          Uitloggen
        </Button>
      </div>
    </div>
  )
}
