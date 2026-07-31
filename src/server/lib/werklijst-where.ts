import type { Prisma } from '@prisma/client'

/**
 * Bouwt de `AND`-takken van een patiënten-werklijst: de scope-takken samen in
 * één `OR` als tak 1, het archieffilter als tak 2. Gebruik als
 * `where: { role: ..., AND: werklijstAnd([...scope], archiefFilter) }`.
 *
 * Dit lijkt een functie die niets doet, en dat is precies de bedoeling: de
 * VORM is het punt. De verleidelijke kortere schrijfwijzen,
 *
 *   { OR: [...scope], ...archief }        // FOUT
 *   { OR: [...scope], OR: [...archief] }  // FOUT
 *
 * werken niet: bij een object-spread wint de laatste gelijknamige sleutel, dus
 * de scoping valt weg en de lijst levert patiënten van elke praktijk op. Dat is
 * het lek van 27 juli (audit H1), destijds op naam en e-mail.
 *
 * `werklijst-where.test.ts` legt de vorm vast, zodat iemand die dit later
 * terugvouwt naar één `OR` een rode test krijgt in plaats van een stil lek.
 *
 * Geef bij `include: 'all'` een leeg object als archieffilter: een lege tak
 * onder `AND` matcht alles en laat de scope-tak intact.
 */
export function werklijstAnd(
  scopeTakken: Prisma.UserWhereInput[],
  archiefFilter: Prisma.UserWhereInput,
): Prisma.UserWhereInput[] {
  return [{ OR: scopeTakken }, archiefFilter]
}
