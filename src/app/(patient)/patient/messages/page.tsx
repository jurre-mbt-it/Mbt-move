'use client'

import { useState, useRef, useEffect } from 'react'
import { getMessagesByPatient } from '@/lib/mock-data'
import { Send } from 'lucide-react'

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
    setMessages(prev => [
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

  const unread = messages.filter(m => m.from === 'therapist' && !m.read).length

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-4 flex items-center gap-3" style={{ background: '#1C2425' }}>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: '#BEF264' }}
        >
          {THERAPIST_NAME.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <div>
          <p className="text-white font-bold text-base">{THERAPIST_NAME}</p>
          <p className="text-[#7B8889] text-xs">Jouw therapeut</p>
        </div>
        {unread > 0 && (
          <div
            className="ml-auto w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: '#ef4444' }}
          >
            {unread}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-32">
        {messages.map((msg, i) => {
          const isPatient = msg.from === 'patient'
          const showDate = i === 0 || new Date(msg.date).toDateString() !== new Date(messages[i - 1].date).toDateString()
          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-2">
                  <span className="text-[11px] text-[#7B8889] bg-[#1C2425] rounded-full px-3 py-1">
                    {new Date(msg.date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                </div>
              )}
              <div className={`flex ${isPatient ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%]">
                  <div
                    className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
                    style={{
                      background: isPatient ? '#BEF264' : '#fff',
                      color: isPatient ? '#fff' : '#1C2425',
                      borderBottomRightRadius: isPatient ? 4 : undefined,
                      borderBottomLeftRadius: !isPatient ? 4 : undefined,
                      boxShadow: !isPatient ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
                    }}
                  >
                    {msg.content}
                  </div>
                  <p className={`text-[10px] text-[#7B8889] mt-1 ${isPatient ? 'text-right' : 'text-left'}`}>
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
        style={{ background: '#fff', borderTop: '1px solid #e4e4e7' }}
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Typ een bericht..."
          className="flex-1 rounded-2xl px-4 py-2.5 text-sm outline-none"
          style={{ background: '#1C2425', border: 'none' }}
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all"
          style={{
            background: input.trim() ? '#BEF264' : '#1C2425',
            color: input.trim() ? 'white' : '#a1a1aa',
          }}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
