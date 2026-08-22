/**
 * Taal van de gebruiker op de server. De iOS-app zet `User.locale` bij
 * inloggen en bij wisselen in Instellingen (`auth.setLocale`); de website is
 * Nederlands en raakt dit veld niet.
 *
 * Wat hier in het Engels wordt gerenderd: pushmeldingen (`sendPush`) en de
 * foutmeldingen die een procedure gooit (vertaald in de errorFormatter in
 * trpc.ts via `ERROR_MESSAGES`). E-mails en de website blijven Nederlands.
 */
import type { Locale as PrismaLocale } from '@prisma/client'

export type Locale = PrismaLocale

export const DEFAULT_LOCALE: Locale = 'NL'

/** Een tekst in beide talen, of één string die voor beide geldt. */
export type Localized = string | { nl: string; en: string }

export function pick(locale: Locale | null | undefined, text: Localized): string {
  if (typeof text === 'string') return text
  return locale === 'EN' ? text.en : text.nl
}

/** Onbekende of oude waarden (client stuurt 'en'/'nl' in kleine letters) normaliseren. */
export function toLocale(value: unknown): Locale {
  return typeof value === 'string' && value.toUpperCase() === 'EN' ? 'EN' : 'NL'
}
