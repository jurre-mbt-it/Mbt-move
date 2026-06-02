/**
 * Admin product-bouwer voor de consumenten-shop.
 * Alleen bereikbaar voor role = ADMIN (gated via (admin)/layout).
 *
 * Hier koppel je een Program-template aan een verkoopbaar product, zet je
 * prijs/teksten en publiceer je het. De storefront (/shop) toont alleen
 * PUBLISHED-producten; concepten blijven verborgen.
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkInput,
  DarkSelect,
  DarkTextarea,
  Kicker,
  Display,
  P,
} from '@/components/dark-ui'
import { centsToEuros, eurosToCents, formatPriceCents } from '@/lib/shop/format'
import {
  BODY_REGION_LABELS,
  BODY_REGION_OPTIONS,
  KIND_LABELS,
  KIND_OPTIONS,
  LEVEL_LABELS,
  STATUS_LABELS,
} from '@/lib/shop/labels'

type Status = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
type Kind = 'PROGRAM' | 'PHYSICAL' | 'SERVICE'
type Level = '' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'

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
  // PHYSICAL (artikel)
  sku: string
  stockQty: string // leeg = voorraad niet bijgehouden
  requiresShipping: boolean
  weightGrams: string
  // SERVICE (dienst)
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

const STATUS_COLOR: Record<Status, string> = {
  DRAFT: P.inkMuted,
  PUBLISHED: P.brand,
  ARCHIVED: P.inkDim,
}

export default function AdminShopPage() {
  const utils = trpc.useUtils()
  const { data: products = [], isLoading } = trpc.shop.adminList.useQuery()
  const { data: programs = [] } = trpc.shop.adminListPrograms.useQuery()
  const { data: therapists = [] } = trpc.shop.adminListTherapists.useQuery()

  const [editor, setEditor] = useState<Editor | null>(null)

  const upsert = trpc.shop.adminUpsert.useMutation({
    onSuccess: () => {
      utils.shop.adminList.invalidate()
      toast.success('Product opgeslagen')
      setEditor(null)
    },
    onError: (e) => toast.error(e.message),
  })
  const remove = trpc.shop.adminDelete.useMutation({
    onSuccess: () => {
      utils.shop.adminList.invalidate()
      toast.success('Product verwijderd')
      setEditor(null)
    },
    onError: (e) => toast.error(e.message),
  })

  function startNew() {
    setEditor({ ...EMPTY })
  }

  function startEdit(p: (typeof products)[number]) {
    setEditor({
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
    })
  }

  function save() {
    if (!editor) return
    if (!editor.name.trim()) return toast.error('Naam is verplicht')
    const slug = editor.slug.trim() || slugify(editor.name)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return toast.error('Slug mag alleen kleine letters, cijfers en koppeltekens bevatten')
    }
    const priceCents = eurosToCents(editor.priceEuros)
    if (priceCents <= 0) return toast.error('Vul een geldige prijs in')

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
      status: editor.status,
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
      weightGrams: isPhysical && editor.weightGrams ? Number.parseInt(editor.weightGrams, 10) : null,
      // Dienst-veld alleen bij een SERVICE.
      bookingUrl: isService ? editor.bookingUrl.trim() || null : null,
      sortOrder: editor.sortOrder,
    })
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <Kicker>Shop</Kicker>
          <Display>Producten</Display>
        </div>
        <div className="flex gap-3">
          <DarkButton href="/admin/shop/verkopen" variant="secondary" size="sm">
            Verkoop &amp; omzet
          </DarkButton>
          <DarkButton href="/shop" variant="secondary" size="sm">
            Bekijk storefront
          </DarkButton>
          {!editor && (
            <DarkButton onClick={startNew} size="sm">
              + Nieuw product
            </DarkButton>
          )}
        </div>
      </div>

      {editor ? (
        <ProductEditor
          editor={editor}
          setEditor={setEditor}
          programs={programs}
          therapists={therapists}
          onSave={save}
          onCancel={() => setEditor(null)}
          onDelete={
            editor.id ? () => remove.mutate({ id: editor.id! }) : undefined
          }
          saving={upsert.isPending}
        />
      ) : isLoading ? (
        <p style={{ color: P.inkMuted }}>Laden…</p>
      ) : products.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-12 text-center"
          style={{ borderColor: P.lineStrong, color: P.inkMuted }}
        >
          <p className="font-medium">Nog geen producten.</p>
          <p className="mt-1 text-sm" style={{ color: P.inkDim }}>
            Maak je eerste product en koppel het aan een van je schema-templates.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border p-4 flex items-center gap-4"
              style={{ borderColor: P.line, background: P.surface }}
            >
              <div
                className="h-12 w-12 shrink-0 rounded-lg"
                style={{
                  background: p.heroImageUrl
                    ? `center / cover no-repeat url(${p.heroImageUrl})`
                    : P.surfaceHi,
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{p.name}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: STATUS_COLOR[p.status as Status], background: P.surfaceHi }}
                  >
                    {STATUS_LABELS[p.status]}
                  </span>
                </div>
                <div className="text-xs mt-0.5 truncate" style={{ color: P.inkDim }}>
                  /{p.slug} · {KIND_LABELS[p.kind]}
                  {p.kind === 'PROGRAM'
                    ? p.program
                      ? ` · ${p.program.name}`
                      : ' · geen schema gekoppeld'
                    : ''}
                  {p.therapist
                    ? ` · ${p.therapist.name || [p.therapist.firstName, p.therapist.lastName].filter(Boolean).join(' ')}`
                    : ''}
                </div>
              </div>
              <span className="font-bold shrink-0">
                {formatPriceCents(p.priceCents, p.currency)}
              </span>
              <div className="flex gap-2 shrink-0">
                <Link
                  href={`/programma/${p.slug}`}
                  className="text-sm hover:text-white transition-colors"
                  style={{ color: P.inkMuted }}
                >
                  Preview
                </Link>
                <button
                  onClick={() => startEdit(p)}
                  className="text-sm font-medium"
                  style={{ color: P.brand }}
                >
                  Bewerk
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide"
        style={{ color: P.inkMuted }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

function ProductEditor({
  editor,
  setEditor,
  programs,
  therapists,
  onSave,
  onCancel,
  onDelete,
  saving,
}: {
  editor: Editor
  setEditor: (e: Editor) => void
  programs: Array<{ id: string; name: string; weeks: number; daysPerWeek: number }>
  therapists: Array<{ id: string; name: string | null; firstName: string | null; lastName: string | null }>
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
  saving: boolean
}) {
  const set = <K extends keyof Editor>(key: K, value: Editor[K]) =>
    setEditor({ ...editor, [key]: value })

  function toggleRegion(r: string) {
    set(
      'bodyRegion',
      editor.bodyRegion.includes(r)
        ? editor.bodyRegion.filter((x) => x !== r)
        : [...editor.bodyRegion, r],
    )
  }

  return (
    <div
      className="rounded-2xl border p-6 space-y-5"
      style={{ borderColor: P.lineStrong, background: P.surface }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Naam">
          <DarkInput
            value={editor.name}
            onChange={(e) => {
              const name = e.target.value
              // Slug automatisch meelopen zolang 'ie nog niet handmatig is gezet.
              const autoSlug = !editor.id && (editor.slug === '' || editor.slug === slugify(editor.name))
              setEditor({ ...editor, name, slug: autoSlug ? slugify(name) : editor.slug })
            }}
            placeholder="Blessurevrij hardlopen"
          />
        </Field>
        <Field label="Slug (URL)">
          <DarkInput
            value={editor.slug}
            onChange={(e) => set('slug', e.target.value)}
            placeholder="blessurevrij-hardlopen"
          />
        </Field>
      </div>

      <Field label="Soort">
        <div className="flex flex-wrap gap-2">
          {KIND_OPTIONS.map((k) => {
            const active = editor.kind === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => set('kind', k)}
                className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
                style={{
                  background: active ? P.brand : P.surfaceHi,
                  color: active ? P.bg : P.inkMuted,
                  border: `1px solid ${active ? P.brand : P.line}`,
                }}
              >
                {KIND_LABELS[k]}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Tagline">
        <DarkInput
          value={editor.tagline}
          onChange={(e) => set('tagline', e.target.value)}
          placeholder="Sterke knieën, minder blessures — in 8 weken"
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
        <Field label="Gekoppeld schema (Program-template)">
          <DarkSelect
            value={editor.programId}
            onChange={(e) => set('programId', e.target.value)}
          >
            <option value="">— Geen schema gekoppeld —</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.weeks} wk · {p.daysPerWeek}×/wk)
              </option>
            ))}
          </DarkSelect>
        </Field>
      )}

      <Field label="Therapeut (krijgt de omzet toegerekend)">
        <DarkSelect value={editor.therapistId} onChange={(e) => set('therapistId', e.target.value)}>
          <option value="">— Geen therapeut —</option>
          {therapists.map((t) => {
            const label = t.name || [t.firstName, t.lastName].filter(Boolean).join(' ') || t.id
            return (
              <option key={t.id} value={t.id}>
                {label}
              </option>
            )
          })}
        </DarkSelect>
      </Field>

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

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Status">
          <DarkSelect
            value={editor.status}
            onChange={(e) => set('status', e.target.value as Status)}
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </DarkSelect>
        </Field>
        <Field label="Sorteervolgorde">
          <DarkInput
            type="number"
            value={editor.sortOrder}
            onChange={(e) => set('sortOrder', Number(e.target.value))}
          />
        </Field>
      </div>

      {/* Schema-specifiek (PROGRAM) */}
      {editor.kind === 'PROGRAM' && (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Niveau">
              <DarkSelect value={editor.level} onChange={(e) => set('level', e.target.value as Level)}>
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
              {BODY_REGION_OPTIONS.map((r) => {
                const active = editor.bodyRegion.includes(r)
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRegion(r)}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      background: active ? P.brand : P.surfaceHi,
                      color: active ? P.bg : P.inkMuted,
                      border: `1px solid ${active ? P.brand : P.line}`,
                    }}
                  >
                    {BODY_REGION_LABELS[r]}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Intake-tags (komma-gescheiden — voor de AI-matcher)">
            <DarkInput
              value={editor.intakeTags}
              onChange={(e) => set('intakeTags', e.target.value)}
              placeholder="hardlopen, knie, beginner, blessurepreventie"
            />
          </Field>
        </>
      )}

      {/* Artikel-specifiek (PHYSICAL) */}
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
            <Field label="Voorraad (leeg = niet bijgehouden)">
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
              className="flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold"
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

      {/* Dienst-specifiek (SERVICE) */}
      {editor.kind === 'SERVICE' && (
        <Field label="Boekingslink (bv. Verne Health afspraakplanner)">
          <DarkInput
            value={editor.bookingUrl}
            onChange={(e) => set('bookingUrl', e.target.value)}
            placeholder="https://app.verne.health/embed-appointment-maker/…"
          />
        </Field>
      )}

      <Field label="Verkooppunten (één per regel)">
        <DarkTextarea
          value={editor.highlights}
          onChange={(e) => set('highlights', e.target.value)}
          placeholder={'8 weken progressieve opbouw\nVideo bij elke oefening\nGeschikt voor thuis of gym'}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Hero-afbeelding URL">
          <DarkInput
            value={editor.heroImageUrl}
            onChange={(e) => set('heroImageUrl', e.target.value)}
            placeholder="https://…"
          />
        </Field>
        <Field label="Preview-video URL">
          <DarkInput
            value={editor.previewVideoUrl}
            onChange={(e) => set('previewVideoUrl', e.target.value)}
            placeholder="https://… (niet-vermelde YouTube of Mux)"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div>
          {onDelete && (
            <DarkButton variant="danger" size="sm" onClick={onDelete}>
              Verwijderen
            </DarkButton>
          )}
        </div>
        <div className="flex gap-3">
          <DarkButton variant="ghost" size="sm" onClick={onCancel}>
            Annuleren
          </DarkButton>
          <DarkButton onClick={onSave} loading={saving}>
            Opslaan
          </DarkButton>
        </div>
      </div>
    </div>
  )
}
