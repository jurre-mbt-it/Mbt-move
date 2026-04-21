/**
 * Therapist-access consent: patient ziet welke therapeuten toegang hebben
 * of aanvragen, en kan accepteren / afwijzen / intrekken.
 */
'use client'

import { useMemo } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkHeader,
  DarkScreen,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

type Relation = {
  id: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'REVOKED'
  requestedAt: Date | string | null
  respondedAt: Date | string | null
  therapist: {
    id: string
    name: string | null
    email: string
    specialty: string | null
    avatarUrl: string | null
  }
}

const STATUS_COPY: Record<Relation['status'], { label: string; color: string; desc: string }> = {
  PENDING: { label: 'WACHTEND', color: P.gold, desc: 'Wil toegang tot jouw schema' },
  APPROVED: { label: 'TOEGELATEN', color: P.lime, desc: 'Kan je schema en voortgang zien' },
  DECLINED: { label: 'AFGEWEZEN', color: P.danger, desc: 'Heeft geen toegang' },
  REVOKED: { label: 'INGETROKKEN', color: P.inkMuted, desc: 'Toegang is stopgezet' },
}

export default function AccessPage() {
  const utils = trpc.useUtils()
  const { data: relations = [], isLoading } = trpc.patient.getTherapistAccess.useQuery()
  const respond = trpc.patient.respondToTherapistAccess.useMutation({
    onSuccess: (_d, vars) => {
      utils.patient.getTherapistAccess.invalidate()
      toast.success(vars.accept ? 'Toegang verleend' : 'Verzoek afgewezen')
    },
    onError: (e) => toast.error(e.message),
  })
  const revoke = trpc.patient.revokeTherapistAccess.useMutation({
    onSuccess: () => {
      utils.patient.getTherapistAccess.invalidate()
      toast.success('Toegang ingetrokken')
    },
    onError: (e) => toast.error(e.message),
  })

  const grouped = useMemo(() => {
    const r = relations as Relation[]
    return {
      pending: r.filter((x) => x.status === 'PENDING'),
      approved: r.filter((x) => x.status === 'APPROVED'),
      other: r.filter((x) => x.status === 'DECLINED' || x.status === 'REVOKED'),
    }
  }, [relations])

  return (
    <DarkScreen>
      <DarkHeader title="Toegang" backHref="/patient/settings" />

      <div className="max-w-lg w-full mx-auto px-4 py-4 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Kicker>Jouw privacy</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
          >
            WIE MAG JOUW
            <br />
            GEGEVENS ZIEN?
          </h1>
          <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: '19px', marginTop: 4 }}>
            Therapeuten die je gekoppeld hebben vragen eerst toestemming. Jij beslist wie
            je schema, pijn en voortgang mag zien.
          </p>
        </div>

        {isLoading && (
          <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>
            LADEN…
          </span>
        )}

        {!isLoading && relations.length === 0 && (
          <Tile>
            <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
              Nog geen koppelingen. Zodra een therapeut je uitnodigt verschijnt hier een verzoek.
            </p>
          </Tile>
        )}

        {grouped.pending.length > 0 && (
          <section className="flex flex-col gap-2">
            <Kicker>Nieuwe verzoeken</Kicker>
            {grouped.pending.map((r) => (
              <RelationCard
                key={r.id}
                relation={r}
                actions={
                  <div className="flex gap-2">
                    <DarkButton
                      variant="primary"
                      size="sm"
                      onClick={() => respond.mutate({ relationId: r.id, accept: true })}
                      disabled={respond.isPending}
                    >
                      Accepteer
                    </DarkButton>
                    <DarkButton
                      variant="secondary"
                      size="sm"
                      onClick={() => respond.mutate({ relationId: r.id, accept: false })}
                      disabled={respond.isPending}
                    >
                      Afwijzen
                    </DarkButton>
                  </div>
                }
              />
            ))}
          </section>
        )}

        {grouped.approved.length > 0 && (
          <section className="flex flex-col gap-2">
            <Kicker>Met toegang</Kicker>
            {grouped.approved.map((r) => (
              <RelationCard
                key={r.id}
                relation={r}
                actions={
                  <DarkButton
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Toegang van ${r.therapist.name ?? r.therapist.email} intrekken?`)) {
                        revoke.mutate({ relationId: r.id })
                      }
                    }}
                    disabled={revoke.isPending}
                  >
                    Intrekken
                  </DarkButton>
                }
              />
            ))}
          </section>
        )}

        {grouped.other.length > 0 && (
          <section className="flex flex-col gap-2">
            <Kicker>Afgewezen / ingetrokken</Kicker>
            {grouped.other.map((r) => (
              <RelationCard
                key={r.id}
                relation={r}
                actions={
                  r.status === 'DECLINED' ? (
                    <DarkButton
                      variant="secondary"
                      size="sm"
                      onClick={() => respond.mutate({ relationId: r.id, accept: true })}
                      disabled={respond.isPending}
                    >
                      Toch accepteren
                    </DarkButton>
                  ) : null
                }
              />
            ))}
          </section>
        )}
      </div>
    </DarkScreen>
  )
}

function RelationCard({
  relation,
  actions,
}: {
  relation: Relation
  actions?: React.ReactNode
}) {
  const t = relation.therapist
  const initials =
    (t.name ?? t.email)
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  const copy = STATUS_COPY[relation.status]

  return (
    <Tile>
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 athletic-mono"
          style={{ background: P.surfaceHi, color: copy.color, fontSize: 13, fontWeight: 900 }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ color: P.ink, fontSize: 14, fontWeight: 700 }} className="truncate">
              {t.name ?? t.email}
            </span>
            <span
              className="athletic-mono px-2 py-0.5 rounded-full"
              style={{
                background: P.surfaceHi,
                color: copy.color,
                fontSize: 9,
                letterSpacing: '0.14em',
                fontWeight: 900,
              }}
            >
              {copy.label}
            </span>
          </div>
          <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>{copy.desc}</p>
          {t.specialty && (
            <p className="athletic-mono" style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.04em', textTransform: 'none', fontWeight: 500, marginTop: 2 }}>
              {t.specialty}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="mt-3 flex justify-end">{actions}</div>}
    </Tile>
  )
}
