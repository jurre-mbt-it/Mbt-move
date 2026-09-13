/**
 * Wie mag wat overschrijven als iemand meer dan één wearable draagt.
 *
 * De regel is STRIKT: de eerste bron die een dag of nacht levert, houdt hem.
 * Een tweede bron overschrijft nooit, maar vult wél aan wat de eerste leeg
 * liet. Zo kan een Polar-horloge de ademhaling aanvullen op een nacht die de
 * Apple Watch heeft vastgelegd, zonder dat diezelfde nacht bij elke sync van
 * bron wisselt en de getallen heen en weer springen.
 *
 * Workouts vallen hier buiten. Die ontdubbelen op tijd-overlap (dedupe.ts) en
 * vullen elkaars lege velden daar al aan, zodat dezelfde training nooit twee
 * keer in de kalender of de belastingscurve belandt.
 *
 * Twee dingen die bewust zo zijn:
 *
 * - **De sloten zitten in de WHERE van de schrijfactie zelf**, niet in een
 *   lees-dan-schrijf. Twee syncs die tegelijk binnenkomen kunnen elkaar zo
 *   niet overrulen; de database beslist wie er als eerste was.
 *
 * - **Weggooien mag alleen als een ánder de dag al beter vastlegde.** De
 *   iOS-bridge schuift zijn HealthKit-anker door zodra de server 200
 *   teruggeeft, ongeacht of de rij is weggeschreven: data die wij stil laten
 *   vallen komt daar nooit meer langs. Onder deze regel is dat veilig, want
 *   een dag die nog niemand heeft bestaat niet als rij en wordt dus altijd
 *   aangemaakt. Polar en Oura zijn daarnaast opnieuw op te halen (28 tot 30
 *   dagen terug), Apple niet.
 *
 * `VitalsEntry` draagt twee groepen met een eigen eigenaar: de NACHTgroep
 * (`source`) en de DAGgroep (`daySource`). Zonder die splitsing kaapt een
 * middagsync met alleen stappen het label van een rij waarvan de HRV van een
 * ander apparaat kwam, en kan de bron van die stappen ze daarna niet meer
 * bijwerken terwijl ze de hele dag oplopen.
 */
import type { Prisma, PrismaClient, WorkoutSource } from '@prisma/client'

const createId = () => crypto.randomUUID()

/** Prisma P2002 = unique-constraint-botsing (rij bestaat al, of een parallelle sync). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002'
  )
}

/** Nachtvelden van VitalsEntry: horen bij één meting, één eigenaar. */
export const NACHT_VELDEN = [
  'restingHeartRate',
  'hrv',
  'hrvType',
  'respiratoryRate',
  'wristTempDeviation',
] as const

/** Dagvelden van VitalsEntry: lopen gedurende de dag op, eigen eigenaar. */
export const DAG_VELDEN = ['steps', 'activeEnergyKcal', 'basalEnergyKcal', 'vo2Max'] as const

export type VitalsGroep = Record<string, unknown>

type SlaapDb = Pick<PrismaClient, 'sleepEntry'>
type VitalsDb = Pick<PrismaClient, 'vitalsEntry'>
type StressDb = Pick<PrismaClient, 'stressEntry'>
type ExertionDb = Pick<PrismaClient, 'exertionEntry'>

/** Wat er met een hele rij gebeurde; `geblokkeerd` = een andere bron had hem al. */
export type Uitkomst = 'geschreven' | 'geblokkeerd'

/**
 * Hele rij, strikt eerste wint: bijwerken mag alleen als de rij al van deze
 * bron is, en anders wordt hij aangemaakt. Bestaat hij van iemand anders, dan
 * blijft hij ongemoeid.
 */
async function schrijfHeleRij(
  bestaandeVanMij: () => Promise<number>,
  maakAan: () => Promise<unknown>,
  label: string,
  context: Record<string, unknown>,
): Promise<Uitkomst> {
  // Eigen rij bijwerken mag altijd: een hersync na een anchor-reset of een
  // herberekening moet gewoon landen.
  if ((await bestaandeVanMij()) > 0) return 'geschreven'
  try {
    await maakAan()
    return 'geschreven'
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    // De rij bestaat en is van een andere bron: die houdt hem. Loggen, want
    // een botsing op een tweede unique (zoals externalId) ziet er hetzelfde
    // uit en zou anders onzichtbaar blijven.
    console.warn(`[wearables] ${label} niet geschreven, bestaande rij van een andere bron`, context)
    return 'geblokkeerd'
  }
}

/** Slaapnacht: hele nacht, strikt eerste wint. */
export async function schrijfSlaapnacht(
  prisma: SlaapDb,
  userId: string,
  date: Date,
  source: WorkoutSource,
  data: Prisma.SleepEntryUpdateManyMutationInput,
): Promise<Uitkomst> {
  return schrijfHeleRij(
    async () => (await prisma.sleepEntry.updateMany({ where: { userId, date, source }, data })).count,
    () =>
      prisma.sleepEntry.create({
        data: { ...data, id: createId(), userId, date, source } as never,
      }),
    'slaapnacht',
    { userId, date: date.toISOString().slice(0, 10), source },
  )
}

/** Dagbelasting: hele dag, strikt eerste wint. */
export async function schrijfDagbelasting(
  prisma: ExertionDb,
  userId: string,
  date: Date,
  source: WorkoutSource,
  data: Prisma.ExertionEntryUpdateManyMutationInput,
): Promise<Uitkomst> {
  return schrijfHeleRij(
    async () =>
      (await prisma.exertionEntry.updateMany({ where: { userId, date, source }, data })).count,
    () =>
      prisma.exertionEntry.create({
        data: { ...data, id: createId(), userId, date, source } as never,
      }),
    'dagbelasting',
    { userId, date: date.toISOString().slice(0, 10), source },
  )
}

/** Stress: hele dag, strikt eerste wint. Vandaag levert alleen Apple dit. */
export async function schrijfStress(
  prisma: StressDb,
  userId: string,
  date: Date,
  source: WorkoutSource,
  data: Prisma.StressEntryUpdateManyMutationInput,
): Promise<Uitkomst> {
  return schrijfHeleRij(
    async () =>
      (await prisma.stressEntry.updateMany({ where: { userId, date, source }, data })).count,
    () =>
      prisma.stressEntry.create({
        data: { ...data, id: createId(), userId, date, source } as never,
      }),
    'stress',
    { userId, date: date.toISOString().slice(0, 10), source },
  )
}

/**
 * Vul uitsluitend velden die nog leeg zijn. Per veld een eigen schrijfactie
 * met `null` in de WHERE, zodat de database bepaalt of het veld nog vrij was
 * en niet een gelezen momentopname.
 *
 * `hrv` en `hrvType` gaan als paar: een HRV-waarde zonder het type erbij is
 * onbruikbaar, want SDNN (Apple) en RMSSD (Polar) zijn niet vergelijkbaar.
 */
async function vulLegeVelden(
  prisma: VitalsDb,
  userId: string,
  date: Date,
  velden: VitalsGroep,
): Promise<void> {
  const rest = { ...velden }
  if (rest.hrv !== undefined) {
    const { hrv, hrvType } = rest
    delete rest.hrv
    delete rest.hrvType
    await prisma.vitalsEntry.updateMany({
      where: { userId, date, hrv: null },
      data: { hrv, hrvType } as Prisma.VitalsEntryUpdateManyMutationInput,
    })
  }
  for (const [veld, waarde] of Object.entries(rest)) {
    await prisma.vitalsEntry.updateMany({
      where: { userId, date, [veld]: null },
      data: { [veld]: waarde } as Prisma.VitalsEntryUpdateManyMutationInput,
    })
  }
}

/**
 * Stappen: hoogste telling wint, ongeacht wie de daggroep bezit.
 *
 * Een stappenteller is een optelling over de dag, geen momentopname. Draag je
 * twee apparaten, dan telt het apparaat dat je het langst om had het eerlijkst,
 * en dat is simpelweg het hoogste getal. Eigenaarschap zou hier juist het
 * verkeerde antwoord geven: wie toevallig als eerste synct zou de dag dan
 * vastzetten op een halve telling (afspraak met Jurre, 13-09-2026, nadat een
 * Polar-sync van 8252 de stappen van een hele dag Apple Watch blokkeerde).
 *
 * De vergelijking zit in de WHERE, zodat twee syncs die tegelijk binnenkomen
 * elkaar niet omlaag kunnen trekken. Keerzijde: corrigeert een bron zijn eigen
 * telling naar BENEDEN, dan blijft de hogere staan.
 */
async function schrijfStappen(
  prisma: VitalsDb,
  userId: string,
  date: Date,
  stappen: number,
): Promise<void> {
  await prisma.vitalsEntry.updateMany({
    where: { userId, date, OR: [{ steps: null }, { steps: { lt: stappen } }] },
    data: { steps: stappen },
  })
}

/**
 * Vitals: twee groepen, elk met een eigen eigenaar. De eigenaar mag zijn eigen
 * groep bijwerken (stappen lopen de hele dag op), een andere bron mag alleen
 * vullen wat nog leeg is.
 */
export async function schrijfVitals(
  prisma: VitalsDb,
  userId: string,
  date: Date,
  source: WorkoutSource,
  nacht: VitalsGroep,
  dag: VitalsGroep,
): Promise<void> {
  // Stappen staan BUITEN het eigenaarschap: zie schrijfStappen hieronder.
  const { steps, ...dagRest } = dag
  const stappen = typeof steps === 'number' ? steps : null
  const heeftNacht = Object.keys(nacht).length > 0
  const heeftDag = Object.keys(dagRest).length > 0
  if (!heeftNacht && !heeftDag && stappen == null) return

  // Bestaat de rij nog niet, dan maakt deze bron hem aan en claimt hij alleen
  // de groepen die hij ook echt levert. Stappen gaan mee zonder claim.
  try {
    await prisma.vitalsEntry.create({
      data: {
        id: createId(),
        userId,
        date,
        ...nacht,
        ...dagRest,
        ...(stappen != null ? { steps: stappen } : {}),
        source: heeftNacht ? source : null,
        daySource: heeftDag ? source : null,
      } as Prisma.VitalsEntryUncheckedCreateInput,
    })
    return
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
  }

  if (stappen != null) await schrijfStappen(prisma, userId, date, stappen)

  if (heeftNacht) {
    // Eigenaar werkt zijn eigen groep bij; is de groep nog van niemand, dan
    // claimt deze bron hem alsnog.
    const eigen = await prisma.vitalsEntry.updateMany({
      where: { userId, date, source },
      data: nacht as Prisma.VitalsEntryUpdateManyMutationInput,
    })
    if (eigen.count === 0) {
      const geclaimd = await prisma.vitalsEntry.updateMany({
        where: { userId, date, source: null },
        data: { ...nacht, source } as Prisma.VitalsEntryUpdateManyMutationInput,
      })
      if (geclaimd.count === 0) await vulLegeVelden(prisma, userId, date, nacht)
    }
  }

  if (heeftDag) {
    const eigen = await prisma.vitalsEntry.updateMany({
      where: { userId, date, daySource: source },
      data: dagRest as Prisma.VitalsEntryUpdateManyMutationInput,
    })
    if (eigen.count === 0) {
      const geclaimd = await prisma.vitalsEntry.updateMany({
        where: { userId, date, daySource: null },
        data: { ...dagRest, daySource: source } as Prisma.VitalsEntryUpdateManyMutationInput,
      })
      if (geclaimd.count === 0) await vulLegeVelden(prisma, userId, date, dagRest)
    }
  }
}
