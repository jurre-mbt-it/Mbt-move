'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkDialog,
  DarkDialogContent,
  DarkDialogDescription,
  DarkDialogHeader,
  DarkDialogTitle,
  DarkInput,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import { KinventSignIn } from './KinventSignIn'
import { usePortal } from '@/lib/portal'
import { asymmetryPct, besteSprong, formatAsymmetry, isEenbenig, metingLabel } from '@/lib/kinvent/measurements'

const fmtDatum = (d: Date | string) =>
  new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Kinvent op de patiëntpagina (tab Tests): koppelen aan het Kinvent-profiel,
 * de aanmelding van de praktijk, en de geïmporteerde sprongen. Krachttests
 * staan niet hier maar in het testrapport waar ze in geïmporteerd zijn.
 */
export function KinventPatientCard({ patientId }: { patientId: string }) {
  const utils = trpc.useUtils()
  const { data: link } = trpc.kinvent.linkStatus.useQuery({ patientId })
  const portal = usePortal()
  const { data: metingen } = trpc.kinvent.measurementsForPatient.useQuery({ patientId }, { enabled: !!link?.linked })
  const laatste = [
    ...(metingen?.jumps ?? []).map((m) => ({ id: m.id, t: new Date(m.performedAt).getTime(), soort: 'sprong' as const, jump: m })),
    ...(metingen?.strength ?? []).map((k) => ({ id: k.id, t: new Date(k.performedAt).getTime(), soort: 'kracht' as const, kracht: k })),
  ]
    .sort((a, b) => b.t - a.t)
    .slice(0, 5)
  const totaal = (metingen?.jumps.length ?? 0) + (metingen?.strength.length ?? 0)
  const [open, setOpen] = useState(false)
  const [ontkoppelVraag, setOntkoppelVraag] = useState(false)

  const unlink = trpc.kinvent.unlink.useMutation({
    onSuccess: () => {
      toast.success('Ontkoppeld van Kinvent')
      setOntkoppelVraag(false)
      void utils.kinvent.linkStatus.invalidate({ patientId })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Tile>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <MetaLabel>Kinvent</MetaLabel>
          {link?.linked ? (
            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4 }}>
              Gekoppeld aan het Kinvent-profiel{link.linkedAt ? ` sinds ${fmtDatum(link.linkedAt)}` : ''}
              {link.lastSyncAt ? ` · laatst opgehaald ${fmtDatum(link.lastSyncAt)}` : ''}
            </p>
          ) : (
            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4 }}>
              Niet gekoppeld. Koppel deze patiënt aan zijn profiel in Kinvent om metingen op te halen.
            </p>
          )}
          {link?.linked && link.pendingCount > 0 && (
            <p style={{ color: P.gold, fontSize: 12, marginTop: 4 }}>
              {link.pendingCount} {link.pendingCount === 1 ? 'meting' : 'metingen'} bij Kinvent nog niet in BASE
              {link.lastCheckedAt ? ` (gecontroleerd ${fmtDatum(link.lastCheckedAt)})` : ''}. Haal ze op vanuit een testrapport.
            </p>
          )}
          {link?.lastError && <p style={{ color: P.gold, fontSize: 12, marginTop: 4 }}>{link.lastError}</p>}
        </div>
        <div className="flex gap-2">
          {link?.linked ? (
            ontkoppelVraag ? (
              <>
                <DarkButton variant="danger" size="sm" onClick={() => unlink.mutate({ patientId })} loading={unlink.isPending}>
                  Ja, ontkoppelen
                </DarkButton>
                <DarkButton variant="ghost" size="sm" onClick={() => setOntkoppelVraag(false)}>Nee</DarkButton>
              </>
            ) : (
              <DarkButton variant="ghost" size="sm" onClick={() => setOntkoppelVraag(true)}>Ontkoppelen</DarkButton>
            )
          ) : (
            <DarkButton size="sm" onClick={() => setOpen(true)}>Koppelen aan Kinvent</DarkButton>
          )}
        </div>
      </div>

      {/* De aanmelding van de praktijk: status, opnieuw aanmelden en afmelden.
          Altijd zichtbaar, ook als alles goed staat, zodat afmelden vindbaar is. */}
      <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${P.line}` }}>
        <KinventSignIn />
      </div>

      {link?.linked && (
        <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${P.line}` }}>
          <div className="flex items-center justify-between gap-3">
            <MetaLabel>Metingen · {totaal}</MetaLabel>
            {totaal > 0 && (
              <DarkButton variant="ghost" size="sm" href={`${portal.patients}/${patientId}/kinvent`}>
                Alle metingen en grafiek
              </DarkButton>
            )}
          </div>
          {totaal === 0 ? (
            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4 }}>
              Nog geen metingen geïmporteerd. Haal ze op vanuit een testrapport.
            </p>
          ) : (
            <div className="mt-2 space-y-1">
              {laatste.map((item) => {
                if (item.soort === 'sprong') {
                  const m = item.jump
                  const beste = besteSprong(m.reps)
                  const eenbenig = isEenbenig(m)
                  const verschil = eenbenig ? null : asymmetryPct(beste?.peakForceLeftN ?? null, beste?.peakForceRightN ?? null)
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-3" style={{ fontSize: 12 }}>
                      <span style={{ color: P.inkMuted }}>
                        {fmtDatum(m.performedAt)} · {metingLabel({ soort: 'sprong', jumpType: m.jumpType ?? '?', eenbenig })}
                        {beste?.side === 'LEFT' ? ' · links' : beste?.side === 'RIGHT' ? ' · rechts' : ''}
                      </span>
                      <span className="athletic-mono whitespace-nowrap" style={{ color: P.ink }}>
                        {(m.peakJumpHeightCm ?? beste?.jumpHeightCm)?.toFixed(1) ?? '–'} cm
                        {verschil !== null ? ` · ${formatAsymmetry(verschil)}` : ''}
                      </span>
                    </div>
                  )
                }
                const k = item.kracht
                const bilateraal = k.leftMaxKg != null && k.rightMaxKg != null
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3" style={{ fontSize: 12 }}>
                    <span style={{ color: P.inkMuted }}>
                      {fmtDatum(k.performedAt)} · {metingLabel({ soort: 'kracht', title: k.title ?? '' })}
                    </span>
                    <span className="athletic-mono whitespace-nowrap" style={{ color: P.ink }}>
                      {bilateraal ? `${k.leftMaxKg!.toFixed(1)} / ${k.rightMaxKg!.toFixed(1)} kg · ${formatAsymmetry(asymmetryPct(k.leftMaxKg, k.rightMaxKg))}` : `${(k.singleMaxKg ?? k.leftMaxKg ?? k.rightMaxKg)?.toFixed(1) ?? '–'} kg`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <KinventLinkDialog patientId={patientId} open={open} onClose={() => setOpen(false)} />
    </Tile>
  )
}

/** Zoeken op naam in Kinvent en de juiste persoon aanwijzen. */
function KinventLinkDialog({ patientId, open, onClose }: { patientId: string; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils()
  const { data: status } = trpc.kinvent.connectionStatus.useQuery(undefined, { enabled: open })
  const [query, setQuery] = useState('')
  const [zoek, setZoek] = useState('')
  const { data: hits = [], isFetching, error } = trpc.kinvent.searchParticipants.useQuery(
    { query: zoek },
    { enabled: open && zoek.trim().length >= 2, retry: false },
  )
  const link = trpc.kinvent.link.useMutation({
    onSuccess: () => {
      toast.success('Gekoppeld aan Kinvent')
      void utils.kinvent.linkStatus.invalidate({ patientId })
      setQuery('')
      setZoek('')
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <DarkDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DarkDialogContent className="max-w-md">
        <DarkDialogHeader>
          <DarkDialogTitle>Koppelen aan Kinvent</DarkDialogTitle>
          <DarkDialogDescription>
            Zoek de naam zoals die in Kinvent staat. Alleen de koppeling wordt bewaard; naam, geboortedatum en foto
            blijven bij Kinvent.
          </DarkDialogDescription>
        </DarkDialogHeader>

        {!status?.connected ? (
          <KinventSignIn compact />
        ) : (
          <div className="space-y-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                setZoek(query.trim())
              }}
            >
              <DarkInput placeholder="Naam in Kinvent" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
              <DarkButton type="submit" size="sm" disabled={query.trim().length < 2} loading={isFetching}>
                Zoek
              </DarkButton>
            </form>
            {error && <p style={{ color: P.danger, fontSize: 12 }}>{error.message}</p>}
            {zoek && !isFetching && hits.length === 0 && !error && (
              <p style={{ color: P.inkMuted, fontSize: 12 }}>Niets gevonden in Kinvent op &lsquo;{zoek}&rsquo;.</p>
            )}
            <div className="space-y-1">
              {hits.map((h) => (
                <div
                  key={h.code}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                  style={{ background: P.surfaceHi, border: `1px solid ${P.line}` }}
                >
                  <div className="min-w-0">
                    <p style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>{h.name || 'Zonder naam'}</p>
                    <p style={{ color: P.inkMuted, fontSize: 11 }}>
                      {h.birthYear ? `Geboren ${h.birthYear}` : 'Geboortejaar onbekend'}
                      {!h.consentRecorded ? ' · geen consent vastgelegd in Kinvent' : ''}
                    </p>
                  </div>
                  <DarkButton size="sm" onClick={() => link.mutate({ patientId, participantCode: h.code })} loading={link.isPending}>
                    Koppel
                  </DarkButton>
                </div>
              ))}
            </div>
          </div>
        )}
      </DarkDialogContent>
    </DarkDialog>
  )
}
