import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildAuthorizeUrl, openPolarTokens, sealPolarTokens, verifyPolarState } from '../polar/config'

describe('polar/config', () => {
  beforeEach(() => {
    process.env.POLAR_CLIENT_ID = 'cid'
    process.env.POLAR_CLIENT_SECRET = 'csecret'
    process.env.NEXT_PUBLIC_APP_URL = 'https://getbase.coach'
  })
  afterEach(() => {
    delete process.env.POLAR_CLIENT_ID
    delete process.env.POLAR_CLIENT_SECRET
  })

  it('authorize-URL bevat client_id, redirect_uri, scope en getekende state', () => {
    const u = new URL(buildAuthorizeUrl('user-1'))
    expect(u.origin + u.pathname).toBe('https://flow.polar.com/oauth2/authorization')
    expect(u.searchParams.get('client_id')).toBe('cid')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('scope')).toBe('accesslink.read_all')
    expect(u.searchParams.get('redirect_uri')).toBe('https://getbase.coach/api/wearable/polar/callback')
    expect(verifyPolarState(u.searchParams.get('state'))).toBe('user-1')
  })

  it('sealPolarTokens → openPolarTokens roundtrip; kapotte blob → null', () => {
    const t = { accessToken: 'tok', expiresAt: 1_900_000_000, polarUserId: '627139' }
    expect(openPolarTokens(sealPolarTokens(t))).toEqual(t)
    expect(openPolarTokens('nonsens')).toBeNull()
    expect(openPolarTokens(null)).toBeNull()
  })
})
