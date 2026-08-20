/**
 * De shop staat op naam van de praktijk, niet van BASE.
 *
 * BASE is het platform dat praktijken afnemen; de shop verkoopt de programma's
 * van Movement Based Therapy zelf aan consumenten. Dat zijn twee verschillende
 * merken naar twee verschillende doelgroepen, en ze horen los van elkaar te
 * staan: op de facturen, in de mails, op het bankafschrift en in de header.
 *
 * Eén bron, zodat de twee niet opnieuw door elkaar gaan lopen. Wie hier iets
 * wijzigt, wijzigt het overal in de shop. Kom je in shop-code een merknaam
 * tegen die niet uit dit bestand komt, dan is dat een bug.
 */
export const SHOP_BRAND = {
  /** Volledige naam. Zo staat hij ook op movementbasedtherapy.nl. */
  name: 'Movement Based Therapy',
  /** Korte vorm voor krappe plekken: watermerken, kleine labels. Dit is de
   *  `alternateName` uit de schema.org-gegevens van de praktijksite. */
  short: 'MBT',
  site: 'movementbasedtherapy.nl',
  email: 'info@movementbasedtherapy.nl',
} as const
