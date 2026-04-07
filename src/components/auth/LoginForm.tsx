'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'

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
        setError(error.message)
        return
      }

      if (data.user) {
        router.push('/therapist/dashboard')
        router.refresh()
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
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
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg" style={{ borderRadius: '12px' }}>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#3ECF6A' }}>
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <span className="font-bold text-lg">MBT Move</span>
        </div>
        <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
        <CardDescription>Sign in to your account to continue</CardDescription>
      </CardHeader>
      <CardContent>
        {!isSupabaseConfigured && (
          <div className="mb-4 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: '#3ECF6A40', background: '#3ECF6A10', color: '#1A1A1A' }}>
            <strong>Dev mode:</strong> Supabase is not connected yet. Auth won&apos;t work until you fill in <code>.env.local</code>.
          </div>
        )}
        <Tabs defaultValue="password">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="password" className="flex-1">Password</TabsTrigger>
            <TabsTrigger value="magic-link" className="flex-1">Magic Link</TabsTrigger>
          </TabsList>

          <TabsContent value="password">
            <form onSubmit={handleEmailPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full"
                style={{ background: '#3ECF6A' }}
                disabled={loading}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="magic-link">
            {magicLinkSent ? (
              <div className="text-center py-4 space-y-2">
                <p className="font-medium">Check your email!</p>
                <p className="text-sm text-muted-foreground">
                  We sent a magic link to <strong>{email}</strong>
                </p>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="magic-email">Email</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  style={{ background: '#3ECF6A' }}
                  disabled={loading}
                >
                  {loading ? 'Sending…' : 'Send magic link'}
                </Button>
              </form>
            )}
          </TabsContent>
        </Tabs>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Don&apos;t have an account?{' '}
          <a href="/register" className="underline" style={{ color: '#3ECF6A' }}>
            Sign up
          </a>
        </p>
      </CardContent>
    </Card>
  )
}
