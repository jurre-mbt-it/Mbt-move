import { describe, expect, it } from 'vitest'

import { isStravaAuthError } from '../strava/sync'

describe('isStravaAuthError', () => {
  it('herkent een geweigerd token: 401 op de API, 400/401 bij refresh', () => {
    expect(isStravaAuthError(new Error('strava_api_401_/athlete'))).toBe(true)
    expect(isStravaAuthError(new Error('strava_token_400'))).toBe(true)
    expect(isStravaAuthError(new Error('strava_token_401'))).toBe(true)
  })

  it('telt tijdelijke storingen niet als ingetrokken toegang', () => {
    // Anders zou een Strava-storing of rate-limit koppelingen laten verdwijnen.
    expect(isStravaAuthError(new Error('strava_api_429_/athlete'))).toBe(false)
    expect(isStravaAuthError(new Error('strava_api_500_/athlete'))).toBe(false)
    expect(isStravaAuthError(new Error('strava_token_500'))).toBe(false)
    expect(isStravaAuthError(new Error('fetch failed'))).toBe(false)
    expect(isStravaAuthError(new Error('strava_not_connected'))).toBe(false)
  })
})
