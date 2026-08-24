import { describe, expect, it } from 'vitest'

import {
  decryptAtRest, encryptAtRest, openJson, sealJson, sha256Key, signState, verifyState,
} from '../token-crypto'

const secret = 'test-secret'
const key = sha256Key(secret)

describe('token-crypto', () => {
  it('state: sign → verify geeft de userId terug', () => {
    expect(verifyState(secret, signState(secret, 'user-1', 60_000))).toBe('user-1')
  })

  it('state: verlopen of geknoeid → null', () => {
    expect(verifyState(secret, signState(secret, 'user-1', -1))).toBeNull()
    expect(verifyState(secret, signState('ander-secret', 'user-1', 60_000))).toBeNull()
    expect(verifyState(secret, null)).toBeNull()
    expect(verifyState(secret, 'geen.echte.state')).toBeNull()
  })

  it('sealJson → openJson roundtrip; verlopen of verkeerde sleutel → null', () => {
    const blob = sealJson(key, { a: 1 }, 60_000)
    expect(openJson(key, blob)).toMatchObject({ a: 1 })
    expect(openJson(key, sealJson(key, { a: 1 }, -1))).toBeNull()
    expect(openJson(sha256Key('andere'), blob)).toBeNull()
    expect(openJson(key, null)).toBeNull()
    expect(openJson(key, 'nonsens')).toBeNull()
  })

  it('at-rest: roundtrip + legacy plaintext blijft ongewijzigd', () => {
    const enc = encryptAtRest(key, 'tok')
    expect(enc.startsWith('enc:v1:')).toBe(true)
    expect(decryptAtRest(key, enc)).toBe('tok')
    expect(decryptAtRest(key, 'plaintext-legacy')).toBe('plaintext-legacy')
  })
})
