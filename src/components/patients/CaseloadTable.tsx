'use client'

/**
 * Caseload-overzicht: één regel per sporter, gemaakt om te scannen en niet om
 * te lezen. De vraag die deze lijst beantwoordt is "wie moet ik vandaag iets
 * doen, en wat" — elke kolom die daar niet aan bijdraagt staat er niet in.
 *
 * Daarom wél belasting (de reeks, niet alleen het getal — de sprong is het
 * signaal), pijn mét richting (5/10 gestegen is een besluit, 5/10 alleen niet),
 * laatste activiteit (vangt de stille uitvallers die een trouw-percentage
 * verbergt) en therapietrouw als zachtste kolom. Niet: het weeknummer, dat
 * verandert nooit wat je nu doet en staat daarom onder de naam.
 *
 * Twee indelingen naast elkaar in plaats van één die omklapt: op tafelbreedte
 * een kolomraster, op telefoonbreedte drie regels. Dat leest op allebei beter
 * dan een raster dat zich in bochten wringt.
 */

import { P, CARD, DATA_COLORS } from '@/lib/palette'
import { LOAD_UITLEG } from '@/lib/training-load'
import { dischargeReasonTekst, formatDischargeDate } from '@/lib/care-status'

export type CaseloadRow = {
  id: string
  name: string
  avatarInitials: string
  programId: string | null
  programName: string | null
  programStatus: string | null
  weeksTotal: number
  startDate: Date | string | null | undefined
  compliancePercent: number | null
  complianceLow: boolean
  series: number[]
  weekLoad: number
  weekChangePct: number | null
  pain: { nrs: number; at: Date | string; trend: 'up' | 'down' | 'flat' } | null
  lastActivityAt: Date | string | null
  /** Dagen sinds de laatste activiteit; null als er nooit iets gelogd is. */
  silentDays: number | null
  attention: boolean
  /**
   * Behandelstatus, niet programmastatus: gevuld = deze praktijk of deze coach
   * heeft de behandeling afgesloten. Zie src/lib/care-status.ts.
   */
  dischargedAt: Date | string | null
  dischargeReason: string | null
}

const MONO = 'var(--font-mono-athletic)'
// Alle sporen vast behalve de naam. Met een `auto`-spoor voor de actie krijgen
// de kop en de rijen verschillende breedtes — de kop rekent met een lege cel,
// een rij met een knop — en dan staan de kolommen niet meer onder hun titel.
const COLS = 'grid-cols-[8px_minmax(0,1fr)_136px_116px_56px_78px_104px]'
// Archief: belasting, pijn, trouw en stille dagen zeggen niets meer over iemand
// die niet meer in behandeling is. Wat er wél toe doet is wanneer het stopte.
const COLS_ARCHIEF = 'grid-cols-[8px_minmax(0,1fr)_260px_104px]'
const SILENT_DAYS = 7

const STATUS_WOORD: Record<string, string> = {
  DRAFT: 'concept',
  COMPLETED: 'afgerond',
  ARCHIVED: 'gearchiveerd',
}

/**
 * Wanneer de behandeling stopte, en waarom. Bewust géén hergebruik van
 * STATUS_WOORD hierboven: dat zijn de woorden van het PROGRAMMA (concept,
 * afgerond, gearchiveerd) en die betekenen iets anders. Een patiënt met een
 * afgerond programma kan gewoon in behandeling zijn.
 */
function OntslagCel({ row }: { row: CaseloadRow }) {
  const datum = formatDischargeDate(row.dischargedAt)
  const reden = dischargeReasonTekst(row.dischargeReason)
  if (!datum) return <span style={{ color: P.inkDim, fontFamily: MONO, fontSize: 11 }}>—</span>
  return (
    <span
      className="truncate"
      style={{ fontFamily: MONO, fontSize: 11.5, color: P.inkMuted }}
      title={reden ? `Inactief sinds ${datum}, ${reden}` : `Inactief sinds ${datum}`}
    >
      inactief sinds {datum}
      {reden && <span style={{ color: P.inkDim }}> · {reden}</span>}
    </span>
  )
}

function fmtLaatst(days: number | null): string {
  if (days === null) return 'nooit'
  if (days <= 0) return 'vandaag'
  if (days === 1) return 'gisteren'
  return `${days} dagen`
}

function weekLabel(startDate: Date | string | null | undefined, weeksTotal: number): string | null {
  if (!startDate || weeksTotal <= 0) return null
  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return null
  const passed = Math.floor((Date.now() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))
  const week = Math.min(Math.max(passed + 1, 1), weeksTotal)
  return `week ${week} van ${weeksTotal}`
}

/** Belastingreeks als lijntje. Geen assen of labels: het gaat om de vorm. */
function Spark({ series, tint }: { series: number[]; tint: string }) {
  const w = 56
  const h = 20
  if (series.length < 2 || series.every(v => v === 0)) {
    return (
      <svg width={w} height={h} aria-hidden style={{ display: 'block' }}>
        <line x1="2" y1={h - 4} x2={w - 2} y2={h - 4} stroke={P.line} strokeWidth="1.5" />
      </svg>
    )
  }
  const max = Math.max(...series)
  const min = Math.min(...series)
  const sx = (i: number) => 2 + (i / (series.length - 1)) * (w - 4)
  const sy = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 8)
  const line = series.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ')
  const area = `${line} L ${sx(series.length - 1).toFixed(1)} ${h} L ${sx(0).toFixed(1)} ${h} Z`
  return (
    <svg width={w} height={h} aria-hidden style={{ display: 'block' }}>
      <path d={area} fill={tint} opacity="0.14" />
      <path d={line} fill="none" stroke={tint} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={sx(series.length - 1)} cy={sy(series[series.length - 1])} r="2.2" fill={tint} />
    </svg>
  )
}

function PainChip({ pain }: { pain: CaseloadRow['pain'] }) {
  if (!pain) return <span style={{ color: P.inkDim, fontFamily: MONO, fontSize: 11 }}>—</span>
  const tint = pain.trend === 'up' ? P.danger : pain.trend === 'down' ? P.lime : P.inkMuted
  const woord = pain.trend === 'up' ? 'gestegen' : pain.trend === 'down' ? 'gedaald' : 'stabiel'
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: MONO,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.03em',
        color: tint,
        background: `color-mix(in srgb, ${tint} 13%, transparent)`,
        padding: '2px 6px',
        borderRadius: 3,
        whiteSpace: 'nowrap',
      }}
      title={`Laatste pijnscore ${pain.nrs} van 10, ${woord} ten opzichte van de twee weken ervoor`}
    >
      {pain.nrs}/10 · {woord}
    </span>
  )
}

/** Een sprong boven de 30% is het signaal; kleiner is ruis en verdient geen kleur. */
const isSpike = (pct: number | null) => pct !== null && pct > 30

function Belasting({ row }: { row: CaseloadRow }) {
  const spike = isSpike(row.weekChangePct)
  return (
    <span className="inline-flex items-center gap-2">
      <Spark series={row.series} tint={spike ? P.brand : DATA_COLORS[0]} />
      <span
        style={{ fontFamily: MONO, fontSize: 11.5, color: P.ink, fontVariantNumeric: 'tabular-nums' }}
        title={LOAD_UITLEG}
      >
        {row.weekLoad} AU
      </span>
      {row.weekChangePct !== null && row.weekChangePct !== 0 && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: spike ? P.brand : P.inkDim,
            fontVariantNumeric: 'tabular-nums',
          }}
          title="Verschil met vorige week"
        >
          {row.weekChangePct > 0 ? '+' : ''}{row.weekChangePct}%
        </span>
      )}
    </span>
  )
}

function Getal({ waarde, tint, titel }: { waarde: string; tint: string; titel: string }) {
  return (
    <span
      style={{ fontFamily: MONO, fontSize: 11.5, color: tint, fontVariantNumeric: 'tabular-nums' }}
      title={titel}
    >
      {waarde}
    </span>
  )
}

export function CaseloadTable({
  rows, onOpen, onPrefetch, renderAction, mode = 'werklijst',
}: {
  rows: CaseloadRow[]
  onOpen: (id: string) => void
  onPrefetch?: (id: string) => void
  renderAction?: (row: CaseloadRow) => React.ReactNode
  /**
   * 'werklijst' = wie in behandeling is, met de signalen erbij.
   * 'archief' = wie afgesloten is; daar zeggen belasting, pijn, trouw en stille
   * dagen niets meer, dus die kolommen maken plaats voor de ontslagdatum.
   */
  mode?: 'werklijst' | 'archief'
}) {
  const archief = mode === 'archief'
  const kolommen = archief ? COLS_ARCHIEF : COLS
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{...CARD }}
    >
      {/* Kop alleen waar de kolommen ook echt naast elkaar staan. */}
      <div
        className={`hidden md:grid ${kolommen} gap-3 items-center px-3 py-2`}
        style={{ borderBottom: `1px solid ${P.line}`, color: P.inkDim }}
      >
        <span />
        <span className="athletic-mono text-[9px]">Sporter</span>
        {archief ? (
          <span className="athletic-mono text-[9px]">Afgesloten</span>
        ) : (
          <>
            <span className="athletic-mono text-[9px]" title={LOAD_UITLEG}>Belasting, 6 wk</span>
            <span className="athletic-mono text-[9px]">Pijn</span>
            <span className="athletic-mono text-[9px]">Trouw</span>
            <span className="athletic-mono text-[9px]">Laatst</span>
          </>
        )}
        <span />
      </div>

      {rows.map((row, i) => {
        const trouw = row.compliancePercent === null ? '—' : `${Math.round(row.compliancePercent * 100)}%`
        const trouwTint = row.complianceLow ? P.gold : P.inkMuted
        const stil = row.silentDays !== null && row.silentDays >= SILENT_DAYS
        // Een programma dat nog op concept staat, ziet de sporter niet. Dat
        // hoort onder de naam te staan, anders lijkt het te lopen.
        const status = row.programStatus && row.programStatus !== 'ACTIVE'
          ? STATUS_WOORD[row.programStatus] ?? null
          : null
        const sub = [
          row.programName ?? 'Geen programma',
          status,
          weekLabel(row.startDate, row.weeksTotal),
        ].filter(Boolean).join(' · ')
        const rand = i === 0 ? undefined : `1px solid ${P.line}`
        // Vier streepjes naast elkaar lezen als ruis. Wie nog nooit iets logde
        // krijgt één regel die dat zegt.
        const leeg = row.silentDays === null && !row.pain && row.series.every(v => v === 0)

        const naam = (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate" style={{ color: P.ink, fontSize: 13.5, fontWeight: 600 }}>
                {row.name}
              </span>
              {/* Behandelstatus als eigen badge, los van de programmawoorden in
                  de regel eronder. Die twee mogen niet op één hoop: een
                  afgerond programma is geen afgesloten behandeling. */}
              {row.dischargedAt && (
                <span
                  className="athletic-mono shrink-0"
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    color: P.inkMuted,
                    border: `1px solid ${P.lineStrong}`,
                    borderRadius: 3,
                    padding: '1px 5px',
                    whiteSpace: 'nowrap',
                  }}
                  title="Niet meer in behandeling bij jou. Het dossier is bewaard gebleven."
                >
                  INACTIEF
                </span>
              )}
            </div>
            <div className="truncate" style={{ color: P.inkDim, fontSize: 11.5 }}>{sub}</div>
          </div>
        )
        /* De stip links: de scan van de rand ís de triage. In het archief valt
           er niets te triëren, dus daar blijft de kolom leeg. */
        const aandacht = row.attention && !archief
        const stip = (
          <span
            aria-hidden
            className="rounded-full self-center"
            style={{ width: 6, height: 6, background: aandacht ? P.brand : 'transparent' }}
            title={aandacht ? 'Vraagt aandacht' : undefined}
          />
        )
        const open = () => onOpen(row.id)
        const gedeeld = {
          role: 'button' as const,
          tabIndex: 0,
          onClick: open,
          onPointerEnter: () => onPrefetch?.(row.id),
          onFocus: () => onPrefetch?.(row.id),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
          },
        }

        return (
          <div key={row.id}>
            {/* Tafelbreedte: kolommen */}
            <div
              {...gedeeld}
              className={`hidden md:grid ${kolommen} gap-3 items-center px-3 py-2.5 cursor-pointer mbt-nav-hover`}
              style={{ borderTop: rand }}
            >
              {stip}
              {naam}
              {archief ? (
                <OntslagCel row={row} />
              ) : leeg ? (
                <span
                  className="col-span-4"
                  style={{ fontFamily: MONO, fontSize: 11, color: P.inkDim }}
                >
                  nog niets gelogd
                </span>
              ) : (
                <>
                  <Belasting row={row} />
                  <PainChip pain={row.pain} />
                  <Getal waarde={trouw} tint={trouwTint} titel="Gepland tegen gelogd, afgelopen 14 dagen" />
                  <Getal
                    waarde={fmtLaatst(row.silentDays)}
                    tint={stil ? P.gold : P.inkDim}
                    titel="Laatste gelogde training"
                  />
                </>
              )}
              <span onClick={e => e.stopPropagation()} className="justify-self-end">
                {renderAction?.(row)}
              </span>
            </div>

            {/* Telefoonbreedte: naam, dan de cijfers op één regel eronder */}
            <div
              {...gedeeld}
              className="md:hidden flex gap-2.5 px-3 py-3 cursor-pointer"
              style={{ borderTop: rand }}
            >
              <span className="pt-1.5">{stip}</span>
              <div className="min-w-0 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  {naam}
                  <span onClick={e => e.stopPropagation()} className="shrink-0">
                    {renderAction?.(row)}
                  </span>
                </div>
                {archief ? (
                  <OntslagCel row={row} />
                ) : leeg ? (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: P.inkDim }}>
                    nog niets gelogd
                  </span>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <Belasting row={row} />
                    <PainChip pain={row.pain} />
                    <Getal waarde={trouw} tint={trouwTint} titel="Therapietrouw, afgelopen 14 dagen" />
                    <Getal
                      waarde={fmtLaatst(row.silentDays)}
                      tint={stil ? P.gold : P.inkDim}
                      titel="Laatste gelogde training"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
