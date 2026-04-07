'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowDown, ArrowUp, X, Search } from 'lucide-react'
import { MOCK_EXERCISES } from '@/lib/exercise-constants'

interface ProgressionPickerProps {
  easierVariantId: string | null
  harderVariantId: string | null
  currentId?: string
  onChangeEasier: (id: string | null) => void
  onChangeHarder: (id: string | null) => void
}

function ExercisePicker({
  label,
  icon,
  color,
  selectedId,
  excludeId,
  onSelect,
}: {
  label: string
  icon: React.ReactNode
  color: string
  selectedId: string | null
  excludeId?: string
  onSelect: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const exercises = MOCK_EXERCISES.filter(
    e => e.id !== excludeId && e.name.toLowerCase().includes(query.toLowerCase())
  )
  const selected = MOCK_EXERCISES.find(e => e.id === selectedId)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        <span>{label}</span>
      </div>

      {selected ? (
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm border"
          style={{ borderColor: `${color}40`, background: `${color}10` }}
        >
          <span className="font-medium">{selected.name}</span>
          <button type="button" onClick={() => onSelect(null)}>
            <X className="w-4 h-4 text-zinc-400 hover:text-destructive" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setOpen(o => !o)}
          >
            <Search className="w-4 h-4 mr-2" />
            Zoek oefening...
          </Button>

          {open && (
            <div className="absolute top-full mt-1 w-full z-50 bg-white border rounded-xl shadow-lg overflow-hidden">
              <div className="p-2 border-b">
                <Input
                  placeholder="Zoeken..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoFocus
                  className="h-8"
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {exercises.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-3 py-2">Geen oefeningen gevonden</p>
                ) : (
                  exercises.map(ex => (
                    <button
                      key={ex.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 flex items-center justify-between"
                      onClick={() => { onSelect(ex.id); setOpen(false); setQuery('') }}
                    >
                      <span>{ex.name}</span>
                      <Badge variant="secondary" className="text-xs">{ex.difficulty}</Badge>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ProgressionPicker({
  easierVariantId,
  harderVariantId,
  currentId,
  onChangeEasier,
  onChangeHarder,
}: ProgressionPickerProps) {
  return (
    <div className="space-y-4">
      <ExercisePicker
        label="Makkelijkere variant"
        icon={<ArrowDown className="w-4 h-4 text-blue-500" />}
        color="#60a5fa"
        selectedId={easierVariantId}
        excludeId={currentId}
        onSelect={onChangeEasier}
      />
      <ExercisePicker
        label="Moeilijkere variant"
        icon={<ArrowUp className="w-4 h-4 text-amber-500" />}
        color="#f59e0b"
        selectedId={harderVariantId}
        excludeId={currentId}
        onSelect={onChangeHarder}
      />
    </div>
  )
}
