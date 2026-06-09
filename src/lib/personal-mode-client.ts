'use client'

/**
 * Client-helper om de persoonlijke-trainingsmodus aan/uit te zetten.
 * Roept de route-handler aan die de cookie zet; de aanroeper navigeert
 * daarna zelf (router.push + router.refresh) zodat de server-layouts de
 * nieuwe modus oppikken.
 */
export async function setPersonalMode(on: boolean): Promise<void> {
  await fetch('/api/personal-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ on }),
  })
}
