/**
 * Testrapport — editor.
 * Behandelaar stelt het rapport samen: kopgegevens, tests (los/catalogus/
 * batterij) met links/rechts-waarden + overschrijfbare as/zones, AI-concept
 * voor interpretatie + vervolgadvies, en opent de PDF.
 */
'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { IconSparkle } from '@/components/icons'
import {
  DarkButton,
  DarkInput,
  DarkSelect,
  DarkTextarea,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import {
  computePlottedValue,
  computeZone,
  formatPlotted,
  ZONE_LABEL,
  ZONE_COLOR,
  type TestSpec,
  type TestZone,
} from '@/lib/test-report/compute'
import type { TestReportEntry } from '@prisma/client'

type RouterEntry = TestReportEntry

const numOrNull = (s: string): number | null => {
  if (s.trim() === '') return null
  const n = Number(s.replace(',', '.'))
  return Number.isNaN(n) ? null : n
}
const str = (n: number | null | undefined) => (n == null ? '' : String(n))

export default function TestReportEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const utils = trpc.useUtils()

  const { data: report, isLoading } = trpc.testReports.get.useQuery({ id })
  const { data: catalog = [] } = trpc.testReports.catalog.useQuery()
  const { data: batteries = [] } = trpc.testReports.batteries.useQuery()

  const refetch = () => utils.testReports.get.invalidate({ id })

  // ── Meta + slottekst state ────────────────────────────────────────────
  const [meta, setMeta] = useState({
    performedAt: '',
    measurementNumber: '',
    subtitle: '',
    trajectLabel: '',
    location: '',
    injuryGoal: '',
    rehabPhaseLabel: '',
    interpretation: '',
    nextTestMoment: '',
    nextTestGoal: '',
  })
  const [advice, setAdvice] = useState<Array<{ title: string; body: string }>>([])
  const [loadedId, setLoadedId] = useState<string | null>(null)

  useEffect(() => {
    if (!report || loadedId === report.id) return
    setMeta({
      performedAt: new Date(report.performedAt).toISOString().slice(0, 10),
      measurementNumber: str(report.measurementNumber),
      subtitle: report.subtitle ?? '',
      trajectLabel: report.trajectLabel ?? '',
      location: report.location ?? '',
      injuryGoal: report.injuryGoal ?? '',
      rehabPhaseLabel: report.rehabPhaseLabel ?? '',
      interpretation: report.interpretation ?? '',
      nextTestMoment: report.nextTestMoment ?? '',
      nextTestGoal: report.nextTestGoal ?? '',
    })
    setAdvice(report.advice.map((a) => ({ title: a.title, body: a.body })))
    setLoadedId(report.id)
  }, [report, loadedId])

  // ── Mutations ──────────────────────────────────────────────────────────
  const updateMeta = trpc.testReports.updateMeta.useMutation({
    onSuccess: () => toast.success('Opgeslagen'),
    onError: (e) => toast.error(e.message),
  })
  const setAdviceM = trpc.testReports.setAdvice.useMutation()
  const addEntry = trpc.testReports.addEntry.useMutation({ onSuccess: refetch, onError: (e) => toast.error(e.message) })
  const addBattery = trpc.testReports.addBattery.useMutation({
    onSuccess: (r) => { toast.success(`${r.added} tests toegevoegd`); refetch() },
    onError: (e) => toast.error(e.message),
  })
  const aiDraft = trpc.testReports.aiDraft.useMutation({
    onSuccess: (d) => {
      setMeta((m) => ({
        ...m,
        interpretation: d.interpretation,
        nextTestMoment: d.nextTestMoment,
        nextTestGoal: d.nextTestGoal,
      }))
      setAdvice(d.advice)
      toast.success('AI-concept ingevuld — controleer en sla op')
    },
    onError: (e) => toast.error(e.message),
  })
  const saveAsBattery = trpc.testReports.saveAsBattery.useMutation({
    onSuccess: () => { toast.success('Batterij opgeslagen'); utils.testReports.batteries.invalidate() },
    onError: (e) => toast.error(e.message),
  })
  const del = trpc.testReports.delete.useMutation({
    onSuccess: () => { toast.success('Rapport verwijderd'); router.push('/therapist/test-reports') },
    onError: (e) => toast.error(e.message),
  })

  const [pickCatalog, setPickCatalog] = useState('')
  const [pickBattery, setPickBattery] = useState('')

  const saveMeta = (status?: 'DRAFT' | 'FINAL') => {
    updateMeta.mutate({
      id,
      performedAt: meta.performedAt || undefined,
      measurementNumber: meta.measurementNumber ? Number(meta.measurementNumber) : null,
      subtitle: meta.subtitle || null,
      trajectLabel: meta.trajectLabel || null,
      location: meta.location || null,
      injuryGoal: meta.injuryGoal || null,
      rehabPhaseLabel: meta.rehabPhaseLabel || null,
      interpretation: meta.interpretation || null,
      nextTestMoment: meta.nextTestMoment || null,
      nextTestGoal: meta.nextTestGoal || null,
      ...(status ? { status } : {}),
    })
    setAdviceM.mutate({ reportId: id, advice: advice.filter((a) => a.title.trim() || a.body.trim()) })
  }

  if (isLoading || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg }}>
        <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>
          LADEN…
        </span>
      </div>
    )
  }

  const patientName = report.patient.name ?? report.patient.email

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-32 space-y-5">
        {/* Kop */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Kicker>Testrapport · {patientName}</Kicker>
            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4 }}>
              {report.entries.length} tests · {report.status === 'FINAL' ? 'definitief' : 'concept'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <DarkButton variant="ghost" size="sm" onClick={() => window.open(`/print/test-report/${id}`, '_blank', 'noopener')}>
              Open PDF
            </DarkButton>
            <DarkButton variant="primary" size="sm" onClick={() => saveMeta()}>
              Opslaan
            </DarkButton>
          </div>
        </div>

        {/* Kopgegevens */}
        <Tile>
          <MetaLabel>Kopgegevens</MetaLabel>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Labeled label="Testdatum">
              <DarkInput type="date" value={meta.performedAt} onChange={(e) => setMeta({ ...meta, performedAt: e.target.value })} />
            </Labeled>
            <Labeled label="Meting nr.">
              <DarkInput type="number" value={meta.measurementNumber} onChange={(e) => setMeta({ ...meta, measurementNumber: e.target.value })} />
            </Labeled>
            <Labeled label="Subtitel" full>
              <DarkInput value={meta.subtitle} onChange={(e) => setMeta({ ...meta, subtitle: e.target.value })} placeholder="Objectieve meting van kracht, power en mobiliteit" />
            </Labeled>
            <Labeled label="Traject-label">
              <DarkInput value={meta.trajectLabel} onChange={(e) => setMeta({ ...meta, trajectLabel: e.target.value })} placeholder="van revalidatietraject" />
            </Labeled>
            <Labeled label="Locatie">
              <DarkInput value={meta.location} onChange={(e) => setMeta({ ...meta, location: e.target.value })} placeholder="NDSM" />
            </Labeled>
            <Labeled label="Blessure / doel" full>
              <DarkInput value={meta.injuryGoal} onChange={(e) => setMeta({ ...meta, injuryGoal: e.target.value })} placeholder="VKB-reconstructie rechts · hamstringpees · terug naar voetbal" />
            </Labeled>
            <Labeled label="Fase revalidatie" full>
              <DarkInput value={meta.rehabPhaseLabel} onChange={(e) => setMeta({ ...meta, rehabPhaseLabel: e.target.value })} placeholder="Fase 3 · kracht & power · maand 5" />
            </Labeled>
          </div>
        </Tile>

        {/* Tests toevoegen */}
        <Tile>
          <MetaLabel>Tests toevoegen</MetaLabel>
          <div className="flex flex-col gap-3 mt-2">
            <div className="flex gap-2 items-end">
              <Labeled label="Uit catalogus" full>
                <DarkSelect value={pickCatalog} onChange={(e) => setPickCatalog(e.target.value)}>
                  <option value="">— kies test —</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.category} · {c.name}{c.subtitle ? ` (${c.subtitle})` : ''}
                    </option>
                  ))}
                </DarkSelect>
              </Labeled>
              <DarkButton
                size="sm"
                disabled={!pickCatalog || addEntry.isPending}
                onClick={() => addEntry.mutate({ reportId: id, catalogItemId: pickCatalog })}
              >
                Voeg toe
              </DarkButton>
            </div>
            <div className="flex gap-2 items-end">
              <Labeled label="Test-batterij" full>
                <DarkSelect value={pickBattery} onChange={(e) => setPickBattery(e.target.value)}>
                  <option value="">— kies batterij —</option>
                  {batteries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.items.length})
                    </option>
                  ))}
                </DarkSelect>
              </Labeled>
              <DarkButton
                size="sm"
                disabled={!pickBattery || addBattery.isPending}
                onClick={() => addBattery.mutate({ reportId: id, batteryId: pickBattery })}
              >
                Voeg toe
              </DarkButton>
            </div>
            <DarkButton variant="ghost" size="sm" onClick={() => addEntry.mutate({ reportId: id })}>
              + Lege test
            </DarkButton>
          </div>
        </Tile>

        {/* Tests */}
        <div className="space-y-3">
          {report.entries.map((e) => (
            <EntryCard key={e.id} entry={e} onChanged={refetch} />
          ))}
          {report.entries.length === 0 && (
            <Tile>
              <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 10 }}>
                Nog geen tests. Voeg er hierboven toe.
              </p>
            </Tile>
          )}
        </div>

        {/* Slottekst */}
        <Tile>
          <div className="flex items-center justify-between gap-2">
            <MetaLabel>Interpretatie & vervolgadvies</MetaLabel>
            <DarkButton
              variant="ghost"
              size="sm"
              disabled={aiDraft.isPending || report.entries.length === 0}
              onClick={() => aiDraft.mutate({ reportId: id })}
            >
              {aiDraft.isPending ? 'AI schrijft…' : <span className="inline-flex items-center gap-1.5"><IconSparkle size={14} /> AI-concept</span>}
            </DarkButton>
          </div>
          <div className="mt-3 space-y-3">
            <Labeled label="Interpretatie" full>
              <DarkTextarea
                rows={7}
                value={meta.interpretation}
                onChange={(e) => setMeta({ ...meta, interpretation: e.target.value })}
                placeholder="Alinea's gescheiden door een lege regel…"
              />
            </Labeled>

            <div>
              <MetaLabel>Vervolgadvies</MetaLabel>
              <div className="space-y-2 mt-2">
                {advice.map((a, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <DarkInput
                        value={a.title}
                        placeholder="Aanhef (vet), bv Quadriceps zwaarder belasten"
                        onChange={(e) => setAdvice(advice.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                      />
                      <DarkTextarea
                        rows={2}
                        value={a.body}
                        placeholder="Toelichting…"
                        onChange={(e) => setAdvice(advice.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                      />
                    </div>
                    <DarkButton variant="ghost" size="sm" onClick={() => setAdvice(advice.filter((_, j) => j !== i))}>
                      ✕
                    </DarkButton>
                  </div>
                ))}
                <DarkButton variant="ghost" size="sm" onClick={() => setAdvice([...advice, { title: '', body: '' }])}>
                  + Adviespunt
                </DarkButton>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Volgend testmoment">
                <DarkInput value={meta.nextTestMoment} onChange={(e) => setMeta({ ...meta, nextTestMoment: e.target.value })} placeholder="Over 6 weken · medio juli 2026" />
              </Labeled>
              <Labeled label="Doel volgende meting">
                <DarkInput value={meta.nextTestGoal} onChange={(e) => setMeta({ ...meta, nextTestGoal: e.target.value })} placeholder="LSI > 90% op alle krachttesten" />
              </Labeled>
            </div>
          </div>
        </Tile>

        {/* Acties */}
        <Tile>
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <div className="flex gap-2 flex-wrap">
              <DarkButton variant="primary" size="sm" onClick={() => saveMeta()}>
                Opslaan
              </DarkButton>
              <DarkButton
                size="sm"
                onClick={() => saveMeta(report.status === 'FINAL' ? 'DRAFT' : 'FINAL')}
              >
                {report.status === 'FINAL' ? 'Terug naar concept' : 'Markeer definitief'}
              </DarkButton>
              <DarkButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  const name = window.prompt('Naam van de batterij?')
                  if (name) saveAsBattery.mutate({ reportId: id, name })
                }}
              >
                Opslaan als batterij
              </DarkButton>
            </div>
            <DarkButton
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm('Dit rapport verwijderen?')) del.mutate({ id })
              }}
            >
              Verwijderen
            </DarkButton>
          </div>
        </Tile>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────
function Labeled({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : undefined}>
      <MetaLabel>{label}</MetaLabel>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function EntryCard({ entry, onChanged }: { entry: RouterEntry; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({
    category: entry.category,
    categoryOrder: str(entry.categoryOrder),
    name: entry.name,
    subtitle: entry.subtitle ?? '',
    source: entry.source ?? '',
    kind: entry.kind as 'BILATERAL' | 'SINGLE',
    metric: entry.metric as 'LSI' | 'RIGHT' | 'LEFT' | 'VALUE',
    unitPrimary: entry.unitPrimary ?? '',
    unitSecondary: entry.unitSecondary ?? '',
    plotUnit: entry.plotUnit,
    axisMin: str(entry.axisMin),
    axisMax: str(entry.axisMax),
    zoneOrangeMin: str(entry.zoneOrangeMin),
    zoneGreenMin: str(entry.zoneGreenMin),
    higherIsBetter: entry.higherIsBetter,
    leftPrimary: str(entry.leftPrimary),
    rightPrimary: str(entry.rightPrimary),
    leftSecondary: str(entry.leftSecondary),
    rightSecondary: str(entry.rightSecondary),
    singleValue: str(entry.singleValue),
    textValue: entry.textValue ?? '',
    plottedValueOverride: str(entry.plottedValueOverride),
    zoneOverride: (entry.zoneOverride ?? '') as '' | TestZone,
  })

  const update = trpc.testReports.updateEntry.useMutation({
    onSuccess: onChanged,
    onError: (e) => toast.error(e.message),
  })
  const del = trpc.testReports.deleteEntry.useMutation({ onSuccess: onChanged })

  const save = () =>
    update.mutate({
      id: entry.id,
      category: f.category,
      categoryOrder: f.categoryOrder ? Number(f.categoryOrder) : 0,
      name: f.name,
      subtitle: f.subtitle || null,
      source: f.source || null,
      kind: f.kind,
      metric: f.metric,
      unitPrimary: f.unitPrimary || null,
      unitSecondary: f.unitSecondary || null,
      plotUnit: f.plotUnit,
      axisMin: numOrNull(f.axisMin) ?? 0,
      axisMax: numOrNull(f.axisMax) ?? 100,
      zoneOrangeMin: numOrNull(f.zoneOrangeMin) ?? 80,
      zoneGreenMin: numOrNull(f.zoneGreenMin) ?? 90,
      higherIsBetter: f.higherIsBetter,
      leftPrimary: numOrNull(f.leftPrimary),
      rightPrimary: numOrNull(f.rightPrimary),
      leftSecondary: numOrNull(f.leftSecondary),
      rightSecondary: numOrNull(f.rightSecondary),
      singleValue: numOrNull(f.singleValue),
      textValue: f.textValue || null,
      plottedValueOverride: numOrNull(f.plottedValueOverride),
      zoneOverride: f.zoneOverride === '' ? null : f.zoneOverride,
    })

  // Live preview
  const spec: TestSpec = {
    kind: f.kind,
    metric: f.metric,
    plotUnit: f.plotUnit,
    axisMin: numOrNull(f.axisMin) ?? 0,
    axisMax: numOrNull(f.axisMax) ?? 100,
    zoneOrangeMin: numOrNull(f.zoneOrangeMin) ?? 80,
    zoneGreenMin: numOrNull(f.zoneGreenMin) ?? 90,
    higherIsBetter: f.higherIsBetter,
  }
  const values = {
    leftPrimary: numOrNull(f.leftPrimary),
    rightPrimary: numOrNull(f.rightPrimary),
    singleValue: numOrNull(f.singleValue),
    plottedValueOverride: numOrNull(f.plottedValueOverride),
    zoneOverride: f.zoneOverride === '' ? null : f.zoneOverride,
  }
  const plotted = useMemo(() => computePlottedValue(spec, values), [spec, values]) // eslint-disable-line react-hooks/exhaustive-deps
  const zone = useMemo(() => computeZone(spec, values), [spec, values]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Tile accentBar={zone ? ZONE_COLOR[zone] : P.inkMuted}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="flex gap-2">
            <DarkInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={save} placeholder="Testnaam" />
            <DarkInput value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} onBlur={save} placeholder="subtitel" />
          </div>
          <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 4, letterSpacing: '0.08em' }}>
            {f.category.toUpperCase()} · {f.kind === 'SINGLE' ? 'ENKEL' : 'BILATERAAL'} · PLOT {f.metric}
          </p>
        </div>
        <div className="text-right" style={{ minWidth: 80 }}>
          <span style={{ fontWeight: 900, fontSize: 18, color: zone ? ZONE_COLOR[zone] : P.ink }}>
            {formatPlotted(spec, plotted)}
          </span>
          <span className="athletic-mono block" style={{ fontSize: 8, color: zone ? ZONE_COLOR[zone] : P.inkMuted, letterSpacing: '0.1em' }}>
            {zone ? ZONE_LABEL[zone] : '—'}
          </span>
        </div>
      </div>

      {/* Waarden */}
      <div className="mt-3">
        {f.kind === 'BILATERAL' ? (
          <div className="grid grid-cols-4 gap-2">
            <Labeled label={`Links${f.unitPrimary ? ` (${f.unitPrimary})` : ''}`}>
              <DarkInput type="number" value={f.leftPrimary} onChange={(e) => setF({ ...f, leftPrimary: e.target.value })} onBlur={save} />
            </Labeled>
            <Labeled label={`Rechts${f.unitPrimary ? ` (${f.unitPrimary})` : ''}`}>
              <DarkInput type="number" value={f.rightPrimary} onChange={(e) => setF({ ...f, rightPrimary: e.target.value })} onBlur={save} />
            </Labeled>
            <Labeled label={`Links 2${f.unitSecondary ? ` (${f.unitSecondary})` : ''}`}>
              <DarkInput type="number" value={f.leftSecondary} onChange={(e) => setF({ ...f, leftSecondary: e.target.value })} onBlur={save} />
            </Labeled>
            <Labeled label={`Rechts 2${f.unitSecondary ? ` (${f.unitSecondary})` : ''}`}>
              <DarkInput type="number" value={f.rightSecondary} onChange={(e) => setF({ ...f, rightSecondary: e.target.value })} onBlur={save} />
            </Labeled>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Labeled label={`Waarde${f.unitPrimary ? ` (${f.unitPrimary})` : ''}`}>
              <DarkInput type="number" value={f.singleValue} onChange={(e) => setF({ ...f, singleValue: e.target.value })} onBlur={save} />
            </Labeled>
            <Labeled label="Of tekst-waarde">
              <DarkInput value={f.textValue} onChange={(e) => setF({ ...f, textValue: e.target.value })} onBlur={save} placeholder="bv graad 2+" />
            </Labeled>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <button
          onClick={() => setOpen(!open)}
          className="athletic-mono"
          style={{ fontSize: 10, color: P.brand, letterSpacing: '0.1em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {open ? '▾ balk & zones verbergen' : '▸ balk & zones aanpassen'}
        </button>
        <DarkButton variant="ghost" size="sm" onClick={() => del.mutate({ id: entry.id })}>
          ✕ verwijderen
        </DarkButton>
      </div>

      {open && (
        <div className="mt-3 pt-3 grid grid-cols-2 gap-2" style={{ borderTop: `1px solid ${P.line}` }}>
          <Labeled label="Categorie">
            <DarkInput value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} onBlur={save} />
          </Labeled>
          <Labeled label="Categorie-volgorde">
            <DarkInput type="number" value={f.categoryOrder} onChange={(e) => setF({ ...f, categoryOrder: e.target.value })} onBlur={save} />
          </Labeled>
          <Labeled label="Bron-regel" full>
            <DarkInput value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} onBlur={save} placeholder="KINVENT K-PULL · ISOMETRISCH" />
          </Labeled>
          <Labeled label="Type">
            <DarkSelect value={f.kind} onChange={(e) => { setF({ ...f, kind: e.target.value as 'BILATERAL' | 'SINGLE' }) }} onBlur={save}>
              <option value="BILATERAL">Bilateraal (L/R)</option>
              <option value="SINGLE">Enkel</option>
            </DarkSelect>
          </Labeled>
          <Labeled label="Plot-metriek">
            <DarkSelect value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value as typeof f.metric })} onBlur={save}>
              <option value="LSI">LSI (symmetrie %)</option>
              <option value="RIGHT">Rechterwaarde</option>
              <option value="LEFT">Linkerwaarde</option>
              <option value="VALUE">Enkele waarde</option>
            </DarkSelect>
          </Labeled>
          <Labeled label="Eenheid">
            <DarkInput value={f.unitPrimary} onChange={(e) => setF({ ...f, unitPrimary: e.target.value })} onBlur={save} placeholder="kg" />
          </Labeled>
          <Labeled label="2e eenheid">
            <DarkInput value={f.unitSecondary} onChange={(e) => setF({ ...f, unitSecondary: e.target.value })} onBlur={save} placeholder="Nm/kg" />
          </Labeled>
          <Labeled label="Plot-eenheid">
            <DarkInput value={f.plotUnit} onChange={(e) => setF({ ...f, plotUnit: e.target.value })} onBlur={save} placeholder="%" />
          </Labeled>
          <Labeled label="Hoger = beter">
            <DarkSelect value={f.higherIsBetter ? 'ja' : 'nee'} onChange={(e) => setF({ ...f, higherIsBetter: e.target.value === 'ja' })} onBlur={save}>
              <option value="ja">Ja</option>
              <option value="nee">Nee</option>
            </DarkSelect>
          </Labeled>
          <Labeled label="As min">
            <DarkInput type="number" value={f.axisMin} onChange={(e) => setF({ ...f, axisMin: e.target.value })} onBlur={save} />
          </Labeled>
          <Labeled label="As max">
            <DarkInput type="number" value={f.axisMax} onChange={(e) => setF({ ...f, axisMax: e.target.value })} onBlur={save} />
          </Labeled>
          <Labeled label="Drempel oranje (≥)">
            <DarkInput type="number" value={f.zoneOrangeMin} onChange={(e) => setF({ ...f, zoneOrangeMin: e.target.value })} onBlur={save} />
          </Labeled>
          <Labeled label="Drempel groen (≥)">
            <DarkInput type="number" value={f.zoneGreenMin} onChange={(e) => setF({ ...f, zoneGreenMin: e.target.value })} onBlur={save} />
          </Labeled>
          <Labeled label="Override geplotte waarde">
            <DarkInput type="number" value={f.plottedValueOverride} onChange={(e) => setF({ ...f, plottedValueOverride: e.target.value })} onBlur={save} placeholder="auto" />
          </Labeled>
          <Labeled label="Override zone">
            <DarkSelect value={f.zoneOverride} onChange={(e) => setF({ ...f, zoneOverride: e.target.value as '' | TestZone })} onBlur={save}>
              <option value="">Automatisch</option>
              <option value="RED">Rood</option>
              <option value="ORANGE">Oranje</option>
              <option value="GREEN">Groen</option>
            </DarkSelect>
          </Labeled>
        </div>
      )}
    </Tile>
  )
}
