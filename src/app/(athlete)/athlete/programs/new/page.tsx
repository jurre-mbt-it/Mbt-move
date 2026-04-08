'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ProgramBuilder } from '@/components/programs/ProgramBuilder'

export default function AthleteNewProgramPage() {
  return (
    <div className="space-y-4">
      <div className="px-4 pt-6">
        <Link
          href="/athlete/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Terug naar dashboard
        </Link>
      </div>
      <ProgramBuilder />
    </div>
  )
}
