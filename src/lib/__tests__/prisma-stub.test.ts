import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * De build-sandbox van Vercel heeft niet altijd DATABASE_URL/DIRECT_URL. Voor
 * dat geval levert prisma.ts een stub die pas bij een ECHTE DB-call klaagt, zodat
 * `next build` het importeren van de module overleeft.
 *
 * Die stub was stuk: prisma.ts roept op moduleniveau `basePrisma.$extends(...)`
 * aan en dat is zelf al een property-toegang, dus de stub gooide tijdens de
 * import. Elke preview-build (waar deze env vars ontbreken) viel daarop om met
 * "Failed to collect configuration for /api/auth/sync-user".
 */
describe('prisma zonder DATABASE_URL (build-sandbox)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('DIRECT_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('laat zich importeren zonder te gooien', async () => {
    await expect(import('../prisma')).resolves.toBeDefined()
  })

  it('is geen thenable, zodat een await er niet op stukloopt', async () => {
    const mod = await import('../prisma')
    expect((mod.prisma as unknown as { then?: unknown }).then).toBeUndefined()
  })

  it('klaagt pas bij een echte database-call, met een bruikbare melding', async () => {
    const { prisma } = await import('../prisma')
    expect(() => prisma.user).toThrowError(/DATABASE_URL\/DIRECT_URL ontbreekt/)
  })
})
