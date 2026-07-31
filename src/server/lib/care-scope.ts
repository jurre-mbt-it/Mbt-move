import { TRPCError } from '@trpc/server'
import type { Prisma } from '@prisma/client'

/**
 * Scope-sleutel voor PatientCareStatus. Een uitbehandel-markering geldt binnen
 * één praktijk of bij één coach, nooit globaal: dezelfde persoon kan tegelijk
 * coach-atleet en praktijk-patiënt zijn (patients.inviteCoMonitor maakt die
 * combinatie), en de coach-rol staat bewust buiten de praktijk (AGENTS.md).
 *
 * Bind de praktijk-tak expliciet aan de rol, niet aan een gevulde practiceId:
 * patiënten en atleten krijgen bij een invite dezelfde practiceId als hun
 * therapeut. Zonder die rol-binding zou elke patiënt de markeringen van elke
 * medepatiënt zien en kunnen zetten. Zelfde regel als practiceScope() in
 * patient-access.ts, met één bewust verschil: ADMIN valt hier wél in de
 * praktijk-tak, want een admin beheert vanuit zijn eigen praktijk.
 */
export type ScopeUser = { id: string; role: string; practiceId: string | null }

/**
 * Precies één van beide is gevuld. De CHECK-constraint
 * `patient_care_status_one_scope` dwingt dezelfde regel af in de database.
 */
export type CareScopeKey =
  | { practiceId: string; coachId: null }
  | { practiceId: null; coachId: string }

/**
 * Schrijfvariant: gooit als er geen geldige scope is. Een rij aanmaken zonder
 * scope mag niet, want zo'n rij is daarna in geen enkele lijst terug te vinden.
 */
export function careScopeKey(user: ScopeUser): CareScopeKey {
  if (user.role === 'COACH') return { practiceId: null, coachId: user.id }
  if (user.role === 'THERAPIST' || user.role === 'ADMIN') {
    if (!user.practiceId) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Dit account hoort bij geen praktijk. Koppel eerst een praktijk.',
      })
    }
    return { practiceId: user.practiceId, coachId: null }
  }
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Alleen een therapeut of een coach kan de behandelstatus beheren.',
  })
}

/**
 * Where-fragment dat precies één lopende markering aanwijst.
 *
 * `reactivatedAt: null` hoort er ONLOSMAKELIJK bij. Een gereactiveerde rij
 * blijft staan, want de reden en de toelichting van de vorige afsluiting zijn
 * een klinisch oordeel dat niet in de audit-log mag (PII) en dus nergens
 * anders bewaard wordt. Zonder deze voorwaarde zou zo'n rij uit de historie
 * de patiënt voor altijd als inactief laten gelden.
 */
export type CareScopeWhere =
  | { practiceId: string; reactivatedAt: null }
  | { coachId: string; reactivatedAt: null }

/**
 * Where-fragment om de lopende markering van deze gebruiker te vinden. Nooit
 * leeg: een lege where zou in een OR-tak de scoping volledig laten wegvallen.
 *
 * De voorwaarde `reactivatedAt: null` zit ingebakken en niet bij de caller.
 * Dit fragment belandt in tientallen `careStatuses: { none: ... }` en
 * `{ some: ... }`-filters; één plek waar hij vergeten wordt is één lijst waarin
 * een allang teruggehaalde patiënt onzichtbaar blijft, en dat merk je niet aan
 * een foutmelding.
 *
 * Gooit dezelfde fouten als {@link careScopeKey}. Gebruik deze variant op
 * schrijfpaden. Zit het fragment in een lijst- of telquery, gebruik dan
 * {@link careScopeWhereForRead}, anders krijgt een account zonder praktijk een
 * foutmelding in plaats van zijn lijst.
 */
export function careScopeWhere(user: ScopeUser): CareScopeWhere {
  const key = careScopeKey(user)
  return key.coachId !== null
    ? { coachId: key.coachId, reactivatedAt: null }
    : { practiceId: key.practiceId, reactivatedAt: null }
}

/**
 * Matcht geen enkele rij. Vers object per aanroep, zodat een caller het mag
 * uitbreiden zonder de volgende aanroep te vervuilen.
 *
 * Hier staat bewust GEEN `reactivatedAt: null` bij. Gedrag verandert er niet
 * van: een lege `in`-lijst is al onvervulbaar, en die AND-en met wat dan ook
 * blijft onvervulbaar. Maar het fragment zou er daarmee uitzien als een gewone
 * scope, en dan is `practiceId: { in: [] }` iets dat iemand later "repareert"
 * terwijl de rest van de where blijft staan. Nu is de onvervulbaarheid het hele
 * object en valt er niets aan te repareren zonder de functie te lezen.
 */
function matchtNiets(): { practiceId: { in: string[] } } {
  return { practiceId: { in: [] } }
}

/**
 * Leesvariant: gooit nooit. Zonder geldige scope (staf zonder praktijk, of een
 * rol die hier niets te zoeken heeft) komt er een filter uit dat geen enkele
 * rij matcht.
 *
 * Dat is in beide richtingen het veilige antwoord. Onder
 * `careStatuses: { none: careScopeWhereForRead(user) }` blijft iedereen actief,
 * en dat klopt: deze gebruiker heeft nooit iemand uitbehandeld. Onder
 * `{ some: ... }` blijft het archief leeg, en dat klopt ook.
 *
 * LAAT HET FILTER NOOIT WEG. Weglaten is bij `none` nog te verdedigen, maar bij
 * `some` fataal: dan komt het archief van de hele praktijk, of dat van elke
 * coach, in de lijst terecht. Eén helper voor beide richtingen houdt die
 * vergissing buiten de deur.
 *
 * Net als de schrijfvariant matcht deze alleen LOPENDE markeringen: zie
 * {@link CareScopeWhere}. Wil je juist de historie van eerdere afsluitingen
 * lezen, bouw dan een eigen where en scope hem met {@link careScopeKey}.
 */
export function careScopeWhereForRead(
  user: ScopeUser,
): CareScopeWhere | { practiceId: { in: string[] } } {
  if (user.role === 'COACH') return { coachId: user.id, reactivatedAt: null }
  if ((user.role === 'THERAPIST' || user.role === 'ADMIN') && user.practiceId) {
    return { practiceId: user.practiceId, reactivatedAt: null }
  }
  return matchtNiets()
}

/**
 * Relatie-filter op User: deze lezer heeft de patiënt NIET uitbehandeld.
 * Gebruik als tak in een where, bijvoorbeeld
 * `AND: [scopeTak, nietUitbehandeld(ctx.user)]` of, op een relatie,
 * `patient: nietUitbehandeld(ctx.user)`.
 *
 * Dit fragment stond eerst op tien plekken uitgeschreven. Achter een functie
 * is er één plek waar `some` en `none` verwisseld kunnen worden, en één plek
 * om de betekenis later te veranderen.
 */
export function nietUitbehandeld(user: ScopeUser) {
  return { careStatuses: { none: careScopeWhereForRead(user) } }
}

/**
 * Spiegelbeeld van {@link nietUitbehandeld}: alleen patiënten die deze lezer
 * WEL heeft uitbehandeld. Dit is het archief.
 *
 * Zonder geldige scope komt hier een filter uit dat niets matcht, dus een leeg
 * archief. Dat is de veilige kant: weglaten zou het archief van de hele
 * praktijk, of dat van elke coach, in de lijst zetten.
 */
export function welUitbehandeld(user: ScopeUser) {
  return { careStatuses: { some: careScopeWhereForRead(user) } }
}

/**
 * Niet-gooiende variant van {@link careScopeKey}: `null` als deze gebruiker
 * helemaal geen markering kán zetten (een therapeut zonder praktijk, of een
 * rol die hier niets te zoeken heeft).
 */
export function careScopeKeyOrNull(user: ScopeUser): CareScopeKey | null {
  if (user.role === 'COACH') return { practiceId: null, coachId: user.id }
  if (user.role === 'THERAPIST' || user.role === 'ADMIN') {
    return user.practiceId ? { practiceId: user.practiceId, coachId: null } : null
  }
  return null
}

/**
 * Welke programma's van deze patiënt horen bij de behandelaar die archiveert,
 * heractiveert of opnieuw uitnodigt?
 *
 * De uitbehandel-markering is scope-gebonden, dus de bijwerkingen moeten dat
 * ook zijn. Zonder dit predicaat zet een therapeut ook de programma's van een
 * meekijkende coach dicht, en haalt een coach die van de praktijk terug.
 *
 * Zelfde vorm als `programs.list`: een coach ziet wat hij zelf maakte
 * (coach-programma's hebben altijd `practiceId = null`), een therapeut of admin
 * ziet daarnaast alles van zijn praktijk.
 *
 * Gebruik dit op ALLE paden die `closedByDischarge` aanraken. Alleen bij het
 * heropenen scopen is erger dan niets doen: dan kan een therapeut een
 * coach-programma dichtzetten dat daarna door niemand meer automatisch
 * terugkomt.
 *
 * Staat hier en niet in patients.ts omdat `care-reactivate.ts` hem ook nodig
 * heeft; een import uit die router zou een cirkel opleveren.
 */
export function programmaScope(scope: CareScopeKey, userId: string): Prisma.ProgramWhereInput {
  if (scope.coachId !== null) return { creatorId: scope.coachId }
  return { OR: [{ practiceId: scope.practiceId }, { creatorId: userId }] }
}

/** Vorm van een lopende markering zoals de cron-jobs hem uitlezen. */
export type LopendeMarkering = { practiceId: string | null; coachId: string | null }

/**
 * Is ELKE actieve behandelaar van deze patiënt klaar met hem?
 *
 * Dit is de vraag die de cron-jobs stellen. Zij draaien zonder ingelogde lezer
 * en hebben dus geen scope om op te filteren, maar "één markering, waar dan
 * ook" is het verkeerde antwoord: deze codebase ondersteunt bewust dat één
 * persoon in twee scopes zit (`patients.inviteCoMonitor` koppelt de atleet van
 * een coach aan een praktijk-therapeut). Archiveert de coach, dan behandelt de
 * therapeut gewoon door, en dan horen de signalen en de push door te lopen.
 * Anders valt dat stil zonder dat er ergens een melding komt.
 *
 * Een behandelaar die zelf geen markering kán zetten (therapeut zonder
 * praktijk) telt als "behandelt door": zijn tak is per definitie niet
 * afgesloten, dus de patiënt blijft in beeld. Dat is de veilige kant.
 *
 * NUL actieve behandelaars is expliciet NIET uitbehandeld, en die regel staat
 * hier en niet bij de aanroepers. `every` op een lege verzameling is vacuously
 * true, dus zonder de guard hieronder zou "niemand behandelt deze persoon"
 * hetzelfde antwoord geven als "iedereen is met hem klaar". Dat is precies
 * omgekeerd aan wat de vraag bedoelt.
 *
 * Het gaat om een bestaand pad, niet om een theoretisch geval:
 * `shop.activateProgram` zet een actief programma klaar voor een koper zónder
 * enige `PatientTherapist`-relatie. Die traint op een gekocht schema en hoort
 * gewoon zijn dagelijkse herinnering te krijgen. Met de vacuous truth viel die
 * stil zodra er ergens een markering op zijn naam stond, zonder melding en
 * zonder dat het in enig scherm te zien was.
 *
 * VEREENVOUDIG DEZE GUARD NIET WEG. Hij ziet eruit als een randgeval dat `every`
 * al afhandelt, en dat is nou juist het probleem.
 */
export function uitbehandeldDoorIedereen(
  behandelaars: ScopeUser[],
  markeringen: LopendeMarkering[],
): boolean {
  if (markeringen.length === 0) return false
  if (behandelaars.length === 0) return false
  return behandelaarsDieDoorbehandelen(behandelaars, markeringen).length === 0
}

/**
 * Welke van deze behandelaars zijn NIET klaar met de patiënt?
 *
 * Los van {@link uitbehandeldDoorIedereen} nodig, want die twee vragen zijn niet
 * hetzelfde. Blijft er één behandelaar over, dan wordt de patiënt niet
 * overgeslagen, maar dat betekent niet dat iedereen bericht hoort te krijgen:
 * wie zelf heeft afgesloten, moet geen melding meer krijgen over een dossier dat
 * hij dicht heeft gezet. Bij een kritiek signaal is dat een e-mail met de naam
 * van de patiënt erin, die linkt naar een overzicht waar het item voor hem juist
 * is weggefilterd.
 *
 * Behoudt de volgorde en het type van de invoer, zodat de caller er direct ids
 * uit kan halen. Zelfde vergelijking als hierboven; een behandelaar zonder eigen
 * scope kan niets hebben afgesloten en blijft dus in de lijst.
 */
export function behandelaarsDieDoorbehandelen<T extends ScopeUser>(
  behandelaars: T[],
  markeringen: LopendeMarkering[],
): T[] {
  if (markeringen.length === 0) return [...behandelaars]
  return behandelaars.filter((behandelaar) => !heeftAfgesloten(behandelaar, markeringen))
}

/** Komt de scope van deze behandelaar voor in de lopende markeringen? */
function heeftAfgesloten(behandelaar: ScopeUser, markeringen: LopendeMarkering[]): boolean {
  const key = careScopeKeyOrNull(behandelaar)
  if (!key) return false
  return markeringen.some((m) =>
    key.coachId !== null ? m.coachId === key.coachId : m.practiceId === key.practiceId,
  )
}
