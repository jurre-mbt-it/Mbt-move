import { createHmac } from 'crypto'
import { describe, expect, it, vi } from 'vitest'

import { handlePolarWebhookEvent, verifyPolarSignature } from '../polar/webhook'

describe('polar webhook-signatuur', () => {
  const secret = 'whsec'
  const body = '{"event":"EXERCISE","user_id":475}'
  const sig = createHmac('sha256', secret).update(body).digest('hex')

  it('geldige HMAC-SHA256 hex → true', () => {
    expect(verifyPolarSignature(body, sig, secret)).toBe(true)
  })

  it('verkeerde signatuur, ontbrekende header of andere body → false', () => {
    const gemuteerd = (sig[0] === '0' ? '1' : '0') + sig.slice(1)
    expect(verifyPolarSignature(body, gemuteerd, secret)).toBe(false)
    expect(verifyPolarSignature(body, null, secret)).toBe(false)
    expect(verifyPolarSignature('{"iets":"anders"}', sig, secret)).toBe(false)
    expect(verifyPolarSignature(body, 'geen-hex', secret)).toBe(false)
  })
})

describe('handlePolarWebhookEvent', () => {
  it('onbekende polarUserId → handled false, geen sync', async () => {
    const db = {
      polarConnection: { findUnique: vi.fn().mockResolvedValue(null) },
    }
    const res = await handlePolarWebhookEvent(db as never, { event: 'EXERCISE', user_id: 475 })
    expect(res.handled).toBe(false)
    expect(db.polarConnection.findUnique).toHaveBeenCalledWith({ where: { polarUserId: '475' } })
  })

  it('koppeling met needsReauth → handled false (geen retry-storm)', async () => {
    const db = {
      polarConnection: {
        findUnique: vi.fn().mockResolvedValue({ userId: 'user-1', needsReauth: true }),
      },
    }
    const res = await handlePolarWebhookEvent(db as never, { event: 'SLEEP', user_id: 475 })
    expect(res.handled).toBe(false)
  })

  it('onbekend event-type → handled false', async () => {
    const db = {
      polarConnection: {
        findUnique: vi.fn().mockResolvedValue({ userId: 'user-1', needsReauth: false }),
      },
    }
    const res = await handlePolarWebhookEvent(db as never, { event: 'PHYSICAL_INFORMATION', user_id: 475 })
    expect(res.handled).toBe(false)
  })
})
