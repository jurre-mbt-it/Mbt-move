/**
 * Product-wizard voor de admin-shop: begeleide flow in drie stappen
 * (Inhoud → Presentatie → Prijs & publicatie) met een live storefront-preview
 * en een publicatie-checklist. Nieuw product start met een soort-keuze;
 * bestaande producten openen direct in stap 1 met vrij navigeerbare stappen.
 */
'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Dumbbell,
  Package,
  CalendarClock,
  Check,
  Circle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkInput,
  DarkSelect,
  DarkTextarea,
  P,
} from '@/components/dark-ui'
import { centsToEuros, eurosToCents, formatPriceCents } from '@/lib/shop/format'
import { heroGradient } from '@/lib/shop/gradient'
import {
  BODY_REGION_LABELS,
  BODY_REGION_OPTIONS,
  KIND_LABELS,
  LEVEL_LABELS,
  STATUS_LABELS,
} from '@/lib/shop/labels'

type Status = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
type Kind = 'PROGRAM' | 'PHYSICAL' | 'SERVICE'
type Level = '' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'

type ProgramOption = { id: string; name: string; weeks: number; daysPerWeek: number }
type TherapistOption = {
  id: string
  name: string | null
  firstName: string | null
  lastName: string | null
}

/** Product zoals `shop.adminList` hem teruggeeft (alleen de velden die de wizard gebruikt). */
export type AdminProduct = {
  id: string
  name: string
  slug: string
  kind: string
  tagline: string | null
  description: string | null
  status: string
  programId: string | null
  therapistId: string | null
  priceCents: number
  vatRate: number
  level: string | null
  durationWeeks: number | null
  bodyRegion: string[]
  heroImageUrl: string | null
  previewVideoUrl: string | null
  highlights: string[]
  intakeTags: string[]
  sku: string | null
  stockQty: number | null
  requiresShipping: boolean
  weightGrams: number | null
  bookingUrl: string | null
  sortOrder: number
}

type Editor = {
  id?: string
  name: string
  slug: string
  kind: Kind
  tagline: string
  description: string
  status: Status
  programId: string
  therapistId: string
  priceEuros: string
  vatRate: number
  level: Level
  durationWeeks: string
  bodyRegion: string[]
  heroImageUrl: string
  previewVideoUrl: string
  highlights: string // één per regel
  intakeTags: string // komma-gescheiden
  sku: string
  stockQty: string // leeg = voorraad niet bijgehouden
  requiresShipping: boolean
  weightGrams: string
  bookingUrl: string
  sortOrder: number
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const EMPTY: Editor = {
  name: '',
  slug: '',
  kind: 'PROGRAM',
  tagline: '',
  description: '',
  status: 'DRAFT',
  programId: '',
  therapistId: '',
  priceEuros: '34.95',
  vatRate: 21,
  level: '',
  durationWeeks: '',
  bodyRegion: [],
  heroImageUrl: '',
  previewVideoUrl: '',
  highlights: '',
  intakeTags: '',
  sku: '',
  stockQty: '',
  requiresShipping: false,
  weightGrams: '',
  bookingUrl: '',
  sortOrder: 0,
}

function toEditor(p: AdminProduct): Editor {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    kind: p.kind as Kind,
    tagline: p.tagline ?? '',
    description: p.description ?? '',
    status: p.status as Status,
    programId: p.programId ?? '',
    therapistId: p.therapistId ?? '',
    priceEuros: centsToEuros(p.priceCents),
    vatRate: p.vatRate,
    level: (p.level ?? '') as Level,
    durationWeeks: p.durationWeeks != null ? String(p.durationWeeks) : '',
    bodyRegion: p.bodyRegion,
    heroImageUrl: p.heroImageUrl ?? '',
    previewVideoUrl: p.previewVideoUrl ?? '',
    highlights: p.highlights.join('\n'),
    intakeTags: p.intakeTags.join(', '),
    sku: p.sku ?? '',
    stockQty: p.stockQty != null ? String(p.stockQty) : '',
    requiresShipping: p.requiresShipping,
    weightGrams: p.weightGrams != null ? String(p.weightGrams) : '',
    bookingUrl: p.bookingUrl ?? '',
    sortOrder: p.sortOrder,
  }
}

const KIND_CARDS: Array<{
  kind: Kind
  title: string
  description: string
  Icon: typeof Dumbbell
}> = [
  {
    kind: 'PROGRAM',
    title: 'Schema',
    description:
      'Een digitaal trainingsprogramma, gekoppeld aan een van je schema-templates. De koper krijgt direct toegang na betaling.',
    Icon: Dumbbell,
  },
  {
    kind: 'PHYSICAL',
    title: 'Artikel',
    description:
      'Een fysiek product zoals een weerstandsband of foamroller, met optionele voorraad en verzending.',
    Icon: Package,
  },
  {
    kind: 'SERVICE',
    title: 'Dienst',
    description:
      'Een dienst zoals een hardloopanalyse. Met boekingslink plant de koper direct een afspraak; zonder link loopt het via iDEAL.',
    Icon: CalendarClock,
  },
]

const STEPS = ['Inhoud', 'Presentatie', 'Prijs & publicatie'] as const

type CheckItem = { label: string; ok: boolean; required: boolean }

function buildChecklist(e: Editor): CheckItem[] {
  const items: CheckItem[] = [
    { label: 'Naam ingevuld', ok: e.name.trim().length > 0, required: true },
    { label: 'Geldige prijs', ok: eurosToCents(e.priceEuros) > 0, required: true },
  ]
  if (e.kind === 'PROGRAM') {
    items.push({ label: 'Schema gekoppeld', ok: !!e.programId, required: true })
  }
  items.push(
    {
      label: 'Tagline of omschrijving',
      ok: e.tagline.trim().length > 0 || e.description.trim().length > 0,
      required: false,
    },
    {
      label: 'Minimaal één verkooppunt',
      ok: e.highlights.split('\n').some((s) => s.trim()),
      required: false,
    },
    { label: 'Eigen hero-afbeelding', ok: e.heroImageUrl.trim().length > 0, required: false },
  )
  if (e.kind === 'SERVICE') {
    items.push({ label: 'Boekingslink ingevuld', ok: e.bookingUrl.trim().length > 0, required: false })
  }
  if (e.kind === 'PHYSICAL' && e.requiresShipping) {
    items.push({ label: 'Gewicht ingevuld (voor verzending)', ok: e.weightGrams.trim().length > 0, required: false })
  }
  return items
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide"
        style={{ color: P.inkMuted }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-xs" style={{ color: P.inkDim }}>
          {hint}
        </span>
      )}
    </label>
  )
}

function TogglePill({
  active,
  onClick,
  children,
  size = 'md',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full font-semibold transition-all active:scale-95 ${
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-1.5 text-sm'
      }`}
      style={{
        background: active ? P.brand : P.surfaceHi,
        color: active ? P.bg : P.inkMuted,
        border: `1px solid ${active ? P.brand : P.line}`,
      }}
    >
      {children}
    </button>
  )
}

export function ProductWizard({
  product,
  programs,
  therapists,
  onClose,
}: {
  product: AdminProduct | null
  programs: ProgramOption[]
  therapists: TherapistOption[]
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const isNew = !product
  const [editor, setEditor] = useState<Editor>(() => (product ? toEditor(product) : { ...EMPTY }))
  // Stap 0 = soort kiezen (alleen bij nieuw), daarna 1..3.
  const [step, setStep] = useState(isNew ? 0 : 1)
  const [maxVisited, setMaxVisited] = useState(isNew ? 0 : 3)

  const upsert = trpc.shop.adminUpsert.useMutation({
    onSuccess: (saved) => {
      utils.shop.adminList.invalidate()
      toast.success(
        saved.status === 'PUBLISHED' ? 'Product opgeslagen en gepubliceerd' : 'Product opgeslagen',
      )
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  const remove = trpc.shop.adminDelete.useMutation({
    onSuccess: () => {
      utils.shop.adminList.invalidate()
      toast.success('Product verwijderd')
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  const set = <K extends keyof Editor>(key: K, value: Editor[K]) =>
    setEditor((prev) => ({ ...prev, [key]: value }))

  const checklist = useMemo(() => buildChecklist(editor), [editor])
  const requiredOk = checklist.filter((c) => c.required).every((c) => c.ok)
  const publishBlocked = editor.status === 'PUBLISHED' && !requiredOk

  function goTo(next: number) {
    setStep(next)
    setMaxVisited((m) => Math.max(m, next))
  }

  function chooseKind(kind: Kind) {
    set('kind', kind)
    goTo(1)
  }

  function next() {
    if (step === 1 && !editor.name.trim()) {
      toast.error('Geef het product eerst een naam')
      return
    }
    goTo(Math.min(step + 1, 3))
  }

  function save(statusOverride?: Status) {
    const status = statusOverride ?? editor.status
    if (!editor.name.trim()) return toast.error('Naam is verplicht')
    const slug = editor.slug.trim() || slugify(editor.name)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return toast.error('Slug mag alleen kleine letters, cijfers en koppeltekens bevatten')
    }
    const priceCents = eurosToCents(editor.priceEuros)
    if (priceCents <= 0) return toast.error('Vul een geldige prijs in')
    if (status === 'PUBLISHED' && editor.kind === 'PROGRAM' && !editor.programId) {
      return toast.error('Koppel eerst een schema voordat je publiceert')
    }

    const isProgram = editor.kind === 'PROGRAM'
    const isPhysical = editor.kind === 'PHYSICAL'
    const isService = editor.kind === 'SERVICE'

    upsert.mutate({
      id: editor.id,
      name: editor.name.trim(),
      slug,
      kind: editor.kind,
      tagline: editor.tagline.trim() || null,
      description: editor.description.trim() || null,
      status,
      // Schema-specifieke velden alleen bij een PROGRAM bewaren.
      programId: isProgram ? editor.programId || null : null,
      therapistId: editor.therapistId || null,
      priceCents,
      vatRate: editor.vatRate,
      level: isProgram ? editor.level || null : null,
      durationWeeks:
        isProgram && editor.durationWeeks ? Number.parseInt(editor.durationWeeks, 10) : null,
      bodyRegion: (isProgram ? editor.bodyRegion : []) as never,
      heroImageUrl: editor.heroImageUrl.trim() || null,
      previewVideoUrl: editor.previewVideoUrl.trim() || null,
      highlights: editor.highlights.split('\n').map((s) => s.trim()).filter(Boolean),
      intakeTags: isProgram
        ? editor.intakeTags.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      // Artikel-velden alleen bij een PHYSICAL.
      sku: isPhysical ? editor.sku.trim() || null : null,
      stockQty: isPhysical && editor.stockQty ? Number.parseInt(editor.stockQty, 10) : null,
      requiresShipping: isPhysical ? editor.requiresShipping : false,
      weightGrams:
        isPhysical && editor.weightGrams ? Number.parseInt(editor.weightGrams, 10) : null,
      // Dienst-veld alleen bij een SERVICE.
      bookingUrl: isService ? editor.bookingUrl.trim() || null : null,
      sortOrder: editor.sortOrder,
    })
  }

  // ── Stap 0: soort kiezen ────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div>
        <p className="mb-1 text-sm font-semibold" style={{ color: P.ink }}>
          Wat ga je verkopen?
        </p>
        <p className="mb-5 text-sm" style={{ color: P.inkMuted }}>
          De soort bepaalt welke stappen en velden je daarna invult.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {KIND_CARDS.map(({ kind, title, description, Icon }) => (
            <button
              key={kind}
              type="button"
              onClick={() => chooseKind(kind)}
              className="group rounded-2xl border p-6 text-left transition-all hover:-translate-y-0.5 active:scale-[0.98]"
              style={{ borderColor: P.line, background: P.surface }}
            >
              <span
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl transition-colors"
                style={{ background: P.surfaceHi, color: P.brand }}
              >
                <Icon size={22} />
              </span>
              <span className="block font-semibold" style={{ color: P.ink }}>
                {title}
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed" style={{ color: P.inkMuted }}>
                {description}
              </span>
              <span
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium transition-transform group-hover:translate-x-0.5"
                style={{ color: P.brand }}
              >
                Kies {title.toLowerCase()} <ChevronRight size={15} />
              </span>
            </button>
          ))}
        </div>
        <div className="mt-6">
          <DarkButton variant="ghost" size="sm" onClick={onClose}>
            Annuleren
          </DarkButton>
        </div>
      </div>
    )
  }

  const previewSlug = editor.slug.trim() || slugify(editor.name) || 'nieuw-product'
  const priceCents = eurosToCents(editor.priceEuros)

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] items-start">
      {/* ── Linker kolom: stappen ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: P.lineStrong, background: P.surface }}
      >
        {/* Stappen-navigatie */}
        <div
          className="flex items-center gap-1 border-b px-4 py-3 overflow-x-auto"
          style={{ borderColor: P.line, background: P.surfaceLow }}
        >
          <span
            className="mr-2 hidden sm:inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shrink-0"
            style={{ background: P.surfaceHi, color: P.brand }}
          >
            {KIND_LABELS[editor.kind]}
          </span>
          {STEPS.map((title, i) => {
            const n = i + 1
            const active = step === n
            const reachable = n <= maxVisited || !isNew
            return (
              <button
                key={title}
                type="button"
                disabled={!reachable}
                onClick={() => reachable && goTo(n)}
                className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors shrink-0 disabled:opacity-40"
                style={{
                  background: active ? P.surfaceHi : 'transparent',
                  color: active ? P.ink : P.inkMuted,
                }}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{
                    background: active ? P.brand : P.surfaceHi,
                    color: active ? P.bg : P.inkMuted,
                  }}
                >
                  {n}
                </span>
                {title}
              </button>
            )
          })}
        </div>

        <div className="p-6 space-y-5">
          {/* ── Stap 1: Inhoud ── */}
          {step === 1 && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Naam">
                  <DarkInput
                    value={editor.name}
                    onChange={(e) => {
                      const name = e.target.value
                      // Slug automatisch meelopen zolang 'ie nog niet handmatig is gezet.
                      const autoSlug =
                        !editor.id && (editor.slug === '' || editor.slug === slugify(editor.name))
                      setEditor((prev) => ({
                        ...prev,
                        name,
                        slug: autoSlug ? slugify(name) : prev.slug,
                      }))
                    }}
                    placeholder="Blessurevrij hardlopen"
                  />
                </Field>
                <Field label="Slug (URL)" hint={`Wordt /programma/${previewSlug}`}>
                  <DarkInput
                    value={editor.slug}
                    onChange={(e) => set('slug', e.target.value)}
                    placeholder="blessurevrij-hardlopen"
                  />
                </Field>
              </div>

              <Field label="Tagline" hint="Eén zin die onder de naam op de kaart verschijnt.">
                <DarkInput
                  value={editor.tagline}
                  onChange={(e) => set('tagline', e.target.value)}
                  placeholder="Sterke knieën, minder blessures, in 8 weken"
                />
              </Field>

              <Field label="Omschrijving">
                <DarkTextarea
                  value={editor.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Wat krijgt de koper, voor wie is het, wat is de opbouw…"
                  style={{ minHeight: 120 }}
                />
              </Field>

              {editor.kind === 'PROGRAM' && (
                <>
                  <Field
                    label="Gekoppeld schema (Program-template)"
                    hint="Dit schema krijgt de koper na betaling. Zonder koppeling kun je niet publiceren."
                  >
                    <DarkSelect
                      value={editor.programId}
                      onChange={(e) => {
                        const programId = e.target.value
                        const program = programs.find((p) => p.id === programId)
                        setEditor((prev) => ({
                          ...prev,
                          programId,
                          // Duur en naam voorinvullen vanuit het template (alleen als nog leeg).
                          durationWeeks:
                            prev.durationWeeks || !program ? prev.durationWeeks : String(program.weeks),
                          name: prev.name || !program ? prev.name : program.name,
                          slug: prev.slug || !program ? prev.slug : slugify(program.name),
                        }))
                      }}
                    >
                      <option value="">— Geen schema gekoppeld —</option>
                      {programs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.weeks} wk · {p.daysPerWeek}×/wk)
                        </option>
                      ))}
                    </DarkSelect>
                  </Field>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Niveau">
                      <DarkSelect
                        value={editor.level}
                        onChange={(e) => set('level', e.target.value as Level)}
                      >
                        <option value="">— Geen —</option>
                        {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </DarkSelect>
                    </Field>
                    <Field label="Duur (weken)">
                      <DarkInput
                        type="number"
                        value={editor.durationWeeks}
                        onChange={(e) => set('durationWeeks', e.target.value)}
                        placeholder="8"
                      />
                    </Field>
                  </div>

                  <Field label="Lichaamsregio's">
                    <div className="flex flex-wrap gap-2">
                      {BODY_REGION_OPTIONS.map((r) => (
                        <TogglePill
                          key={r}
                          size="sm"
                          active={editor.bodyRegion.includes(r)}
                          onClick={() =>
                            set(
                              'bodyRegion',
                              editor.bodyRegion.includes(r)
                                ? editor.bodyRegion.filter((x) => x !== r)
                                : [...editor.bodyRegion, r],
                            )
                          }
                        >
                          {BODY_REGION_LABELS[r]}
                        </TogglePill>
                      ))}
                    </div>
                  </Field>

                  <Field
                    label="Intake-tags"
                    hint="Komma-gescheiden. De AI-intake gebruikt deze tags om bezoekers naar dit programma te matchen."
                  >
                    <DarkInput
                      value={editor.intakeTags}
                      onChange={(e) => set('intakeTags', e.target.value)}
                      placeholder="hardlopen, knie, beginner, blessurepreventie"
                    />
                  </Field>
                </>
              )}

              {editor.kind === 'PHYSICAL' && (
                <>
                  <div className="grid gap-5 sm:grid-cols-3">
                    <Field label="SKU (artikelnummer)">
                      <DarkInput
                        value={editor.sku}
                        onChange={(e) => set('sku', e.target.value)}
                        placeholder="MBT-BAND-LICHT"
                      />
                    </Field>
                    <Field label="Voorraad" hint="Leeg = niet bijgehouden">
                      <DarkInput
                        type="number"
                        value={editor.stockQty}
                        onChange={(e) => set('stockQty', e.target.value)}
                        placeholder="25"
                      />
                    </Field>
                    <Field label="Gewicht (gram)">
                      <DarkInput
                        type="number"
                        value={editor.weightGrams}
                        onChange={(e) => set('weightGrams', e.target.value)}
                        placeholder="250"
                      />
                    </Field>
                  </div>

                  <button
                    type="button"
                    onClick={() => set('requiresShipping', !editor.requiresShipping)}
                    className="flex items-center gap-3 text-sm font-medium"
                    style={{ color: P.ink }}
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold transition-colors"
                      style={{
                        background: editor.requiresShipping ? P.brand : P.surfaceHi,
                        color: editor.requiresShipping ? P.bg : 'transparent',
                        border: `1px solid ${editor.requiresShipping ? P.brand : P.line}`,
                      }}
                    >
                      ✓
                    </span>
                    Wordt verzonden (vraagt om een verzendadres bij het afrekenen)
                  </button>
                </>
              )}

              {editor.kind === 'SERVICE' && (
                <Field
                  label="Boekingslink"
                  hint="Bijvoorbeeld de Verne Health afspraakplanner. Zonder link rekent de koper af via iDEAL."
                >
                  <DarkInput
                    value={editor.bookingUrl}
                    onChange={(e) => set('bookingUrl', e.target.value)}
                    placeholder="https://app.verne.health/embed-appointment-maker/…"
                  />
                </Field>
              )}
            </>
          )}

          {/* ── Stap 2: Presentatie ── */}
          {step === 2 && (
            <>
              <Field
                label="Verkooppunten (één per regel)"
                hint="Verschijnen als vinkjes op de productpagina."
              >
                <DarkTextarea
                  value={editor.highlights}
                  onChange={(e) => set('highlights', e.target.value)}
                  placeholder={'8 weken progressieve opbouw\nVideo bij elke oefening\nGeschikt voor thuis of gym'}
                  style={{ minHeight: 110 }}
                />
              </Field>

              <Field
                label="Hero-afbeelding URL"
                hint="Leeg laten kan: dan krijgt het product een on-brand gradient (zie preview)."
              >
                <DarkInput
                  value={editor.heroImageUrl}
                  onChange={(e) => set('heroImageUrl', e.target.value)}
                  placeholder="https://…"
                />
              </Field>

              <Field
                label="Preview-video URL"
                hint="Niet-vermelde YouTube-link; wordt als video op de productpagina getoond."
              >
                <DarkInput
                  value={editor.previewVideoUrl}
                  onChange={(e) => set('previewVideoUrl', e.target.value)}
                  placeholder="https://youtu.be/…"
                />
              </Field>
            </>
          )}

          {/* ── Stap 3: Prijs & publicatie ── */}
          {step === 3 && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Prijs (€, incl. btw)">
                  <DarkInput
                    inputMode="decimal"
                    value={editor.priceEuros}
                    onChange={(e) => set('priceEuros', e.target.value)}
                    placeholder="34.95"
                  />
                </Field>
                <Field label="Btw %">
                  <DarkInput
                    type="number"
                    value={editor.vatRate}
                    onChange={(e) => set('vatRate', Number(e.target.value))}
                  />
                </Field>
              </div>

              {priceCents > 0 && (
                <p className="text-xs" style={{ color: P.inkDim }}>
                  {formatPriceCents(priceCents)} incl. btw ·{' '}
                  {formatPriceCents(Math.round(priceCents / (1 + editor.vatRate / 100)))} excl. btw
                </p>
              )}

              <Field
                label="Therapeut (krijgt de omzet toegerekend)"
                hint="Basis voor de omzetverdeling in Verkoop & omzet."
              >
                <DarkSelect
                  value={editor.therapistId}
                  onChange={(e) => set('therapistId', e.target.value)}
                >
                  <option value="">— Geen therapeut —</option>
                  {therapists.map((t) => {
                    const label =
                      t.name || [t.firstName, t.lastName].filter(Boolean).join(' ') || t.id
                    return (
                      <option key={t.id} value={t.id}>
                        {label}
                      </option>
                    )
                  })}
                </DarkSelect>
              </Field>

              <Field label="Sorteervolgorde" hint="Lager = eerder in de shop.">
                <DarkInput
                  type="number"
                  value={editor.sortOrder}
                  onChange={(e) => set('sortOrder', Number(e.target.value))}
                />
              </Field>

              <Field label="Zichtbaarheid">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                    <TogglePill key={s} active={editor.status === s} onClick={() => set('status', s)}>
                      {STATUS_LABELS[s]}
                    </TogglePill>
                  ))}
                </div>
              </Field>

              {publishBlocked && (
                <p className="text-sm font-medium" style={{ color: P.brand }}>
                  Publiceren kan nog niet: vink eerst de verplichte punten in de checklist af.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t px-6 py-4"
          style={{ borderColor: P.line }}
        >
          <div className="flex gap-3">
            <DarkButton variant="ghost" size="sm" onClick={onClose}>
              Annuleren
            </DarkButton>
            {editor.id && step === 3 && (
              <DarkButton
                variant="danger"
                size="sm"
                onClick={() => remove.mutate({ id: editor.id! })}
                loading={remove.isPending}
              >
                Verwijderen
              </DarkButton>
            )}
          </div>
          <div className="flex gap-3">
            {step > 1 && (
              <DarkButton variant="secondary" size="sm" onClick={() => goTo(step - 1)}>
                <ChevronLeft size={15} /> Vorige
              </DarkButton>
            )}
            {step < 3 ? (
              <DarkButton size="sm" onClick={next}>
                Volgende <ChevronRight size={15} />
              </DarkButton>
            ) : editor.status === 'DRAFT' && isNew ? (
              <>
                <DarkButton
                  variant="secondary"
                  size="sm"
                  onClick={() => save('DRAFT')}
                  loading={upsert.isPending}
                >
                  Opslaan als concept
                </DarkButton>
                <DarkButton
                  size="sm"
                  onClick={() => save('PUBLISHED')}
                  disabled={!requiredOk}
                  loading={upsert.isPending}
                >
                  Publiceren
                </DarkButton>
              </>
            ) : (
              <DarkButton
                size="sm"
                onClick={() => save()}
                disabled={publishBlocked}
                loading={upsert.isPending}
              >
                Opslaan
              </DarkButton>
            )}
          </div>
        </div>
      </div>

      {/* ── Rechter kolom: live preview + checklist ── */}
      <div className="space-y-4 lg:sticky lg:top-6">
        <div>
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-wide"
            style={{ color: P.inkMuted }}
          >
            Zo staat &apos;ie straks in de shop
          </p>
          <div
            className="rounded-2xl overflow-hidden border transition-all"
            style={{ borderColor: P.line, background: P.surface }}
          >
            <div
              className="aspect-[16/10] relative"
              style={{
                background: editor.heroImageUrl.trim()
                  ? `center / cover no-repeat url(${editor.heroImageUrl.trim()})`
                  : heroGradient(previewSlug),
              }}
            >
              {!editor.heroImageUrl.trim() && (
                <span
                  className="absolute bottom-3 left-4 text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: 'rgba(255,255,255,0.42)' }}
                >
                  MBT·Gym
                </span>
              )}
            </div>
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {editor.kind !== 'PROGRAM' && (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: P.surfaceHi, color: P.inkMuted, border: `1px solid ${P.line}` }}
                  >
                    {KIND_LABELS[editor.kind]}
                  </span>
                )}
                {editor.level && (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: P.surfaceHi, color: P.inkMuted, border: `1px solid ${P.line}` }}
                  >
                    {LEVEL_LABELS[editor.level]}
                  </span>
                )}
                {editor.durationWeeks && (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: P.surfaceHi, color: P.inkMuted, border: `1px solid ${P.line}` }}
                  >
                    {editor.durationWeeks} weken
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-lg leading-snug" style={{ color: P.ink }}>
                {editor.name.trim() || 'Naam van je product'}
              </h3>
              <p className="mt-1 text-sm" style={{ color: P.inkMuted }}>
                {editor.tagline.trim() || 'Tagline verschijnt hier'}
              </p>
              <div
                className="mt-4 pt-4 border-t flex items-center justify-between"
                style={{ borderColor: P.line }}
              >
                <span className="font-bold" style={{ color: P.ink }}>
                  {priceCents > 0 ? formatPriceCents(priceCents) : '€ —'}
                </span>
                <span className="text-sm font-medium" style={{ color: P.brand }}>
                  Bekijk →
                </span>
              </div>
            </div>
          </div>
          {editor.id && (
            <a
              href={`/programma/${editor.slug}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:text-white"
              style={{ color: P.inkMuted }}
            >
              <ExternalLink size={13} /> Open productpagina in nieuw tabblad
            </a>
          )}
        </div>

        {/* Publicatie-checklist */}
        <div
          className="rounded-2xl border p-5"
          style={{ borderColor: P.line, background: P.surface }}
        >
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-wide"
            style={{ color: P.inkMuted }}
          >
            Klaar om te publiceren?
          </p>
          <ul className="space-y-2.5">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-2.5 text-sm">
                {c.ok ? (
                  <span
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                    style={{ background: P.brand, color: P.bg }}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : (
                  <Circle
                    size={18}
                    className="shrink-0"
                    style={{ color: c.required ? P.brand : P.inkDim }}
                  />
                )}
                <span style={{ color: c.ok ? P.ink : P.inkMuted }}>
                  {c.label}
                  {!c.required && !c.ok && (
                    <span className="ml-1.5 text-xs" style={{ color: P.inkDim }}>
                      aanbevolen
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
