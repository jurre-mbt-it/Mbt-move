'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect'

export function RegisterForm() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'ATHLETE',
  })
  const [otpCode, setOtpCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const otpInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: formData.email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          data: {
            name: formData.name,
            role: formData.role,
          },
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setError(error.message)
        return
      }

      setCodeSent(true)
      setTimeout(() => otpInputRef.current?.focus(), 100)
    } catch {
      setError('Er is een onverwachte fout opgetreden. Probeer opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const normalized = otpCode.replace(/\D/g, '')
    if (normalized.length !== 6) {
      setError('De code bestaat uit 6 cijfers.')
      return
    }

    setLoading(true)
    try {
      const { data, error: otpError } = await supabase.auth.verifyOtp({
        email: formData.email.trim().toLowerCase(),
        token: normalized,
        type: 'email',
      })

      if (otpError || !data.user) {
        setError(otpError?.message ?? 'De code klopt niet. Vraag een nieuwe aan.')
        return
      }

      // Sync user naar DB (name/role komen mee uit form, role wordt server-side ge-allowlist).
      try {
        await fetch('/api/auth/sync-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formData.name, role: formData.role }),
        })
      } catch {
        /* sync is idempotent — als 'ie faalt komt 'ie alsnog via /api/auth/me self-heal */
      }

      const next = await resolvePostLoginRedirect(supabase)
      router.push(next)
      router.refresh()
    } catch {
      setError('Er is een onverwachte fout opgetreden.')
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
        <CardTitle className="text-2xl font-bold">
          {codeSent ? 'Bevestig je e-mail' : 'Account aanmaken'}
        </CardTitle>
        <CardDescription>
          {codeSent
            ? 'We hebben een 6-cijfer code gestuurd. Vul hem hieronder in om door te gaan.'
            : 'Maak een account aan voor MBT Gym — geen wachtwoord nodig, je logt elke keer in met een code per mail.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {codeSent ? (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">6-cijfer code</Label>
              <Input
                id="otp"
                ref={otpInputRef}
                type="tel"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                disabled={loading}
                className="text-center text-2xl tracking-widest font-bold"
              />
              <p className="text-xs text-muted-foreground">
                Verstuurd naar <strong>{formData.email}</strong>
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              style={{ background: '#e87a55' }}
              disabled={loading || otpCode.length !== 6}
            >
              {loading ? 'Bezig…' : 'Bevestig en log in'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setCodeSent(false)
                setOtpCode('')
                setError(null)
              }}
              className="w-full text-xs text-muted-foreground underline"
            >
              Ander e-mailadres
            </button>
          </form>
        ) : (
          <form onSubmit={handleRequestCode} className="space-y-4">
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
                  {/* Fysiotherapeut/clinicus is bewust geen self-signup-optie:
                      staff wordt via invite/admin geprovisioneerd. */}
                  <SelectItem value="ATHLETE">Atleet</SelectItem>
                  <SelectItem value="PATIENT">Patiënt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              style={{ background: '#e87a55' }}
              disabled={loading}
            >
              {loading ? 'Bezig…' : 'Stuur inlogcode'}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground mt-4">
          Al een account?{' '}
          <a href="/login" className="underline" style={{ color: '#e87a55' }}>
            Inloggen
          </a>
        </p>
      </CardContent>
    </Card>
  )
}
