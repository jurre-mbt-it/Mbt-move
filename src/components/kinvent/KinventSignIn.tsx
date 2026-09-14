'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, DarkInput, MetaLabel, P } from '@/components/dark-ui'

/**
 * Aanmelden van de praktijk bij Kinvent: e-mail en wachtwoord van het
 * KINVENT-praktijkaccount, daarna de code uit mail of sms. De gegevens blijven
 * alleen in dit formulier tot de aanmelding rond is; de server bewaart alleen
 * het token, versleuteld, 31 dagen. Daarna moet iemand dit opnieuw doen.
 */
export function KinventSignIn({ compact = false }: { compact?: boolean }) {
  const utils = trpc.useUtils()
  const { data: status, isLoading } = trpc.kinvent.connectionStatus.useQuery()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [method, setMethod] = useState<string | null>(null)
  const [opnieuw, setOpnieuw] = useState(false)

  const klaar = () => {
    setEmail('')
    setPassword('')
    setCode('')
    setMethod(null)
    setOpnieuw(false)
    void utils.kinvent.connectionStatus.invalidate()
  }

  const start = trpc.kinvent.startSignIn.useMutation({
    onSuccess: (r) => {
      if (r.done) {
        toast.success('Aangemeld bij Kinvent')
        klaar()
      } else {
        setMethod(r.method)
      }
    },
    onError: (e) => toast.error(e.message),
  })
  const complete = trpc.kinvent.completeSignIn.useMutation({
    onSuccess: () => {
      toast.success('Aangemeld bij Kinvent')
      klaar()
    },
    onError: (e) => toast.error(e.message),
  })
  const disconnect = trpc.kinvent.disconnect.useMutation({
    onSuccess: () => {
      toast.success('Afgemeld bij Kinvent')
      klaar()
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) return null

  const verbonden = !!status?.connected
  const toonFormulier = !verbonden || opnieuw

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <MetaLabel style={{ color: verbonden ? (status?.needsRenewal ? P.gold : P.lime) : P.inkMuted }}>
            {verbonden
              ? status?.needsRenewal
                ? `KINVENT · VERLOOPT OVER ${status.daysLeft} DAG${status.daysLeft === 1 ? '' : 'EN'}`
                : 'KINVENT · AANGEMELD'
              : 'KINVENT · NIET AANGEMELD'}
          </MetaLabel>
          {verbonden && status && (
            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4 }}>
              Geldig tot {new Date(status.expiresAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
              {status.connectedByName ? ` · aangemeld door ${status.connectedByName}` : ''}
            </p>
          )}
          {status?.connected && status.lastError && (
            <p style={{ color: P.gold, fontSize: 12, marginTop: 4 }}>{status.lastError}</p>
          )}
        </div>
        {verbonden && !opnieuw && (
          <div className="flex gap-2">
            <DarkButton variant="ghost" size="sm" onClick={() => setOpnieuw(true)}>Opnieuw aanmelden</DarkButton>
            {!compact && (
              <DarkButton variant="ghost" size="sm" onClick={() => disconnect.mutate()} loading={disconnect.isPending}>
                Afmelden
              </DarkButton>
            )}
          </div>
        )}
      </div>

      {toonFormulier && (
        <div className="space-y-2">
          {!method ? (
            <>
              <p style={{ color: P.inkMuted, fontSize: 12 }}>
                Meld de praktijk aan met het KINVENT-account. Het wachtwoord wordt niet bewaard; alleen de
                aanmelding, voor 31 dagen.
              </p>
              <DarkInput
                type="email"
                autoComplete="username"
                placeholder="E-mail van het KINVENT-account"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <DarkInput
                type="password"
                autoComplete="current-password"
                placeholder="Wachtwoord"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="flex gap-2">
                <DarkButton
                  size="sm"
                  disabled={!email.trim() || !password}
                  loading={start.isPending}
                  onClick={() => start.mutate({ email: email.trim(), password })}
                >
                  Code aanvragen
                </DarkButton>
                {opnieuw && (
                  <DarkButton variant="ghost" size="sm" onClick={() => setOpnieuw(false)}>Annuleren</DarkButton>
                )}
              </div>
            </>
          ) : (
            <>
              <p style={{ color: P.inkMuted, fontSize: 12 }}>
                Kinvent heeft een code gestuurd via {method.toLowerCase() === 'email' ? 'e-mail' : method.toLowerCase()}.
              </p>
              <DarkInput
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className="flex gap-2">
                <DarkButton
                  size="sm"
                  disabled={code.trim().length < 4}
                  loading={complete.isPending}
                  onClick={() => complete.mutate({ email: email.trim(), password, code: code.trim() })}
                >
                  Aanmelden
                </DarkButton>
                <DarkButton variant="ghost" size="sm" onClick={() => setMethod(null)}>Terug</DarkButton>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
