'use client'

import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { P } from '@/lib/shop/palette'
import { youtubeId, youtubeThumb, youtubeEmbed } from '@/lib/shop/youtube'

type Item = {
  id: string
  name: string
  videoUrl: string | null
  mediaType: string | null
  sets: number
  setsMax: number | null
  reps: number
  repsMax: number | null
  repUnit: string
  restTime: number
}

function formatSets(item: Item): string {
  const sets = item.setsMax && item.setsMax !== item.sets ? `${item.sets}-${item.setsMax}` : `${item.sets}`
  const reps = item.repsMax && item.repsMax !== item.reps ? `${item.reps}-${item.repsMax}` : `${item.reps}`
  const unit = item.repUnit === 'sec' ? 'sec' : 'herh.'
  return `${sets} × ${reps} ${unit}`
}

export function WorkoutPlayer({ slug }: { slug: string }) {
  const { data, isLoading, error } = trpc.shop.previewProgram.useQuery({ slug })
  const [week, setWeek] = useState(1)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [openVideo, setOpenVideo] = useState<string | null>(null)

  function toggle(id: string) {
    setDone((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  if (isLoading) {
    return <Shell>{<p style={{ color: P.inkMuted }}>Laden…</p>}</Shell>
  }
  if (error || !data) {
    return (
      <Shell>
        <p style={{ color: P.inkMuted }}>Dit programma is niet beschikbaar.</p>
      </Shell>
    )
  }
  if (!data.program || data.weeks.length === 0) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">{data.product.name}</h1>
        <p className="mt-2" style={{ color: P.inkMuted }}>
          Aan dit programma is nog geen schema gekoppeld.
        </p>
      </Shell>
    )
  }

  const currentWeek = data.weeks.find((w) => w.week === week) ?? data.weeks[0]
  const weekItems = currentWeek.days.flatMap((d) => d.items)
  const doneCount = weekItems.filter((i) => done.has(i.id)).length
  const pct = weekItems.length ? Math.round((doneCount / weekItems.length) * 100) : 0

  return (
    <Shell>
      <Link
        href="/mijn-programmas"
        className="text-sm transition-colors hover:text-white"
        style={{ color: P.inkMuted }}
      >
        ← Mijn programma&apos;s
      </Link>

      <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight">{data.product.name}</h1>
      <p className="mt-1 text-sm" style={{ color: P.inkMuted }}>
        {data.program.weeks} weken · {data.program.daysPerWeek}× per week
      </p>

      {/* Week-selector */}
      <div className="mt-6 flex flex-wrap gap-2">
        {data.weeks.map((w) => {
          const active = w.week === week
          return (
            <button
              key={w.week}
              onClick={() => {
                setWeek(w.week)
                setOpenVideo(null)
              }}
              className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
              style={{
                background: active ? P.brand : P.surface,
                color: active ? P.bg : P.inkMuted,
                border: `1px solid ${active ? P.brand : P.line}`,
              }}
            >
              Week {w.week}
            </button>
          )
        })}
      </div>

      {/* Voortgang van de week */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: P.inkMuted }}>
          <span>Voortgang deze week</span>
          <span>
            {doneCount}/{weekItems.length} afgevinkt
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: P.surfaceHi }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: P.brand }}
          />
        </div>
      </div>

      {/* Dagen */}
      <div className="mt-8 space-y-8">
        {currentWeek.days.map((d) => (
          <section key={d.day}>
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] mb-3" style={{ color: P.inkMuted }}>
              Dag {d.day}
            </h2>
            <div className="space-y-3">
              {d.items.map((item) => {
                const yid = item.mediaType === 'YOUTUBE' ? youtubeId(item.videoUrl) : null
                const isDone = done.has(item.id)
                const videoOpen = openVideo === item.id
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl overflow-hidden border"
                    style={{ borderColor: P.line, background: P.surface }}
                  >
                    <div className="flex items-center gap-4 p-3">
                      <button
                        onClick={() => setOpenVideo(videoOpen ? null : item.id)}
                        className="relative shrink-0 rounded-lg overflow-hidden"
                        style={{
                          width: 96,
                          height: 64,
                          background: yid ? `center / cover no-repeat url(${youtubeThumb(yid)})` : P.surfaceHi,
                        }}
                        aria-label="Bekijk video"
                      >
                        <span
                          className="absolute inset-0 flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.25)' }}
                        >
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-full"
                            style={{ background: 'rgba(0,0,0,0.55)' }}
                          >
                            <span
                              style={{
                                marginLeft: 2,
                                borderLeft: '8px solid white',
                                borderTop: '5px solid transparent',
                                borderBottom: '5px solid transparent',
                              }}
                            />
                          </span>
                        </span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold leading-snug truncate">{item.name}</h3>
                        <p className="text-sm mt-0.5" style={{ color: P.inkMuted }}>
                          {formatSets(item)} · rust {item.restTime} sec
                        </p>
                      </div>

                      <button
                        onClick={() => toggle(item.id)}
                        className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
                        style={{
                          background: isDone ? P.brand : 'transparent',
                          border: `1.5px solid ${isDone ? P.brand : P.lineStrong}`,
                          color: isDone ? P.bg : P.inkDim,
                        }}
                        aria-label={isDone ? 'Afgevinkt' : 'Vink af'}
                      >
                        {isDone ? '✓' : ''}
                      </button>
                    </div>

                    {videoOpen && yid && (
                      <div className="px-3 pb-3">
                        <div
                          className="relative w-full overflow-hidden rounded-lg"
                          style={{ aspectRatio: '16 / 9', background: '#000' }}
                        >
                          <iframe
                            src={youtubeEmbed(yid)}
                            title={item.name}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="absolute inset-0 h-full w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-5 py-10">{children}</div>
}
