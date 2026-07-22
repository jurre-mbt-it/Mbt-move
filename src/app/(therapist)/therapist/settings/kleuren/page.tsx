'use client'

/**
 * Kleur per trainingssoort instellen. Geldt voor de hele praktijk, zodat
 * collega's dezelfde kalender zien; werk je zonder praktijk, dan geldt hij voor
 * jou. Bewust per soort en niet per losse workout: dan hoef je een kleur één
 * keer af te spreken in plaats van hem bij elke training opnieuw te kiezen.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkScreen,
  DarkHeader,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import { EXERCISE_CATEGORIES } from '@/lib/exercise-constants'
import { CATEGORY_COLORS } from '@/lib/palette'

/** Statuskleuren van de kalender. Kiest iemand hier iets dat daar dicht bij
 *  ligt, dan gaan op een tegel de soort en de status weer op elkaar lijken. */
const STATUS_KLEUREN: Array<[string, string]> = [
  ['voltooid', '#5FD08A'],
  ['bezig', '#F5B942'],
  ['deels', '#EE8447'],
  ['gemist', '#F0796C'],
]

function kanalen(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Grofweg hoe ver twee kleuren uit elkaar liggen; genoeg voor een waarschuwing. */
function afstand(a: string, b: string): number {
  const [r1, g1, b1] = kanalen(a)
  const [r2, g2, b2] = kanalen(b)
  return Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b1 - b2))
}

function botsing(hex: string): string | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null
  const dichtst = STATUS_KLEUREN
    .map(([naam, kleur]) => ({ naam, d: afstand(hex, kleur) }))
    .sort((a, b) => a.d - b.d)[0]
  return dichtst.d < 30 ? dichtst.naam : null
}

export default function KleurenPage() {
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.practice.categoryColors.useQuery(undefined, {
    staleTime: 60_000,
  })
  // `null` = nog niets aangepast, dan geldt wat er is opgeslagen. Zo hoeft er
  // geen effect de serverwaarde in state te kopiëren.
  const [aangepast, setAangepast] = useState<Record<string, string> | null>(null)
  const concept = aangepast ?? data?.colors ?? CATEGORY_COLORS
  const setConcept = (
    f: (v: Record<string, string>) => Record<string, string>,
  ) => setAangepast(f(concept))

  const opslaan = trpc.practice.setCategoryColors.useMutation({
    onSuccess: () => {
      void utils.practice.categoryColors.invalidate()
      setAangepast(null)
      toast.success('Kleuren opgeslagen')
    },
    onError: (e: { message: string }) => toast.error(e.message),
  })

  const gewijzigd = !!data && EXERCISE_CATEGORIES.some(c => concept[c.value] !== data.colors[c.value])

  return (
    <DarkScreen>
      <DarkHeader title="Kleuren" sub="TRAININGSSOORTEN" backHref="../settings" />

      <div className="max-w-2xl w-full mx-auto px-4 pb-10 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <Kicker>Weergave</Kicker>
          <MetaLabel style={{ textTransform: 'none', fontWeight: 500 }}>
            {data?.scope === 'practice'
              ? 'Deze kleuren gelden voor iedereen in je praktijk.'
              : 'Deze kleuren gelden voor jou.'}
          </MetaLabel>
        </div>

        <Tile>
          <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.55 }}>
            In de kalender zegt de <strong style={{ color: P.ink }}>rand</strong> van een
            tegel hoe het ging en het <strong style={{ color: P.ink }}>icoon</strong> wat
            voor training het was. Die twee moeten uit elkaar te houden blijven, dus kies
            hier bij voorkeur koele of gedempte tinten: de warme kleuren zijn van de status.
          </p>
        </Tile>

        {isLoading ? (
          <Tile><p style={{ color: P.inkMuted, fontSize: 13 }}>Laden…</p></Tile>
        ) : (
          <div className="flex flex-col gap-2">
            {EXERCISE_CATEGORIES.map(c => {
              const waarde = concept[c.value] ?? CATEGORY_COLORS[c.value]
              const waarschuwing = botsing(waarde)
              return (
                <Tile key={c.value}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <input
                      type="color"
                      value={waarde}
                      onChange={e => setConcept(v => ({ ...v, [c.value]: e.target.value.toUpperCase() }))}
                      aria-label={`Kleur voor ${c.label}`}
                      style={{
                        width: 40, height: 28, padding: 0, border: `1px solid ${P.lineStrong}`,
                        borderRadius: 6, background: 'transparent', cursor: 'pointer',
                      }}
                    />
                    <span style={{ color: P.ink, fontSize: 14, fontWeight: 600, minWidth: 96 }}>
                      {c.label}
                    </span>
                    <span
                      className="athletic-mono"
                      style={{ color: P.inkDim, fontSize: 11 }}
                    >
                      {waarde}
                    </span>
                    {waarde.toUpperCase() !== CATEGORY_COLORS[c.value].toUpperCase() && (
                      <button
                        type="button"
                        onClick={() => setConcept(v => ({ ...v, [c.value]: CATEGORY_COLORS[c.value] }))}
                        className="athletic-mono ml-auto"
                        style={{ color: P.inkMuted, fontSize: 10 }}
                      >
                        Terug naar standaard
                      </button>
                    )}
                  </div>
                  {waarschuwing && (
                    <p style={{ color: P.gold, fontSize: 12, marginTop: 8 }}>
                      Lijkt sterk op de statuskleur &ldquo;{waarschuwing}&rdquo;. Op een
                      kalendertegel zijn de soort en de status dan lastig uit elkaar te houden.
                    </p>
                  )}
                </Tile>
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-2">
          <DarkButton
            variant="primary"
            disabled={!gewijzigd || opslaan.isPending}
            loading={opslaan.isPending}
            onClick={() => opslaan.mutate({ colors: concept })}
          >
            Opslaan
          </DarkButton>
          {gewijzigd && (
            <DarkButton variant="ghost" onClick={() => setAangepast(null)}>
              Ongedaan maken
            </DarkButton>
          )}
        </div>
      </div>
    </DarkScreen>
  )
}
