/**
 * Defensieve helper voor de app-base-URL.
 *
 * Trim whitespace/newlines van `NEXT_PUBLIC_APP_URL` en strip een trailing
 * slash, zodat callers gewoon `${getAppUrl()}/login/code` kunnen doen zonder
 * dubbele slashes of (erger) spaties in de URL — een typefout in de Vercel
 * env-var zou anders alle invite-mails breken.
 */
const FALLBACK = 'https://getbase.coach'

export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const base = raw && raw.length > 0 ? raw : FALLBACK
  return base.replace(/\/+$/, '')
}
