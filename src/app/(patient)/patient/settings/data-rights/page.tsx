'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkHeader,
  DarkInput,
  DarkScreen,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

export default function DataRightsPage() {
  const router = useRouter()
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteReason, setDeleteReason] = useState('')

  const exportMutation = trpc.gdpr.exportMyData.useMutation()
  const requestDeleteMutation = trpc.gdpr.requestDeletion.useMutation()
  const cancelDeleteMutation = trpc.gdpr.cancelDeletion.useMutation()
  const { data: status, refetch: refetchStatus } =
    trpc.gdpr.deletionStatus.useQuery()

  async function handleExport() {
    setExporting(true)
    try {
      const payload = await exportMutation.mutateAsync()
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mbt-gym-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Download gestart — check je Downloads-map.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export mislukt.')
    } finally {
      setExporting(false)
    }
  }

  async function handleDeleteConfirm() {
    if (deleteConfirm !== 'VERWIJDER') {
      toast.error('Typ VERWIJDER in hoofdletters om te bevestigen.')
      return
    }
    try {
      const res = await requestDeleteMutation.mutateAsync({
        confirm: 'VERWIJDER',
        reason: deleteReason.trim() || undefined,
      })
      await refetchStatus()
      setDeleteOpen(false)
      setDeleteConfirm('')
      setDeleteReason('')
      toast.success(
        `Verwijder-verzoek vastgelegd. Je account wordt gewist op ${new Date(res.deletionScheduledAt).toLocaleDateString('nl-NL')}.`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kon verzoek niet vastleggen.')
    }
  }

  async function handleCancelDelete() {
    try {
      await cancelDeleteMutation.mutateAsync()
      await refetchStatus()
      toast.success('Verwijder-verzoek is geannuleerd.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kon niet annuleren.')
    }
  }

  const hasActiveDeletion = !!status?.requestedAt && !deleteOpen

  return (
    <DarkScreen>
      <DarkHeader title="Mijn data" backHref="/patient/settings" />

      <div className="max-w-lg w-full mx-auto px-4 py-4 flex flex-col gap-4 pb-24">
        {/* Hero */}
        <div>
          <Kicker>AVG · JOUW RECHTEN</Kicker>
          <h1
            className="athletic-display"
            style={{
              color: P.ink,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              fontSize: 'clamp(36px, 10vw, 56px)',
              lineHeight: 1.02,
              paddingTop: 4,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            MIJN DATA
          </h1>
          <p
            style={{
              color: P.inkMuted,
              fontSize: 13,
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            Onder de AVG mag je je persoonsgegevens opvragen (art. 15 &amp; 20) en laten
            verwijderen (art. 17). Hier regel je dat zelf.
          </p>
        </div>

        {/* Export tile */}
        <Tile accentBar={P.ice}>
          <Kicker>DOWNLOAD</Kicker>
          <h2
            style={{
              color: P.ink,
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: '-0.01em',
              marginTop: 8,
            }}
          >
            Al mijn data downloaden
          </h2>
          <p
            style={{
              color: P.inkMuted,
              fontSize: 13,
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Krijg één JSON-bestand met je profiel, programma&apos;s, sessie-logs, wellness-checks,
            pijnregistraties, berichten en audit-logs. Je kunt dit bewaren of met iemand anders delen.
          </p>
          <DarkButton
            variant="secondary"
            onClick={handleExport}
            disabled={exporting}
            loading={exporting}
            className="mt-4"
          >
            {exporting ? 'Bezig met exporteren…' : 'Download mijn data (JSON)'}
          </DarkButton>
        </Tile>

        {/* Deletion tile */}
        <Tile
          accentBar={hasActiveDeletion ? P.gold : P.danger}
          style={{ borderColor: hasActiveDeletion ? P.gold : undefined }}
        >
          <Kicker style={{ color: hasActiveDeletion ? P.gold : P.danger }}>
            {hasActiveDeletion ? 'VERZOEK LOPEND' : 'VERGEETVERZOEK'}
          </Kicker>
          <h2
            style={{
              color: P.ink,
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: '-0.01em',
              marginTop: 8,
            }}
          >
            Account verwijderen
          </h2>

          {hasActiveDeletion && status?.scheduledAt ? (
            <>
              <p
                style={{
                  color: P.inkMuted,
                  fontSize: 13,
                  marginTop: 6,
                  lineHeight: 1.5,
                }}
              >
                Je hebt op{' '}
                <strong style={{ color: P.ink }}>
                  {new Date(status.requestedAt!).toLocaleDateString('nl-NL')}
                </strong>{' '}
                gevraagd om je account te verwijderen. Je data wordt definitief gewist op{' '}
                <strong style={{ color: P.gold }}>
                  {new Date(status.scheduledAt).toLocaleDateString('nl-NL')}
                </strong>
                . Tot dan kun je nog annuleren.
              </p>
              <DarkButton
                variant="secondary"
                onClick={handleCancelDelete}
                disabled={cancelDeleteMutation.isPending}
                className="mt-4"
              >
                {cancelDeleteMutation.isPending ? 'Annuleren…' : 'Annuleer verwijder-verzoek'}
              </DarkButton>
            </>
          ) : !deleteOpen ? (
            <>
              <p
                style={{
                  color: P.inkMuted,
                  fontSize: 13,
                  marginTop: 6,
                  lineHeight: 1.5,
                }}
              >
                Je kunt je account laten verwijderen. We starten een wachttijd van{' '}
                {status?.gracePeriodDays ?? 30} dagen voordat alles definitief weg is — zodat je
                tijd hebt om te heroverwegen. Daarna zijn je gegevens niet meer te herstellen.
              </p>
              <DarkButton
                variant="danger"
                onClick={() => setDeleteOpen(true)}
                className="mt-4"
              >
                Account verwijderen
              </DarkButton>
            </>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <MetaLabel>REDEN (OPTIONEEL)</MetaLabel>
                <DarkInput
                  placeholder="Waarom wil je weg? (max 500 tekens)"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value.slice(0, 500))}
                />
              </div>
              <div className="space-y-1.5">
                <MetaLabel>TYP &ldquo;VERWIJDER&rdquo; OM TE BEVESTIGEN</MetaLabel>
                <DarkInput
                  placeholder="VERWIJDER"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())}
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <DarkButton
                  variant="ghost"
                  onClick={() => {
                    setDeleteOpen(false)
                    setDeleteConfirm('')
                    setDeleteReason('')
                  }}
                  className="flex-1"
                >
                  Annuleer
                </DarkButton>
                <DarkButton
                  variant="danger"
                  onClick={handleDeleteConfirm}
                  disabled={
                    deleteConfirm !== 'VERWIJDER' || requestDeleteMutation.isPending
                  }
                  loading={requestDeleteMutation.isPending}
                  className="flex-1"
                >
                  Bevestig verwijdering
                </DarkButton>
              </div>
            </div>
          )}
        </Tile>

        <p
          style={{
            color: P.inkDim,
            fontSize: 11,
            textAlign: 'center',
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          Vragen of hulp nodig? Mail{' '}
          <a
            href="mailto:jurre@movementbasedtherapy.nl"
            style={{ color: P.lime, textDecoration: 'none' }}
          >
            jurre@movementbasedtherapy.nl
          </a>
        </p>
      </div>
    </DarkScreen>
  )
}
