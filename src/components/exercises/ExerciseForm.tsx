'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
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
import { cn } from '@/lib/utils'
import { Save, X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'

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

function Section({ title, children, collapsible = false }: { title: string; children: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => collapsible && setOpen(o => !o)}
        className={cn('flex items-center justify-between w-full text-left', collapsible && 'cursor-pointer')}
      >
        <h3 className="font-semibold text-base">{title}</h3>
        {collapsible && (open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
      </button>
      {open && children}
    </div>
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
    set('bodyRegion', form.bodyRegion.includes(v)
      ? form.bodyRegion.filter(r => r !== v)
      : [...form.bodyRegion, v])
  }

  const addTag = () => {
    const t = tagDraft.trim().toLowerCase()
    if (t && !form.tags.includes(t)) { set('tags', [...form.tags, t]); setTagDraft('') }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Naam is verplicht'); return }

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
      movementPattern: form.movementPattern as never ?? null,
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
    } catch {
      toast.error('Opslaan mislukt')
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Basis info */}
      <Section title="Basis informatie">
        <div className="grid gap-4">
          <div>
            <Label htmlFor="name">Naam <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              placeholder="bv. Bulgarian Split Squat"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="desc">Beschrijving</Label>
            <Textarea
              id="desc"
              placeholder="Korte omschrijving van de oefening..."
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="mt-1.5 min-h-[80px]"
            />
          </div>

          {/* Category */}
          <div>
            <Label>Categorie</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {EXERCISE_CATEGORIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set('category', c.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                    form.category === c.value
                      ? 'border-transparent text-white'
                      : 'border-zinc-200 text-muted-foreground hover:border-zinc-300'
                  )}
                  style={form.category === c.value ? { background: '#4ECDC4' } : {}}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <Label>Moeilijkheidsgraad</Label>
            <div className="flex gap-2 mt-1.5">
              {DIFFICULTIES.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => set('difficulty', d.value)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                    form.difficulty === d.value
                      ? 'border-transparent bg-zinc-900 text-white'
                      : 'border-zinc-200 text-muted-foreground hover:border-zinc-400'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body regions */}
          <div>
            <Label>Lichaamsdelen</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {BODY_REGIONS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => toggleBodyRegion(r.value)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    form.bodyRegion.includes(r.value)
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'border-zinc-200 text-muted-foreground hover:border-zinc-400'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <Label>Tags</Label>
            <div className="flex gap-2 mt-1.5">
              <Input
                placeholder="bv. kniepreventie, excentrisch..."
                value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              />
              <Button type="button" variant="outline" onClick={addTag} disabled={!tagDraft.trim()}>
                +
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button type="button" onClick={() => set('tags', form.tags.filter(t => t !== tag))}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Publiek beschikbaar</p>
              <p className="text-xs text-muted-foreground">Zichtbaar voor alle therapeuten in de praktijk</p>
            </div>
            <Switch
              checked={form.isPublic}
              onCheckedChange={v => set('isPublic', v)}
            />
          </div>
        </div>
      </Section>

      <Separator />

      {/* Video */}
      <Section title="Video">
        <VideoInput
          value={{ mediaType: form.mediaType, url: form.videoUrl }}
          onChange={v => { set('mediaType', v.mediaType); set('videoUrl', v.url) }}
        />
      </Section>

      <Separator />

      {/* Coaching cues */}
      <Section title="Coaching cues (uitvoering)">
        <CoachingCues
          label="Uitvoering stap voor stap"
          placeholder="Voeg een uitvoeringsstap toe..."
          value={form.instructions}
          onChange={v => set('instructions', v)}
        />
      </Section>

      <Separator />

      <Section title="Tips & aandachtspunten" collapsible>
        <CoachingCues
          label="Tips"
          placeholder="Voeg een tip toe..."
          value={form.tips}
          onChange={v => set('tips', v)}
        />
      </Section>

      <Separator />

      {/* Exercise properties for strain estimation */}
      <Section title="Oefening-eigenschappen" collapsible>
        <div className="space-y-4">
          {/* Movement Pattern */}
          <div className="space-y-1.5">
            <Label className="text-sm">Bewegingspatroon</Label>
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={form.movementPattern ?? ''}
              onChange={e => set('movementPattern', e.target.value || null)}
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
          <div className="space-y-1.5">
            <Label className="text-sm">Type belasting</Label>
            <div className="grid grid-cols-2 gap-2">
              {LOAD_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm text-left transition-colors',
                    form.loadType === opt.value
                      ? 'border-[#4ECDC4] bg-[#4ECDC410] font-medium'
                      : 'border-input hover:bg-accent'
                  )}
                  onClick={() => set('loadType', opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Unilateral toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Unilateraal (eenzijdig)</Label>
              <p className="text-xs text-muted-foreground">Single leg, single arm, etc.</p>
            </div>
            <Switch
              checked={form.isUnilateral}
              onCheckedChange={v => set('isUnilateral', v)}
            />
          </div>
        </div>
      </Section>

      <Separator />

      {/* Muscle loads */}
      <Section title="Spiergroep belasting" collapsible>
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 w-full"
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
              toast.success(`${Object.keys(estimated).length} spiergroepen automatisch ingeschat`)
            }}
          >
            <Sparkles className="w-4 h-4" style={{ color: '#4ECDC4' }} />
            Auto-inschatting spierbelasting
          </Button>
          <MuscleLoadSliders
            value={form.muscleLoads}
            onChange={v => set('muscleLoads', v)}
          />
        </div>
      </Section>

      <Separator />

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

      <Separator />

      {/* Actions — sticky on mobile, inline on desktop */}
      <div className="fixed md:relative bottom-16 md:bottom-auto left-0 md:left-auto right-0 md:right-auto z-10 md:z-auto bg-white md:bg-transparent border-t md:border-t-0 px-4 py-3 md:px-0 md:py-0 flex gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 flex-1 md:flex-none"
          style={{ background: '#4ECDC4' }}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Opslaan...' : mode === 'create' ? 'Oefening aanmaken' : 'Wijzigingen opslaan'}
        </Button>
        <Button variant="outline" onClick={() => router.push('/therapist/exercises')} className="flex-1 md:flex-none">
          Annuleren
        </Button>
      </div>
      {/* Spacer so content isn't hidden behind sticky bar on mobile */}
      <div className="h-20 md:hidden" />
    </div>
  )
}
