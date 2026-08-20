/**
 * Testcatalogus + batterij-beheer.
 * Therapeut stelt eigen tests samen (met progressiebalk-config) en bouwt
 * batterijen die als revalidatie-protocol met week-doelen kunnen fungeren.
 * Praktijk-breed zichtbaar; globale seeds zijn ook bewerkbaar (single-clinic).
 */
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, DarkDialog, DarkDialogContent, DarkDialogHeader, DarkDialogTitle, DarkInput, DarkTextarea, DarkSelect, DarkMenuSelect, DarkTabs, DarkTabsList, DarkTabsTrigger, DarkTabsContent, Display, Kicker, MetaLabel, Tile, P, CARD } from '@/components/dark-ui'
import { ChevronLeft, Plus, Pencil, Trash2, X, GripVertical } from 'lucide-react'

// ── Mini progressiebalk: rood → oranje → groen op basis van axis + zones ──────
function ZoneBar({
  axisMin, axisMax, zoneOrangeMin, zoneGreenMin, higherIsBetter,
}: {
  axisMin: number; axisMax: number; zoneOrangeMin: number; zoneGreenMin: number; higherIsBetter: boolean
}) {
  const span = Math.max(axisMax - axisMin, 0.0001)
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - axisMin) / span) * 100))
  const oStart = pct(zoneOrangeMin)
  const gStart = pct(zoneGreenMin)
  // Bij higherIsBetter=false draaien de zones om (lager = beter).
  const stops = higherIsBetter
    ? [
        { c: P.danger, from: 0, to: oStart },
        { c: P.gold, from: oStart, to: gStart },
        { c: P.lime, from: gStart, to: 100 },
      ]
    : [
        { c: P.lime, from: 0, to: gStart },
        { c: P.gold, from: gStart, to: oStart },
        { c: P.danger, from: oStart, to: 100 },
      ]
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full" style={{ background: P.surfaceLow }}>
      {stops.map((s, i) => (
        <div
          key={i}
          className="absolute top-0 h-full"
          style={{ left: `${s.from}%`, width: `${Math.max(s.to - s.from, 0)}%`, background: s.c, opacity: 0.85 }}
        />
      ))}
    </div>
  )
}

// ── Catalogus-formulier (aanmaken/bewerken van een test) ──────────────────────
type CatalogDraft = {
  id?: string
  category: string
  name: string
  subtitle: string
  source: string
  kind: 'BILATERAL' | 'SINGLE'
  metric: 'LSI' | 'RIGHT' | 'LEFT' | 'VALUE'
  unitPrimary: string
  plotUnit: string
  axisMin: number
  axisMax: number
  zoneOrangeMin: number
  zoneGreenMin: number
  higherIsBetter: boolean
}

const EMPTY_CATALOG: CatalogDraft = {
  category: 'Kracht', name: '', subtitle: '', source: '',
  kind: 'BILATERAL', metric: 'LSI', unitPrimary: 'kg', plotUnit: '%',
  axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90, higherIsBetter: true,
}

function CatalogForm({
  draft, onClose,
}: {
  draft: CatalogDraft
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [d, setD] = useState<CatalogDraft>(draft)
  const set = <K extends keyof CatalogDraft>(k: K, v: CatalogDraft[K]) => setD(prev => ({ ...prev, [k]: v }))
  const num = (k: keyof CatalogDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, (e.target.value === '' ? 0 : Number(e.target.value)) as CatalogDraft[typeof k])

  const upsert = trpc.testReports.catalogUpsert.useMutation({
    onSuccess: () => {
      toast.success(d.id ? 'Test bijgewerkt' : 'Test aangemaakt')
      utils.testReports.catalog.invalidate()
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <MetaLabel>Categorie</MetaLabel>
          <DarkInput value={d.category} onChange={(e) => set('category', e.target.value)} placeholder="Kracht" />
        </div>
        <div className="flex-1">
          <MetaLabel>Naam</MetaLabel>
          <DarkInput value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Quadriceps" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <MetaLabel>Subtitel</MetaLabel>
          <DarkInput value={d.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="isometrisch" />
        </div>
        <div className="flex-1">
          <MetaLabel>Bron / apparaat</MetaLabel>
          <DarkInput value={d.source} onChange={(e) => set('source', e.target.value)} placeholder="KINVENT K-PULL" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <MetaLabel>Type</MetaLabel>
          <DarkSelect value={d.kind} onChange={(e) => set('kind', e.target.value as CatalogDraft['kind'])}>
            <option value="BILATERAL">Bilateraal (L/R)</option>
            <option value="SINGLE">Enkel</option>
          </DarkSelect>
        </div>
        <div className="flex-1">
          <MetaLabel>Geplotte waarde</MetaLabel>
          <DarkSelect value={d.metric} onChange={(e) => set('metric', e.target.value as CatalogDraft['metric'])}>
            <option value="LSI">LSI (symmetrie %)</option>
            <option value="VALUE">Waarde</option>
            <option value="RIGHT">Rechts</option>
            <option value="LEFT">Links</option>
          </DarkSelect>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <MetaLabel>Eenheid meting</MetaLabel>
          <DarkInput value={d.unitPrimary} onChange={(e) => set('unitPrimary', e.target.value)} placeholder="kg" />
        </div>
        <div className="flex-1">
          <MetaLabel>Eenheid plot</MetaLabel>
          <DarkInput value={d.plotUnit} onChange={(e) => set('plotUnit', e.target.value)} placeholder="%" />
        </div>
      </div>

      <div className="rounded-xl p-3" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
        <MetaLabel>Progressiebalk, as & zones ({d.plotUnit})</MetaLabel>
        <div className="mt-2 flex gap-2">
          <div className="flex-1">
            <MetaLabel>As min</MetaLabel>
            <DarkInput type="number" value={d.axisMin} onChange={num('axisMin')} />
          </div>
          <div className="flex-1">
            <MetaLabel>Oranje ≥</MetaLabel>
            <DarkInput type="number" value={d.zoneOrangeMin} onChange={num('zoneOrangeMin')} />
          </div>
          <div className="flex-1">
            <MetaLabel>Groen ≥</MetaLabel>
            <DarkInput type="number" value={d.zoneGreenMin} onChange={num('zoneGreenMin')} />
          </div>
          <div className="flex-1">
            <MetaLabel>As max</MetaLabel>
            <DarkInput type="number" value={d.axisMax} onChange={num('axisMax')} />
          </div>
        </div>
        <div className="mt-3">
          <ZoneBar {...d} />
        </div>
        <label className="mt-3 flex items-center gap-2 cursor-pointer" style={{ color: P.inkMuted, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={d.higherIsBetter}
            onChange={(e) => set('higherIsBetter', e.target.checked)}
          />
          Hoger is beter (uit = lager is beter)
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <DarkButton variant="ghost" size="sm" onClick={onClose}>Annuleren</DarkButton>
        <DarkButton
          variant="primary"
          size="sm"
          disabled={!d.name.trim() || !d.category.trim() || upsert.isPending}
          onClick={() => upsert.mutate({
            id: d.id,
            category: d.category.trim(),
            name: d.name.trim(),
            subtitle: d.subtitle.trim() || null,
            source: d.source.trim() || null,
            kind: d.kind,
            metric: d.metric,
            unitPrimary: d.unitPrimary.trim() || null,
            plotUnit: d.plotUnit.trim() || '%',
            axisMin: d.axisMin,
            axisMax: d.axisMax,
            zoneOrangeMin: d.zoneOrangeMin,
            zoneGreenMin: d.zoneGreenMin,
            higherIsBetter: d.higherIsBetter,
          })}
        >
          {d.id ? 'Opslaan' : 'Aanmaken'}
        </DarkButton>
      </div>
    </div>
  )
}

// ── Batterij-formulier (samenstellen + weken-protocol) ────────────────────────
type BatteryItemDraft = { catalogItemId: string; targetWeek: number | null }
type BatteryDraft = {
  id?: string
  name: string
  description: string
  durationWeeks: number | null
  items: BatteryItemDraft[]
}

function BatteryForm({
  draft, catalog, onClose,
}: {
  draft: BatteryDraft
  catalog: Array<{ id: string; name: string; category: string }>
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [d, setD] = useState<BatteryDraft>(draft)
  const [addId, setAddId] = useState('')

  const catalogById = useMemo(() => new Map(catalog.map(c => [c.id, c])), [catalog])
  const available = catalog.filter(c => !d.items.some(it => it.catalogItemId === c.id))

  const upsert = trpc.testReports.batteryUpsert.useMutation({
    onSuccess: () => {
      toast.success(d.id ? 'Batterij bijgewerkt' : 'Batterij aangemaakt')
      utils.testReports.batteries.invalidate()
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  const addItem = (id: string) => {
    if (!id || d.items.some(it => it.catalogItemId === id)) return
    setD(prev => ({ ...prev, items: [...prev.items, { catalogItemId: id, targetWeek: null }] }))
    setAddId('')
  }
  const removeItem = (id: string) =>
    setD(prev => ({ ...prev, items: prev.items.filter(it => it.catalogItemId !== id) }))
  const setWeek = (id: string, week: number | null) =>
    setD(prev => ({ ...prev, items: prev.items.map(it => it.catalogItemId === id ? { ...it, targetWeek: week } : it) }))

  const hasTimeline = d.durationWeeks != null

  return (
    <div className="flex flex-col gap-3">
      <div>
        <MetaLabel>Naam</MetaLabel>
        <DarkInput value={d.name} onChange={(e) => setD(p => ({ ...p, name: e.target.value }))} placeholder="Return to sport, VKB" />
      </div>
      <div>
        <MetaLabel>Omschrijving</MetaLabel>
        <DarkTextarea
          value={d.description}
          onChange={(e) => setD(p => ({ ...p, description: e.target.value }))}
          placeholder="Doel van deze batterij / protocol…"
          rows={2}
        />
      </div>
      <div className="flex items-end gap-3">
        <div style={{ width: 200 }}>
          <MetaLabel>Looptijd protocol (weken)</MetaLabel>
          <DarkInput
            type="number"
            min={1}
            value={d.durationWeeks ?? ''}
            placeholder="bv. 12, leeg = losse batterij"
            onChange={(e) => setD(p => ({ ...p, durationWeeks: e.target.value === '' ? null : Number(e.target.value) }))}
          />
        </div>
        <p style={{ color: P.inkMuted, fontSize: 11, lineHeight: 1.4, paddingBottom: 6 }}>
          Vul een looptijd in om er een revalidatie-protocol van te maken: je kunt dan per test
          een doelweek zetten.
        </p>
      </div>

      <div className="rounded-xl p-3" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
        <MetaLabel>Tests in deze batterij ({d.items.length})</MetaLabel>
        <div className="mt-2 flex flex-col gap-1.5">
          {d.items.length === 0 && (
            <p style={{ color: P.inkMuted, fontSize: 12, padding: '6px 2px' }}>Nog geen tests toegevoegd.</p>
          )}
          {d.items.map((it) => {
            const cat = catalogById.get(it.catalogItemId)
            return (
              <div
                key={it.catalogItemId}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                style={{...CARD }}
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0" style={{ color: P.inkDim }} />
                <div className="flex-1 min-w-0">
                  <p className="truncate" style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>
                    {cat?.name ?? '—'}
                  </p>
                  <p style={{ color: P.inkMuted, fontSize: 10 }}>{cat?.category}</p>
                </div>
                {hasTimeline && (
                  <div className="flex items-center gap-1">
                    <span style={{ color: P.inkMuted, fontSize: 10 }}>week</span>
                    <input
                      type="number"
                      min={0}
                      max={d.durationWeeks ?? 104}
                      value={it.targetWeek ?? ''}
                      placeholder="—"
                      onChange={(e) => setWeek(it.catalogItemId, e.target.value === '' ? null : Number(e.target.value))}
                      className="w-14 rounded-md px-2 py-1 text-sm outline-none"
                      style={{ background: P.surfaceLow, border: `1px solid ${P.lineStrong}`, color: P.ink }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Verwijderen"
                  onClick={() => removeItem(it.catalogItemId)}
                  className="mbt-btn-hover shrink-0 rounded-md p-1 opacity-60 hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" style={{ color: P.danger }} />
                </button>
              </div>
            )
          })}
        </div>
        {available.length > 0 && (
          <div className="mt-2">
            <DarkMenuSelect
              value={addId}
              onValueChange={addItem}
              placeholder="+ Test toevoegen…"
              options={available.map(c => ({ value: c.id, label: `${c.name} · ${c.category}` }))}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <DarkButton variant="ghost" size="sm" onClick={onClose}>Annuleren</DarkButton>
        <DarkButton
          variant="primary"
          size="sm"
          disabled={!d.name.trim() || d.items.length === 0 || upsert.isPending}
          onClick={() => upsert.mutate({
            id: d.id,
            name: d.name.trim(),
            description: d.description.trim() || null,
            durationWeeks: d.durationWeeks,
            items: d.items.map((it, order) => ({
              catalogItemId: it.catalogItemId,
              order,
              targetWeek: hasTimeline ? it.targetWeek : null,
            })),
          })}
        >
          {d.id ? 'Opslaan' : 'Aanmaken'}
        </DarkButton>
      </div>
    </div>
  )
}

// ── Pagina ────────────────────────────────────────────────────────────────────
export default function ManageTestsPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: catalog = [] } = trpc.testReports.catalog.useQuery()
  const { data: batteries = [] } = trpc.testReports.batteries.useQuery()

  const [catalogDraft, setCatalogDraft] = useState<CatalogDraft | null>(null)
  const [batteryDraft, setBatteryDraft] = useState<BatteryDraft | null>(null)

  const setActive = trpc.testReports.catalogSetActive.useMutation({
    onSuccess: () => { utils.testReports.catalog.invalidate(); toast.success('Test gearchiveerd') },
    onError: (e) => toast.error(e.message),
  })
  const deleteBattery = trpc.testReports.batteryDelete.useMutation({
    onSuccess: () => { utils.testReports.batteries.invalidate(); toast.success('Batterij verwijderd') },
    onError: (e) => toast.error(e.message),
  })

  const grouped = useMemo(() => {
    const m = new Map<string, typeof catalog>()
    for (const c of catalog) {
      const arr = m.get(c.category) ?? []
      arr.push(c)
      m.set(c.category, arr)
    }
    return [...m.entries()]
  }, [catalog])

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-24 space-y-6">
        <button
          onClick={() => router.push('/therapist/test-reports')}
          className="mbt-btn-hover inline-flex items-center gap-1 text-sm"
          style={{ color: P.inkMuted }}
        >
          <ChevronLeft className="h-4 w-4" /> Terug naar testrapporten
        </button>

        <div className="space-y-1">
          <Kicker>Return to sport · library</Kicker>
          <Display size="md">TESTS & BATTERIJEN</Display>
          <MetaLabel style={{ textTransform: 'none', fontWeight: 500, marginTop: 2 }}>
            Stel eigen tests samen en bouw batterijen, desgewenst als revalidatie-protocol met weken.
          </MetaLabel>
        </div>

        <DarkTabs defaultValue="tests">
          <DarkTabsList>
            <DarkTabsTrigger value="tests">Tests ({catalog.length})</DarkTabsTrigger>
            <DarkTabsTrigger value="batteries">Batterijen ({batteries.length})</DarkTabsTrigger>
          </DarkTabsList>

          {/* Tests */}
          <DarkTabsContent value="tests">
            <div className="flex justify-end mb-3">
              <DarkButton variant="primary" size="sm" onClick={() => setCatalogDraft(EMPTY_CATALOG)}>
                <Plus className="h-4 w-4" /> Nieuwe test
              </DarkButton>
            </div>
            <div className="space-y-5">
              {grouped.map(([category, items]) => (
                <div key={category}>
                  <MetaLabel>{category}</MetaLabel>
                  <div className="mt-2 flex flex-col gap-2">
                    {items.map((c) => (
                      <Tile key={c.id}>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{c.name}</p>
                              {c.subtitle && (
                                <span style={{ color: P.inkMuted, fontSize: 11 }}>{c.subtitle}</span>
                              )}
                            </div>
                            <div className="mt-2 max-w-[260px]">
                              <ZoneBar
                                axisMin={c.axisMin} axisMax={c.axisMax}
                                zoneOrangeMin={c.zoneOrangeMin} zoneGreenMin={c.zoneGreenMin}
                                higherIsBetter={c.higherIsBetter}
                              />
                            </div>
                            <p className="athletic-mono mt-1" style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.08em' }}>
                              {c.zoneOrangeMin} / {c.zoneGreenMin} {c.plotUnit} · {c.metric}
                              {c.practiceId ? ' · EIGEN' : ' · STANDAARD'}
                            </p>
                          </div>
                          <button
                            aria-label="Bewerken"
                            onClick={() => setCatalogDraft({
                              id: c.id, category: c.category, name: c.name,
                              subtitle: c.subtitle ?? '', source: c.source ?? '',
                              kind: c.kind as CatalogDraft['kind'], metric: c.metric as CatalogDraft['metric'],
                              unitPrimary: c.unitPrimary ?? '', plotUnit: c.plotUnit,
                              axisMin: c.axisMin, axisMax: c.axisMax,
                              zoneOrangeMin: c.zoneOrangeMin, zoneGreenMin: c.zoneGreenMin,
                              higherIsBetter: c.higherIsBetter,
                            })}
                            className="mbt-btn-hover shrink-0 rounded-lg p-2"
                            style={{ color: P.inkMuted }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            aria-label="Archiveren"
                            onClick={() => {
                              if (confirm(`"${c.name}" archiveren? Bestaande rapporten blijven intact.`)) {
                                setActive.mutate({ id: c.id, isActive: false })
                              }
                            }}
                            className="mbt-btn-hover shrink-0 rounded-lg p-2"
                            style={{ color: P.inkMuted }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </Tile>
                    ))}
                  </div>
                </div>
              ))}
              {catalog.length === 0 && (
                <Tile>
                  <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
                    Nog geen tests. Klik op <strong style={{ color: P.ink }}>Nieuwe test</strong>.
                  </p>
                </Tile>
              )}
            </div>
          </DarkTabsContent>

          {/* Batterijen */}
          <DarkTabsContent value="batteries">
            <div className="flex justify-end mb-3">
              <DarkButton
                variant="primary"
                size="sm"
                onClick={() => setBatteryDraft({ name: '', description: '', durationWeeks: null, items: [] })}
              >
                <Plus className="h-4 w-4" /> Nieuwe batterij
              </DarkButton>
            </div>
            <div className="flex flex-col gap-2">
              {batteries.map((b) => (
                <Tile key={b.id}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{b.name}</p>
                      <p className="athletic-mono mt-1" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.06em' }}>
                        {b.items.length} TESTS
                        {b.durationWeeks ? ` · PROTOCOL ${b.durationWeeks} WKN` : ''}
                        {b.practiceId ? ' · EIGEN' : ' · STANDAARD'}
                      </p>
                    </div>
                    <button
                      aria-label="Bewerken"
                      onClick={() => setBatteryDraft({
                        id: b.id, name: b.name, description: b.description ?? '',
                        durationWeeks: b.durationWeeks ?? null,
                        items: b.items.map(it => ({ catalogItemId: it.catalogItemId, targetWeek: it.targetWeek ?? null })),
                      })}
                      className="mbt-btn-hover shrink-0 rounded-lg p-2"
                      style={{ color: P.inkMuted }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="Verwijderen"
                      onClick={() => {
                        if (confirm(`Batterij "${b.name}" verwijderen?`)) deleteBattery.mutate({ id: b.id })
                      }}
                      className="mbt-btn-hover shrink-0 rounded-lg p-2"
                      style={{ color: P.inkMuted }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </Tile>
              ))}
              {batteries.length === 0 && (
                <Tile>
                  <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
                    Nog geen batterijen. Klik op <strong style={{ color: P.ink }}>Nieuwe batterij</strong>.
                  </p>
                </Tile>
              )}
            </div>
          </DarkTabsContent>
        </DarkTabs>
      </div>

      {/* Dialogs */}
      <DarkDialog open={catalogDraft != null} onOpenChange={(o) => !o && setCatalogDraft(null)}>
        <DarkDialogContent>
          <DarkDialogHeader>
            <DarkDialogTitle>{catalogDraft?.id ? 'Test bewerken' : 'Nieuwe test'}</DarkDialogTitle>
          </DarkDialogHeader>
          {catalogDraft && <CatalogForm draft={catalogDraft} onClose={() => setCatalogDraft(null)} />}
        </DarkDialogContent>
      </DarkDialog>

      <DarkDialog open={batteryDraft != null} onOpenChange={(o) => !o && setBatteryDraft(null)}>
        <DarkDialogContent>
          <DarkDialogHeader>
            <DarkDialogTitle>{batteryDraft?.id ? 'Batterij bewerken' : 'Nieuwe batterij'}</DarkDialogTitle>
          </DarkDialogHeader>
          {batteryDraft && (
            <BatteryForm draft={batteryDraft} catalog={catalog} onClose={() => setBatteryDraft(null)} />
          )}
        </DarkDialogContent>
      </DarkDialog>
    </div>
  )
}
