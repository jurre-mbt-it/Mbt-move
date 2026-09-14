'use client'

/**
 * Bloklijst van een geplande training in de sessie-runners (atleet én
 * patiënt). De planner zet oefeningen, notities en pauzes in één geordende
 * lijst; hier wordt die lijst weer een overzicht: fase- en groepskoppen, de
 * oefening op zijn plek, een notitie als kaart, een pauze als rij met timer.
 */

import Link from 'next/link'
import { Coffee, HeartPulse, StickyNote } from 'lucide-react'
import { CARD, DarkButton, P } from '@/components/dark-ui'
import { fmtMmSs, groupLabel, type ItemGroups } from '@/lib/planner-blocks'
import { readWorkout, summarize, totalDurationSec } from '@/lib/cardio-workout'
import { CARDIO_ACTIVITIES } from '@/lib/cardio-constants'

export type AthleteBlock = {
  id: string
  order: number
  blockKind: 'EXERCISE' | 'NOTE' | 'BREAK'
  text: string | null
  videoUrl: string | null
  durationSec: number | null
  phase: 'WARMUP' | 'COOLDOWN' | null
  supersetGroup: string | null
}

export type Regel<T> =
  | { soort: 'kop'; tekst: string; key: string }
  | { soort: 'oefening'; e: T; key: string }
  | { soort: 'notitie'; tekst: string; videoUrl: string | null; key: string }
  | { soort: 'pauze'; sec: number; tekst: string | null; key: string }

/** Zonder blokken (programma-sessie): gewoon de oefeningen in volgorde. */
export function regelsVoor<T extends { uid: string }>(
  exercises: T[],
  blocks: AthleteBlock[] | undefined,
  groups: ItemGroups,
): Regel<T>[] {
  if (!blocks || blocks.length === 0) return exercises.map(e => ({ soort: 'oefening', e, key: e.uid }))
  const byUid = new Map(exercises.map(e => [e.uid, e]))
  const out: Regel<T>[] = []
  let vorigeFase: string | null = null
  let vorigeGroep: string | null = null
  for (const b of blocks) {
    const fase = b.phase ?? 'MAIN'
    if (fase !== vorigeFase && b.blockKind !== 'NOTE') {
      out.push({ soort: 'kop', key: `fase-${b.id}`, tekst: fase === 'WARMUP' ? 'Warming-up' : fase === 'COOLDOWN' ? 'Cooldown' : 'Hoofddeel' })
      vorigeFase = fase
    }
    const groep = b.supersetGroup ?? null
    if (groep && groep !== vorigeGroep) {
      const g = groups[groep]
      const detail = g?.kind === 'CIRCUIT'
        ? [
            g.rounds ? `${g.rounds} ronde${g.rounds === 1 ? '' : 's'}` : null,
            g.timeCapSec ? `binnen ${fmtMmSs(g.timeCapSec)}` : null,
            g.restSec != null ? `rust ${g.restSec} s` : null,
          ].filter(Boolean).join(' · ')
        : 'afwisselend, zonder rust ertussen'
      out.push({ soort: 'kop', key: `groep-${b.id}`, tekst: `${groupLabel(groep, groups)}${detail ? ` · ${detail}` : ''}` })
    }
    vorigeGroep = groep
    if (b.blockKind === 'NOTE') out.push({ soort: 'notitie', key: b.id, tekst: b.text ?? '', videoUrl: b.videoUrl })
    else if (b.blockKind === 'BREAK') out.push({ soort: 'pauze', key: b.id, sec: b.durationSec ?? 0, tekst: b.text })
    else { const e = byUid.get(b.id); if (e) out.push({ soort: 'oefening', e, key: e.uid }) }
  }
  // Zelf toegevoegde oefeningen staan niet in de blokken: achteraan.
  for (const e of exercises) if (!blocks.some(b => b.id === e.uid)) out.push({ soort: 'oefening', e, key: e.uid })
  return out
}

/** Leest het geplande item uit de getTodayExercises-uitvoer zonder de diepe tRPC-typen. */
export function geplandeBlokkenUit(sessionData: unknown): { blocks: AthleteBlock[] | undefined; groups: unknown } {
  const top = sessionData as { blocks?: AthleteBlock[]; groups?: unknown; plannedItem?: { blocks?: AthleteBlock[]; groups?: unknown } } | null | undefined
  if (top?.blocks) return { blocks: top.blocks, groups: top.groups }
  return { blocks: top?.plannedItem?.blocks, groups: top?.plannedItem?.groups }
}

export function BlokRegel<T>({ regel, onVideo, onTimer }: {
  regel: Exclude<Regel<T>, { soort: 'oefening' }>
  onVideo?: (url: string) => void
  onTimer?: (sec: number) => void
}) {
  if (regel.soort === 'kop') {
    return (
      <p className="athletic-mono pt-2" style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        {regel.tekst}
      </p>
    )
  }
  if (regel.soort === 'notitie') {
    return (
      <div className="rounded-xl px-3.5 py-3 flex items-start gap-2.5" style={{ ...CARD, borderLeft: `3px solid ${P.gold}` }}>
        <StickyNote className="w-4 h-4 shrink-0 mt-0.5" style={{ color: P.gold }} />
        <div className="flex-1 min-w-0">
          <p style={{ color: P.ink, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{regel.tekst}</p>
          {regel.videoUrl && onVideo && (
            <button type="button" onClick={() => onVideo(regel.videoUrl!)} className="athletic-mono mt-1.5"
              style={{ color: P.brand, fontSize: 10, letterSpacing: '0.12em', fontWeight: 800 }}>
              VIDEO BEKIJKEN
            </button>
          )}
          {regel.videoUrl && !onVideo && (
            <a href={regel.videoUrl} target="_blank" rel="noreferrer" className="athletic-mono mt-1.5 inline-block"
              style={{ color: P.brand, fontSize: 10, letterSpacing: '0.12em', fontWeight: 800 }}>
              VIDEO BEKIJKEN
            </a>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-xl px-3.5 py-2.5 flex items-center gap-2.5" style={{ ...CARD, borderLeft: `3px solid ${P.inkDim}` }}>
      <Coffee className="w-4 h-4 shrink-0" style={{ color: P.inkDim }} />
      <span className="flex-1 min-w-0 truncate">
        <span className="athletic-mono" style={{ color: P.ink, fontSize: 11, letterSpacing: '0.1em', fontWeight: 800 }}>PAUZE {fmtMmSs(regel.sec)}</span>
        {regel.tekst && <span style={{ color: P.inkMuted, fontSize: 12 }}> · {regel.tekst}</span>}
      </span>
      {onTimer && (
        <button type="button" onClick={() => onTimer(regel.sec)} className="athletic-mono shrink-0 rounded-lg px-2.5 py-1"
          style={{ border: `1px solid ${P.lineStrong}`, color: P.inkMuted, fontSize: 9, letterSpacing: '0.12em', fontWeight: 800 }}>
          TIMER
        </button>
      )}
    </div>
  )
}

// ─── Cardio-workout uit de blokkenbouwer ─────────────────────────────────────

/**
 * De cardio-workout van het geplande item (warming-up, intervallen, cooldown)
 * bovenaan de sessie. De atleet start hem in de cardio-runner via `startHref`;
 * zonder link (patiënt) is het een leesbare samenvatting.
 */
export function CardioPlanRow({ cardio, startHref }: { cardio: unknown; startHref: string | null }) {
  const w = readWorkout(cardio ?? null)
  if (!w) return null
  const dur = Math.round(totalDurationSec(w.blocks) / 60)
  return (
    <div className="rounded-xl p-3" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
      <div className="flex items-center gap-2">
        <span className="flex shrink-0" style={{ color: P.danger }}><HeartPulse className="w-4 h-4" /></span>
        <span className="text-sm font-bold flex-1 min-w-0 truncate" style={{ color: P.ink }}>
          {CARDIO_ACTIVITIES[w.activity]?.label ?? 'Cardio'}
        </span>
        <span className="athletic-mono shrink-0" style={{ fontSize: 10, color: P.inkMuted, letterSpacing: '0.08em' }}>
          {dur} MIN
        </span>
      </div>
      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: P.inkDim }}>{summarize(w.blocks)}</p>
      {startHref && (
        <Link href={startHref} className="mt-2.5 inline-flex">
          <DarkButton variant="secondary" size="sm">Cardio starten</DarkButton>
        </Link>
      )}
    </div>
  )
}
