'use client'

import { useMemo, useRef, useState } from 'react'
import {
  DarkButton,
  DarkInput,
  DarkTextarea,
  DarkSelect,
  DarkDialog,
  DarkDialogContent,
  DarkDialogHeader,
  DarkDialogTitle,
  DarkDialogFooter,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import { trpc } from '@/lib/trpc/client'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, Upload, Trash2, Pencil, FileText, Video, ExternalLink } from 'lucide-react'

const BODY_REGIONS = [
  'KNEE', 'SHOULDER', 'BACK', 'ANKLE', 'HIP', 'FULL_BODY',
  'CERVICAL', 'THORACIC', 'LUMBAR', 'ELBOW', 'WRIST', 'FOOT',
] as const
type BodyRegion = (typeof BODY_REGIONS)[number]

type FormState = {
  id?: string
  title: string
  description: string
  format: 'VIDEO' | 'PDF'
  videoUrl: string
  filePath: string
  fileName: string
  thumbnailUrl: string
  specialty: string
  bodyRegion: BodyRegion[]
  tags: string
  isActive: boolean
  order: number
}

const EMPTY_FORM: FormState = {
  title: '', description: '', format: 'PDF', videoUrl: '', filePath: '',
  fileName: '', thumbnailUrl: '', specialty: '', bodyRegion: [], tags: '',
  isActive: true, order: 0,
}

export default function AdminEducationPage() {
  const utils = trpc.useUtils()
  const { data: resources, isLoading } = trpc.education.adminList.useQuery()
  const { data: specialties } = trpc.education.protocolSpecialties.useQuery()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const upsert = trpc.education.adminUpsert.useMutation({
    onSuccess: async () => {
      await utils.education.adminList.invalidate()
      toast.success('Opgeslagen')
      setOpen(false)
      setForm(EMPTY_FORM)
    },
    onError: (err) => toast.error(err.message ?? 'Opslaan mislukt'),
  })
  const del = trpc.education.adminDelete.useMutation({
    onSuccess: async () => {
      await utils.education.adminList.invalidate()
      toast.success('Verwijderd')
    },
    onError: (err) => toast.error(err.message ?? 'Verwijderen mislukt'),
  })

  function openNew() {
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  function openEdit(r: NonNullable<typeof resources>[number]) {
    setForm({
      id: r.id,
      title: r.title,
      description: r.description ?? '',
      format: r.format,
      videoUrl: r.videoUrl ?? '',
      filePath: r.filePath ?? '',
      fileName: r.filePath ? r.filePath.split('/').pop() ?? 'document.pdf' : '',
      thumbnailUrl: r.thumbnailUrl ?? '',
      specialty: r.specialty ?? '',
      bodyRegion: (r.bodyRegion as BodyRegion[]) ?? [],
      tags: (r.tags ?? []).join(', '),
      isActive: r.isActive,
      order: r.order,
    })
    setOpen(true)
  }

  async function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      toast.error('Alleen PDF-bestanden')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error('PDF is groter dan 25 MB')
      return
    }
    setUploading(true)
    try {
      const supabase = createClient()
      // Uniek pad; originele naam bewaren we als titel/fileName, niet in't pad.
      const path = `pdf/${crypto.randomUUID()}.pdf`
      const { error } = await supabase.storage
        .from('educational-resources')
        .upload(path, file, { upsert: false, contentType: 'application/pdf' })
      if (error) throw error
      setForm((f) => ({ ...f, filePath: path, fileName: file.name }))
      toast.success('PDF geüpload')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload mislukt')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function toggleRegion(region: BodyRegion) {
    setForm((f) => ({
      ...f,
      bodyRegion: f.bodyRegion.includes(region)
        ? f.bodyRegion.filter((r) => r !== region)
        : [...f.bodyRegion, region],
    }))
  }

  function handleSave() {
    if (!form.title.trim()) {
      toast.error('Titel is verplicht')
      return
    }
    if (form.format === 'VIDEO' && !form.videoUrl.trim()) {
      toast.error('Video-URL is verplicht')
      return
    }
    if (form.format === 'PDF' && !form.filePath) {
      toast.error('Upload eerst een PDF')
      return
    }
    upsert.mutate({
      id: form.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      format: form.format,
      videoUrl: form.format === 'VIDEO' ? form.videoUrl.trim() : null,
      filePath: form.format === 'PDF' ? form.filePath : null,
      thumbnailUrl: form.thumbnailUrl.trim() || null,
      specialty: form.specialty.trim() || null,
      bodyRegion: form.bodyRegion,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      isActive: form.isActive,
      order: form.order,
    })
  }

  // Groepeer op specialty voor een overzichtelijke lijst.
  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof resources>>()
    for (const r of resources ?? []) {
      const key = r.specialty ?? '__algemeen__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return [...map.entries()]
  }, [resources])

  return (
    <div className="max-w-4xl w-full flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <Kicker>Content</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
          >
            EDUCATIE
          </h1>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            Video&apos;s en PDF-documenten die patiënten in hun rehab-traject zien
          </MetaLabel>
        </div>
        <DarkButton variant="primary" onClick={openNew}>
          <Plus className="w-4 h-4" /> Nieuw
        </DarkButton>
      </div>

      {isLoading ? (
        <p style={{ color: P.inkMuted }}>Laden…</p>
      ) : (resources?.length ?? 0) === 0 ? (
        <Tile>
          <MetaLabel>Nog geen content</MetaLabel>
          <p className="mt-2 text-sm" style={{ color: P.inkMuted }}>
            Voeg de eerste educatie-resource toe met &quot;Nieuw&quot;.
          </p>
        </Tile>
      ) : (
        grouped.map(([key, items]) => (
          <div key={key} className="flex flex-col gap-2">
            <MetaLabel>
              {key === '__algemeen__' ? 'Algemeen (alle patiënten)' : key}
            </MetaLabel>
            {items.map((r) => (
              <Tile key={r.id}>
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center rounded-lg shrink-0"
                    style={{ width: 36, height: 36, background: P.surface }}
                  >
                    {r.format === 'PDF'
                      ? <FileText className="w-4 h-4" style={{ color: P.inkMuted }} />
                      : <Video className="w-4 h-4" style={{ color: P.inkMuted }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
                      {r.title}
                      {!r.isActive && (
                        <span style={{ color: P.inkDim, fontSize: 11, marginLeft: 8, fontWeight: 500 }}>
                          (verborgen)
                        </span>
                      )}
                    </p>
                    {r.description && (
                      <p className="truncate" style={{ color: P.inkMuted, fontSize: 12 }}>
                        {r.description}
                      </p>
                    )}
                  </div>
                  {(r.fileUrl || r.videoUrl) && (
                    <a
                      href={r.fileUrl ?? r.videoUrl ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg shrink-0"
                      style={{ color: P.inkMuted }}
                      aria-label="Openen"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    className="p-2 rounded-lg shrink-0"
                    style={{ color: P.inkMuted }}
                    aria-label="Bewerken"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`"${r.title}" verwijderen?`)) del.mutate({ id: r.id })
                    }}
                    className="p-2 rounded-lg shrink-0"
                    style={{ color: P.danger ?? '#F0796C' }}
                    aria-label="Verwijderen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Tile>
            ))}
          </div>
        ))
      )}

      {/* ── Aanmaken / bewerken dialog ── */}
      <DarkDialog open={open} onOpenChange={setOpen}>
        <DarkDialogContent>
          <DarkDialogHeader>
            <DarkDialogTitle>{form.id ? 'Content bewerken' : 'Nieuwe content'}</DarkDialogTitle>
          </DarkDialogHeader>

          <div className="flex flex-col gap-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <Field label="Titel *">
              <DarkInput
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Het ACL-traject: wat je kunt verwachten"
              />
            </Field>
            <Field label="Omschrijving">
              <DarkTextarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Korte uitleg voor de patiënt"
              />
            </Field>

            <Field label="Type">
              <DarkSelect
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value as 'VIDEO' | 'PDF' })}
              >
                <option value="PDF">PDF-document</option>
                <option value="VIDEO">Video</option>
              </DarkSelect>
            </Field>

            {form.format === 'VIDEO' ? (
              <>
                <Field label="Video-URL *">
                  <DarkInput
                    type="url"
                    value={form.videoUrl}
                    onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                    placeholder="https://youtube.com/… of https://vimeo.com/…"
                  />
                </Field>
                <Field label="Thumbnail-URL (optioneel)">
                  <DarkInput
                    type="url"
                    value={form.thumbnailUrl}
                    onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
              </>
            ) : (
              <Field label="PDF-bestand *">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handlePdfSelect}
                  disabled={uploading}
                />
                <div className="flex items-center gap-2">
                  <DarkButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? 'Uploaden…' : form.filePath ? 'Vervang PDF' : 'Upload PDF'}
                  </DarkButton>
                  {form.fileName && (
                    <span className="truncate text-xs" style={{ color: P.inkMuted }}>
                      {form.fileName}
                    </span>
                  )}
                </div>
                <span className="text-[11px] mt-1 inline-block" style={{ color: P.inkMuted }}>
                  Alleen PDF · max 25 MB
                </span>
              </Field>
            )}

            <Field label="Koppel aan traject">
              <DarkSelect
                value={form.specialty}
                onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              >
                <option value="">Algemeen (alle patiënten)</option>
                {(specialties ?? []).map((s) => (
                  <option key={s.specialty} value={s.specialty}>
                    {s.specialty}, bv. {s.exampleName}
                  </option>
                ))}
              </DarkSelect>
            </Field>

            <Field label="Lichaamsregio (optioneel)">
              <div className="flex flex-wrap gap-1.5">
                {BODY_REGIONS.map((region) => {
                  const active = form.bodyRegion.includes(region)
                  return (
                    <button
                      key={region}
                      type="button"
                      onClick={() => toggleRegion(region)}
                      className="athletic-mono rounded-full px-2.5 py-1"
                      style={{
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        fontWeight: 700,
                        background: active ? `color-mix(in srgb, ${P.lime} 13%, transparent)` : P.surface,
                        color: active ? P.lime : P.inkMuted,
                        border: `1px solid ${active ? P.lime : 'transparent'}`,
                      }}
                    >
                      {region}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field label="Tags (komma-gescheiden)">
              <DarkInput
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="pre-operatief, uitleg, herstel"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Volgorde">
                <DarkInput
                  type="number"
                  min={0}
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Zichtbaar">
                <DarkSelect
                  value={form.isActive ? '1' : '0'}
                  onChange={(e) => setForm({ ...form, isActive: e.target.value === '1' })}
                >
                  <option value="1">Zichtbaar voor patiënten</option>
                  <option value="0">Verborgen (concept)</option>
                </DarkSelect>
              </Field>
            </div>
          </div>

          <DarkDialogFooter>
            <DarkButton type="button" variant="secondary" onClick={() => setOpen(false)}>
              Annuleren
            </DarkButton>
            <DarkButton
              type="button"
              variant="primary"
              disabled={upsert.isPending || uploading}
              onClick={handleSave}
            >
              {upsert.isPending ? 'Opslaan…' : 'Opslaan'}
            </DarkButton>
          </DarkDialogFooter>
        </DarkDialogContent>
      </DarkDialog>
    </div>
  )
}

function Field({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="athletic-mono"
        style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}
