/**
 * Bewaartermijn van berichten in de app, in dagen. Hier los van de server-code
 * zodat client-componenten hem kunnen tonen zonder Prisma mee te bundelen.
 * De uitleg en de opruimlogica staan in `src/server/lib/message-retention.ts`.
 */
export const MESSAGE_RETENTION_DAYS = 30
