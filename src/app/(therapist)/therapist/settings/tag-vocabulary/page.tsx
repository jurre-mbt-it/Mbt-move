'use client'

/**
 * Beheer van de praktijk-woordenlijst voor #klacht-tags. Deze lijst voedt de
 * suggesties bij het loggen (patiënt + therapeut) zodat varianten aan de bron
 * worden voorkomen. Globale seed-termen (practiceId = NULL) staan er ook in en
 * zijn in de single-clinic realiteit ook beheerbaar — zelfde semantiek als de
 * test-library.
 */
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkInput,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

export default function TagVocabularyPage() {
  const utils = trpc.useUtils()
  const { data: items, isLoading } = trpc.tags.vocabulary.useQuery()
  const [draft, setDraft] = useState('')

  const add = trpc.tags.vocabularyAdd.useMutation({
    onSuccess: () => {
      setDraft('')
      utils.tags.vocabulary.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })
  const remove = trpc.tags.vocabularyRemove.useMutation({
    onSuccess: () => utils.tags.vocabulary.invalidate(),
    onError: (e) => toast.error(e.message),
  })

  const submit = () => {
    const v = draft.trim()
    if (v.length < 2) return
    add.mutate({ display: v })
  }

  return (
    <div className="max-w-2xl w-full flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/therapist/settings"
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
        >
          ← INSTELLINGEN
        </Link>
        <div className="flex flex-col gap-1">
          <Kicker>Configuratie</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
          >
            KLACHT-TAGS
          </h1>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            Suggesties bij het loggen · voorkomt dat dezelfde klacht als varianten wordt getypt
          </MetaLabel>
        </div>
      </div>

      <Tile>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <MetaLabel>Nieuwe tag</MetaLabel>
            <DarkInput
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              placeholder="bv. achillespees"
              className="mt-1.5"
            />
          </div>
          <DarkButton onClick={submit} size="sm" disabled={add.isPending || draft.trim().length < 2}>
            Toevoegen
          </DarkButton>
        </div>
        <p style={{ color: P.inkDim, fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
          Wordt genormaliseerd (kleine letters, geen accenten). Spaties worden koppeltekens:
          &ldquo;lage rug&rdquo; → #lage-rug.
        </p>
      </Tile>

      {isLoading ? (
        <Tile><div className="py-6 text-center"><MetaLabel>LADEN…</MetaLabel></div></Tile>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(items ?? []).map((it) => (
            <div
              key={it.id}
              className="rounded-full flex items-center gap-2 pl-3 pr-2 py-1.5"
              style={{ background: P.surfaceHi, border: `1px solid ${P.line}` }}
            >
              <span style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: P.lime }}>#</span>{it.display}
              </span>
              {it.practiceId === null && (
                <span style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.1em' }}>STANDAARD</span>
              )}
              <button
                type="button"
                onClick={() => remove.mutate({ id: it.id })}
                aria-label={`Verwijder ${it.display}`}
                className="athletic-tap"
                style={{ color: P.inkDim, fontSize: 16, lineHeight: 1, padding: '0 2px' }}
              >
                ×
              </button>
            </div>
          ))}
          {(items ?? []).length === 0 && (
            <MetaLabel>Nog geen tags in de woordenlijst.</MetaLabel>
          )}
        </div>
      )}
    </div>
  )
}
