/**
 * Namen van activiteiten. Eén bron voor elke plek die een gelogde activiteit
 * benoemt: de kalender, het dossier, de voortgang, de therapeut-feed.
 *
 * Waarom apart van `cardio-constants.ts`: dat bestand beschrijft wat je kunt
 * VOORSCHRIJVEN (label, icoon, eenheid, omschrijving — een keuzelijst). Dit
 * bestand beschrijft wat er TERUGKOMT uit een sync, en dat is een veel langere
 * staart. Alles wat de brug niet kent valt naar `OTHER` met het ruwe bron-type
 * ernaast in `CardioLog.sourceActivity`; zonder de tabel hieronder heet een
 * potje padel gewoon "Cardio", en stond een hike van 18 kilometer in de
 * kalender als "Cardio".
 *
 * Dit is een van de bewust gespiegelde stukken met de mobiele repo
 * (`lib/home-tiles.ts` daar). `npm run check:mirror` laadt beide bestanden en
 * eist dezelfde uitkomst voor dezelfde invoer — commentaar is een afspraak,
 * dat script is de controle erop.
 */

export type CardioLocale = 'nl' | 'en'

/** Namen van de activiteiten uit onze eigen enum. */
export const CARDIO_LABEL: Record<string, string> = {
  RUNNING: 'Hardlopen',
  CYCLING: 'Fietsen',
  ROWING: 'Roeien',
  SWIMMING: 'Zwemmen',
  WALKING: 'Wandelen',
  HIKING: 'Hiken',
  CROSSTRAINER: 'Crosstrainer',
  SKIERG: 'SkiErg',
  ASSAULT_BIKE: 'Assault Bike',
  WATTBIKE: 'Wattbike',
  STAIRCLIMBER: 'Stairclimber',
  STRENGTH: 'Kracht',
  HIIT: 'HIIT',
  YOGA: 'Yoga',
  OTHER: 'Cardio',
}

export const CARDIO_LABEL_EN: Record<string, string> = {
  RUNNING: 'Running',
  CYCLING: 'Cycling',
  ROWING: 'Rowing',
  SWIMMING: 'Swimming',
  WALKING: 'Walking',
  HIKING: 'Hike',
  CROSSTRAINER: 'Cross trainer',
  SKIERG: 'SkiErg',
  ASSAULT_BIKE: 'Assault Bike',
  WATTBIKE: 'Wattbike',
  STAIRCLIMBER: 'Stair climber',
  STRENGTH: 'Strength',
  HIIT: 'HIIT',
  YOGA: 'Yoga',
  OTHER: 'Cardio',
}

/**
 * Sporten waar we niet mee rékenen maar die wel hun eigen naam verdienen. Onze
 * enum blijft klein — alleen typen die de app anders behandelt — dus alles
 * hierbuiten komt binnen als OTHER met het ruwe bron-type ernaast.
 */
const SOURCE_LABEL: Record<string, { nl: string; en: string }> = {
  pickleball: { nl: 'Padel', en: 'Pickleball' },
  padel: { nl: 'Padel', en: 'Padel' },
  tennis: { nl: 'Tennis', en: 'Tennis' },
  squash: { nl: 'Squash', en: 'Squash' },
  badminton: { nl: 'Badminton', en: 'Badminton' },
  tabletennis: { nl: 'Tafeltennis', en: 'Table tennis' },
  golf: { nl: 'Golf', en: 'Golf' },
  soccer: { nl: 'Voetbal', en: 'Football' },
  basketball: { nl: 'Basketbal', en: 'Basketball' },
  volleyball: { nl: 'Volleybal', en: 'Volleyball' },
  hockey: { nl: 'Hockey', en: 'Hockey' },
  handball: { nl: 'Handbal', en: 'Handball' },
  boxing: { nl: 'Boksen', en: 'Boxing' },
  kickboxing: { nl: 'Kickboksen', en: 'Kickboxing' },
  martialarts: { nl: 'Vechtsport', en: 'Martial arts' },
  climbing: { nl: 'Klimmen', en: 'Climbing' },
  surfingsports: { nl: 'Surfen', en: 'Surfing' },
  snowboarding: { nl: 'Snowboarden', en: 'Snowboarding' },
  downhillskiing: { nl: 'Skiën', en: 'Downhill skiing' },
  crosscountryskiing: { nl: 'Langlaufen', en: 'Cross-country skiing' },
  skating: { nl: 'Schaatsen', en: 'Skating' },
  skatingsports: { nl: 'Schaatsen', en: 'Skating' },
  jumprope: { nl: 'Touwtjespringen', en: 'Jump rope' },
  barre: { nl: 'Barre', en: 'Barre' },
  dance: { nl: 'Dansen', en: 'Dance' },
  cardiodance: { nl: 'Dansen', en: 'Cardio dance' },
  socialdance: { nl: 'Dansen', en: 'Dance' },
  taichi: { nl: 'Tai chi', en: 'Tai chi' },
  crosstraining: { nl: 'Crosstraining', en: 'Cross training' },
  mixedcardio: { nl: 'Cardio', en: 'Cardio' },
  handcycling: { nl: 'Handbiken', en: 'Hand cycling' },
  paddlesports: { nl: 'Peddelen', en: 'Paddle sports' },
  underwaterdiving: { nl: 'Duiken', en: 'Diving' },
  equestriansports: { nl: 'Paardrijden', en: 'Horse riding' },
  cooldown: { nl: 'Cooldown', en: 'Cool-down' },
  preparationandrecovery: { nl: 'Herstel', en: 'Recovery' },
}

/**
 * Onbekend ruw type leesbaar maken: "trackAndField" wordt "Track and field",
 * "gravel_ride" wordt "Gravel ride". Beter een net gespelde onbekende sport dan
 * "Cardio" voor alles wat we nog niet in een tabel hebben staan.
 */
function humanizeSource(raw: string): string {
  const words = raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  if (!words) return ''
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Naam van een activiteit. `sourceActivity` is het ruwe type van de bron en
 * wint alleen wanneer onze eigen enum niets zinnigs zegt (OTHER) — dan is dat
 * ruwe type namelijk het enige dat de sport nog benoemt.
 */
export function cardioLabel(
  activity: string,
  locale: CardioLocale = 'nl',
  sourceActivity?: string | null,
): string {
  const dict = locale === 'en' ? CARDIO_LABEL_EN : CARDIO_LABEL
  const known = dict[activity]
  if (known && activity !== 'OTHER') return known

  if (sourceActivity) {
    const key = sourceActivity.replace(/[\s_-]+/g, '').toLowerCase()
    const hit = SOURCE_LABEL[key]
    if (hit) return locale === 'en' ? hit.en : hit.nl
    // "other" en "hk-3000" zeggen niets meer dan onze eigen terugval.
    if (key !== 'other' && !key.startsWith('hk')) {
      const human = humanizeSource(sourceActivity)
      if (human) return human
    }
  }
  return known ?? 'Cardio'
}
