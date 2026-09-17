/**
 * Ondertekende links in mails: `<id>.<handtekening>`.
 *
 * Twee mails sturen de ontvanger naar een pagina die zonder login iets doet
 * met een rij uit de database: de uitnodiging (inloggen in de app) en "uit
 * de groep stappen". Het id alleen is dan niet genoeg, want ids zijn te raden
 * of te lezen uit andere schermen. De handtekening bewijst dat de link uit
 * onze mail komt. De scope zit in de handtekening, zodat een
 * uitnodigingstoken nooit als groepstoken doorgaat.
 *
 * Sleutel: `SIGNED_LINK_SECRET`, en anders afgeleid van de service-role-key
 * van Supabase. Geen nieuwe env en geen migratie; roteert die key, dan
 * vervallen openstaande links. Dat is een venster van dagen, geen data.
 */
import crypto from 'node:crypto'

export type LinkScope = 'invite' | 'group-leave'

function sleutel(): Buffer {
  const geheim = process.env.SIGNED_LINK_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!geheim) throw new Error('Geen sleutel voor ondertekende links: SUPABASE_SERVICE_ROLE_KEY ontbreekt')
  return crypto.createHash('sha256').update(`base-signed-link:${geheim}`).digest()
}

function handtekening(scope: LinkScope, id: string): string {
  return crypto.createHmac('sha256', sleutel()).update(`${scope}:${id}`).digest('base64url')
}

/** `<id>.<handtekening>`; het id mag geen punt bevatten (cuid en uuid doen dat niet). */
export function signLink(scope: LinkScope, id: string): string {
  if (!id || id.includes('.')) throw new Error('Ongeldig id voor een ondertekende link')
  return `${id}.${handtekening(scope, id)}`
}

/** Het id uit een token, of null als de handtekening niet klopt. Gooit nooit op invoer. */
export function verifyLink(scope: LinkScope, token: string): string | null {
  if (typeof token !== 'string' || token.length > 300) return null
  const delen = token.split('.')
  if (delen.length !== 2) return null
  const [id, sig] = delen
  if (!id || !sig) return null
  let verwacht: string
  try {
    verwacht = handtekening(scope, id)
  } catch {
    return null
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(verwacht)
  if (a.length !== b.length) return null
  return crypto.timingSafeEqual(a, b) ? id : null
}
