'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'

export function RegisterForm() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    role: 'THERAPIST',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (formData.password !== formData.confirmPassword) {
      setError('Wachtwoorden komen niet overeen')
      return
    }

    if (formData.password.length < 8) {
      setError('Wachtwoord moet minimaal 8 tekens lang zijn')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            role: formData.role,
          },
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        },
      })

      if (error) {
        setError(error.message)
        return
      }

      if (data.user) {
        // Sync user to public.users table
        await fetch('/api/auth/sync-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: data.user.id,
            email: data.user.email,
            name: formData.name,
            role: formData.role,
          }),
        })

        if (data.session) {
          const role = data.user.user_metadata?.role
          router.push(role === 'PATIENT' ? '/patient/dashboard' : role === 'ATHLETE' ? '/athlete/dashboard' : '/therapist/dashboard')
          router.refresh()
        } else {
          router.push('/login?message=Controleer je e-mail om je account te bevestigen')
        }
      }
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
        <CardTitle className="text-2xl font-bold">Account aanmaken</CardTitle>
        <CardDescription>Maak een account aan voor MBT Gym</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Volledige naam</Label>
            <Input
              id="name"
              type="text"
              placeholder="Emma Bakker"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mailadres</Label>
            <Input
              id="email"
              type="email"
              placeholder="jij@voorbeeld.nl"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Ik ben een</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => setFormData({ ...formData, role: value })}
              disabled={loading}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="THERAPIST">Fysiotherapeut / Clinicus</SelectItem>
                <SelectItem value="ATHLETE">Atleet</SelectItem>
                <SelectItem value="PATIENT">Patiënt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Wachtwoord</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Wachtwoord bevestigen</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
              disabled={loading}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            style={{ background: '#BEF264' }}
            disabled={loading}
          >
            {loading ? 'Account aanmaken…' : 'Account aanmaken'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Al een account?{' '}
          <a href="/login" className="underline" style={{ color: '#BEF264' }}>
            Inloggen
          </a>
        </p>
      </CardContent>
    </Card>
  )
}
