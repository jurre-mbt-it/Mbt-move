import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../strava/sync', () => ({
  syncStravaActivity: vi.fn(),
  removeStravaActivity: vi.fn(),
  isStravaAccessRevoked: vi.fn(),
}))

import { isStravaAccessRevoked, removeStravaActivity, syncStravaActivity } from '../strava/sync'
import { handleStravaWebhookEvent, stravaSubscriptionChallenge } from '../strava/webhook'

const params = (o: Record<string, string>) => new URLSearchParams(o)

describe('stravaSubscriptionChallenge', () => {
  it('geldig verify-token → 200 met hub.challenge', () => {
    const r = stravaSubscriptionChallenge(
      params({ 'hub.mode': 'subscribe', 'hub.verify_token': 'geheim', 'hub.challenge': 'abc123' }),
      'geheim',
    )
    expect(r).toEqual({ status: 200, body: { 'hub.challenge': 'abc123' } })
  })

  it('verkeerd token, verkeerde mode of ontbrekende challenge → 403', () => {
    expect(stravaSubscriptionChallenge(params({ 'hub.mode': 'subscribe', 'hub.verify_token': 'fout', 'hub.challenge': 'x' }), 'geheim').status).toBe(403)
    expect(stravaSubscriptionChallenge(params({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'geheim', 'hub.challenge': 'x' }), 'geheim').status).toBe(403)
    expect(stravaSubscriptionChallenge(params({ 'hub.mode': 'subscribe', 'hub.verify_token': 'geheim' }), 'geheim').status).toBe(403)
  })

  it('geen verify-token geconfigureerd → 503 (fail-closed)', () => {
    expect(stravaSubscriptionChallenge(params({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': 'x' }), undefined).status).toBe(503)
  })
})

describe('handleStravaWebhookEvent', () => {
  const conn = { userId: 'user-1' }
  const db = () => ({
    stravaConnection: { findUnique: vi.fn().mockResolvedValue(conn), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    wearableConnection: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  })

  beforeEach(() => {
    vi.mocked(syncStravaActivity).mockReset()
    vi.mocked(removeStravaActivity).mockReset()
    vi.mocked(isStravaAccessRevoked).mockReset()
  })

  it('onbekende owner_id → handled false, geen sync', async () => {
    const d = db()
    d.stravaConnection.findUnique.mockResolvedValue(null)
    const res = await handleStravaWebhookEvent(d as never, { object_type: 'activity', aspect_type: 'create', object_id: 1, owner_id: 99 })
    expect(res.handled).toBe(false)
    expect(d.stravaConnection.findUnique).toHaveBeenCalledWith({ where: { athleteId: '99' }, select: { userId: true } })
    expect(syncStravaActivity).not.toHaveBeenCalled()
  })

  it('activity create/update → gerichte sync van die activiteit', async () => {
    vi.mocked(syncStravaActivity).mockResolvedValue(true)
    const res = await handleStravaWebhookEvent(db() as never, { object_type: 'activity', aspect_type: 'create', object_id: 555, owner_id: 42 })
    expect(res).toEqual({ handled: true, action: 'synced' })
    expect(syncStravaActivity).toHaveBeenCalledWith(expect.anything(), 'user-1', 555)
  })

  it('activity delete → rij weg', async () => {
    vi.mocked(removeStravaActivity).mockResolvedValue(true)
    const res = await handleStravaWebhookEvent(db() as never, { object_type: 'activity', aspect_type: 'delete', object_id: 555, owner_id: 42 })
    expect(res).toEqual({ handled: true, action: 'removed' })
    expect(removeStravaActivity).toHaveBeenCalledWith(expect.anything(), 'user-1', 555)
  })

  it('athlete deauthorize, door Strava bevestigd → koppeling verwijderd', async () => {
    vi.mocked(isStravaAccessRevoked).mockResolvedValue(true)
    const d = db()
    const res = await handleStravaWebhookEvent(d as never, { object_type: 'athlete', aspect_type: 'update', object_id: 42, owner_id: 42, updates: { authorized: 'false' } })
    expect(res).toEqual({ handled: true, action: 'deauthorized' })
    expect(isStravaAccessRevoked).toHaveBeenCalledWith(expect.anything(), 'user-1')
    expect(d.stravaConnection.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(d.wearableConnection.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', provider: 'STRAVA' } })
  })

  it('athlete deauthorize terwijl het token bij Strava nog werkt → genegeerd, niets verwijderd', async () => {
    // Events zijn ongesigneerd. Wie een atleet-id raadt, mag daarmee niet
    // andermans koppeling kunnen slopen (audit 2026-09-13).
    vi.mocked(isStravaAccessRevoked).mockResolvedValue(false)
    const d = db()
    const res = await handleStravaWebhookEvent(d as never, { object_type: 'athlete', aspect_type: 'update', object_id: 42, owner_id: 42, updates: { authorized: 'false' } })
    expect(res).toEqual({ handled: true, action: 'ignored' })
    expect(d.stravaConnection.deleteMany).not.toHaveBeenCalled()
    expect(d.wearableConnection.deleteMany).not.toHaveBeenCalled()
  })

  it('athlete-update zonder deauthorize (bv. privacy) → handled false, niets verwijderd', async () => {
    const d = db()
    const res = await handleStravaWebhookEvent(d as never, { object_type: 'athlete', aspect_type: 'update', object_id: 42, owner_id: 42, updates: { title: 'x' } })
    expect(res.handled).toBe(false)
    expect(d.stravaConnection.deleteMany).not.toHaveBeenCalled()
  })
})
