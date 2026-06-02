import { WorkoutPlayer } from '@/components/shop/WorkoutPlayer'

export const metadata = { title: 'Programma' }

export default async function MyProgramPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <WorkoutPlayer slug={slug} />
}
