/**
 * Quick start voor nieuwe therapeuten.
 *
 * Zelfde opzet als `lib/release-notes.ts`: de inhoud staat hier als data, de
 * rendering in `/therapist/quick-start`, `components/system/QuickStartModal.tsx`
 * en de kaart op het therapeut-dashboard.
 *
 * - `path` is BEWUST zonder portaal-prefix. De pagina plakt er `usePortal().base`
 *   voor, zodat een re-export onder het coach-segment blijft werken. Zie
 *   AGENTS.md: hardcode nooit `/therapist/...` in gedeelde UI.
 * - `id` matcht een sleutel uit `onboarding.progress` (server telt of de stap
 *   echt is gedaan). Voeg je een stap toe, voeg dan daar een teller toe.
 * - Copy volgt `docs/tone-of-voice.md`, register 8. Het product heet BASE.
 */

export type QuickStartStepId = 'patient' | 'exercise' | 'program' | 'week' | 'session'

export interface QuickStartStep {
  id: QuickStartStepId
  title: string
  /** Eén zin: waarom deze stap er toe doet. */
  why: string
  /** De concrete handeling, 2 tot 4 bullets. */
  body: string[]
  /** Pad zonder portaal-prefix, bijvoorbeeld '/patients'. */
  path: string
  cta: string
}

/** localStorage-key waarmee de welkomstmodal onthoudt dat hij is weggeklikt. */
export const QUICK_START_DISMISSED_KEY = 'mbt-quick-start-dismissed'

export const quickStartIntro = {
  lead:
    'Vijf stappen om BASE in gebruik te nemen. Ze vinken zichzelf af zodra je ze echt hebt gedaan, dus je kunt hier altijd terugkomen om te zien waar je was gebleven.',
  welcome:
    'Je account staat klaar. Vijf stappen en je hebt BASE draaien voor je eerste patiënt.',
}

export const quickStartSteps: QuickStartStep[] = [
  {
    id: 'patient',
    title: 'Nodig je eerste patiënt uit',
    why: 'Zonder patiënt blijft de rest van de app leeg.',
    body: [
      'Ga naar Patiënten en klik op Uitnodigen. Naam, e-mailadres en geboortejaar zijn genoeg.',
      'Kies patiënt of atleet. Die keuze bepaalt welk portaal er opengaat: herstel of training.',
      'De uitnodiging gaat per mail. Na het accepteren van de verwerkersovereenkomst staat het dossier klaar.',
    ],
    path: '/patients',
    cta: 'Naar patiënten',
  },
  {
    id: 'exercise',
    title: 'Voeg een oefening toe',
    why: 'De bibliotheek is al gevuld, maar wat jij mist voeg je zelf toe.',
    body: [
      'Kijk bij Oefeningen eerst of het er al in staat. Filter op categorie, spiergroep of je eigen collecties.',
      'Mis je iets, maak het dan aan met video, instructie en spierbelasting.',
      'Let op: wat jij aanmaakt is zichtbaar voor je collega\'s in dezelfde praktijk, niet alleen voor jou.',
    ],
    path: '/exercises/new',
    cta: 'Oefening aanmaken',
  },
  {
    id: 'program',
    title: 'Bouw een programma',
    why: 'Een programma is de set oefeningen die je patiënt thuis of in de gym doet.',
    body: [
      'In de Builder zet je oefeningen op weken en dagen, met sets, herhalingen en rust.',
      'Per oefening kun je een voorschrift meegeven: RPE, percentage van 1RM of onder de dagelijkse max.',
      'Koppel het programma daarna aan een patiënt vanaf de patiëntpagina. Meerdere programma\'s naast elkaar mag.',
    ],
    path: '/programs/new',
    cta: 'Naar de builder',
  },
  {
    id: 'week',
    title: 'Zet de week klaar',
    why: 'Het weekschema bepaalt wat je patiënt per dag te zien krijgt.',
    body: [
      'Sleep workouts naar dagen, of zet een plan-sjabloon vanaf een datum op de kalender.',
      'Rustdagen, notities en tests plan je mee. Die zijn voor jou, de patiënt ziet alleen de workouts.',
      'Wat hier staat verschijnt in het schema van de patiënt, zowel in de web-app als op de telefoon.',
    ],
    path: '/week-planner',
    cta: 'Naar het weekschema',
  },
  {
    id: 'session',
    title: 'Log je eerste behandeling',
    why: 'Wat je logt voedt de belasting-curve en de signalen op je dashboard.',
    body: [
      'Op je dashboard staat de knop Start behandeling. Kies de patiënt die voor je staat en je zit meteen in het behandelscherm.',
      'Je logt per set wat er werkelijk is gedaan. Bij het afronden vul je RPE, gevoel en eventueel pijn in.',
      'Na een stuk of acht sessies loopt de belasting-curve en komen de eerste signalen binnen.',
    ],
    // Wijst naar de knop op het dashboard, niet naar de patiëntenlijst: daar
    // stond je vroeger met een lijst namen en geen volgende stap. De param
    // laat `StartTreatmentCard` even oplichten. Zie START_TREATMENT_PARAM.
    path: '/dashboard?start=behandeling',
    cta: 'Start een behandeling',
  },
]
