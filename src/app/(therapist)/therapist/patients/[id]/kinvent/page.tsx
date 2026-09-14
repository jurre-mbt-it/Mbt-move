'use client'

import { use } from 'react'
import { KinventMeasurements } from '@/components/kinvent/KinventMeasurements'

/** Kinvent-metingen van één patiënt: grafiek over de tijd plus detail per meting. */
export default function KinventMeasurementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <KinventMeasurements patientId={id} />
}
