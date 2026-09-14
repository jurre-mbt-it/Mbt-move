'use client'

import { use } from 'react'
import { GroupDetail } from '@/components/groups/GroupDetail'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <GroupDetail groupId={id} />
}
