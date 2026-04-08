'use client'

import { useState, useRef, useEffect } from 'react'
import { MESSAGES } from '@/lib/mock-data'
import { MOCK_PATIENT } from '@/lib/patient-constants'
import { Send, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

// Patient is always pat1 (Jan de Vries) in mock
const PATIENT_ID = 'pat1'

export default function PatientMessagesPage() {
  const initialMessages = MESSAGES.filter(m => m.patientId === PATIENT_ID)
    .sort((a, b) => a.date.localeCompare(b.date))

  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function sendMessage() {
    const text = draft.trim()
    if (!text) return
    const newMsg = {
      id: `m-new-${Date.now()}`,
      patientId: PATIENT_ID,
      from: 'patient' as const,
      content: text,
      date: new Date().toISOString(),
      read: true,
    }
    setMessages(prev => [...prev, newMsg])
    setDraft('')
  }

  function formatTime(isoDate: string) {
    const d = new Date(isoDate)
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  }

  function formatDay(isoDate: string) {
    const d = new Date(isoDate)
    return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  // Group messages by day
  const grouped: { day: string; msgs: typeof messages }[] = []
  for (const msg of messages) {
    const day = formatDay(msg.date)
    const last = grouped[grouped.length - 1]
    if (last && last.day === day) last.msgs.push(msg)
    else grouped.push({ day, msgs: [msg] })
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4 border-b bg-white shrink-0">
        <Link href="/patient/dashboard" className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ background: '#1A1A1A' }}>
          EB
        </div>
        <div>
          <p className="font-semibold text-sm">Emma Bakker</p>
          <p className="text-xs text-muted-foreground">Therapeut · MBT Gym</p>
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-32">
        {grouped.map(group => (
          <div key={group.day}>
            <div className="flex items-center justify-center mb-3">
              <span className="text-xs text-muted-foreground px-3 py-1 rounded-full bg-zinc-100 capitalize">
                {group.day}
              </span>
            </div>
            <div className="space-y-2">
              {group.msgs.map(msg => {
                const isPatient = msg.from === 'patient'
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isPatient ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="max-w-[80%] rounded-2xl px-4 py-2.5"
                      style={
                        isPatient
                          ? { background: '#1A1A1A', color: 'white', borderBottomRightRadius: 4 }
                          : { background: 'white', border: '1px solid #e4e4e7', borderBottomLeftRadius: 4 }
                      }
                    >
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                      <p
                        className="text-[10px] mt-1 text-right"
                        style={{ color: isPatient ? 'rgba(255,255,255,0.5)' : '#a1a1aa' }}
                      >
                        {formatTime(msg.date)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-3 pt-2 border-t bg-white">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Stuur een bericht..."
            rows={1}
            className="flex-1 resize-none border rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
            style={{ maxHeight: 120 }}
          />
          <button
            onClick={sendMessage}
            disabled={!draft.trim()}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all"
            style={{
              background: draft.trim() ? '#3ECF6A' : '#e4e4e7',
              color: draft.trim() ? 'white' : '#a1a1aa',
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
