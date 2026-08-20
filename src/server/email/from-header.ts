/**
 * Bouwt het `From`-veld.
 *
 * Het adres ligt vast op het geverifieerde domein. Alleen de weergavenaam
 * wisselt, en die komt uit gebruikersinvoer: een praktijknaam die iemand zelf
 * heeft ingetypt. Vandaar het quoten en het strippen van regelovergangen. Een
 * newline in een headerveld is de klassieke header-injectie bij mail-API's.
 */
import type { EmailSender } from './sender'

export const MAIL_FROM_ADDRESS = 'noreply@getbase.coach'

export function buildFromHeader(sender: EmailSender): string {
  const name = sender.displayName
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .trim()
  return `"${name}" <${MAIL_FROM_ADDRESS}>`
}
