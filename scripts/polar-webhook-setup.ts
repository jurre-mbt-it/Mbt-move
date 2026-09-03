/**
 * Eenmalige setup/beheer van de Polar AccessLink-webhook (max 1 per client).
 *
 * Gebruik:
 *   npx tsx scripts/polar-webhook-setup.ts get
 *   npx tsx scripts/polar-webhook-setup.ts create [--url https://getbase.coach/api/wearable/polar/webhook]
 *   npx tsx scripts/polar-webhook-setup.ts activate
 *   npx tsx scripts/polar-webhook-setup.ts deactivate
 *   npx tsx scripts/polar-webhook-setup.ts delete --id <webhook-id>
 *
 * UITROLVOLGORDE (belangrijk):
 *   1. Deploy eerst de app mét /api/wearable/polar/webhook — Polar stuurt bij
 *      `create` een PING naar de URL en weigert de webhook als die geen 200
 *      teruggeeft.
 *   2. Draai dan `create`. Het antwoord bevat de `signature_secret_key`:
 *      DIT IS DE ENIGE KEER dat Polar die laat zien.
 *   3. Zet die waarde als POLAR_WEBHOOK_SECRET in Vercel + .env.local en
 *      deploy opnieuw. Zonder secret negeert de route alle events (wel 200,
 *      zodat Polar de webhook niet na 7 dagen fouten deactiveert).
 *
 * `get` toont de status; is de webhook gedeactiveerd (7 dagen fouten), zet
 * `activate` hem terug (Polar pingt dan opnieuw).
 */
import { existsSync } from 'fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const API = 'https://www.polaraccesslink.com/v3/webhooks'
const DEFAULT_URL = 'https://getbase.coach/api/wearable/polar/webhook'
const EVENTS = ['EXERCISE', 'SLEEP', 'CONTINUOUS_HEART_RATE', 'ACTIVITY_SUMMARY']

function basicAuth(): string {
  const id = process.env.POLAR_CLIENT_ID
  const secret = process.env.POLAR_CLIENT_SECRET
  if (!id || !secret) {
    console.error('POLAR_CLIENT_ID en POLAR_CLIENT_SECRET moeten in de env staan (.env.local).')
    process.exit(1)
  }
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function call(method: string, path = '', body?: object): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: basicAuth(),
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  console.log(`${method} ${API}${path} → ${res.status}`)
  if (!text) return
  try {
    type Hook = { signature_secret_key?: string }
    const json = JSON.parse(text) as { data?: Hook | Hook[] } & Hook
    console.log(JSON.stringify(json, null, 2))
    // Polar wikkelt responses in { data: ... } (object of array) — pak het
    // secret waar het ook zit.
    const d = json.data
    const secret =
      json.signature_secret_key ??
      (Array.isArray(d) ? d[0]?.signature_secret_key : d?.signature_secret_key)
    if (secret) {
      console.log('\n>>> BEWAAR DIT NU — Polar toont het maar één keer:')
      console.log(`>>> POLAR_WEBHOOK_SECRET=${secret}`)
      console.log('>>> Zet in Vercel (production) + .env.local en deploy opnieuw.')
    }
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
    case 'create':
      await call('POST', '', { events: EVENTS, url: arg('url') ?? DEFAULT_URL })
      break
    case 'activate':
      await call('POST', '/activate')
      break
    case 'deactivate':
      await call('POST', '/deactivate')
      break
    case 'delete': {
      const id = arg('id')
      if (!id) {
        console.error('delete vereist --id <webhook-id> (zie `get`).')
        process.exit(1)
      }
      await call('DELETE', `/${id}`)
      break
    }
    default:
      console.log('Gebruik: get | create [--url ...] | activate | deactivate | delete --id <id>')
      process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
