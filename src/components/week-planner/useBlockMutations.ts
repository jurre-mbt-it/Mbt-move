'use client'

/**
 * Alle schrijfacties op de bloklijst van een workout-item, op één plek.
 * setItemExercises is vervang-alles, dus elke actie stuurt de hele lijst.
 * Na opslaan worden listItemContents én listWithItems ververst: de server
 * leidt duur en soort uit de inhoud af en die staan op het item.
 */
import { useCallback } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { toBlockPayload, type BlockDraft, type ItemGroup, type ItemGroups, type PlannerBlock } from '@/lib/planner-blocks'

export function useBlockMutations() {
  const utils = trpc.useUtils()
  const setItemExercises = trpc.weekSchedules.setItemExercises.useMutation({
    onSuccess: () => {
      utils.weekSchedules.listItemContents.invalidate()
      utils.weekSchedules.listWithItems.invalidate()
    },
    onError: (e) => toast.error(e.message || 'Opslaan is niet gelukt'),
  })
  const setItemGroups = trpc.weekSchedules.setItemGroups.useMutation({
    onSuccess: () => utils.weekSchedules.listItemContents.invalidate(),
    onError: (e) => toast.error(e.message || 'Opslaan is niet gelukt'),
  })

  const saveList = useCallback(async (itemId: string, blocks: BlockDraft[]) => {
    await setItemExercises.mutateAsync({ itemId, exercises: blocks.map(toBlockPayload) })
  }, [setItemExercises])

  const submitBlock = useCallback(async (itemId: string, blocks: PlannerBlock[], draft: BlockDraft) => {
    const next: BlockDraft[] = draft.id
      ? blocks.map(b => (b.id === draft.id ? { ...b, ...draft } : b))
      : [...blocks, draft]
    await saveList(itemId, next)
  }, [saveList])

  const removeBlock = useCallback(async (itemId: string, blocks: PlannerBlock[], id: string) => {
    await saveList(itemId, blocks.filter(b => b.id !== id))
  }, [saveList])

  const moveBlock = useCallback(async (itemId: string, blocks: PlannerBlock[], id: string, dir: -1 | 1) => {
    const i = blocks.findIndex(b => b.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    await saveList(itemId, next)
  }, [saveList])

  const setGroup = useCallback(async (itemId: string, groups: ItemGroups, letter: string, group: ItemGroup | null) => {
    const next: ItemGroups = { ...groups }
    if (group) next[letter] = group
    else delete next[letter]
    await setItemGroups.mutateAsync({ itemId, groups: next })
  }, [setItemGroups])

  return {
    saving: setItemExercises.isPending || setItemGroups.isPending,
    submitBlock, removeBlock, moveBlock, setGroup,
  }
}
