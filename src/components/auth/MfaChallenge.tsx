'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect'

export function MfaChallenge() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totpFactors = factors?.totp ?? []

      if (totpFactors.length === 0) {
        setError('No MFA factor found. Please re-enroll.')
        return
      }

      // Een account kan meerdere geverifieerde TOTP-factoren hebben (bijv. door
      // herhaalde enroll). De volgorde van listFactors() is niet gegarandeerd,
      // dus blind `totp[0]` pakken faalde willekeurig ("eerst ongeldig, dan
      // wel"). We proberen elke factor: de code matcht er precies één, en één
      // geslaagde verify is genoeg voor aal2. Een mislukte verify verbruikt de
      // code niet, dus dit is veilig.
      let verified = false
      for (const factor of totpFactors) {
        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: factor.id,
        })
        if (challengeError || !challengeData) continue

        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challengeData.id,
          code,
        })
        if (!verifyError) {
          verified = true
          break
        }
      }

      if (!verified) {
        setError('Invalid code. Please try again.')
        return
      }

      const next = await resolvePostLoginRedirect(supabase)
      // Harde navigatie: in de iOS-webview-wrapper herrendert een soft
      // router.push+refresh de role-layouts niet altijd na MFA, waardoor het
      // scherm "bevriest". Een volledige document-load lost dit op.
      window.location.assign(next)
    } catch {
      setError('Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg" style={{ borderRadius: '12px' }}>
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Two-Factor Authentication</CardTitle>
        <CardDescription>
          Enter the 6-digit code from your authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="totp-code">Authentication Code</Label>
            <Input
              id="totp-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              disabled={loading}
              className="text-center text-2xl tracking-widest"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button
            type="submit"
            className="w-full"
            style={{ background: '#e87a55' }}
            disabled={loading || code.length !== 6}
          >
            {loading ? 'Verifying…' : 'Verify'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
