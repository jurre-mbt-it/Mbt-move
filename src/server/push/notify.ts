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
      title: { nl: 'Nieuw schema', en: 'New schedule' },
      body: {
        nl: 'Je therapeut heeft je oefeningen voor de komende periode klaargezet.',
        en: 'Your therapist has set up your exercises for the coming period.',
      },
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
      title: { nl: 'Je training van vandaag', en: 'Your training for today' },
      body: {
        nl: 'Je hebt vandaag een training op het programma staan. Consistentie is enorm belangrijk voor je herstel en progressie.',
        en: 'You have a training session on the program today. Consistency matters a lot for your recovery and progress.',
      },
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
          title: { nl: 'Je bent goed hersteld', en: 'You are well recovered' },
          body: {
            nl: 'Je slaap en herstel zien er goed uit vandaag. Een prima dag om iets steviger te trainen.',
            en: 'Your sleep and recovery look good today. A good day to train a bit harder.',
          },
        }
      : {
          title: { nl: 'Je herstel is wat lager', en: 'Your recovery is a bit lower' },
          body: {
            nl: 'Je lichaam heeft nog wat herstel nodig. Houd je training vandaag rustiger aan en geef je herstel de ruimte.',
            en: 'Your body still needs some recovery. Keep today’s training easier and give recovery the room it needs.',
          },
        }
  await sendPush(patientId, { ...msg, data: { type: 'recovery', level } }, 'insight')
}

/** Belasting loopt te hard op (overload_risk). */
export async function notifyLoadWarning(patientId: string): Promise<void> {
  await sendPush(
    patientId,
    {
      title: { nl: 'Let op je opbouw', en: 'Watch your build-up' },
      body: {
        nl: 'Je belasting loopt deze week flink op. Let goed op je herstel, zo blijf je klachtenvrij opbouwen.',
        en: 'Your load is climbing fast this week. Pay close attention to your recovery so you keep building up without complaints.',
      },
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
      title: { nl: 'Criterium behaald', en: 'Criterion achieved' },
      body: {
        nl: 'Je hebt een doel behaald. Mooi werk, je bent weer een stap verder in je herstel!',
        en: 'You reached a goal. Nice work, you are another step further in your recovery!',
      },
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
