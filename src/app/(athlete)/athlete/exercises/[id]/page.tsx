'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Play, Lightbulb } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import {
  P,
  Kicker,
  MetaLabel,
  Tile,
  DarkButton,
  CATEGORY_COLORS,
} from '@/components/dark-ui'

const mono =
  'ui-monospace, Menlo, "SF Mono", "Cascadia Code", "Source Code Pro", monospace'

const CATEGORY_LABEL: Record<string, string> = {
  STRENGTH: 'KRACHT',
  MOBILITY: 'MOBILITEIT',
  PLYOMETRICS: 'PLYO',
  CARDIO: 'CARDIO',
  STABILITY: 'STABILITEIT',
}

const DIFFICULTY_LABEL: Record<string, string> = {
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'GEVORDERD',
  ADVANCED: 'EXPERT',
}

const BODY_REGION_LABEL: Record<string, string> = {
  KNEE: 'KNIE',
  SHOULDER: 'SCHOUDER',
  BACK: 'RUG',
  ANKLE: 'ENKEL',
  HIP: 'HEUP',
  FULL_BODY: 'FULL BODY',
  CERVICAL: 'NEK',
  THORACIC: 'BOVEN RUG',
  LUMBAR: 'ONDERRUG',
  ELBOW: 'ELLEBOOG',
  WRIST: 'POLS',
  FOOT: 'VOET',
}

function categoryColor(cat: string): string {
  return (CATEGORY_COLORS as Record<string, string>)[cat] ?? P.lime
}

/**
 * Converteer YouTube/Vimeo URL naar embed-URL voor iframe-afspelen.
 */
function toEmbedUrl(url: string | null): string | null {
  if (!url) return null
  const trimmed = url.trim()

  const yt =
    trimmed.match(/youtube\.com\/watch\?v=([^&]+)/) ??
    trimmed.match(/youtu\.be\/([^?&]+)/) ??
    trimmed.match(/youtube\.com\/embed\/([^?&]+)/)
  if (yt) {
    return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1&playsinline=1`
  }

  const vm =
    trimmed.match(/player\.vimeo\.com\/video\/([^?&]+)/) ??
    trimmed.match(/vimeo\.com\/([0-9]+)/)
  if (vm) {
    return `https://player.vimeo.com/video/${vm[1]}?playsinline=1`
  }

  return trimmed
}

interface Props {
  params: Promise<{ id: string }>
}

export default function AthleteExerciseDetailPage({ params }: Props) {
  const { id } = use(params)
  const { data: ex, isLoading, error } = trpc.exercises.get.useQuery({ id })
  const [videoOpen, setVideoOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
          <BackLink />
          <div
            className="h-12 rounded-xl animate-pulse"
            style={{ background: P.surfaceHi }}
          />
          <div
            className="h-48 rounded-xl animate-pulse"
            style={{ background: P.surfaceHi }}
          />
        </div>
      </div>
    )
  }

  if (error || !ex) return notFound()

  const color = categoryColor(ex.category)
  const catLabel = CATEGORY_LABEL[ex.category] ?? ex.category
  const embedUrl = toEmbedUrl(ex.videoUrl)
  const instructions = (ex.instructions as string[] | null) ?? []
  const tips = (ex.tips as string[] | null) ?? []
  const tags = (ex.tags as string[] | null) ?? []
  const bodyRegions = (ex.bodyRegion as string[] | null) ?? []
  const muscleLoads = (ex.muscleLoads as Record<string, number> | null) ?? {}
  const muscleLoadEntries = Object.entries(muscleLoads).sort(
    ([, a], [, b]) => (b as number) - (a as number),
  )

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-8 pb-10 space-y-4">
        {/* Topbar */}
        <div className="flex items-center justify-between">
          <BackLink />
        </div>

        {/* Hero */}
        <div
          className="relative"
          style={{ paddingLeft: 14, paddingTop: 10, paddingBottom: 6 }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              top: 18,
              width: 3,
              height: 60,
              borderRadius: 1.5,
              background: color,
            }}
          />
          <MetaLabel style={{ color }}>{catLabel}</MetaLabel>
          <h1
            className="athletic-display"
            style={{
              color: P.ink,
              fontWeight: 900,
              letterSpacing: '-0.035em',
              lineHeight: 1.05,
              fontSize: 'clamp(28px, 9vw, 44px)',
              paddingTop: 6,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            {ex.name}
          </h1>
        </div>

        {/* Video */}
        {embedUrl && (
          <>
            {!videoOpen ? (
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                className="athletic-tap w-full flex items-center gap-3 rounded-xl"
                style={{
                  background: P.surface,
                  border: `1px solid ${P.lineStrong}`,
                  padding: 14,
                  textAlign: 'left',
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: color }}
                >
                  <Play className="w-4 h-4" style={{ color: P.bg }} fill={P.bg} />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    style={{
                      color: P.ink,
                      fontSize: 14,
                      fontWeight: 900,
                      letterSpacing: '0.02em',
                    }}
                  >
                    BEKIJK VIDEO
                  </div>
                  <div
                    className="athletic-mono"
                    style={{
                      color: P.inkMuted,
                      fontSize: 10,
                      letterSpacing: '0.14em',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      marginTop: 4,
                    }}
                  >
                    {ex.videoUrl?.includes('vimeo') ? 'VIMEO' : 'YOUTUBE'} · TIK OM AF TE SPELEN
                  </div>
                </div>
                <span style={{ color: P.inkDim, fontSize: 18 }} aria-hidden>
                  →
                </span>
              </button>
            ) : (
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background: '#000',
                  aspectRatio: '16 / 9',
                  border: `1px solid ${P.lineStrong}`,
                }}
              >
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  title={ex.name}
                />
              </div>
            )}
          </>
        )}

        {/* Description */}
        {ex.description && (
          <Tile>
            <p
              style={{
                color: P.ink,
                fontSize: 14,
                lineHeight: '20px',
                margin: 0,
              }}
            >
              {ex.description}
            </p>
          </Tile>
        )}

        {/* Meta pills */}
        <div className="flex flex-wrap gap-1.5">
          <MetaPill label={DIFFICULTY_LABEL[ex.difficulty] ?? ex.difficulty} />
          {ex.isUnilateral && <MetaPill label="UNILATERAAL" />}
          {ex.loadType && ex.loadType !== 'BODYWEIGHT' && (
            <MetaPill label={ex.loadType} />
          )}
          {bodyRegions.map((r) => (
            <MetaPill key={r} label={BODY_REGION_LABEL[r] ?? r} />
          ))}
        </div>

        {/* Instructions */}
        {instructions.length > 0 && (
          <div>
            <Kicker style={{ marginBottom: 8, paddingLeft: 4 }}>UITVOERING</Kicker>
            <Tile>
              <div className="space-y-3">
                {instructions.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: color }}
                    >
                      <span
                        className="athletic-mono"
                        style={{
                          color: P.bg,
                          fontSize: 11,
                          fontWeight: 900,
                        }}
                      >
                        {i + 1}
                      </span>
                    </div>
                    <p
                      className="flex-1"
                      style={{
                        color: P.ink,
                        fontSize: 14,
                        lineHeight: '20px',
                        paddingTop: 3,
                        margin: 0,
                      }}
                    >
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </Tile>
          </div>
        )}

        {/* Tips */}
        {tips.length > 0 && (
          <div>
            <Kicker style={{ marginBottom: 8, paddingLeft: 4 }}>TIPS</Kicker>
            <Tile>
              <div className="space-y-2">
                {tips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Lightbulb
                      className="w-4 h-4 shrink-0 mt-1"
                      style={{ color: P.gold }}
                    />
                    <p
                      className="flex-1"
                      style={{
                        color: P.ink,
                        fontSize: 14,
                        lineHeight: '20px',
                        margin: 0,
                      }}
                    >
                      {tip}
                    </p>
                  </div>
                ))}
              </div>
            </Tile>
          </div>
        )}

        {/* Muscle loads */}
        {muscleLoadEntries.length > 0 && (
          <div>
            <Kicker style={{ marginBottom: 8, paddingLeft: 4 }}>SPIERBELASTING</Kicker>
            <Tile>
              <div>
                {muscleLoadEntries.map(([muscle, load], i) => (
                  <div
                    key={muscle}
                    className="flex items-center gap-3"
                    style={{
                      paddingTop: 8,
                      paddingBottom: 8,
                      borderTop: i === 0 ? 'none' : `1px solid ${P.line}`,
                    }}
                  >
                    <span
                      className="athletic-mono flex-1"
                      style={{
                        color: P.ink,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {muscle}
                    </span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span
                          key={n}
                          aria-hidden
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background:
                              n <= (load as number) ? P.lime : P.surfaceHi,
                            display: 'inline-block',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Tile>
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {tags.map((t) => (
              <span
                key={t}
                className="athletic-mono rounded"
                style={{
                  background: P.surfaceHi,
                  color: P.inkMuted,
                  padding: '4px 10px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                }}
              >
                #{t.toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {/* Quick CTA — start workout met deze oefening */}
        <div className="pt-4">
          <DarkButton
            href={`/athlete/workouts/new?exercise=${ex.id}`}
            variant="primary"
            className="w-full"
          >
            START WORKOUT MET DEZE OEFENING →
          </DarkButton>
        </div>
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/athlete/exercises"
      className="athletic-tap inline-flex items-center"
      style={{
        fontFamily: mono,
        fontSize: 11,
        letterSpacing: '0.16em',
        fontWeight: 800,
        color: P.inkMuted,
        textTransform: 'uppercase',
        textDecoration: 'none',
      }}
    >
      ← TERUG
    </Link>
  )
}

function MetaPill({ label }: { label: string }) {
  return (
    <span
      className="athletic-mono rounded"
      style={{
        background: P.surface,
        border: `1px solid ${P.lineStrong}`,
        color: P.inkMuted,
        padding: '5px 10px',
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  )
}
