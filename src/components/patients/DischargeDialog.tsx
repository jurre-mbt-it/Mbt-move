'use client'

/**
 * Een patiënt of atleet op inactief zetten.
 *
 * Dit is iets anders dan de koppeling verbreken, en dat verschil staat met
 * zoveel woorden in de dialoog. Verbreken haalt je toegang weg en verwijdert de
 * programma's die jij maakte. Inactief zetten laat alles staan: het account,
 * het dossier, de historie. De persoon verdwijnt alleen uit je werklijst, je
 * signalen en je herinneringen, en je haalt hem er met één knop weer bij.
 *
 * De markering geldt binnen jouw praktijk of, ben je coach, bij jou. Een
 * collega uit een andere praktijk die dezelfde persoon behandelt merkt hier
 * niets van.
 *
 * Twee dingen die hier bewust NIET gebeuren:
 * - Een coach ziet het vinkje voor het revalidatietraject niet. Een traject
 *   afsluiten is een klinisch besluit, de server weigert het voor een coach met
 *   BAD_REQUEST, en tegen een fout aanlopen die je vooraf kunt voorkomen is
 *   geen goede reden om de knop te tonen.
 * - De programmalijst komt rechtstreeks uit `programs.list`. Die past dezelfde
 *   scope toe als de server bij het afsluiten, dus wat je hier kunt aanvinken is
 *   ook echt wat er dichtgaat. Een eigen filter zou vroeg of laat uit de pas
 *   lopen en dan vink je iets aan waar stil niets mee gebeurt.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogDescription as DialogDescription,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkMenuSelect,
  DarkTextarea,
  MetaLabel,
  P,
} from '@/components/dark-ui'
import {
  DISCHARGE_REASONS,
  DISCHARGE_REASON_LABEL,
  type DischargeReason,
} from '@/lib/care-status'

const REASON_OPTIONS = DISCHARGE_REASONS.map(value => ({
  value,
  label: DISCHARGE_REASON_LABEL[value],
}))

/** Vinkje in de stijl van de rest van het scherm, met de uitleg ernaast. */
function Vinkje({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label
      className="flex items-start gap-2.5 cursor-pointer"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
        style={{ accentColor: P.brand }}
      />
      <span className="min-w-0">
        <span style={{ color: P.ink, fontSize: 13.5, display: 'block' }}>{label}</span>
        {hint && (
          <span style={{ color: P.inkDim, fontSize: 11.5, display: 'block', marginTop: 1 }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  )
}

export function DischargeDialog({
  patientId,
  patientName,
  personLabel,
  /**
   * Rol van de ingelogde gebruiker. Bepaalt of het traject-vinkje er staat:
   * de server laat dat alleen toe voor THERAPIST en ADMIN.
   */
  role,
  onClose,
  onDone,
}: {
  patientId: string
  patientName: string
  personLabel: string
  role: string | undefined
  onClose: () => void
  onDone: () => void
}) {
  const magTrajectSluiten = role === 'THERAPIST' || role === 'ADMIN'

  const [reason, setReason] = useState<DischargeReason>('COMPLETED')
  const [note, setNote] = useState('')
  // Welke programma's je NIET wilt meesluiten. Standaard staat alles aan, dus
  // het is korter om de uitzonderingen te onthouden dan de regel.
  const [uitgevinkt, setUitgevinkt] = useState<Set<string>>(new Set())
  const [closeTraject, setCloseTraject] = useState(true)
  const [busy, setBusy] = useState(false)

  const utils = trpc.useUtils()

  const { data: programsRaw = [], isLoading: programsLoading } =
    trpc.programs.list.useQuery({ patientId })
  // Shallow cast: tRPC's inferentie over programs.list is te diep voor TS2589
  // zodra je er in een component doorheen loopt. Zelfde truc als op de
  // patiëntpagina.
  const programs = programsRaw as Array<{
    id: string
    name: string
    status: string
    isTemplate: boolean
  }>
  const lopend = useMemo(
    () => programs.filter(p => p.status === 'ACTIVE' && !p.isTemplate),
    [programs],
  )

  // Een coach mag dit endpoint niet aanroepen (therapistProcedure), dus vragen
  // we het ook niet.
  const { data: tracker } = trpc.rehab.getPatientTracker.useQuery(
    { patientId },
    { enabled: magTrajectSluiten },
  )
  const lopendTraject = magTrajectSluiten && tracker && !tracker.deactivatedAt ? tracker : null

  const setInactive = trpc.patients.setInactive.useMutation({
    onSuccess: () => {
      utils.patients.list.invalidate()
      utils.patients.get.invalidate({ id: patientId })
      utils.programs.list.invalidate()
      utils.rehab.getPatientTracker.invalidate({ patientId })
      toast.success(`${patientName} staat op inactief`)
      onDone()
    },
    onError: e => {
      setBusy(false)
      // De server schrijft hier zelf een bruikbare melding, ook bij
      // PRECONDITION_FAILED (staf zonder praktijk) en CONFLICT (staat al op
      // inactief). Die tonen we letterlijk; een eigen tekst zou minder zeggen.
      toast.error(e.message)
      if (e.data?.code === 'CONFLICT') {
        // Iemand anders was net sneller. Het scherm klopt niet meer, dus
        // halen we de waarheid opnieuw op in plaats van de dialoog open te
        // laten staan met een knop die het nooit meer gaat doen.
        utils.patients.list.invalidate()
        utils.patients.get.invalidate({ id: patientId })
        onClose()
      }
    },
  })

  const teSluiten = lopend.filter(p => !uitgevinkt.has(p.id))

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Op inactief zetten</DialogTitle>
          <DialogDescription>
            {patientName} verdwijnt uit je werklijst, je signalen en de dagelijkse herinneringen.
            Het account, het dossier en de hele historie blijven staan, en je haalt {patientName}
            {' '}met één knop weer terug.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="rounded-lg p-3"
            style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
          >
            <p style={{ color: P.inkMuted, fontSize: 12.5, lineHeight: 1.6 }}>
              Dit is niet hetzelfde als de koppeling verbreken. Bij verbreken raak je je toegang
              tot het dossier kwijt en verdwijnen de programma&rsquo;s die jij hebt gemaakt. Hier
              raakt niets kwijt.
            </p>
          </div>

          <div className="space-y-1.5">
            <MetaLabel>Reden</MetaLabel>
            <DarkMenuSelect
              value={reason}
              onValueChange={v => setReason(v as DischargeReason)}
              options={REASON_OPTIONS}
              ariaLabel="Reden van afsluiten"
              searchable={false}
            />
          </div>

          <div className="space-y-1.5">
            <MetaLabel>Toelichting (optioneel)</MetaLabel>
            <DarkTextarea
              value={note}
              maxLength={2000}
              onChange={e => setNote(e.target.value)}
              placeholder="Waar staat de klacht nu, en wat is er afgesproken?"
              style={{ minHeight: 76 }}
            />
            <p style={{ color: P.inkDim, fontSize: 11 }}>
              Komt in het dossier te staan en is later terug te lezen.
            </p>
          </div>

          {/* Lopende programma's. Standaard gaan ze mee dicht: een schema dat
              doorloopt terwijl de behandeling stopt, blijft de patiënt
              trainingen sturen. Wie dat expliciet wil, vinkt het uit. */}
          {!programsLoading && lopend.length > 0 && (
            <div className="space-y-2">
              <MetaLabel>Lopende programma&rsquo;s afsluiten</MetaLabel>
              <div className="space-y-2">
                {lopend.map(p => (
                  <Vinkje
                    key={p.id}
                    checked={!uitgevinkt.has(p.id)}
                    onChange={aan =>
                      setUitgevinkt(prev => {
                        const next = new Set(prev)
                        if (aan) next.delete(p.id)
                        else next.add(p.id)
                        return next
                      })
                    }
                    label={p.name}
                  />
                ))}
              </div>
              <p style={{ color: P.inkDim, fontSize: 11.5, lineHeight: 1.5 }}>
                Wat je hier afsluit komt vanzelf weer terug zodra je {personLabel} weer in
                behandeling neemt. Laat je een programma aan staan, dan blijft het gewoon doorlopen
                in de app.
              </p>
            </div>
          )}

          {!programsLoading && lopend.length === 0 && (
            <p style={{ color: P.inkDim, fontSize: 12 }}>
              Er loopt geen programma dat mee afgesloten hoeft te worden.
            </p>
          )}

          {/* Alleen voor een therapeut of admin: de server weigert dit vinkje
              voor een coach. Zie de kop van dit bestand. */}
          {lopendTraject && (
            <div className="space-y-2">
              <MetaLabel>Revalidatietraject</MetaLabel>
              <Vinkje
                checked={closeTraject}
                onChange={setCloseTraject}
                label={`${lopendTraject.protocol.name} afsluiten`}
                hint="De uitkomst blijft op onbekend staan. Wil je er een uitkomst bij, sluit het traject dan af op de revalidatie-tab."
              />
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <DarkButton variant="secondary" onClick={onClose} disabled={busy}>
            Annuleren
          </DarkButton>
          <DarkButton
            variant="primary"
            disabled={busy}
            loading={busy}
            onClick={() => {
              setBusy(true)
              setInactive.mutate({
                id: patientId,
                reason,
                note: note.trim() || undefined,
                closeProgramIds: teSluiten.map(p => p.id),
                // Nooit meesturen als de gebruiker het vinkje niet mocht zien.
                closeTraject: Boolean(lopendTraject) && closeTraject,
              })
            }}
          >
            Op inactief zetten
          </DarkButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
