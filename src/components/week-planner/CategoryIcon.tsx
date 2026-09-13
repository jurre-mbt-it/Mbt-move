'use client'

import { IconStrength, IconMobility, IconPlyometrics, IconCardio, IconCore } from '@/components/icons'
import type { Category } from '@/lib/planner-blocks'

export const CATEGORY_LABELS: Record<Category, string> = {
  STRENGTH: 'Kracht',
  MOBILITY: 'Mobiliteit',
  PLYOMETRICS: 'Plyometrie',
  CARDIO: 'Cardio',
  STABILITY: 'Stabiliteit',
}

export function CategoryIcon({ category, size = 14 }: { category: Category; size?: number }) {
  switch (category) {
    case 'STRENGTH': return <IconStrength size={size} />
    case 'MOBILITY': return <IconMobility size={size} />
    case 'PLYOMETRICS': return <IconPlyometrics size={size} />
    case 'CARDIO': return <IconCardio size={size} />
    case 'STABILITY': return <IconCore size={size} />
  }
}
