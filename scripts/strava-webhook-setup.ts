/**
 * Eenmalige setup/beheer van de Strava push-subscription (max 1 per API-app).
 *
 * Gebruik:
 *   npx tsx scripts/strava-webhook-setup.ts get
 *   npx tsx scripts/strava-webhook-setup.ts create [--url https://getbase.coach/api/wearable/strava/webhook]
 *   npx tsx scripts/strava-webhook-setup.ts delete --id <subscription-id>
 *
 * UITROLVOLGORDE (belangrijk):
 *   1. Kies een STRAVA_WEBHOOK_VERIFY_TOKEN (willekeurige string, bv.
 *      `openssl rand -hex 24`) en zet die in Vercel (production) + .env.local.
 *   2. Deploy de app mét /api/wearable/strava/webhook. Strava doet bij
 *      `create` een GET naar de URL met hub.verify_token en verwacht binnen
 *      2 s een 200 met de hub.challenge terug — zonder deploy of zonder
 *      token in de env mislukt het aanmaken.
 *   3. Draai `create`. Vanaf dan pusht Strava elke nieuwe/gewijzigde/
 *      verwijderde activiteit van gekoppelde gebruikers; de dagelijkse
 *      strava-sync-cron blijft het vangnet.
 *
 * Let op: de callback-URL moet op het "Authorization Callback Domain" van de
 * Strava-API-app zitten (getbase.coach).
 */
import { existsSync } from 'fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const API = 'https://www.strava.com/api/v3/push_subscriptions'
const DEFAULT_URL = 'https://getbase.coach/api/wearable/strava/webhook'

function creds(): { client_id: string; client_secret: string } {
  const client_id = process.env.STRAVA_CLIENT_ID
  const client_secret = process.env.STRAVA_CLIENT_SECRET
  if (!client_id || !client_secret) {
    console.error('STRAVA_CLIENT_ID en STRAVA_CLIENT_SECRET moeten in de env staan (.env.local).')
    process.exit(1)
  }
  return { client_id, client_secret }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function call(method: string, path = '', form?: Record<string, string>): Promise<void> {
  const c = creds()
  const url = new URL(`${API}${path}`)
  // Strava neemt de credentials voor GET/DELETE als query, voor POST als form.
  if (method !== 'POST') Object.entries(c).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url, {
    method,
    headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: form ? new URLSearchParams({ ...c, ...form }).toString() : undefined,
  })
  const text = await res.text()
  console.log(`${method} ${API}${path} → ${res.status}`)
  if (!text) return
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2))
  } catch {
    console.log(text)
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2]
  switch (cmd) {
    case 'get':
      await call('GET')
      break
    case 'create': {
      const verify = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN
      if (!verify) {
        console.error('STRAVA_WEBHOOK_VERIFY_TOKEN ontbreekt in de env — zet dezelfde waarde in Vercel én .env.local.')
        process.exit(1)
      }
      await call('POST', '', { callback_url: arg('url') ?? DEFAULT_URL, verify_token: verify })
      break
    }
    case 'delete': {
      const id = arg('id')
      if (!id) {
        console.error('delete vereist --id <subscription-id> (zie `get`).')
        process.exit(1)
      }
      await call('DELETE', `/${id}`)
      break
    }
    default:
      console.log('Gebruik: get | create [--url ...] | delete --id <id>')
      process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
