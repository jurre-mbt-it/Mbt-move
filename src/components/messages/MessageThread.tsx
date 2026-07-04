'use client'

import { useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { Plus, X, Send, Dumbbell, CalendarCheck } from 'lucide-react'
import { P, MetaLabel, DarkTextarea } from '@/components/dark-ui'

const mono =
  'ui-monospace, Menlo, "SF Mono", "Cascadia Code", "Source Code Pro", monospace'

/** Koppeling die aan het volgende bericht hangt (sessie en/of oefening). */
type PendingLink = {
  sessionLogId?: string
  exerciseId?: string
  label: string
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Chat-draad tussen patiënt/atleet en praktijk. `viewerSide` bepaalt welke
 * berichten rechts (eigen kant) staan: voor de patiënt zijn dat de eigen
 * berichten, voor de therapeut alles van de praktijk-kant. Berichten kunnen
 * via de +-knop gekoppeld worden aan een recente sessie of oefening; die
 * koppeling wordt als context-kaartje in de bubbel getoond.
 */
export function MessageThread({
  viewerSide,
  patientId,
}: {
  viewerSide: 'patient' | 'practice'
  patientId?: string
}) {
  const utils = trpc.useUtils()
  const threadInput = patientId ? { patientId } : undefined
  const { data: messages, isLoading } = trpc.messages.thread.useQuery(threadInput, {
    refetchInterval: 15_000,
  })
  const { data: recentSessions } = trpc.messages.recentContext.useQuery(threadInput)

  const markRead = trpc.messages.markRead.useMutation({
    onSuccess: () => {
      void utils.messages.unreadCount.invalidate()
      void utils.messages.unreadTotal.invalidate()
      void utils.messages.inbox.invalidate()
    },
  })
  const send = trpc.messages.send.useMutation({
    onSuccess: async () => {
      setBody('')
      setPendingLink(null)
      await utils.messages.thread.invalidate()
    },
  })

  const [body, setBody] = useState('')
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Ongelezen berichten van de andere kant als gelezen markeren zodra ze in
  // beeld zijn. De ref voorkomt een mutation-loop op elke refetch.
  const markedRef = useRef(0)
  useEffect(() => {
    if (!messages) return
    const otherSide = viewerSide === 'patient' ? false : true
    const unread = messages.filter(m => m.fromPatient === otherSide && !m.readAt).length
    if (unread > 0 && unread !== markedRef.current) {
      markedRef.current = unread
      markRead.mutate(threadInput)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, viewerSide])

  // Autoscroll naar het laatste bericht.
  const bottomRef = useRef<HTMLDivElement>(null)
  const countRef = useRef(0)
  useEffect(() => {
    if (!messages) return
    if (messages.length !== countRef.current) {
      countRef.current = messages.length
      bottomRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messages])

  function handleSend() {
    const text = body.trim()
    if (!text || send.isPending) return
    send.mutate({
      ...(patientId ? { patientId } : {}),
      body: text,
      sessionLogId: pendingLink?.sessionLogId,
      exerciseId: pendingLink?.exerciseId,
    })
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Berichten */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-10">
            <MetaLabel>LADEN…</MetaLabel>
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <MetaLabel>NOG GEEN BERICHTEN</MetaLabel>
            <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
              {viewerSide === 'patient'
                ? 'Stel een vraag over je programma of een oefening — koppel er met de +-knop een sessie aan.'
                : 'Stuur een reactie op een sessie of beantwoord vragen van de patiënt.'}
            </p>
          </div>
        ) : (
          messages.map(m => {
            const own = viewerSide === 'patient' ? m.fromPatient : !m.fromPatient
            return (
              <div key={m.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%]">
                  {/* Auteur (alleen bij de andere kant, of bij collega's) */}
                  {!own && (
                    <p
                      className="athletic-mono mb-1"
                      style={{ color: P.inkMuted, fontSize: 9, letterSpacing: '0.12em', fontWeight: 800, textTransform: 'uppercase' }}
                    >
                      {m.authorName ?? (m.fromPatient ? 'Patiënt' : 'Therapeut')}
                    </p>
                  )}
                  <div
                    className="rounded-2xl px-3.5 py-2.5"
                    style={{
                      background: own ? 'rgba(232,122,85,0.14)' : P.surface,
                      border: `1px solid ${own ? 'rgba(232,122,85,0.35)' : P.line}`,
                    }}
                  >
                    {/* Context-kaartje: gekoppelde sessie/oefening */}
                    {(m.exercise || m.session) && (
                      <div
                        className="flex items-center gap-2 rounded-xl px-2.5 py-2 mb-2"
                        style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}` }}
                      >
                        {m.exercise
                          ? <Dumbbell className="w-3.5 h-3.5 shrink-0" style={{ color: P.gold }} />
                          : <CalendarCheck className="w-3.5 h-3.5 shrink-0" style={{ color: P.lime }} />}
                        <div className="min-w-0">
                          {m.exercise && (
                            <p className="truncate" style={{ color: P.ink, fontSize: 12, fontWeight: 700 }}>
                              {m.exercise.name}
                            </p>
                          )}
                          {m.session && (
                            <p
                              className="athletic-mono truncate"
                              style={{ color: P.inkMuted, fontSize: 9.5, letterSpacing: '0.08em', marginTop: m.exercise ? 1 : 0 }}
                            >
                              SESSIE {fmtDate(m.session.completedAt).toUpperCase()}
                              {m.session.programName ? ` · ${m.session.programName.toUpperCase()}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    <p style={{ color: P.ink, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                      {m.body}
                    </p>
                  </div>
                  <p
                    className={`athletic-mono mt-1 ${own ? 'text-right' : ''}`}
                    style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.08em' }}
                  >
                    {fmtDate(m.createdAt).toUpperCase()} · {fmtTime(m.createdAt)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div
        className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]"
        style={{ borderTop: `1px solid ${P.line}`, background: P.bg }}
      >
        {/* Koppel-kiezer: recente sessies + hun oefeningen */}
        {pickerOpen && (
          <div
            className="rounded-2xl p-3 mb-2 space-y-2 max-h-56 overflow-y-auto"
            style={{ background: P.surface, border: `1px dashed ${P.lineStrong}` }}
          >
            <div className="flex items-center justify-between">
              <MetaLabel>KOPPEL AAN</MetaLabel>
              <button type="button" onClick={() => setPickerOpen(false)} aria-label="Sluiten" className="athletic-tap" style={{ color: P.inkDim, padding: 2 }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {!recentSessions || recentSessions.length === 0 ? (
              <p style={{ color: P.inkMuted, fontSize: 12 }}>Nog geen gelogde sessies om aan te koppelen.</p>
            ) : (
              recentSessions.map(s => (
                <div key={s.id} className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingLink({ sessionLogId: s.id, label: `Sessie ${fmtDate(s.completedAt)}${s.programName ? ` · ${s.programName}` : ''}` })
                      setPickerOpen(false)
                    }}
                    className="athletic-tap w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left"
                    style={{ background: P.surfaceHi, border: `1px solid ${P.line}` }}
                  >
                    <CalendarCheck className="w-3.5 h-3.5 shrink-0" style={{ color: P.lime }} />
                    <span className="truncate" style={{ color: P.ink, fontSize: 12.5, fontWeight: 700 }}>
                      Sessie {fmtDate(s.completedAt)}
                      {s.programName ? ` · ${s.programName}` : ''}
                    </span>
                  </button>
                  {s.exercises.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap pl-2">
                      {s.exercises.map(e => (
                        <button
                          key={`${s.id}-${e.id}`}
                          type="button"
                          onClick={() => {
                            setPendingLink({ sessionLogId: s.id, exerciseId: e.id, label: `${e.name} · ${fmtDate(s.completedAt)}` })
                            setPickerOpen(false)
                          }}
                          className="athletic-tap rounded-full"
                          style={{
                            padding: '4px 10px',
                            border: `1px solid ${P.lineStrong}`,
                            background: 'transparent',
                            color: P.inkMuted,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {e.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Gekozen koppeling */}
        {pendingLink && (
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2 mb-2"
            style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}` }}
          >
            {pendingLink.exerciseId
              ? <Dumbbell className="w-3.5 h-3.5 shrink-0" style={{ color: P.gold }} />
              : <CalendarCheck className="w-3.5 h-3.5 shrink-0" style={{ color: P.lime }} />}
            <span className="flex-1 min-w-0 truncate" style={{ color: P.ink, fontSize: 12, fontWeight: 600 }}>
              {pendingLink.label}
            </span>
            <button type="button" onClick={() => setPendingLink(null)} aria-label="Koppeling verwijderen" className="athletic-tap" style={{ color: P.inkDim, padding: 2 }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {send.error && (
          <p style={{ color: P.danger, fontSize: 12, marginBottom: 8 }}>
            Versturen mislukt. Probeer het opnieuw.
          </p>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(v => !v)}
            aria-label="Sessie of oefening koppelen"
            className="athletic-tap shrink-0 rounded-xl flex items-center justify-center"
            style={{
              width: 44,
              height: 44,
              border: `1.5px solid ${pickerOpen || pendingLink ? P.brand : P.lineStrong}`,
              color: pickerOpen || pendingLink ? P.brand : P.inkMuted,
              background: 'transparent',
            }}
          >
            <Plus className="w-4 h-4" />
          </button>
          <DarkTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Typ een bericht…"
            rows={1}
            className="flex-1 min-w-0"
            style={{ fontSize: 16, minHeight: 44, maxHeight: 120, resize: 'none' }}
            aria-label="Bericht"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!body.trim() || send.isPending}
            aria-label="Versturen"
            className="athletic-tap shrink-0 rounded-xl flex items-center justify-center"
            style={{
              width: 44,
              height: 44,
              background: body.trim() && !send.isPending ? P.brand : P.surfaceHi,
              color: body.trim() && !send.isPending ? '#fff' : P.inkDim,
              border: `1.5px solid ${body.trim() && !send.isPending ? P.brand : P.line}`,
              fontFamily: mono,
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
