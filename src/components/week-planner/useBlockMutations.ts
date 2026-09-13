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

  /** Nieuw (op `atIndex`, standaard achteraan) of bewerkt (op id). */
  const submitBlock = useCallback(async (itemId: string, blocks: PlannerBlock[], draft: BlockDraft, atIndex?: number) => {
    let next: BlockDraft[]
    if (draft.id) next = blocks.map(b => (b.id === draft.id ? { ...b, ...draft } : b))
    else if (atIndex != null && atIndex >= 0 && atIndex < blocks.length) next = [...blocks.slice(0, atIndex), draft, ...blocks.slice(atIndex)]
    else next = [...blocks, draft]
    await saveList(itemId, next)
  }, [saveList])

  /** Meerdere rijen (bv. van het klembord) invoegen op `atIndex`, standaard achteraan. */
  const insertBlocks = useCallback(async (itemId: string, blocks: PlannerBlock[], drafts: BlockDraft[], atIndex?: number) => {
    if (drafts.length === 0) return
    const i = atIndex != null && atIndex >= 0 && atIndex < blocks.length ? atIndex : blocks.length
    await saveList(itemId, [...blocks.slice(0, i), ...drafts, ...blocks.slice(i)])
  }, [saveList])

  /** Kopie direct onder het origineel. */
  const duplicateBlock = useCallback(async (itemId: string, blocks: PlannerBlock[], id: string) => {
    const i = blocks.findIndex(b => b.id === id)
    if (i < 0) return
    const kopie: BlockDraft = { ...blocks[i], id: undefined }
    await saveList(itemId, [...blocks.slice(0, i + 1), kopie, ...blocks.slice(i + 1)])
  }, [saveList])

  /** Slepen binnen één training: zet `activeId` op de plek van `overId`. */
  const reorderBlocks = useCallback(async (itemId: string, blocks: PlannerBlock[], activeId: string, overId: string) => {
    const from = blocks.findIndex(b => b.id === activeId)
    const to = blocks.findIndex(b => b.id === overId)
    if (from < 0 || to < 0 || from === to) return
    const next = [...blocks]
    const [rij] = next.splice(from, 1)
    next.splice(to, 0, rij)
    await saveList(itemId, next)
  }, [saveList])

  /**
   * Slepen naar een andere training: weg bij de bron, erbij op het doel (op
   * `toIndex`, standaard achteraan). De groepsletter blijft niet staan, want
   * die hoort bij de groepen van de bron.
   */
  const moveBlockToItem = useCallback(async (
    from: { itemId: string; blocks: PlannerBlock[] },
    to: { itemId: string; blocks: PlannerBlock[] },
    blockId: string,
    toIndex?: number,
  ) => {
    const rij = from.blocks.find(b => b.id === blockId)
    if (!rij || from.itemId === to.itemId) return
    const kopie: BlockDraft = { ...rij, id: undefined, supersetGroup: null, supersetOrder: 0 }
    const i = toIndex != null && toIndex >= 0 && toIndex < to.blocks.length ? toIndex : to.blocks.length
    await saveList(to.itemId, [...to.blocks.slice(0, i), kopie, ...to.blocks.slice(i)])
    await saveList(from.itemId, from.blocks.filter(b => b.id !== blockId))
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
    submitBlock, insertBlocks, duplicateBlock, reorderBlocks, moveBlockToItem, removeBlock, moveBlock, setGroup,
  }
}
