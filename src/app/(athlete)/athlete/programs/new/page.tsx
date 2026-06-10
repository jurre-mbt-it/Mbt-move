'use client'

import { Suspense } from 'react'
import { ProgramBuilder } from '@/components/programs/ProgramBuilder'

export default function AthleteNewProgramPage() {
  // De builder is een fullscreen-component met eigen top-bar en interne
  // scroll-panelen (h-full + overflow-y-auto). Die interne scroll werkt
  // alleen als de container een vaste hoogte heeft — anders groeit de
  // oefeningenlijst eindeloos door op mobile. We geven 'm hier daarom de
  // volledige viewport minus de bottom-nav (h-16) en laten de builder met
  // -m-4/-m-6 uit de padding breken, net als de therapeut-shell.
  return (
    <div
      className="athletic-dark flex flex-col overflow-hidden"
      style={{ height: 'calc(100dvh - 4rem)', background: '#0A0E0F', color: '#F5F7F6' }}
    >
      <div className="flex-1 overflow-hidden p-4 md:p-6">
        <Suspense>
          <ProgramBuilder backHref="/athlete/dashboard" />
        </Suspense>
      </div>
    </div>
  )
}
