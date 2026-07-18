/**
 * Domein-notificaties: dunne wrappers rond `sendPush` met de vaste, on-brand
 * copy per gebeurtenis (zie docs/push-notifications-plan.md §5b in de mobiele
 * repo). Geen PHI in title/body.
 */
import { sendPush } from './send'

/**
 * Een therapeut heeft een nieuw schema/programma aan de patiënt toegewezen.
 * Bewust geen deep-link-route: de schema-weergave verschilt per rol (PATIENT
 * heeft een schema-tab, ATHLETE ziet het op home), dus de melding opent de app
 * en de gebruiker vindt het nieuwe schema op de gebruikelijke plek.
 */
export async function notifyNewSchedule(patientId: string): Promise<void> {
  await sendPush(
    patientId,
    {
      title: 'Nieuw schema',
      body: 'Je therapeut heeft je oefeningen voor de komende periode klaargezet.',
      data: { type: 'schedule' },
    },
    'schedule',
  )
}

/** Dagelijkse herinnering: er staat vandaag training klaar. */
export async function notifyTrainingToday(patientId: string): Promise<void> {
  await sendPush(
    patientId,
    {
      title: 'Je training van vandaag',
      body: 'Je hebt vandaag een training op het programma staan. Consistentie is enorm belangrijk voor je herstel en progressie.',
      data: { type: 'reminder-training' },
    },
    'reminder',
  )
}

/** Herstel-signaal op basis van de readiness-band. Alleen bij een duidelijke
 *  afwijking (goed of laag); AMBER/LEARNING sturen we niet. */
export async function notifyRecovery(patientId: string, level: 'good' | 'low'): Promise<void> {
  const msg =
    level === 'good'
      ? {
          title: 'Je bent goed hersteld',
          body: 'Je slaap en herstel zien er goed uit vandaag. Een prima dag om iets steviger te trainen.',
        }
      : {
          title: 'Je herstel is wat lager',
          body: 'Je lichaam heeft nog wat herstel nodig. Houd je training vandaag rustiger aan en geef je herstel de ruimte.',
        }
  await sendPush(patientId, { ...msg, data: { type: 'recovery', level } }, 'insight')
}

/** Belasting loopt te hard op (overload_risk). */
export async function notifyLoadWarning(patientId: string): Promise<void> {
  await sendPush(
    patientId,
    {
      title: 'Let op je opbouw',
      body: 'Je belasting loopt deze week flink op. Let goed op je herstel, zo blijf je klachtenvrij opbouwen.',
      data: { type: 'load' },
    },
    'insight',
  )
}

/** Een rehab-criterium is behaald. */
export async function notifyRehabCriterion(patientId: string): Promise<void> {
  await sendPush(
    patientId,
    {
      title: 'Criterium behaald',
      body: 'Je hebt een doel behaald. Mooi werk, je bent weer een stap verder in je herstel!',
      data: { type: 'rehab-criterion' },
    },
    'insight',
  )
}

/** Alle criteria van de huidige fase zijn behaald: klaar voor de volgende fase. */
export async function notifyRehabPhase(patientId: string): Promise<void> {
  await sendPush(
    patientId,
    {
      title: 'Volgende fase',
      body: 'Je herstel is zover dat je aan de volgende fase kunt beginnen. Je therapeut heeft je oefeningen aangepast.',
      data: { type: 'rehab-phase' },
    },
    'insight',
  )
}
