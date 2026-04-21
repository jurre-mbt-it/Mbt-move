'use client'

import { useState, useRef, useEffect } from 'react'
import { getMessagesByPatient } from '@/lib/mock-data'
import { DarkScreen, P, PulsingDot } from '@/components/dark-ui'

const THERAPIST_NAME = 'Uw therapeut'

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Gisteren'
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

type Message = {
  id: string
  patientId: string
  from: 'therapist' | 'patient'
  content: string
  date: string
  read: boolean
}

export default function MessagesPage() {
  const initial = getMessagesByPatient('pat1')
  const [messages, setMessages] = useState<Message[]>(initial)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = () => {
    const text = input.trim()
    if (!text) return
    setMessages((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        patientId: 'pat1',
        from: 'patient',
        content: text,
        date: new Date().toISOString(),
        read: true,
      },
    ])
    setInput('')
  }

  const unread = messages.filter((m) => m.from === 'therapist' && !m.read).length
  const initials = THERAPIST_NAME.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <DarkScreen>
      {/* Header */}
      <div
        className="px-4 pt-10 pb-4 flex items-center gap-3"
        style={{ borderBottom: `1px solid ${P.line}` }}
      >
        <div
          className="athletic-mono w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{
            backgroundColor: P.lime,
            color: P.bg,
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: '0.04em',
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="athletic-mono"
            style={{
              color: P.ink,
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: '0.1em',
            }}
          >
            {THERAPIST_NAME.toUpperCase()}
          </p>
          <p style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}>
            <PulsingDot color={P.lime} size={6} style={{ marginRight: 6 }} />
            Jouw therapeut
          </p>
        </div>
        {unread > 0 && (
          <div
            className="athletic-mono ml-auto min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: P.danger,
              color: P.bg,
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            {unread}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 pb-32">
        {messages.map((msg, i) => {
          const isPatient = msg.from === 'patient'
          const showDate =
            i === 0 ||
            new Date(msg.date).toDateString() !== new Date(messages[i - 1].date).toDateString()
          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-2">
                  <span
                    className="athletic-mono rounded-full px-3 py-1"
                    style={{
                      color: P.inkMuted,
                      backgroundColor: P.surface,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                    }}
                  >
                    {new Date(msg.date)
                      .toLocaleDateString('nl-NL', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })
                      .toUpperCase()}
                  </span>
                </div>
              )}
              <div className={`flex ${isPatient ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%]">
                  <div
                    className="rounded-2xl px-4 py-3"
                    style={{
                      backgroundColor: isPatient ? P.lime : P.surface,
                      color: isPatient ? P.bg : P.ink,
                      fontSize: 14,
                      lineHeight: '19px',
                      borderBottomRightRadius: isPatient ? 4 : undefined,
                      borderBottomLeftRadius: !isPatient ? 4 : undefined,
                      border: isPatient ? 'none' : `1px solid ${P.line}`,
                    }}
                  >
                    {msg.content}
                  </div>
                  <p
                    className={`athletic-mono mt-1 ${isPatient ? 'text-right' : 'text-left'}`}
                    style={{
                      color: P.inkDim,
                      fontSize: 10,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {formatTime(msg.date)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="fixed bottom-16 left-0 right-0 px-4 py-3 flex items-center gap-3"
        style={{
          backgroundColor: P.surface,
          borderTop: `1px solid ${P.lineStrong}`,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Typ een bericht..."
          className="flex-1 rounded-2xl px-4 py-2.5 outline-none"
          style={{
            backgroundColor: P.surfaceHi,
            color: P.ink,
            border: `1px solid ${P.lineStrong}`,
            fontSize: 14,
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={!input.trim()}
          className="athletic-tap w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all"
          style={{
            backgroundColor: input.trim() ? P.lime : P.surfaceHi,
            color: input.trim() ? P.bg : P.inkMuted,
            fontSize: 16,
            fontWeight: 900,
          }}
          aria-label="Versturen"
        >
          ➤
        </button>
      </div>
    </DarkScreen>
  )
}
