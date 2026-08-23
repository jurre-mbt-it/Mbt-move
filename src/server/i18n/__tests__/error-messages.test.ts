/**
 * Elke statische Nederlandse foutmelding in de routers moet een Engelse
 * vertaling hebben, anders ziet een Engelse app-gebruiker Nederlands in een
 * popup. Meldingen met een ingevulde waarde (template literal met ${}) vallen
 * buiten de check: die blijven bewust Nederlands.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ERROR_MESSAGES, translateErrorMessage } from '../error-messages'

const ROUTERS = join(__dirname, '..', '..', 'routers')

// Alleen wat de iOS-app aanroept; admin/practice/shop/planTemplates/education
// zijn web-only en blijven Nederlands.
const MOBILE_ROUTERS = [
  'patient', 'patients', 'wearables', 'messages', 'auth', 'gdpr', 'insights', 'rehab',
  'assessments', 'testReports', 'weekSchedules', 'runningAnalysis', 'tags', 'exercises',
  'clinicalTests', 'invite', 'dpa', 'dailyGoals', 'wellness', 'programs', 'push',
]

const MESSAGE_RE = /message:\s*'([^']+)'/g

function looksDutch(s: string): boolean {
  return /\b(niet|geen|deze|dit|jouw|al|eerst|kan|kon|van|met|voor|bij|is|een)\b/i.test(s)
}

describe('foutmeldingen voor de Engelse app', () => {
  const missing: string[] = []
  for (const name of MOBILE_ROUTERS) {
    const src = readFileSync(join(ROUTERS, `${name}.ts`), 'utf8')
    for (const m of src.matchAll(MESSAGE_RE)) {
      const msg = m[1]
      if (!looksDutch(msg)) continue
      // Samengestelde melding (literal + literal): de volledige zin staat in de dictionary.
      if (msg.endsWith(' ') && Object.keys(ERROR_MESSAGES).some((k) => k.startsWith(msg))) continue
      if (!(msg in ERROR_MESSAGES)) missing.push(`${name}: ${msg}`)
    }
  }

  it('heeft een vertaling voor elke statische Nederlandse melding', () => {
    expect(missing).toEqual([])
  })

  it('laat onbekende meldingen ongemoeid', () => {
    expect(translateErrorMessage('Iets dynamisch met 3 trajecten')).toBe('Iets dynamisch met 3 trajecten')
    expect(translateErrorMessage('Sessie niet gevonden')).toBe('Session not found')
  })

  it('heeft geen lege vertalingen', () => {
    for (const [nl, en] of Object.entries(ERROR_MESSAGES)) {
      expect(en.trim().length, nl).toBeGreaterThan(0)
      expect(en).not.toBe(nl)
    }
  })

  it('routers-map bestaat voor alle gecontroleerde namen', () => {
    const files = new Set(readdirSync(ROUTERS))
    for (const name of MOBILE_ROUTERS) expect(files.has(`${name}.ts`), name).toBe(true)
  })
})
