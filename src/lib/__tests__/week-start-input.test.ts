import { describe, expect, it } from 'vitest'

import { isDateKey, mondayKey } from '../week-dates'

/**
 * De datumkiezer van "Plan naar atleet sturen" ging twee keer de mist in, en
 * allebei de keren omdat de pagina zelf datumrekende en de invoer bij élke
 * toetsaanslag omzette naar de maandag en terugschreef in het veld.
 *
 * Dit legt vast wat het scherm nu doet: `isDateKey` weigert onvolledige
 * invoer (zodat het veld met rust gelaten wordt tijdens het typen) en
 * `mondayKey` leidt de startweek af zónder de invoer aan te raken. De
 * functies komen uit week-dates.ts, dezelfde die de pagina importeert.
 */

/** Wat het scherm onder het veld toont, en wat er naar de server gaat. */
function afgeleideMaandag(veld: string): string | null {
  return isDateKey(veld) ? mondayKey(veld) : null
}

describe('startweek-invoer', () => {
  it('weigert onvolledige invoer in plaats van er een datum van te maken', () => {
    // Een `<input type="date">` geeft tijdens het typen een lege waarde door.
    // De oude code maakte daar via `new Date('')` de tekst "NaN-NaN-NaN" van;
    // het veld was daarna niet meer leeg te krijgen.
    expect(afgeleideMaandag('')).toBeNull()
    expect(afgeleideMaandag('2026-08')).toBeNull()
    expect(afgeleideMaandag('2026-08-1')).toBeNull()
    expect(afgeleideMaandag('20260810')).toBeNull()
  })

  it('springt tijdens het typen niet naar een andere week', () => {
    // "2026-08" las `new Date` als 1 augustus, waarna de maandag-berekening op
    // 27 juli uitkwam: een andere maand dan wat de gebruiker aan het typen was.
    expect(afgeleideMaandag('2026-08')).not.toBe('2026-07-27')
  })

  it('leidt de maandag af van elke gekozen dag', () => {
    expect(afgeleideMaandag('2026-08-10')).toBe('2026-08-10') // maandag zelf
    expect(afgeleideMaandag('2026-08-15')).toBe('2026-08-10') // zaterdag
    expect(afgeleideMaandag('2026-08-16')).toBe('2026-08-10') // zondag
    expect(afgeleideMaandag('2026-08-17')).toBe('2026-08-17') // volgende maandag
  })

  it('werkt over een maandgrens heen', () => {
    // Zondag 2 augustus 2026 hoort bij de week die op 27 juli begint.
    expect(afgeleideMaandag('2026-08-02')).toBe('2026-07-27')
  })

  it('houdt stand rond de zomertijd-overgang', () => {
    // De klok gaat op zondag 25 oktober 2026 terug. Een berekening die met
    // lokale middernacht en uren werkt schuift hier een dag; week-dates rekent
    // daarom vanaf het midden van de dag.
    expect(afgeleideMaandag('2026-10-25')).toBe('2026-10-19')
    expect(afgeleideMaandag('2026-10-26')).toBe('2026-10-26')
    // En vooruit, bij het ingaan van de zomertijd op 29 maart 2026.
    expect(afgeleideMaandag('2026-03-29')).toBe('2026-03-23')
    expect(afgeleideMaandag('2026-03-30')).toBe('2026-03-30')
  })
})
