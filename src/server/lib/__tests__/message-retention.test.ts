import { describe, it, expect, vi } from 'vitest'
import { MESSAGE_RETENTION_DAYS, messageRetentionCutoff, purgeExpiredMessages } from '../message-retention'

describe('message-retention', () => {
  it('bewaart berichten 30 dagen', () => {
    expect(MESSAGE_RETENTION_DAYS).toBe(30)
    const now = new Date('2026-09-18T02:00:00Z')
    expect(messageRetentionCutoff(now).toISOString()).toBe('2026-08-19T02:00:00.000Z')
  })

  it('wist alleen berichten die vóór de grens zijn verzonden', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 3 })
    const prisma = { message: { deleteMany } } as unknown as Parameters<typeof purgeExpiredMessages>[0]
    const now = new Date('2026-09-18T02:00:00Z')

    const result = await purgeExpiredMessages(prisma, now)

    expect(deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-08-19T02:00:00Z') } },
    })
    expect(result).toEqual({ deleted: 3, cutoff: new Date('2026-08-19T02:00:00Z') })
  })
})
