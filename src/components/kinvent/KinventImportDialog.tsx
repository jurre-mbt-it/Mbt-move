'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import {
  DarkButton,
  DarkDialog,
  DarkDialogContent,
  DarkDialogDescription,
  DarkDialogFooter,
  DarkDialogHeader,
  DarkDialogTitle,
  MetaLabel,
  P,
} from '@/components/dark-ui'
import { KinventSignIn } from './KinventSignIn'
import { kinventLabel, kinventSource } from '@/lib/kinvent/labels'
import type { ImportCandidate } from '@/lib/kinvent/candidates'

type Kandidaat = Omit<ImportCandidate, 'performedAt' | 'jump'> & { performedAt: string | Date }

const sleutel = (c: { protocolCode: string; activityCode: string }) => `${c.protocolCode}/${c.activityCode}`
const fmtDatum = (d: string | Date) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * "Haal op uit Kinvent" vanuit een testrapport. Haalt het voorstel op, laat
 * de therapeut aanvinken wat mee mag, en schrijft pas dan. Krachttests worden
 * regels in dit rapport; sprongen gaan naar de sprongenlijst op de
 * patiëntpagina. Een meting die al in het rapport staat is te zien maar
 * standaard uitgevinkt, net als een meting waarvan de eenheid twijfelachtig is.
 */
export function KinventImportDialog({
  reportId,
  patientId,
  open,
  onClose,
  onImported,
}: {
  reportId: string
  patientId: string
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const portal = usePortal()
  const { data: status } = trpc.kinvent.connectionStatus.useQuery(undefined, { enabled: open })
  const { data: link } = trpc.kinvent.linkStatus.useQuery({ patientId }, { enabled: open })
  const pull = trpc.kinvent.pullForPatient.useMutation({ onError: (e) => toast.error(e.message) })
  const commit = trpc.kinvent.commitImport.useMutation({
    onSuccess: (r) => {
      const delen = [
        r.entries > 0 ? `${r.entries} test${r.entries === 1 ? '' : 's'} in het rapport` : null,
        r.jumps > 0 ? `${r.jumps} sprongmeting${r.jumps === 1 ? '' : 'en'}` : null,
        r.skipped > 0 ? `${r.skipped} stond er al` : null,
      ].filter(Boolean)
      toast.success(delen.length ? `Geïmporteerd: ${delen.join(', ')}` : 'Niets geïmporteerd')
      onImported()
      sluit()
    },
    onError: (e) => toast.error(e.message),
  })
  const [keuze, setKeuze] = useState<Set<string> | null>(null)

  const kanOphalen = !!status?.connected && !!link?.linked
  const candidates = useMemo(() => (pull.data?.candidates ?? []) as Kandidaat[], [pull.data])

  // Eén keer ophalen zodra de dialoog open is en beide voorwaarden kloppen.
  const { mutate: haalOp, data: opgehaald, isPending: bezig } = pull
  useEffect(() => {
    if (open && kanOphalen && !opgehaald && !bezig) haalOp({ patientId })
  }, [open, kanOphalen, opgehaald, bezig, haalOp, patientId])

  // Sluiten gooit de keuze én het opgehaalde voorstel weg, zodat de volgende
  // keer vers bij Kinvent wordt gekeken.
  const sluit = () => {
    setKeuze(null)
    pull.reset()
    onClose()
  }

  const standaard = useMemo(
    () => new Set(candidates.filter((c) => !c.alreadyImported && c.unit.status !== 'suspect').map(sleutel)),
    [candidates],
  )
  const gekozen = keuze ?? standaard
  const toggle = (k: string) => {
    const next = new Set(gekozen)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setKeuze(next)
  }

  const kracht = candidates.filter((c) => c.kind === 'STRENGTH')
  const sprongen = candidates.filter((c) => c.kind === 'JUMP')
  const verwijderd = pull.data?.removedProtocolCodes ?? []

  return (
    <DarkDialog open={open} onOpenChange={(o) => !o && sluit()}>
      <DarkDialogContent className="max-w-2xl">
        <DarkDialogHeader>
          <DarkDialogTitle>Ophalen uit Kinvent</DarkDialogTitle>
          <DarkDialogDescription>
            Vink aan wat in dit rapport mag. Krachttests komen als regels in het rapport; sprongen komen op de
            patiëntpagina. Handmatig ingevulde regels blijven altijd staan.
          </DarkDialogDescription>
        </DarkDialogHeader>

        {!status?.connected ? (
          <KinventSignIn compact />
        ) : !link?.linked ? (
          <p style={{ color: P.inkMuted, fontSize: 13 }}>
            Deze patiënt is nog niet gekoppeld aan een Kinvent-profiel.{' '}
            <Link href={`${portal.patients}/${patientId}?tab=tests`} style={{ color: P.brand, textDecoration: 'underline' }}>
              Koppel hem op de patiëntpagina
            </Link>{' '}
            en kom dan hier terug.
          </p>
        ) : pull.isPending ? (
          <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>
            OPHALEN BIJ KINVENT…
          </p>
        ) : pull.error ? (
          <div className="space-y-2">
            <p style={{ color: P.danger, fontSize: 13 }}>{pull.error.message}</p>
            <DarkButton variant="ghost" size="sm" onClick={() => pull.mutate({ patientId })}>Opnieuw proberen</DarkButton>
          </div>
        ) : candidates.length === 0 ? (
          <p style={{ color: P.inkMuted, fontSize: 13 }}>Kinvent heeft geen metingen voor deze patiënt.</p>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {verwijderd.length > 0 && (
              <p style={{ color: P.gold, fontSize: 12 }}>
                {verwijderd.length} eerder geïmporteerde meting{verwijderd.length === 1 ? ' is' : 'en zijn'} in Kinvent verwijderd. De
                regels in BASE blijven staan.
              </p>
            )}
            {kracht.length > 0 && (
              <section>
                <MetaLabel>Krachttests · {kracht.length}</MetaLabel>
                <div className="mt-2 space-y-1">
                  {kracht.map((c) => (
                    <Rij key={sleutel(c)} c={c} aan={gekozen.has(sleutel(c))} onToggle={() => toggle(sleutel(c))}>
                      <span className="athletic-mono whitespace-nowrap">
                        {c.left !== null && c.right !== null
                          ? `${c.left.toFixed(1)} / ${c.right.toFixed(1)} kg · LSI ${c.lsi !== null ? Math.round(c.lsi) : '–'}%`
                          : `${(c.single ?? c.left ?? c.right ?? 0).toFixed(1)} kg`}
                      </span>
                    </Rij>
                  ))}
                </div>
              </section>
            )}
            {sprongen.length > 0 && (
              <section>
                <MetaLabel>Sprongen · {sprongen.length}</MetaLabel>
                <div className="mt-2 space-y-1">
                  {sprongen.map((c) => (
                    <Rij key={sleutel(c)} c={c} aan={gekozen.has(sleutel(c))} onToggle={() => toggle(sleutel(c))}>
                      <span className="athletic-mono whitespace-nowrap">
                        {c.jumpHeightCm !== null ? `${c.jumpHeightCm.toFixed(1)} cm` : '–'}
                        {c.rsi !== null ? ` · RSI ${c.rsi.toFixed(2)}` : ''}
                      </span>
                    </Rij>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {kanOphalen && candidates.length > 0 && (
          <DarkDialogFooter>
            <DarkButton variant="ghost" size="sm" onClick={sluit}>Annuleren</DarkButton>
            <DarkButton
              size="sm"
              disabled={gekozen.size === 0}
              loading={commit.isPending}
              onClick={() =>
                commit.mutate({
                  patientId,
                  reportId,
                  items: candidates.filter((c) => gekozen.has(sleutel(c))).map((c) => ({ protocolCode: c.protocolCode, activityCode: c.activityCode })),
                })
              }
            >
              Importeer {gekozen.size}
            </DarkButton>
          </DarkDialogFooter>
        )}
      </DarkDialogContent>
    </DarkDialog>
  )
}

function Rij({ c, aan, onToggle, children }: { c: Kandidaat; aan: boolean; onToggle: () => void; children: React.ReactNode }) {
  const twijfel = c.unit.status === 'suspect'
  const reden = c.unit.status === 'ok' ? null : c.unit.reason
  return (
    <label
      className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer"
      style={{ background: P.surfaceHi, border: `1px solid ${twijfel ? P.gold : P.line}`, opacity: c.alreadyImported && !aan ? 0.6 : 1 }}
    >
      <input type="checkbox" checked={aan} onChange={onToggle} className="accent-[color:var(--p-brand)]" />
      <div className="min-w-0 flex-1">
        <p style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>
          {kinventLabel(c.title)}
          {c.alreadyImported && (
            <span className="athletic-mono ml-2" style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.1em' }}>AL GEÏMPORTEERD</span>
          )}
        </p>
        <p style={{ color: P.inkMuted, fontSize: 11 }}>
          {fmtDatum(c.performedAt)} · {kinventSource(c.deviceType, c.exerciseType)}
        </p>
        {twijfel && reden && <p style={{ color: P.gold, fontSize: 11, marginTop: 2 }}>{reden}</p>}
      </div>
      <div style={{ color: P.ink, fontSize: 12 }}>{children}</div>
    </label>
  )
}
