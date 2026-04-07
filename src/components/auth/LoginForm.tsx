'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'

function getRoleRedirect(role?: string) {
  if (role === 'PATIENT') return '/patient/dashboard'
  return '/therapist/dashboard'
}

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  const supabase = createClient()

  async function handleEmailPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setError(error.message === 'Invalid login credentials'
          ? 'Ongeldig e-mailadres of wachtwoord'
          : error.message)
        return
      }

      if (data.user) {
        const role = data.user.user_metadata?.role
        router.push(getRoleRedirect(role))
        router.refresh()
      }
    } catch {
      setError('Er is een onverwachte fout opgetreden. Probeer opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        },
      })

      if (error) {
        setError(error.message)
        return
      }

      setMagicLinkSent(true)
    } catch {
      setError('Er is een onverwachte fout opgetreden. Probeer opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg" style={{ borderRadius: '12px' }}>
      <CardHeader className="space-y-1">
        <div className="flex items-center mb-2">
          <img src="/Logo.jpg" alt="MBT Gym" className="h-8 w-auto" />
        </div>
        <CardTitle className="text-2xl font-bold">Welkom terug</CardTitle>
        <CardDescription>Log in op je account om verder te gaan</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="password">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="password" className="flex-1">Wachtwoord</TabsTrigger>
            <TabsTrigger value="magic-link" className="flex-1">Magic Link</TabsTrigger>
          </TabsList>

          <TabsContent value="password">
            <form onSubmit={handleEmailPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mailadres</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="jij@voorbeeld.nl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Wachtwoord</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                style={{ background: '#3ECF6A' }}
                disabled={loading}
              >
                {loading ? 'Inloggen…' : 'Inloggen'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="magic-link">
            {magicLinkSent ? (
              <div className="text-center py-4 space-y-2">
                <p className="font-medium">Controleer je e-mail!</p>
                <p className="text-sm text-muted-foreground">
                  We hebben een magic link gestuurd naar <strong>{email}</strong>
                </p>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="magic-email">E-mailadres</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    placeholder="jij@voorbeeld.nl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  className="w-full"
                  style={{ background: '#3ECF6A' }}
                  disabled={loading}
                >
                  {loading ? 'Versturen…' : 'Stuur magic link'}
                </Button>
              </form>
            )}
          </TabsContent>
        </Tabs>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Nog geen account?{' '}
          <a href="/register" className="underline" style={{ color: '#3ECF6A' }}>
            Registreren
          </a>
        </p>
      </CardContent>
    </Card>
  )
}
