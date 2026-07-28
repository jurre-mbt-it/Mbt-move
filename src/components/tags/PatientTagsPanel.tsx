'use client'

/**
 * Klachten-/tag-paneel op het patiëntdossier (therapeut). Toont de #hashtags
 * die de patiënt (of een collega-therapeut) op workouts/cardio zette,
 * gegroepeerd in episodes: usages met > 3 maanden gap horen niet meer bij
 * elkaar. Beantwoordt "vanaf wanneer speelt dit, en na welke sessies".
 *
 * Klik een tag → de tijdlijn (episodes) met de gelogde sessies eronder.
 */
import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ACTIVITY_NL: Record<string, string> = {
  RUNNING: 'Hardlopen', CYCLING: 'Fietsen', WALKING: 'Wandelen', SWIMMING: 'Zwemmen',
  ROWING: 'Roeien', CROSSTRAINER: 'Crosstrainer', SKIERG: 'SkiErg', OTHER: 'Cardio',
}

export function PatientTagsPanel({ patientId }: { patientId: string }) {
  const { data: tags, isLoading } = trpc.tags.list.useQuery({ patientId })
  const [openId, setOpenId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <Tile>
        <div className="py-8 text-center"><MetaLabel>KLACHTEN LADEN…</MetaLabel></div>
      </Tile>
    )
  }

  if (!tags || tags.length === 0) {
    return (
      <Tile>
        <div className="py-8 text-center space-y-2">
          <MetaLabel>NOG GEEN TAGS</MetaLabel>
          <p style={{ color: P.inkMuted, fontSize: 13, maxWidth: 360, margin: '0 auto', lineHeight: 1.5 }}>
            Zodra de patiënt (of jij bij het afronden) een training met #klacht tagt, bijvoorbeeld
            #achillespees, verschijnt hier vanaf wanneer en na welke sessies dat speelt.
          </p>
        </div>
      </Tile>
    )
  }

  return (
    <div className="space-y-3">
      {tags.map((t) => (
        <Tile key={t.id}>
          <button
            type="button"
            onClick={() => setOpenId(openId === t.id ? null : t.id)}
            className="w-full text-left athletic-tap"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-1 min-w-0">
                <span style={{ color: P.lime, fontSize: 18, fontWeight: 800 }}>#</span>
                <span style={{ color: P.ink, fontSize: 17, fontWeight: 700 }} className="truncate">{t.display}</span>
              </div>
              <span style={{ color: P.inkDim, fontSize: 16 }}>{openId === t.id ? '▾' : '▸'}</span>
            </div>
            <MetaLabel style={{ marginTop: 6 }}>
              {t.currentEpisode.count}× deze periode · sinds {fmtDate(t.currentEpisode.from)}
              {t.previousEpisodeCount > 0
                ? ` · + ${t.previousEpisodeCount} eerdere ${t.previousEpisodeCount === 1 ? 'periode' : 'periodes'}`
                : ''}
            </MetaLabel>
          </button>

          {openId === t.id && <TagTimeline tagId={t.id} display={t.display} />}
        </Tile>
      ))}
    </div>
  )
}

function TagTimeline({ tagId, display }: { tagId: string; display: string }) {
  const { data, isLoading } = trpc.tags.timeline.useQuery({ tagId })

  if (isLoading) {
    return <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${P.line}` }}><MetaLabel>LADEN…</MetaLabel></div>
  }
  if (!data) return null

  return (
    <div className="mt-3 pt-3 space-y-4" style={{ borderTop: `1px solid ${P.line}` }}>
      {data.episodes.map((ep, i) => (
        <div key={ep.from + i} className="space-y-2">
          <div className="flex items-center justify-between">
            <Kicker>{ep.current ? 'HUIDIGE PERIODE' : 'EERDERE PERIODE'}</Kicker>
            <MetaLabel style={{ color: ep.current ? P.lime : P.inkDim }}>
              {fmtDate(ep.from)}-{fmtDate(ep.to)}
            </MetaLabel>
          </div>
          <div className="space-y-1.5">
            {ep.usages.map((u) => {
              const meta = [
                u.durationSec ? `${Math.round(u.durationSec / 60)} min` : null,
                u.rpe != null ? `RPE ${u.rpe}` : null,
                u.painLevel != null && u.painLevel > 0 ? `pijn ${u.painLevel}/10` : null,
                u.byTherapist ? 'door therapeut' : null,
              ].filter(Boolean).join(' · ')
              return (
                <div
                  key={u.id}
                  className="rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                  style={{ background: P.surfaceHi }}
                >
                  <div className="min-w-0">
                    <div style={{ color: P.ink, fontSize: 14, fontWeight: 600 }} className="truncate">
                      {u.source === 'cardio' ? (ACTIVITY_NL[u.label] ?? 'Cardio') : u.label}
                    </div>
                    {meta && <div style={{ color: P.inkMuted, fontSize: 12 }}>{meta}</div>}
                  </div>
                  <span style={{ color: P.inkMuted, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(u.loggedAt)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <p style={{ color: P.inkDim, fontSize: 11, lineHeight: 1.5 }}>
        Periodes worden gesplitst bij meer dan 3 maanden zonder #{display}; oudere periodes tellen
        klinisch niet meer als dezelfde episode.
      </p>
    </div>
  )
}
