import { ProgramBuilder } from '@/components/programs/ProgramBuilder'
import { MOCK_PROGRAMS, buildMockProgram } from '@/lib/program-constants'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditProgramPage({ params }: Props) {
  const { id } = await params
  const program = MOCK_PROGRAMS.find(p => p.id === id)
  if (!program) notFound()

  const exercises = id === 'p1' ? buildMockProgram() : []

  return (
    <ProgramBuilder
      programId={id}
      initialState={{
        name: program.name,
        description: program.description,
        weeks: program.weeks,
        daysPerWeek: program.daysPerWeek,
        isTemplate: program.isTemplate,
        exercises,
      }}
    />
  )
}
