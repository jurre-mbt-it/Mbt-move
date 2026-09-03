import { describe, it, expect, beforeAll } from 'vitest'
import { encryptToken, decryptToken, jwtExpiry } from '@/lib/kinvent/crypto'

/** Een JWT met alleen een exp-claim; de handtekening doet er hier niet toe. */
function fakeJwt(exp: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS512' })}.${b64({ sub: 'x', exp })}.handtekening`
}

beforeAll(() => {
  process.env.KINVENT_TOKEN_SECRET = 'testsecret-van-ruim-voldoende-lengte'
})

describe('encryptToken / decryptToken', () => {
  it('komt na versleutelen en ontsleutelen op hetzelfde uit', () => {
    const token = fakeJwt(1_789_898_075)
    const stored = encryptToken(token)
    expect(stored.startsWith('enc:v1:')).toBe(true)
    expect(stored).not.toContain(token)
    expect(decryptToken(stored)).toBe(token)
  })

  it('geeft bij dezelfde invoer elke keer een andere ciphertext', () => {
    // Willekeurige IV per keer: twee gelijke tokens zijn in de database niet
    // aan elkaar te herkennen.
    expect(encryptToken('abc')).not.toBe(encryptToken('abc'))
  })

  it('weigert een waarde zonder het verwachte prefix', () => {
    expect(() => decryptToken('zomaar-een-string')).toThrow()
  })

  it('weigert een ciphertext waaraan geknoeid is', () => {
    const stored = encryptToken('geheim')
    const geknoeid = stored.slice(0, -2) + (stored.endsWith('A') ? 'BB' : 'AA')
    expect(() => decryptToken(geknoeid)).toThrow()
  })
})

describe('jwtExpiry', () => {
  it('leest de vervaldatum uit de exp-claim', () => {
    const exp = 1_789_898_075
    expect(jwtExpiry(fakeJwt(exp))?.getTime()).toBe(exp * 1000)
  })

  it('geeft null voor iets dat geen JWT is', () => {
    // Precies wat productie teruggeeft als 2FA aanstaat: een kort token
    // zonder punten. Daar mag geen vervaldatum uit komen.
    expect(jwtExpiry('SMS')).toBeNull()
    expect(jwtExpiry('')).toBeNull()
  })
})
