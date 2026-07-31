import { addDaysKey, amsMidnight, mondayKeyOf } from './week-dates'

/**
 * Vanaf welke week de planning niet meer aan de patiënt getoond wordt: de
 * eerste maandag ná de ontslagdatum, zodat de lopende week heel blijft.
 *
 * Reken in Europe/Amsterdam. WeekSchedule.startDate staat als NL-middernacht
 * opgeslagen (2026-05-03T22:00Z is maandag 4 mei), dus een UTC-vergelijking
 * zet de knip een hele week verkeerd. Vandaar de helpers uit week-dates en
 * geen eigen new Date(...)-rekenwerk.
 */
export function planningCutoff(dischargedAt: Date): Date {
  const maandagVanDieWeek = mondayKeyOf(dischargedAt)
  return amsMidnight(addDaysKey(maandagVanDieWeek, 7))
}
