import { describe, it, expect } from 'vitest'
import { planVerzending, type GroepsWeek, type LidWeek } from '../group-send'

const G = 'groep-a'
const week = (monday: string, items: Array<[number, string]>): GroepsWeek => ({
  id: `gw-${monday}`, monday,
  days: [0, 1, 2, 3, 4, 5, 6].map(d => ({ dayOfWeek: d, items: items.filter(([dow]) => dow === d).map(([, id]) => ({ id })) })),
})

describe('planVerzending', () => {
  it('kopieert alle groepsitems naar een lid zonder week (week wordt aangemaakt)', () => {
    const stappen = planVerzending({
      groupId: G, vandaag: '2026-10-05',
      groepsWeken: [week('2026-10-05', [[0, 'a'], [2, 'b']])],
      lidWeken: [],
    })
    expect(stappen).toEqual([{ monday: '2026-10-05', lidWeekId: null, verwijderen: [], kopieren: [{ bronItemId: 'a', dayOfWeek: 0 }, { bronItemId: 'b', dayOfWeek: 2 }] }])
  })

  it('vervangt alleen items van deze groep en laat eigen items en andere groepen staan', () => {
    const lid: LidWeek = { id: 'lw', monday: '2026-10-05', items: [
      { id: 'oud-a', dayOfWeek: 0, groupId: G, gelogd: false },
      { id: 'eigen', dayOfWeek: 0, groupId: null, gelogd: false },
      { id: 'ander', dayOfWeek: 1, groupId: 'groep-b', gelogd: false },
    ] }
    const [stap] = planVerzending({ groupId: G, vandaag: '2026-10-05', groepsWeken: [week('2026-10-05', [[0, 'a']])], lidWeken: [lid] })
    expect(stap.lidWeekId).toBe('lw')
    expect(stap.verwijderen).toEqual(['oud-a'])
    expect(stap.kopieren).toEqual([{ bronItemId: 'a', dayOfWeek: 0 }])
  })

  it('laat dagen vóór vandaag en gelogde items met rust', () => {
    const lid: LidWeek = { id: 'lw', monday: '2026-10-05', items: [
      { id: 'ma', dayOfWeek: 0, groupId: G, gelogd: false },
      { id: 'wo-gelogd', dayOfWeek: 2, groupId: G, gelogd: true },
      { id: 'vr', dayOfWeek: 4, groupId: G, gelogd: false },
    ] }
    const [stap] = planVerzending({
      groupId: G, vandaag: '2026-10-07',
      groepsWeken: [week('2026-10-05', [[0, 'a'], [2, 'b'], [4, 'c']])],
      lidWeken: [lid],
    })
    expect(stap.verwijderen).toEqual(['vr'])
    expect(stap.kopieren).toEqual([{ bronItemId: 'c', dayOfWeek: 4 }])
  })

  it('slaat een groepsweek die helemaal in het verleden ligt over', () => {
    expect(planVerzending({ groupId: G, vandaag: '2026-10-20', groepsWeken: [week('2026-10-05', [[0, 'a']])], lidWeken: [] })).toEqual([])
  })

  it('kopieert op de dag van vandaag wel, want die is nog niet voorbij', () => {
    const [stap] = planVerzending({ groupId: G, vandaag: '2026-10-07', groepsWeken: [week('2026-10-05', [[2, 'b']])], lidWeken: [] })
    expect(stap.kopieren).toEqual([{ bronItemId: 'b', dayOfWeek: 2 }])
  })

  it('slaat lege trainingen over', () => {
    const gw: GroepsWeek = { id: 'gw', monday: '2026-10-05', days: [{ dayOfWeek: 0, items: [{ id: 'vol' }, { id: 'leeg', leeg: true }] }] }
    const [stap] = planVerzending({ groupId: G, vandaag: '2026-10-05', groepsWeken: [gw], lidWeken: [] })
    expect(stap.kopieren).toEqual([{ bronItemId: 'vol', dayOfWeek: 0 }])
  })
})
