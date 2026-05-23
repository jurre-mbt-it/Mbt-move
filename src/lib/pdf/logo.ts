import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let cached: string | null = null

/**
 * Logo als data-URI. Inline base64 zodat de HTML self-contained is
 * en de PDF ook werkt zonder externe asset-loads (kritisch voor
 * expo-print op mobile en voor airgapped print-dialogs).
 */
export function getLogoDataUri(): string {
  if (cached) return cached
  const path = join(process.cwd(), 'public', 'Logo.jpg')
  const bytes = readFileSync(path)
  cached = `data:image/jpeg;base64,${bytes.toString('base64')}`
  return cached
}
