'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ProgramBuilder } from '@/components/programs/ProgramBuilder'

function NewProgramContent() {
  const searchParams = useSearchParams()
  const patientId = searchParams.get('patientId')
  const addExerciseId = searchParams.get('addExerciseId')

  return (
    <ProgramBuilder
      initialState={patientId ? { patientId } : undefined}
      initialAddExerciseId={addExerciseId ?? undefined}
    />
  )
}

export default function NewProgramPage() {
  return (
    <Suspense>
      <NewProgramContent />
    </Suspense>
  )
}
