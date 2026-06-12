'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { DarkButton, DarkInput, DarkTextarea, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'
import { trpc } from '@/lib/trpc/client'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Building2, Upload, Trash2, Smartphone, Monitor, Info } from 'lucide-react'
import { IconWarning } from '@/components/icons'

type PracticeForm = {
  name: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  city: string
  country: string
  phone: string
  email: string
  website: string
  agbCodePractice: string
  privacyDisclaimer: string
  logoUrl: string
}

const EMPTY_FORM: PracticeForm = {
  name: '', addressLine1: '', addressLine2: '', postalCode: '', city: '',
  country: 'Nederland', phone: '', email: '', website: '',
  agbCodePractice: '', privacyDisclaimer: '', logoUrl: '',
}

export default function PracticeSettingsPage() {
  const utils = trpc.useUtils()
  const { data: me } = trpc.auth.getMe.useQuery()
  const { data: practice, isLoading } = trpc.practice.getMine.useQuery()
  const updateMutation = trpc.practice.update.useMutation({
    onSuccess: async () => {
      await utils.practice.getMine.invalidate()
      toast.success('Praktijkgegevens opgeslagen')
    },
    onError: (err) => toast.error(err.message ?? 'Opslaan mislukt'),
  })
  const removeLogoMutation = trpc.practice.removeLogo.useMutation({
    onSuccess: async () => {
      await utils.practice.getMine.invalidate()
      setForm(f => ({ ...f, logoUrl: '' }))
      toast.success('Logo verwijderd')
    },
  })

  const [form, setForm] = useState<PracticeForm>(EMPTY_FORM)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Server-input → form-state synchroniseren wanneer data binnenkomt of na save.
  useEffect(() => {
    if (!practice) return
    setForm({
      name: practice.name ?? '',
      addressLine1: practice.addressLine1 ?? '',
      addressLine2: practice.addressLine2 ?? '',
      postalCode: practice.postalCode ?? '',
      city: practice.city ?? '',
      country: practice.country ?? 'Nederland',
      phone: practice.phone ?? '',
      email: practice.email ?? '',
      website: practice.website ?? '',
      agbCodePractice: practice.agbCodePractice ?? '',
      privacyDisclaimer: practice.privacyDisclaimer ?? '',
      logoUrl: practice.logoUrl ?? '',
    })
  }, [practice])

  const isOwner = !!me?.isPracticeOwner
  const isAdmin = me?.role === 'ADMIN'
  const canEdit = isOwner || isAdmin

  // Live preview — vraag de footer-HTML op met de huidige (mogelijk nog niet
  // opgeslagen) form-state. Server rendert exact zoals patient-mail.
  // `name` is required in de update-schema, maar voor preview willen we lege
  // input toestaan zodat de footer correct als 'incompleet' wordt afgehandeld.
  const previewInput = useMemo(() => ({
    practice: {
      name: form.name || undefined,
      addressLine1: form.addressLine1 || null,
      addressLine2: form.addressLine2 || null,
      postalCode: form.postalCode || null,
      city: form.city || null,
      country: form.country || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      logoUrl: form.logoUrl || null,
      agbCodePractice: form.agbCodePractice || null,
      privacyDisclaimer: form.privacyDisclaimer || null,
    },
  }), [form])
  const { data: previewData } = trpc.practice.previewFooter.useQuery(previewInput, {
    // Trottle om bij elke toetsaanslag een server-roundtrip te vermijden:
    // staleTime + refetch on rehydrate alleen.
    staleTime: 500,
  })

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!practice?.id) {
      toast.error('Geen praktijk gekoppeld')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo is groter dan 2 MB')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
      toast.error('Alleen PNG, JPG of SVG')
      return
    }
    setUploadingLogo(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const path = `${practice.id}/logo.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('practice-logos')
        .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type })
      if (uploadErr) throw uploadErr
      // Public URL — bucket is public-read, dus geen signed URL nodig
      const { data: pub } = supabase.storage.from('practice-logos').getPublicUrl(path)
      // Cache-buster zodat browsers en mail-clients het oude bestand niet
      // blijven serveren bij vervangen.
      const url = `${pub.publicUrl}?v=${Date.now()}`
      setForm(f => ({ ...f, logoUrl: url }))
      // Direct opslaan zodat de URL persistent is (anders verlies je 'm bij refresh).
      await updateMutation.mutateAsync({ ...form, logoUrl: url, name: form.name || practice.name })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload mislukt')
    } finally {
      setUploadingLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit) return
    if (!form.name.trim()) {
      toast.error('Praktijknaam is verplicht')
      return
    }
    await updateMutation.mutateAsync({
      name: form.name.trim(),
      addressLine1: form.addressLine1.trim() || null,
      addressLine2: form.addressLine2.trim() || null,
      postalCode: form.postalCode.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      logoUrl: form.logoUrl.trim() || null,
      agbCodePractice: form.agbCodePractice.trim() || null,
      privacyDisclaimer: form.privacyDisclaimer.trim() || null,
    })
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl w-full">
        <p style={{ color: P.inkMuted }}>Laden…</p>
      </div>
    )
  }

  if (!practice) {
    return (
      <div className="max-w-lg w-full flex flex-col gap-4">
        <Link
          href="/therapist/settings"
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
        >
          ← INSTELLINGEN
        </Link>
        <Tile>
          <MetaLabel>Geen praktijk</MetaLabel>
          <p className="mt-2 text-sm" style={{ color: P.ink }}>
            Je bent nog niet aan een praktijk gekoppeld. Neem contact op met je admin.
          </p>
        </Tile>
      </div>
    )
  }

  const ownerName = practice.owner?.firstName?.trim()
    || practice.owner?.name?.trim()
    || practice.owner?.email
    || 'de praktijkeigenaar'

  return (
    <div className="max-w-5xl w-full flex flex-col gap-4">
      <Link
        href="/therapist/settings"
        className="athletic-mono"
        style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
      >
        ← INSTELLINGEN
      </Link>

      <div className="flex flex-col gap-1">
        <Kicker>Praktijk</Kicker>
        <h1
          className="athletic-display"
          style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
        >
          PRAKTIJKPROFIEL
        </h1>
        <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
          Deze gegevens komen onder elke patiëntmail van je praktijk te staan
        </MetaLabel>
      </div>

      {!canEdit && (
        <Tile>
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: P.inkMuted }} />
            <div className="text-sm" style={{ color: P.ink }}>
              <p className="font-semibold">Alleen-lezen</p>
              <p style={{ color: P.inkMuted, marginTop: 2 }}>
                Vraag {ownerName} om praktijkgegevens aan te passen.
              </p>
            </div>
          </div>
        </Tile>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── Form kolom ── */}
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <Tile>
            <MetaLabel>Praktijk</MetaLabel>
            <div className="flex flex-col gap-3 mt-3">
              <Field label="Naam *">
                <DarkInput
                  required
                  disabled={!canEdit}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Movement Based Therapy"
                />
              </Field>
              <Field label="Adresregel 1">
                <DarkInput
                  disabled={!canEdit}
                  value={form.addressLine1}
                  onChange={e => setForm({ ...form, addressLine1: e.target.value })}
                  placeholder="Hoofdstraat 12"
                />
              </Field>
              <Field label="Adresregel 2">
                <DarkInput
                  disabled={!canEdit}
                  value={form.addressLine2}
                  onChange={e => setForm({ ...form, addressLine2: e.target.value })}
                  placeholder="Suite 4"
                />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Postcode">
                  <DarkInput
                    disabled={!canEdit}
                    value={form.postalCode}
                    onChange={e => setForm({ ...form, postalCode: e.target.value })}
                    placeholder="1234 AB"
                  />
                </Field>
                <Field label="Plaats" className="col-span-2">
                  <DarkInput
                    disabled={!canEdit}
                    value={form.city}
                    onChange={e => setForm({ ...form, city: e.target.value })}
                    placeholder="Amsterdam"
                  />
                </Field>
              </div>
              <Field label="Land">
                <DarkInput
                  disabled={!canEdit}
                  value={form.country}
                  onChange={e => setForm({ ...form, country: e.target.value })}
                />
              </Field>
            </div>
          </Tile>

          <Tile>
            <MetaLabel>Contact</MetaLabel>
            <div className="flex flex-col gap-3 mt-3">
              <Field label="Telefoon">
                <DarkInput
                  type="tel"
                  disabled={!canEdit}
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="020 1234567"
                />
              </Field>
              <Field label="E-mail">
                <DarkInput
                  type="email"
                  disabled={!canEdit}
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="info@praktijk.nl"
                />
              </Field>
              <Field label="Website">
                <DarkInput
                  type="url"
                  disabled={!canEdit}
                  value={form.website}
                  onChange={e => setForm({ ...form, website: e.target.value })}
                  placeholder="https://praktijk.nl"
                />
              </Field>
            </div>
          </Tile>

          <Tile>
            <MetaLabel>Logo</MetaLabel>
            <div className="flex items-center gap-3 mt-3">
              {form.logoUrl ? (
                <div className="rounded-lg p-2" style={{ background: '#FFFFFF', border: `1px solid ${P.lineStrong}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.logoUrl} alt="Logo" style={{ maxHeight: 56, maxWidth: 140, display: 'block' }} />
                </div>
              ) : (
                <div
                  className="flex items-center justify-center rounded-lg"
                  style={{ width: 80, height: 56, background: P.surface, border: `1px dashed ${P.lineStrong}` }}
                >
                  <Building2 className="w-5 h-5" style={{ color: P.inkMuted }} />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoSelect}
                  disabled={!canEdit || uploadingLogo}
                />
                <DarkButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!canEdit || uploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingLogo ? 'Uploaden…' : form.logoUrl ? 'Vervang logo' : 'Upload logo'}
                </DarkButton>
                {form.logoUrl && canEdit && (
                  <button
                    type="button"
                    onClick={() => removeLogoMutation.mutate()}
                    disabled={removeLogoMutation.isPending}
                    className="flex items-center gap-1 text-xs"
                    style={{ color: P.danger ?? '#ef4444' }}
                  >
                    <Trash2 className="w-3 h-3" />
                    Verwijder logo
                  </button>
                )}
                <p className="text-[11px]" style={{ color: P.inkMuted }}>
                  PNG, JPG of SVG · max 2 MB
                </p>
              </div>
            </div>
          </Tile>

          <Tile>
            <MetaLabel>AGB & disclaimer</MetaLabel>
            <div className="flex flex-col gap-3 mt-3">
              <Field label="AGB-praktijk">
                <DarkInput
                  disabled={!canEdit}
                  value={form.agbCodePractice}
                  onChange={e => setForm({ ...form, agbCodePractice: e.target.value })}
                  placeholder="12345678"
                />
              </Field>
              <Field label="Privacy disclaimer (optioneel, max 500 tekens)">
                <DarkTextarea
                  disabled={!canEdit}
                  value={form.privacyDisclaimer}
                  onChange={e => setForm({ ...form, privacyDisclaimer: e.target.value })}
                  maxLength={500}
                  rows={4}
                  placeholder="Bijv. lidmaatschapsregister, klacht-procedure, …"
                />
                <span
                  className="text-[10px] mt-1 inline-block"
                  style={{ color: P.inkMuted }}
                >
                  {form.privacyDisclaimer.length} / 500
                </span>
              </Field>
            </div>
          </Tile>

          {canEdit && (
            <DarkButton
              type="submit"
              variant="primary"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Opslaan…' : 'Opslaan'}
            </DarkButton>
          )}
        </form>

        {/* ── Live preview kolom ── */}
        <div className="flex flex-col gap-3">
          <Tile>
            <div className="flex items-center justify-between">
              <MetaLabel>Live preview</MetaLabel>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPreviewMode('desktop')}
                  className="p-1.5 rounded transition-colors"
                  style={{
                    color: previewMode === 'desktop' ? P.ink : P.inkMuted,
                    background: previewMode === 'desktop' ? P.surface : 'transparent',
                  }}
                  aria-label="Desktop preview"
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('mobile')}
                  className="p-1.5 rounded transition-colors"
                  style={{
                    color: previewMode === 'mobile' ? P.ink : P.inkMuted,
                    background: previewMode === 'mobile' ? P.surface : 'transparent',
                  }}
                  aria-label="Mobile preview"
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-[11px] mt-1" style={{ color: P.inkMuted }}>
              Hoe de footer eruitziet onderaan elke patiëntmail van jouw praktijk.
            </p>
          </Tile>

          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: P.bg,
              border: `1px solid ${P.lineStrong}`,
              padding: 0,
              maxWidth: previewMode === 'mobile' ? 375 : '100%',
              transition: 'max-width 200ms ease',
              alignSelf: 'flex-start',
              width: '100%',
            }}
          >
            <PreviewIframe html={buildPreviewHtml(previewData?.html ?? '')} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({
  label, children, className,
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
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

function PreviewIframe({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(280)

  useEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    const onLoad = () => {
      const doc = iframe.contentDocument
      if (!doc) return
      const h = doc.body.scrollHeight + 40
      setHeight(Math.max(280, h))
    }
    iframe.addEventListener('load', onLoad)
    return () => iframe.removeEventListener('load', onLoad)
  }, [html])

  return (
    <iframe
      ref={ref}
      title="Email preview"
      sandbox=""
      srcDoc={html}
      style={{ width: '100%', height, border: 0, display: 'block' }}
    />
  )
}

function buildPreviewHtml(footer: string): string {
  // Simuleert een ingekorte versie van de echte programma-mail (zelfde dark
  // MBT brand) zodat de therapeut ziet hoe de footer aansluit.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#0A0E0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0E0F;padding:24px 16px;">
        <tr><td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#141A1B;border:1px solid rgba(255,255,255,0.12);border-radius:20px;overflow:hidden;">
            <tr><td style="padding:24px 24px 8px 24px;">
              <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:11px;letter-spacing:0.2em;color:#e87a55;font-weight:900;">● MBT · GYM</div>
            </td></tr>
            <tr><td style="padding:6px 24px 0 24px;">
              <h1 style="margin:0;padding:4px 0 0 0;font-size:26px;line-height:32px;font-weight:900;letter-spacing:-1px;color:#F5F7F6;text-transform:uppercase;">HALLO {voornaam}</h1>
            </td></tr>
            <tr><td style="padding:12px 24px 0 24px;">
              <p style="margin:0;color:#7B8889;font-size:14px;line-height:21px;">Je therapeut heeft een revalidatieprogramma voor je klaargezet.</p>
            </td></tr>
            <tr><td style="padding:16px 24px 0 24px;">
              <div style="background:#1C2425;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:14px;">
                <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.14em;color:#7B8889;text-transform:uppercase;font-weight:700;">PROGRAMMA</div>
                <div style="color:#F5F7F6;font-size:15px;font-weight:700;margin-top:4px;">Revalidatieprogramma — voorbeeld</div>
              </div>
            </td></tr>
            <tr><td style="padding:18px 24px 0 24px;">
              <div style="background:#e87a55;color:#0A0E0F;text-align:center;padding:14px 20px;border-radius:12px;font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:900;letter-spacing:0.16em;text-transform:uppercase;">PROGRAMMA OPENEN →</div>
            </td></tr>
            ${footer
              ? `<tr><td style="padding:18px 24px 24px 24px;">${footer}</td></tr>`
              : `<tr><td style="padding:20px 24px 24px 24px;">
                  <div style="background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.30);border-radius:8px;padding:12px;font-size:12px;color:#F59E0B;line-height:1.5;">
                    <IconWarning size={13} className="inline-block mr-1 align-[-2px]" /> Geen footer — vul minimaal praktijknaam, adres, plaats en telefoon óf email in.
                  </div>
                </td></tr>`
            }
          </table>
        </td></tr>
      </table>
    </body></html>`
}
