/**
 * Tijdvenster-constanten voor de ochtendmeldingen.
 *
 * Staan apart van `send.ts` omdat dat bestand de Prisma-client importeert: wie
 * alleen deze getallen nodig heeft (de cron, de sync-melding, hun tests) zou
 * anders een databaseverbinding moeten optuigen om een uur te kunnen lezen.
 *
 * Ze horen bij elkaar in één bestand omdat ze aan elkaar vastzitten. Eindigt de
 * stilte later dan het uur waarop de ochtendmeldingen uitgaan, dan gooit
 * `sendPush` de hele ochtendbatch weg: herinnering en insight zijn niet-urgent
 * en vallen dus onder quiet hours. Die twee mogen nooit uit elkaar lopen.
 */

/** Uur (NL) waarop de ochtend-cron zijn meldingen stuurt. */
export const MORNING_PUSH_HOUR = 7

/** Default quiet-hours voor niet-urgente pushes, in minuten na middernacht. */
export const DEFAULT_QUIET_START = 21 * 60
export const DEFAULT_QUIET_END = MORNING_PUSH_HOUR * 60
