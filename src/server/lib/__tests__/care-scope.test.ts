import { TRPCError } from '@trpc/server'
import { describe, expect, it } from 'vitest'

import {
  careScopeKey,
  careScopeWhere,
  careScopeWhereForRead,
  nietUitbehandeld,
  welUitbehandeld,
  uitbehandeldDoorIedereen,
} from '../care-scope'

const therapeut = { id: 't1', role: 'THERAPIST' as const, practiceId: 'p1' }
const coach = { id: 'c1', role: 'COACH' as const, practiceId: null }
const losseTherapeut = { id: 't2', role: 'THERAPIST' as const, practiceId: null }
const admin = { id: 'a1', role: 'ADMIN' as const, practiceId: 'p1' }
const patient = { id: 'p9', role: 'PATIENT' as const, practiceId: 'p1' }
const atleet = { id: 'a9', role: 'ATHLETE' as const, practiceId: 'p1' }

/** De tRPC-foutcode van een gooiende aanroep, of null als hij niet gooide. */
function foutcode(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof TRPCError ? e.code : `geen TRPCError: ${String(e)}`
  }
}

describe('careScopeKey', () => {
  it('scopet een therapeut op zijn praktijk', () => {
    expect(careScopeKey(therapeut)).toEqual({ practiceId: 'p1', coachId: null })
  })

  it('scopet een coach op zichzelf, niet op practiceId null', () => {
    // Een coach heeft altijd practiceId null. Zonder eigen sleutel zouden
    // twee coaches elkaars gearchiveerde atleten zien.
    expect(careScopeKey(coach)).toEqual({ practiceId: null, coachId: 'c1' })
  })

  it('weigert een therapeut zonder praktijk', () => {
    expect(() => careScopeKey(losseTherapeut)).toThrow(/praktijk/i)
  })

  it('weigert een therapeut zonder praktijk met PRECONDITION_FAILED, niet met een 500', () => {
    expect(foutcode(() => careScopeKey(losseTherapeut))).toBe('PRECONDITION_FAILED')
  })

  it('laat een admin met praktijk in de praktijk-tak vallen', () => {
    // Bewust afwijkend van practiceScope(), dat alleen THERAPIST toelaat. Een
    // admin beheert hier vanuit zijn eigen praktijk; zonder praktijk gooit hij.
    expect(careScopeKey(admin)).toEqual({ practiceId: 'p1', coachId: null })
  })

  it('weigert een patiënt, ook al deelt die de practiceId van zijn therapeut', () => {
    // De lekklasse uit AGENTS.md: patiënten en atleten erven de practiceId van
    // hun therapeut. Zou de praktijk-tak op practiceId hangen in plaats van op
    // rol, dan zag elke patiënt het dossier van elke medepatiënt.
    expect(foutcode(() => careScopeKey(patient))).toBe('FORBIDDEN')
  })

  it('weigert een atleet om dezelfde reden', () => {
    expect(foutcode(() => careScopeKey(atleet))).toBe('FORBIDDEN')
  })
})

/**
 * Rijen zoals ze in patient_care_status staan, uitgekleed tot de velden waar de
 * where-fragmenten op filteren. `matcht` speelt Prisma's AND-semantiek na, zodat
 * een test kan aantonen wat een fragment wel en niet selecteert.
 */
const lopendPraktijk = { practiceId: 'p1', coachId: null, reactivatedAt: null }
const afgeslotenPraktijk = { practiceId: 'p1', coachId: null, reactivatedAt: new Date() }
const lopendCoach = { practiceId: null, coachId: 'c1', reactivatedAt: null }

function matcht(fragment: Record<string, unknown>, rij: Record<string, unknown>): boolean {
  return Object.entries(fragment).every(([veld, waarde]) => {
    if (waarde && typeof waarde === 'object' && 'in' in waarde) {
      return (waarde as { in: unknown[] }).in.includes(rij[veld])
    }
    return rij[veld] === waarde
  })
}

describe('careScopeWhere', () => {
  it('geeft nooit een lege where terug', () => {
    // Een lege where zou in een OR-tak de scoping volledig laten wegvallen.
    expect(careScopeWhere(coach)).toEqual({ coachId: 'c1', reactivatedAt: null })
    expect(careScopeWhere(therapeut)).toEqual({ practiceId: 'p1', reactivatedAt: null })
  })

  it('filtert zelf op lopende markeringen, zodat een caller dat niet kan vergeten', () => {
    // Het fragment belandt in tientallen careStatuses: { none/some: ... }
    // filters. Zit de voorwaarde bij de caller, dan is één vergeten filter één
    // lijst waarin een teruggehaalde patiënt onzichtbaar blijft.
    expect(careScopeWhere(therapeut)).toHaveProperty('reactivatedAt', null)
  })

  it('matcht een lopende markering en negeert een afgesloten periode', () => {
    const fragment = careScopeWhere(therapeut)
    expect(matcht(fragment, lopendPraktijk)).toBe(true)
    // Dezelfde patiënt, dezelfde praktijk, maar al teruggehaald. Deze rij
    // blijft bewaard voor de reden en de toelichting; hij mag de patiënt niet
    // opnieuw als inactief laten gelden.
    expect(matcht(fragment, afgeslotenPraktijk)).toBe(false)
  })

  it('houdt praktijk en coach uit elkaar', () => {
    expect(matcht(careScopeWhere(therapeut), lopendCoach)).toBe(false)
    expect(matcht(careScopeWhere(coach), lopendPraktijk)).toBe(false)
  })
})

describe('careScopeWhereForRead', () => {
  it('scopet net als de schrijfvariant zolang er een geldige scope is', () => {
    expect(careScopeWhereForRead(therapeut)).toEqual({ practiceId: 'p1', reactivatedAt: null })
    expect(careScopeWhereForRead(coach)).toEqual({ coachId: 'c1', reactivatedAt: null })
    expect(careScopeWhereForRead(admin)).toEqual({ practiceId: 'p1', reactivatedAt: null })
  })

  it('negeert een afgesloten periode net zo goed als de schrijfvariant', () => {
    const fragment = careScopeWhereForRead(therapeut)
    expect(matcht(fragment, lopendPraktijk)).toBe(true)
    expect(matcht(fragment, afgeslotenPraktijk)).toBe(false)
  })

  it('gooit niet bij een therapeut zonder praktijk maar matcht niets', () => {
    // Anders levert één verkeerde onboarding een 500 op de hele patiëntenlijst.
    expect(careScopeWhereForRead(losseTherapeut)).toEqual({ practiceId: { in: [] } })
  })

  it('matcht ook niets voor een rol die hier niets te zoeken heeft', () => {
    expect(careScopeWhereForRead(patient)).toEqual({ practiceId: { in: [] } })
    expect(careScopeWhereForRead(atleet)).toEqual({ practiceId: { in: [] } })
  })

  it('matcht geen enkele rij zonder geldige scope, lopend of afgesloten', () => {
    // De lege in-lijst is op zichzelf al onvervulbaar, daarom staat er bewust
    // geen reactivatedAt bij: er valt niets aan toe te voegen en een tweede
    // voorwaarde zou de vorm laten lijken op een gewone scope.
    const fragment = careScopeWhereForRead(losseTherapeut)
    expect(matcht(fragment, lopendPraktijk)).toBe(false)
    expect(matcht(fragment, afgeslotenPraktijk)).toBe(false)
    expect(matcht(fragment, lopendCoach)).toBe(false)
  })

  it('geeft elke aanroep een vers object, zodat een caller het kan uitbreiden', () => {
    const a = careScopeWhereForRead(losseTherapeut)
    const b = careScopeWhereForRead(losseTherapeut)
    expect(a).not.toBe(b)
  })
})

describe('nietUitbehandeld / welUitbehandeld', () => {
  it('gebruiken none respectievelijk some, met dezelfde scope', () => {
    // De twee staan hier naast elkaar omdat de verwisseling het gevaar is:
    // `some` waar `none` hoort, levert precies de omgekeerde lijst op.
    expect(nietUitbehandeld(therapeut)).toEqual({
      careStatuses: { none: { practiceId: 'p1', reactivatedAt: null } },
    })
    expect(welUitbehandeld(therapeut)).toEqual({
      careStatuses: { some: { practiceId: 'p1', reactivatedAt: null } },
    })
  })

  it('scopen een coach op zichzelf', () => {
    expect(nietUitbehandeld(coach)).toEqual({
      careStatuses: { none: { coachId: 'c1', reactivatedAt: null } },
    })
  })

  it('houden het archief leeg zonder geldige scope', () => {
    // Niet weglaten maar niets matchen: anders zou het archief van elke
    // praktijk in de lijst van deze gebruiker komen.
    expect(welUitbehandeld(losseTherapeut)).toEqual({
      careStatuses: { some: { practiceId: { in: [] } } },
    })
  })
})

describe('uitbehandeldDoorIedereen', () => {
  const praktijkMarkering = { practiceId: 'p1', coachId: null }
  const coachMarkering = { practiceId: null, coachId: 'c1' }

  it('is onwaar zonder markeringen', () => {
    expect(uitbehandeldDoorIedereen([therapeut], [])).toBe(false)
  })

  it('is waar als de enige behandelaar heeft afgesloten', () => {
    expect(uitbehandeldDoorIedereen([therapeut], [praktijkMarkering])).toBe(true)
  })

  it('laat de patiënt lopen als één behandelaar niet heeft afgesloten', () => {
    // Het scenario uit inviteCoMonitor: coach C archiveert de atleet, maar
    // therapeut T uit praktijk P behandelt door. Zou dit true worden, dan
    // vielen de signalen en de push van T stil zonder enige melding.
    expect(uitbehandeldDoorIedereen([therapeut, coach], [coachMarkering])).toBe(false)
    expect(uitbehandeldDoorIedereen([therapeut, coach], [praktijkMarkering])).toBe(false)
  })

  it('is waar als beide scopes hebben afgesloten', () => {
    expect(
      uitbehandeldDoorIedereen([therapeut, coach], [coachMarkering, praktijkMarkering]),
    ).toBe(true)
  })

  it('houdt praktijken uit elkaar', () => {
    const anderePraktijk = { id: 't9', role: 'THERAPIST' as const, practiceId: 'p2' }
    expect(uitbehandeldDoorIedereen([anderePraktijk], [praktijkMarkering])).toBe(false)
  })

  it('telt een behandelaar zonder eigen scope als doorbehandelen', () => {
    // Een therapeut zonder praktijk kan zelf geen markering zetten, dus zijn
    // tak is per definitie niet afgesloten. Veilige kant: patiënt blijft in
    // beeld in plaats van stil te vallen.
    expect(uitbehandeldDoorIedereen([losseTherapeut], [praktijkMarkering])).toBe(false)
  })

  it('is ONWAAR bij nul behandelaars, ook met een lopende markering', () => {
    // De enige tak die je niet aan de code kunt aflezen: `every` op een lege
    // verzameling is vacuously true, dus zonder expliciete guard zou "niemand
    // behandelt deze persoon" hetzelfde antwoord geven als "iedereen is met hem
    // klaar". Het pad bestaat echt: shop.activateProgram zet een actief
    // programma klaar voor een koper zonder enige PatientTherapist-relatie, en
    // die hoort zijn dagelijkse herinnering te houden.
    expect(uitbehandeldDoorIedereen([], [praktijkMarkering])).toBe(false)
    expect(uitbehandeldDoorIedereen([], [praktijkMarkering, coachMarkering])).toBe(false)
    expect(uitbehandeldDoorIedereen([], [])).toBe(false)
  })
})
