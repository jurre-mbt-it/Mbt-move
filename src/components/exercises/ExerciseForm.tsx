'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { VideoInput } from './VideoInput'
import { MuscleLoadSliders } from './MuscleLoadSliders'
import { CoachingCues } from './CoachingCues'
import { ProgressionPicker } from './ProgressionPicker'
import {
  EXERCISE_CATEGORIES,
  BODY_REGIONS,
  DIFFICULTIES,
  type MuscleGroup,
} from '@/lib/exercise-constants'
import {
  estimateMuscleStrain,
  LOAD_TYPE_OPTIONS,
  MOVEMENT_PATTERN_OPTIONS,
  type LoadType,
  type MovementPattern,
} from '@/lib/strain-estimation'
import { Save, X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  P,
  Kicker,
  MetaLabel,
  DarkInput,
  DarkTextarea,
  DarkButton,
  CATEGORY_COLORS,
} from '@/components/dark-ui'

interface ExerciseFormData {
  name: string
  description: string
  category: string
  bodyRegion: string[]
  difficulty: string
  mediaType: 'UPLOAD' | 'YOUTUBE' | 'VIMEO' | null
  videoUrl: string
  instructions: string[]
  tips: string[]
  tags: string[]
  isPublic: boolean
  muscleLoads: Partial<Record<MuscleGroup, number>>
  easierVariantId: string | null
  harderVariantId: string | null
  loadType: string
  isUnilateral: boolean
  movementPattern: string | null
}

interface ExerciseFormProps {
  initialData?: Partial<ExerciseFormData>
  exerciseId?: string
  mode: 'create' | 'edit'
}

const defaultData: ExerciseFormData = {
  name: '',
  description: '',
  category: 'STRENGTH',
  bodyRegion: [],
  difficulty: 'BEGINNER',
  mediaType: null,
  videoUrl: '',
  instructions: [],
  tips: [],
  tags: [],
  isPublic: false,
  muscleLoads: {},
  easierVariantId: null,
  harderVariantId: null,
  loadType: 'BODYWEIGHT',
  isUnilateral: false,
  movementPattern: null,
}

function categoryColor(cat: string): string {
  return (CATEGORY_COLORS as Record<string, string>)[cat] ?? P.lime
}

function Section({
  title,
  children,
  collapsible = false,
}: {
  title: string
  children: React.ReactNode
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => collapsible && setOpen(o => !o)}
        className={collapsible ? 'athletic-tap cursor-pointer' : ''}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <Kicker>{title.toUpperCase()}</Kicker>
        {collapsible &&
          (open ? (
            <ChevronUp className="w-4 h-4" style={{ color: P.inkMuted }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: P.inkMuted }} />
          ))}
      </button>
      {open && children}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="athletic-tap rounded-full transition-colors relative shrink-0"
      style={{
        width: 44,
        height: 26,
        background: checked ? P.lime : P.surfaceHi,
        border: `1px solid ${checked ? P.lime : P.lineStrong}`,
      }}
    >
      <span
        aria-hidden
        className="block rounded-full transition-transform"
        style={{
          width: 20,
          height: 20,
          background: checked ? P.bg : P.inkMuted,
          transform: `translateX(${checked ? 20 : 2}px)`,
          marginTop: 2,
        }}
      />
    </button>
  )
}

export function ExerciseForm({ initialData, exerciseId, mode }: ExerciseFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<ExerciseFormData>({ ...defaultData, ...initialData })
  const [tagDraft, setTagDraft] = useState('')

  const createMutation = trpc.exercises.create.useMutation()
  const updateMutation = trpc.exercises.update.useMutation()
  const saving = createMutation.isPending || updateMutation.isPending

  const set = <K extends keyof ExerciseFormData>(key: K, val: ExerciseFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const toggleBodyRegion = (v: string) => {
    set(
      'bodyRegion',
      form.bodyRegion.includes(v)
        ? form.bodyRegion.filter(r => r !== v)
        : [...form.bodyRegion, v],
    )
  }

  const addTag = () => {
    const t = tagDraft.trim().toLowerCase()
    if (t && !form.tags.includes(t)) {
      set('tags', [...form.tags, t])
      setTagDraft('')
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Naam is verplicht')
      return
    }

    const payload = {
      name: form.name,
      description: form.description || undefined,
      category: form.category as never,
      bodyRegion: form.bodyRegion as never,
      difficulty: form.difficulty as never,
      mediaType: form.mediaType ?? null,
      videoUrl: form.videoUrl || undefined,
      thumbnailUrl: undefined,
      instructions: form.instructions,
      tips: form.tips,
      tags: form.tags,
      isPublic: form.isPublic,
      muscleLoads: form.muscleLoads as Record<string, number>,
      easierVariantId: form.easierVariantId ?? null,
      harderVariantId: form.harderVariantId ?? null,
      loadType: form.loadType as never,
      isUnilateral: form.isUnilateral,
      movementPattern: (form.movementPattern || null) as never,
    }

    try {
      if (mode === 'create') {
        await createMutation.mutateAsync(payload)
        toast.success('Oefening aangemaakt')
      } else {
        await updateMutation.mutateAsync({ id: exerciseId!, ...payload })
        toast.success('Oefening opgeslagen')
      }
      router.push('/therapist/exercises')
    } catch (err) {
      console.error('Save failed:', err)
      const msg = err instanceof Error ? err.message : 'Opslaan mislukt'
      toast.error(msg)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Basis info */}
      <Section title="Basis informatie">
        <div className="space-y-4">
          <div>
            <MetaLabel>
              NAAM <span style={{ color: P.danger }}>*</span>
            </MetaLabel>
            <DarkInput
              placeholder="bv. Bulgarian Split Squat"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <MetaLabel>BESCHRIJVING</MetaLabel>
            <DarkTextarea
              placeholder="Korte omschrijving van de oefening..."
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="mt-1.5"
              style={{ minHeight: 80 }}
            />
          </div>

          {/* Category */}
          <div>
            <MetaLabel>CATEGORIE</MetaLabel>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {EXERCISE_CATEGORIES.map(c => {
                const active = form.category === c.value
                const color = categoryColor(c.value)
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set('category', c.value)}
                    className="athletic-tap athletic-mono rounded-lg transition-colors"
                    style={{
                      padding: '7px 14px',
                      background: active ? color : P.surface,
                      color: active ? P.bg : P.inkMuted,
                      border: `1px solid ${active ? color : P.line}`,
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <MetaLabel>MOEILIJKHEIDSGRAAD</MetaLabel>
            <div className="flex gap-1.5 mt-1.5">
              {DIFFICULTIES.map(d => {
                const active = form.difficulty === d.value
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => set('difficulty', d.value)}
                    className="athletic-tap athletic-mono flex-1 rounded-lg transition-colors"
                    style={{
                      padding: '10px 0',
                      background: active ? P.lime : P.surface,
                      color: active ? P.bg : P.inkMuted,
                      border: `1px solid ${active ? P.lime : P.line}`,
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Body regions */}
          <div>
            <MetaLabel>LICHAAMSDELEN</MetaLabel>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {BODY_REGIONS.map(r => {
                const active = form.bodyRegion.includes(r.value)
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => toggleBodyRegion(r.value)}
                    className="athletic-tap athletic-mono rounded-full transition-colors"
                    style={{
                      padding: '6px 12px',
                      background: active ? P.lime : P.surface,
                      color: active ? P.bg : P.inkMuted,
                      border: `1px solid ${active ? P.lime : P.line}`,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tags */}
          <div>
            <MetaLabel>TAGS</MetaLabel>
            <div className="flex gap-2 mt-1.5">
              <DarkInput
                placeholder="bv. kniepreventie, excentrisch..."
                value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
                className="flex-1"
              />
              <button
                type="button"
                onClick={addTag}
                disabled={!tagDraft.trim()}
                className="athletic-tap rounded-xl shrink-0 flex items-center justify-center"
                style={{
                  background: tagDraft.trim() ? P.lime : P.surfaceHi,
                  color: tagDraft.trim() ? P.bg : P.inkDim,
                  border: `1px solid ${tagDraft.trim() ? P.lime : P.lineStrong}`,
                  width: 48,
                  height: 48,
                  fontSize: 18,
                  fontWeight: 900,
                }}
                aria-label="Tag toevoegen"
              >
                +
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map(tag => (
                  <span
                    key={tag}
                    className="athletic-mono inline-flex items-center gap-1.5 rounded-full"
                    style={{
                      background: P.surfaceHi,
                      color: P.inkMuted,
                      padding: '4px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                    }}
                  >
                    #{tag.toUpperCase()}
                    <button
                      type="button"
                      onClick={() => set('tags', form.tags.filter(t => t !== tag))}
                      className="athletic-tap"
                      style={{ color: P.inkDim }}
                      aria-label="Verwijder tag"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div
            className="flex items-center justify-between rounded-xl"
            style={{
              background: P.surface,
              border: `1px solid ${P.line}`,
              padding: '12px 14px',
            }}
          >
            <div>
              <p
                style={{
                  color: P.ink,
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.01em',
                }}
              >
                PUBLIEK BESCHIKBAAR
              </p>
              <p
                style={{
                  color: P.inkMuted,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                Zichtbaar voor alle therapeuten in de praktijk
              </p>
            </div>
            <Toggle checked={form.isPublic} onChange={v => set('isPublic', v)} />
          </div>
        </div>
      </Section>

      <Divider />

      {/* Video */}
      <Section title="Video">
        <VideoInput
          value={{ mediaType: form.mediaType, url: form.videoUrl }}
          onChange={v => {
            set('mediaType', v.mediaType)
            set('videoUrl', v.url)
          }}
        />
      </Section>

      <Divider />

      {/* Coaching cues */}
      <Section title="Coaching cues (uitvoering)">
        <CoachingCues
          label="Uitvoering stap voor stap"
          placeholder="Voeg een uitvoeringsstap toe..."
          value={form.instructions}
          onChange={v => set('instructions', v)}
        />
      </Section>

      <Divider />

      <Section title="Tips & aandachtspunten" collapsible>
        <CoachingCues
          label="Tips"
          placeholder="Voeg een tip toe..."
          value={form.tips}
          onChange={v => set('tips', v)}
        />
      </Section>

      <Divider />

      {/* Exercise properties for strain estimation */}
      <Section title="Oefening-eigenschappen" collapsible>
        <div className="space-y-4">
          {/* Movement Pattern */}
          <div>
            <MetaLabel>BEWEGINGSPATROON</MetaLabel>
            <select
              className="w-full rounded-xl mt-1.5 outline-none transition-colors"
              value={form.movementPattern ?? ''}
              onChange={e => set('movementPattern', e.target.value || null)}
              style={{
                background: P.surfaceHi,
                border: `1px solid ${P.lineStrong}`,
                color: P.ink,
                padding: '12px 14px',
                fontSize: 14,
              }}
            >
              <option value="">Selecteer patroon...</option>
              {MOVEMENT_PATTERN_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.emoji} {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Load Type */}
          <div>
            <MetaLabel>TYPE BELASTING</MetaLabel>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {LOAD_TYPE_OPTIONS.map(opt => {
                const active = form.loadType === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className="athletic-tap rounded-xl text-left transition-colors"
                    style={{
                      background: active ? 'rgba(190,242,100,0.08)' : P.surface,
                      border: `1px solid ${active ? P.lime : P.line}`,
                      color: active ? P.lime : P.ink,
                      padding: '10px 14px',
                      fontSize: 13,
                      fontWeight: active ? 800 : 600,
                    }}
                    onClick={() => set('loadType', opt.value)}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Unilateral toggle */}
          <div
            className="flex items-center justify-between rounded-xl"
            style={{
              background: P.surface,
              border: `1px solid ${P.line}`,
              padding: '12px 14px',
            }}
          >
            <div>
              <p
                style={{
                  color: P.ink,
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.01em',
                }}
              >
                UNILATERAAL (EENZIJDIG)
              </p>
              <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
                Single leg, single arm, etc.
              </p>
            </div>
            <Toggle
              checked={form.isUnilateral}
              onChange={v => set('isUnilateral', v)}
            />
          </div>
        </div>
      </Section>

      <Divider />

      {/* Muscle loads */}
      <Section title="Spiergroep belasting" collapsible>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              const estimated = estimateMuscleStrain({
                movementPattern: (form.movementPattern as MovementPattern) ?? null,
                loadType: form.loadType as LoadType,
                isUnilateral: form.isUnilateral,
                difficulty: form.difficulty as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED',
                category: form.category,
                bodyRegions: form.bodyRegion,
              })
              if (Object.keys(estimated).length === 0) {
                toast.error('Selecteer eerst een bewegingspatroon of lichaamsregio')
                return
              }
              set('muscleLoads', estimated)
              toast.success(
                `${Object.keys(estimated).length} spiergroepen automatisch ingeschat`,
              )
            }}
            className="athletic-tap athletic-mono w-full flex items-center justify-center gap-2 rounded-xl"
            style={{
              background: P.surfaceHi,
              border: `1px solid ${P.lineStrong}`,
              color: P.ink,
              padding: '12px 16px',
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            <Sparkles className="w-4 h-4" style={{ color: P.lime }} />
            AUTO-INSCHATTING SPIERBELASTING
          </button>
          <MuscleLoadSliders
            value={form.muscleLoads}
            onChange={v => set('muscleLoads', v)}
          />
        </div>
      </Section>

      <Divider />

      {/* Progression */}
      <Section title="Progressie-varianten" collapsible>
        <ProgressionPicker
          easierVariantId={form.easierVariantId}
          harderVariantId={form.harderVariantId}
          currentId={exerciseId}
          onChangeEasier={id => set('easierVariantId', id)}
          onChangeHarder={id => set('harderVariantId', id)}
        />
      </Section>

      <Divider />

      {/* Actions — sticky on mobile, inline on desktop */}
      <div
        className="fixed md:relative bottom-16 md:bottom-auto left-0 md:left-auto right-0 md:right-auto z-10 md:z-auto px-4 py-3 md:px-0 md:py-0 flex gap-3"
        style={{
          background: 'transparent',
        }}
      >
        <div
          className="md:hidden absolute inset-0 pointer-events-none"
          style={{
            background: P.surface,
            borderTop: `1px solid ${P.lineStrong}`,
          }}
        />
        <DarkButton
          onClick={handleSave}
          disabled={saving}
          variant="primary"
          className="flex-1 md:flex-none gap-2 relative"
        >
          <Save className="w-4 h-4" />
          {saving
            ? 'Opslaan...'
            : mode === 'create'
              ? 'Oefening aanmaken'
              : 'Wijzigingen opslaan'}
        </DarkButton>
        <DarkButton
          variant="secondary"
          onClick={() => router.push('/therapist/exercises')}
          className="flex-1 md:flex-none relative"
        >
          Annuleren
        </DarkButton>
      </div>
      {/* Spacer so content isn't hidden behind sticky bar on mobile */}
      <div className="h-20 md:hidden" />
    </div>
  )
}

function Divider() {
  return (
    <div
      aria-hidden
      style={{ height: 1, background: P.line, marginTop: 12, marginBottom: 12 }}
    />
  )
}
