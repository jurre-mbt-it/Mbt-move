import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  KinventError,
  analyzeProtocols,
  completeSecondFactor,
  fetchDeletedProtocolCodes,
  fetchProtocolsForParticipant,
  requestSecondFactor,
  searchParticipants,
} from '@/lib/kinvent/client'

/**
 * De client tegen een nagebootste Kinvent. Alleen de HTTP-laag is nep; wat we
 * toetsen is welke endpoints hij aanroept, hoe hij batcht en wat hij van een
 * respons overhoudt. Endpoints en foutcodes volgen de spec van september 2026.
 */

type Call = { url: string; init: RequestInit }
let calls: Call[]
let responder: (url: string, init: RequestInit) => Response

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  calls = []
  responder = () => json(200, [])
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init })
      return responder(url, init)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const TOKEN = 'jwt-token'

describe('aanmelden', () => {
  const creds = { email: 'praktijk@voorbeeld.nl', password: 'geheim' }

  it('logt in met de ingetypte gegevens en meldt via welk kanaal de code komt', async () => {
    responder = () => json(200, { token: 'abc', twoFaPreferredMethod: 'EMAIL' })
    const r = await requestSecondFactor(creds)
    expect(calls[0].url).toMatch(/\/api\/authorization\/login$/)
    expect(new Headers(calls[0].init.headers).get('Authorization')).toBe(
      `Basic ${Buffer.from('praktijk@voorbeeld.nl:geheim').toString('base64')}`,
    )
    expect(r).toEqual({ kind: 'code-sent', method: 'EMAIL' })
  })

  it('is meteen klaar als het account geen tweede factor heeft', async () => {
    responder = () => json(200, { token: 'a.b.c' })
    expect(await requestSecondFactor(creds)).toEqual({ kind: 'signed-in', token: 'a.b.c' })
  })

  it('wisselt de code in voor het token', async () => {
    responder = () => json(200, { token: 'a.b.c' })
    const t = await completeSecondFactor(creds, ' 123456 ')
    expect(calls[0].url).toMatch(/\/api\/authorization\/twoFaLogin$/)
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ token: '123456' })
    expect(t).toBe('a.b.c')
  })
})

describe('searchParticipants', () => {
  it('zoekt server-side via de gepagineerde v2-call en houdt alleen het nodige over', async () => {
    responder = () =>
      json(200, {
        content: [
          {
            code: 'c1',
            firstName: 'Anna',
            lastName: 'Voorbeeld',
            dateOfBirth: 631152000000,
            email: 'niet@doorgeven.nl',
            photo: 'AAAA',
            weight: 64.6,
            dateConsentToKeepData: 0,
          },
        ],
        last: true,
      })
    const result = await searchParticipants(TOKEN, 'voorb')

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toMatch(/\/api\/participants\/v2\/paginated$/)
    expect(calls[0].init.method).toBe('POST')
    expect(new Headers(calls[0].init.headers).get('X-Auth-Token')).toBe(TOKEN)
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ query: 'voorb', page: 0, size: 25 })
    expect(result).toEqual([
      { code: 'c1', firstName: 'Anna', lastName: 'Voorbeeld', dateOfBirth: 631152000000, consentRecorded: false },
    ])
  })

  it('ziet vastgelegde consent aan een timestamp', async () => {
    responder = () => json(200, { content: [{ code: 'c2', firstName: 'B', lastName: 'C', dateConsentToKeepData: 1700000000000 }], last: true })
    const [hit] = await searchParticipants(TOKEN, 'c')
    expect(hit.consentRecorded).toBe(true)
  })
})

describe('fetchProtocolsForParticipant', () => {
  it('haalt de lichte lijst per participant op via de common-call', async () => {
    responder = () => json(200, [{ code: 'p1', participantCode: 'c1', updatedOn: 5, activities: [] }])
    const result = await fetchProtocolsForParticipant(TOKEN, 'c1')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url).toMatch(/\/api\/protocols\/common\/v1\/findByParticipantCode\?participantCode=c1$/)
    expect(result.map((p) => p.code)).toEqual(['p1'])
  })
})

describe('fetchDeletedProtocolCodes', () => {
  it('vraagt alleen de codes van verwijderde sessies op', async () => {
    responder = () => json(200, ['p9'])
    const result = await fetchDeletedProtocolCodes(TOKEN, 'c1')
    expect(calls[0].init.method ?? 'GET').toBe('GET')
    expect(calls[0].url).toMatch(/\/api\/protocols\/v2\/protocolInfoByParticipantCode\?/)
    expect(calls[0].url).toContain('participantCode=c1')
    expect(calls[0].url).toContain('deleted=true')
    expect(result).toEqual(['p9'])
  })
})

describe('analyzeProtocols', () => {
  it('vraagt samenvattingen en batcht per honderd', async () => {
    responder = (_url, init) =>
      json(200, { protocolsResults: (JSON.parse(String(init.body)) as string[]).map((c) => ({ protocolCode: c })) })
    const codes = Array.from({ length: 150 }, (_, i) => `p${i}`)
    const result = await analyzeProtocols(TOKEN, codes)
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toMatch(/\/api\/protocols\/v2\/analyze\?detailed=false$/)
    expect(JSON.parse(String(calls[0].init.body))).toHaveLength(100)
    expect(JSON.parse(String(calls[1].init.body))).toHaveLength(50)
    expect(result.map((r) => r.protocolCode)).toEqual(codes)
  })

  it('slaat bij ERR_4090 alleen het protocol zonder analyzer over', async () => {
    responder = (_url, init) => {
      const batch = JSON.parse(String(init.body)) as string[]
      if (batch.includes('zonder-analyzer')) {
        return json(404, { errorCode: 'ERR_4090', message: 'no analyzer', errorsByObjectCode: {} })
      }
      return json(200, { protocolsResults: batch.map((c) => ({ protocolCode: c })) })
    }
    const result = await analyzeProtocols(TOKEN, ['a', 'zonder-analyzer', 'b'])
    expect(result.map((r) => r.protocolCode)).toEqual(['a', 'b'])
  })

  it('meldt een verlopen token als opnieuw aanmelden', async () => {
    responder = () => new Response('', { status: 401 })
    await expect(analyzeProtocols(TOKEN, ['a'])).rejects.toMatchObject({ needsSignIn: true })
  })

  it('geeft de foutcode van Kinvent door', async () => {
    responder = () => json(403, { errorCode: 'ERR_4003', message: 'not shared', errorsByObjectCode: {} })
    const err = await fetchProtocolsForParticipant(TOKEN, 'c1').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(KinventError)
    expect((err as KinventError).code).toBe('ERR_4003')
    expect((err as KinventError).status).toBe(403)
  })
})
