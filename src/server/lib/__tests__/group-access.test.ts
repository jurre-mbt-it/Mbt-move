import { describe, it, expect } from 'vitest'
import { roleAllows } from '../group-access'

describe('roleAllows', () => {
  it('laat een hogere of gelijke rol door', () => {
    expect(roleAllows('OWNER', 'MANAGER')).toBe(true)
    expect(roleAllows('MANAGER', 'MANAGER')).toBe(true)
    expect(roleAllows('PLANNER', 'VIEWER')).toBe(true)
  })
  it('weigert een lagere rol', () => {
    expect(roleAllows('VIEWER', 'PLANNER')).toBe(false)
    expect(roleAllows('PLANNER', 'MANAGER')).toBe(false)
    expect(roleAllows('MANAGER', 'OWNER')).toBe(false)
  })
})
