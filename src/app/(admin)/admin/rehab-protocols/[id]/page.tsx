/**
 * Admin rehab-protocol detail: alle fases + criteria inzien en criteria bewerken.
 */
'use client'

import { use, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkDialog,
  DarkDialogContent,
  DarkDialogHeader,
  DarkDialogTitle,
  DarkHeader,
  DarkInput,
  DarkScreen,
  DarkSelect,
  DarkTextarea,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

type InputType = 'NUMERIC' | 'TEXT' | 'PASS_FAIL'

export default function AdminRehabProtocolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const utils = trpc.useUtils()
  const { data: protocol, isLoading } = trpc.rehab.adminGetProtocol.useQuery({ id })

  const updateProtocol = trpc.rehab.adminUpdateProtocol.useMutation({
    onSuccess: () => {
      utils.rehab.adminGetProtocol.invalidate({ id })
      utils.rehab.adminListProtocols.invalidate()
      toast.success('Protocol opgeslagen')
    },
    onError: (e) => toast.error(e.message),
  })

  const [editMeta, setEditMeta] = useState(false)
  const [metaName, setMetaName] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [metaSource, setMetaSource] = useState('')

  function openMetaEdit() {
    if (!protocol) return
    setMetaName(protocol.name)
    setMetaDescription(protocol.description ?? '')
    setMetaSource(protocol.sourceReference ?? '')
    setEditMeta(true)
  }

  if (isLoading) {
    return (
      <DarkScreen>
        <DarkHeader title="Protocol" backHref="/admin/rehab-protocols" />
        <div className="p-6">
          <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>LADEN…</span>
        </div>
      </DarkScreen>
    )
  }

  if (!protocol) {
    return (
      <DarkScreen>
        <DarkHeader title="Niet gevonden" backHref="/admin/rehab-protocols" />
      </DarkScreen>
    )
  }

  return (
    <DarkScreen>
      <DarkHeader title="Protocol" backHref="/admin/rehab-protocols" />
      <div className="max-w-4xl w-full mx-auto px-4 py-4 flex flex-col gap-5">
        {/* Metadata */}
        <Tile accentBar={protocol.isActive ? P.lime : P.inkDim}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <Kicker>{protocol.specialty}</Kicker>
              <h1
                className="athletic-display"
                style={{ fontSize: 26, lineHeight: '30px', letterSpacing: '-0.02em', paddingTop: 4 }}
              >
                {protocol.name.toUpperCase()}
              </h1>
              {protocol.description && (
                <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 6 }}>{protocol.description}</p>
              )}
              {protocol.sourceReference && (
                <p className="athletic-mono" style={{ color: P.inkDim, fontSize: 11, marginTop: 8, letterSpacing: '0.04em' }}>
                  Bron: {protocol.sourceReference}
                </p>
              )}
              <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 6, letterSpacing: '0.12em' }}>
                KEY: {protocol.key} · {protocol.isActive ? 'ACTIEF' : 'INACTIEF'}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <DarkButton size="sm" variant="secondary" onClick={openMetaEdit}>
                Bewerk
              </DarkButton>
              <DarkButton
                size="sm"
                variant={protocol.isActive ? 'ghost' : 'primary'}
                disabled={updateProtocol.isPending}
                onClick={() => updateProtocol.mutate({ id: protocol.id, isActive: !protocol.isActive })}
              >
                {protocol.isActive ? 'Zet uit' : 'Zet aan'}
              </DarkButton>
            </div>
          </div>
        </Tile>

        <DarkDialog open={editMeta} onOpenChange={setEditMeta}>
          <DarkDialogContent>
            <DarkDialogHeader>
              <DarkDialogTitle>Protocol bewerken</DarkDialogTitle>
            </DarkDialogHeader>
            <div className="flex flex-col gap-3">
              <div>
                <MetaLabel>Naam</MetaLabel>
                <DarkInput value={metaName} onChange={(e) => setMetaName(e.target.value)} />
              </div>
              <div>
                <MetaLabel>Beschrijving</MetaLabel>
                <DarkTextarea rows={3} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
              </div>
              <div>
                <MetaLabel>Bron / referentie</MetaLabel>
                <DarkInput value={metaSource} onChange={(e) => setMetaSource(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <DarkButton variant="ghost" size="sm" onClick={() => setEditMeta(false)}>
                Annuleren
              </DarkButton>
              <DarkButton
                variant="primary"
                size="sm"
                disabled={updateProtocol.isPending}
                onClick={() =>
                  updateProtocol.mutate(
                    {
                      id: protocol.id,
                      name: metaName,
                      description: metaDescription || null,
                      sourceReference: metaSource || null,
                    },
                    { onSuccess: () => setEditMeta(false) },
                  )
                }
              >
                Opslaan
              </DarkButton>
            </div>
          </DarkDialogContent>
        </DarkDialog>

        {/* Phases + criteria */}
        {protocol.phases.map((phase) => (
          <PhaseSection key={phase.id} phase={phase} protocolId={protocol.id} />
        ))}
      </div>
    </DarkScreen>
  )
}

function PhaseSection({
  phase,
  protocolId,
}: {
  phase: {
    id: string
    order: number
    shortName: string
    name: string
    description: string | null
    keyGoals: string[]
    typicalStartWeek: number | null
    typicalEndWeek: number | null
    criteria: Array<{
      id: string
      order: number
      name: string
      testDescription: string
      reference: string | null
      targetValue: string
      targetUnit: string | null
      inputType: InputType
      isBonus: boolean
    }>
  }
  protocolId: string
}) {
  return (
    <Tile>
      <div className="flex flex-col gap-3">
        <div>
          <MetaLabel>{phase.shortName}</MetaLabel>
          <h3 style={{ color: P.ink, fontSize: 16, fontWeight: 800, marginTop: 4 }}>{phase.name}</h3>
          {phase.description && (
            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{phase.description}</p>
          )}
          {(phase.typicalStartWeek != null || phase.typicalEndWeek != null) && (
            <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 4, letterSpacing: '0.06em' }}>
              TYPISCH: week {phase.typicalStartWeek ?? '?'} – {phase.typicalEndWeek ?? 'ongoing'}
            </p>
          )}
          {phase.keyGoals.length > 0 && (
            <ul className="mt-2" style={{ color: P.ink, fontSize: 12 }}>
              {phase.keyGoals.map((g, i) => (
                <li key={i} style={{ paddingLeft: 12, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: P.lime }}>•</span>
                  {g}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2" style={{ borderTop: `1px solid ${P.line}`, paddingTop: 12 }}>
          <div className="flex items-center justify-between">
            <MetaLabel>Criteria · {phase.criteria.length}</MetaLabel>
            <AddCriterionButton phaseId={phase.id} protocolId={protocolId} />
          </div>
          {phase.criteria.map((c) => (
            <CriterionRow key={c.id} criterion={c} protocolId={protocolId} />
          ))}
        </div>
      </div>
    </Tile>
  )
}

function CriterionRow({
  criterion,
  protocolId,
}: {
  criterion: {
    id: string
    name: string
    testDescription: string
    reference: string | null
    targetValue: string
    targetUnit: string | null
    inputType: InputType
    isBonus: boolean
  }
  protocolId: string
}) {
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(criterion.name)
  const [testDescription, setTestDescription] = useState(criterion.testDescription)
  const [reference, setReference] = useState(criterion.reference ?? '')
  const [targetValue, setTargetValue] = useState(criterion.targetValue)
  const [targetUnit, setTargetUnit] = useState(criterion.targetUnit ?? '')
  const [inputType, setInputType] = useState<InputType>(criterion.inputType)
  const [isBonus, setIsBonus] = useState(criterion.isBonus)

  const update = trpc.rehab.adminUpdateCriterion.useMutation({
    onSuccess: () => {
      utils.rehab.adminGetProtocol.invalidate({ id: protocolId })
      toast.success('Opgeslagen')
      setOpen(false)
    },
    onError: (e) => toast.error(e.message),
  })
  const remove = trpc.rehab.adminDeleteCriterion.useMutation({
    onSuccess: () => {
      utils.rehab.adminGetProtocol.invalidate({ id: protocolId })
      toast.success('Criterium verwijderd')
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div
      className="rounded-lg flex items-start justify-between gap-2 flex-wrap"
      style={{ background: P.surfaceHi, padding: '10px 12px', border: `1px solid ${P.line}` }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}>{criterion.name}</p>
          {criterion.isBonus && (
            <span
              className="athletic-mono"
              style={{
                background: 'rgba(244,194,97,0.2)',
                color: P.gold,
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 4,
                fontWeight: 900,
                letterSpacing: '0.12em',
              }}
            >
              BONUS
            </span>
          )}
          <span
            className="athletic-mono"
            style={{
              background: P.surface,
              color: P.inkMuted,
              fontSize: 9,
              padding: '1px 6px',
              borderRadius: 4,
              letterSpacing: '0.1em',
            }}
          >
            {criterion.inputType}
          </span>
        </div>
        <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, marginTop: 3, letterSpacing: '0.04em' }}>
          Doel: <span style={{ color: P.ink }}>{criterion.targetValue}</span>
          {criterion.targetUnit && <> {criterion.targetUnit}</>}
          {criterion.reference && <> · {criterion.reference}</>}
        </p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <DarkButton size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Bewerk
        </DarkButton>
        <DarkButton
          size="sm"
          variant="danger"
          disabled={remove.isPending}
          onClick={() => {
            if (confirm(`Criterium "${criterion.name}" verwijderen?`)) {
              remove.mutate({ id: criterion.id })
            }
          }}
        >
          ×
        </DarkButton>
      </div>

      <DarkDialog open={open} onOpenChange={setOpen}>
        <DarkDialogContent>
          <DarkDialogHeader>
            <DarkDialogTitle>Criterium bewerken</DarkDialogTitle>
          </DarkDialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <MetaLabel>Naam</MetaLabel>
              <DarkInput value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <MetaLabel>Test beschrijving</MetaLabel>
              <DarkTextarea rows={3} value={testDescription} onChange={(e) => setTestDescription(e.target.value)} />
            </div>
            <div>
              <MetaLabel>Referentie</MetaLabel>
              <DarkInput value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <MetaLabel>Doel-waarde</MetaLabel>
                <DarkInput value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
              </div>
              <div>
                <MetaLabel>Eenheid</MetaLabel>
                <DarkInput value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <MetaLabel>Input type</MetaLabel>
                <DarkSelect value={inputType} onChange={(e) => setInputType(e.target.value as InputType)}>
                  <option value="NUMERIC">NUMERIC</option>
                  <option value="TEXT">TEXT</option>
                  <option value="PASS_FAIL">PASS_FAIL</option>
                </DarkSelect>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2" style={{ color: P.ink, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={isBonus}
                    onChange={(e) => setIsBonus(e.target.checked)}
                  />
                  Bonus (aanvullend doel)
                </label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <DarkButton variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuleren
            </DarkButton>
            <DarkButton
              variant="primary"
              size="sm"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  id: criterion.id,
                  name,
                  testDescription,
                  reference: reference || null,
                  targetValue,
                  targetUnit: targetUnit || null,
                  inputType,
                  isBonus,
                })
              }
            >
              Opslaan
            </DarkButton>
          </div>
        </DarkDialogContent>
      </DarkDialog>
    </div>
  )
}

function AddCriterionButton({ phaseId, protocolId }: { phaseId: string; protocolId: string }) {
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [testDescription, setTestDescription] = useState('')
  const [reference, setReference] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [targetUnit, setTargetUnit] = useState('')
  const [inputType, setInputType] = useState<InputType>('NUMERIC')
  const [isBonus, setIsBonus] = useState(false)

  const create = trpc.rehab.adminCreateCriterion.useMutation({
    onSuccess: () => {
      utils.rehab.adminGetProtocol.invalidate({ id: protocolId })
      toast.success('Criterium toegevoegd')
      setOpen(false)
      setName('')
      setTestDescription('')
      setReference('')
      setTargetValue('')
      setTargetUnit('')
      setIsBonus(false)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <DarkDialog open={open} onOpenChange={setOpen}>
      <DarkButton size="sm" variant="primary" onClick={() => setOpen(true)}>
        + Criterium
      </DarkButton>
      <DarkDialogContent>
        <DarkDialogHeader>
          <DarkDialogTitle>Criterium toevoegen</DarkDialogTitle>
        </DarkDialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <MetaLabel>Naam</MetaLabel>
            <DarkInput placeholder="bv. Single Leg Hop Test" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <MetaLabel>Test beschrijving</MetaLabel>
            <DarkTextarea rows={3} value={testDescription} onChange={(e) => setTestDescription(e.target.value)} />
          </div>
          <div>
            <MetaLabel>Referentie (optioneel)</MetaLabel>
            <DarkInput placeholder="bv. Noyes et al. (1991)" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <MetaLabel>Doel-waarde</MetaLabel>
              <DarkInput placeholder="bv. ≥90%" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
            </div>
            <div>
              <MetaLabel>Eenheid</MetaLabel>
              <DarkInput placeholder="bv. %, °, reps" value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <MetaLabel>Input type</MetaLabel>
              <DarkSelect value={inputType} onChange={(e) => setInputType(e.target.value as InputType)}>
                <option value="NUMERIC">NUMERIC</option>
                <option value="TEXT">TEXT</option>
                <option value="PASS_FAIL">PASS_FAIL</option>
              </DarkSelect>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2" style={{ color: P.ink, fontSize: 13 }}>
                <input type="checkbox" checked={isBonus} onChange={(e) => setIsBonus(e.target.checked)} />
                Bonus
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <DarkButton variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Annuleren
          </DarkButton>
          <DarkButton
            variant="primary"
            size="sm"
            disabled={create.isPending || name.length < 2 || testDescription.length < 2 || targetValue.length < 1}
            onClick={() =>
              create.mutate({
                phaseId,
                name,
                testDescription,
                reference: reference || undefined,
                targetValue,
                targetUnit: targetUnit || undefined,
                inputType,
                isBonus,
              })
            }
          >
            Toevoegen
          </DarkButton>
        </div>
      </DarkDialogContent>
    </DarkDialog>
  )
}
