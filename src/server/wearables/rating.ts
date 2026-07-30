/**
 * Demp-aanbod-regel voor de beoordeel-popup: bij elke derde overgeslagen rit
 * van hetzelfde type (3, 6, 9, …) bieden we aan om dat type stil te houden,
 * zolang het niet al gedempt is. De teller is zelf de throttle: het aanbod
 * komt hooguit één keer per drie skips, zonder "al aangeboden"-boekhouding.
 */
export function shouldOfferRatingMute(skippedOfType: number, muted: boolean): boolean {
  return !muted && skippedOfType >= 3 && skippedOfType % 3 === 0
}
