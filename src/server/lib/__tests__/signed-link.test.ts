import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { signLink, verifyLink } from '../signed-link'

const ORIGINEEL = process.env.SUPABASE_SERVICE_ROLE_KEY

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-sleutel-voor-links'
})
afterEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINEEL
})

describe('ondertekende links', () => {
  it('geeft het id terug voor een geldig token', () => {
    const token = signLink('invite', 'clx123abc')
    expect(token.startsWith('clx123abc.')).toBe(true)
    expect(verifyLink('invite', token)).toBe('clx123abc')
  })

  it('bevat alleen url-veilige tekens', () => {
    expect(signLink('group-leave', '3f2a9c1e-4b5d-4e6f-8a7b-9c0d1e2f3a4b')).toMatch(/^[A-Za-z0-9._-]+$/)
  })

  it('weigert een token van een andere scope', () => {
    const token = signLink('invite', 'clx123abc')
    expect(verifyLink('group-leave', token)).toBeNull()
  })

  it('weigert een aangepast id of een aangepaste handtekening', () => {
    const token = signLink('invite', 'clx123abc')
    const [id, sig] = token.split('.')
    expect(verifyLink('invite', `clx123abd.${sig}`)).toBeNull()
    expect(verifyLink('invite', `${id}.${sig.slice(0, -1)}x`)).toBeNull()
  })

  it('weigert rommel zonder te gooien', () => {
    expect(verifyLink('invite', '')).toBeNull()
    expect(verifyLink('invite', 'geen-punt')).toBeNull()
    expect(verifyLink('invite', '..')).toBeNull()
    expect(verifyLink('invite', 'a.b.c')).toBeNull()
  })

  it('verandert mee met de sleutel', () => {
    const token = signLink('invite', 'clx123abc')
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'andere-sleutel'
    expect(verifyLink('invite', token)).toBeNull()
  })
})
