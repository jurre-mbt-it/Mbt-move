'use client'

import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { P, CARD } from '@/lib/shop/palette'
import { formatPriceCents } from '@/lib/shop/format'
import { heroGradient } from '@/lib/shop/gradient'
import { LEVEL_LABELS } from '@/lib/shop/labels'
import {
  RED_FLAGS,
  type Goal,
  type Level,
  type Region,
  type Surgery,
  type Days,
  type Place,
  type Duration,
} from '@/lib/shop/intake/flow'

type Answers = {
  goal?: Goal
  level?: Level
  region?: Region
  surgery?: Surgery
  daysPerWeek?: Days
  location?: Place
  duration?: Duration
}

type Bubble = { role: 'assistant' | 'user'; text: string }
type Phase = 'intro' | 'redflags' | 'questions' | 'loading' | 'result' | 'redflagged'

type Option = { value: string; label: string }
type Question = { key: keyof Answers; text: string; options: Option[] }

const INTRO =
  'Hoi! Ik stel je een paar korte vragen, net zoals bij een intake bij ons in de praktijk. Daarna adviseer ik het programma dat het best bij je past. Je antwoorden gebruiken we alleen om je te adviseren.'

const REDFLAG_Q =
  'Eén ding eerst, voor je eigen veiligheid. Herken je een of meer van deze dingen op dit moment?'

function nextQuestion(a: Answers): Question | null {
  if (!a.goal) {
    return {
      key: 'goal',
      text: 'Waar wil je mee aan de slag?',
      options: [
        { value: 'hardlopen', label: 'Sterker worden voor het hardlopen' },
        { value: 'klacht', label: 'Een specifieke klacht aanpakken' },
        { value: 'prehab', label: 'Me voorbereiden op een operatie' },
      ],
    }
  }
  if (a.goal === 'hardlopen' && !a.level) {
    return {
      key: 'level',
      text: 'Hoeveel ervaring heb je met krachttraining?',
      options: [
        { value: 'BEGINNER', label: 'Weinig of geen ervaring' },
        { value: 'INTERMEDIATE', label: 'Ik train al regelmatig met gewichten' },
        { value: 'ADVANCED', label: 'Ervaren met zwaardere krachttraining' },
      ],
    }
  }
  if (a.goal === 'klacht' && !a.region) {
    return {
      key: 'region',
      text: 'Waar zit de klacht?',
      options: [
        { value: 'achilles', label: 'Achillespees' },
        { value: 'patella', label: 'Knie, de pees onder de knieschijf' },
        { value: 'rug', label: 'Rug' },
        { value: 'heup', label: 'Heup' },
      ],
    }
  }
  if (a.goal === 'prehab' && !a.surgery) {
    return {
      key: 'surgery',
      text: 'Welke operatie staat er gepland?',
      options: [
        { value: 'acl', label: 'Kruisband (ACL)' },
        { value: 'meniscus', label: 'Meniscus' },
      ],
    }
  }
  if (a.goal === 'klacht' && !a.duration) {
    return {
      key: 'duration',
      text: 'Hoe lang heb je de klacht al?',
      options: [
        { value: 'kort', label: 'Korter dan 6 weken' },
        { value: 'middel', label: '6 weken tot 3 maanden' },
        { value: 'lang', label: 'Langer dan 3 maanden' },
      ],
    }
  }
  if (!a.daysPerWeek) {
    return {
      key: 'daysPerWeek',
      text: 'Hoeveel dagen per week wil je trainen?',
      options: [
        { value: '2', label: '2 dagen' },
        { value: '3', label: '3 dagen' },
        { value: '4+', label: '4 dagen of meer' },
      ],
    }
  }
  if (!a.location) {
    return {
      key: 'location',
      text: 'Waar train je het liefst?',
      options: [
        { value: 'thuis', label: 'Thuis' },
        { value: 'gym', label: 'In de gym' },
        { value: 'allebei', label: 'Allebei is prima' },
      ],
    }
  }
  return null
}

export function IntakeWizard() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [consent, setConsent] = useState(false)
  const [transcript, setTranscript] = useState<Bubble[]>([{ role: 'assistant', text: INTRO }])
  const [answers, setAnswers] = useState<Answers>({})
  const [checkedFlags, setCheckedFlags] = useState<string[]>([])
  const [current, setCurrent] = useState<Question | null>(null)

  const recommend = trpc.shop.intakeRecommend.useMutation()

  function push(b: Bubble) {
    setTranscript((t) => [...t, b])
  }

  function start() {
    push({ role: 'assistant', text: REDFLAG_Q })
    setPhase('redflags')
  }

  function submitRedflags() {
    if (checkedFlags.length > 0) {
      push({ role: 'user', text: 'Ja, ik herken een of meer van deze dingen.' })
      push({
        role: 'assistant',
        text:
          'Dankjewel voor je eerlijkheid. Op basis hiervan kun je dit beter eerst met een fysiotherapeut bespreken in plaats van zelf met een schema te starten. Zo weet je zeker dat je veilig traint. Je bent welkom om vrijblijvend bij ons langs te komen.',
      })
      setPhase('redflagged')
      return
    }
    push({ role: 'user', text: 'Nee, geen van deze.' })
    ask({})
  }

  function ask(extra: Answers) {
    const merged = { ...answers, ...extra }
    setAnswers(merged)
    const q = nextQuestion(merged)
    if (!q) {
      submit(merged)
      return
    }
    setCurrent(q)
    push({ role: 'assistant', text: q.text })
    setPhase('questions')
  }

  function choose(opt: Option) {
    if (!current) return
    push({ role: 'user', text: opt.label })
    setCurrent(null)
    ask({ [current.key]: opt.value } as Answers)
  }

  function submit(final: Answers) {
    setPhase('loading')
    recommend.mutate(
      { consent: true, redFlags: [], ...(final as Required<Answers>) },
      {
        onSuccess: (res) => {
          if (res.redFlagged) {
            setPhase('redflagged')
            return
          }
          push({ role: 'assistant', text: res.rationale })
          setPhase('result')
        },
        onError: () => {
          push({
            role: 'assistant',
            text: 'Er ging iets mis bij het ophalen van je advies. Probeer het zo nog eens.',
          })
          setPhase('result')
        },
      },
    )
  }

  const result = recommend.data && !recommend.data.redFlagged ? recommend.data : null

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-2" style={{ color: P.brand }}>
        AI-intake
      </p>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-6">Vind jouw schema</h1>

      {/* Transcript */}
      <div className="space-y-3">
        {transcript.map((b, i) => (
          <Bubble key={i} bubble={b} />
        ))}
        {phase === 'loading' && (
          <div
            className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm px-4 py-3"
            style={{...CARD }}
          >
            <Dot delay="0ms" /> <Dot delay="150ms" /> <Dot delay="300ms" />
          </div>
        )}
      </div>

      {/* Actiezone */}
      <div className="mt-5">
        {phase === 'intro' && (
          <div
            className="rounded-2xl p-5"
            style={{...CARD }}
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--p-brand)]"
              />
              <span className="text-sm" style={{ color: P.inkMuted }}>
                Ik ga ermee akkoord dat MBT mijn antwoorden gebruikt om mij een passend programma te
                adviseren.
              </span>
            </label>
            <button
              disabled={!consent}
              onClick={start}
              className="mt-4 rounded-xl px-5 py-3 text-sm font-extrabold transition-opacity disabled:opacity-40"
              style={{ background: P.brand, color: P.bg }}
            >
              Beginnen
            </button>
          </div>
        )}

        {phase === 'redflags' && (
          <div
            className="rounded-2xl p-5"
            style={{...CARD }}
          >
            <div className="space-y-2.5">
              {RED_FLAGS.map((f) => {
                const on = checkedFlags.includes(f.id)
                return (
                  <label key={f.id} className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setCheckedFlags((c) =>
                          e.target.checked ? [...c, f.id] : c.filter((x) => x !== f.id),
                        )
                      }
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--p-brand)]"
                    />
                    <span className="text-sm" style={{ color: P.ink }}>
                      {f.label}
                    </span>
                  </label>
                )
              })}
            </div>
            <button
              onClick={submitRedflags}
              className="mt-4 rounded-xl px-5 py-3 text-sm font-extrabold"
              style={{ background: P.brand, color: P.bg }}
            >
              {checkedFlags.length > 0 ? 'Verder' : 'Nee, geen van deze'}
            </button>
          </div>
        )}

        {phase === 'questions' && current && (
          <div className="grid gap-2.5">
            {current.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => choose(opt)}
                className="text-left rounded-xl px-4 py-3.5 text-[15px] font-medium transition-colors hover:border-[var(--p-brand)]"
                style={{...CARD, color: P.ink}}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {phase === 'redflagged' && (
          <div className="flex flex-wrap gap-3">
            <a
              href="https://www.movementbasedtherapy.nl/contact"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl px-5 py-3 text-sm font-extrabold"
              style={{ background: P.brand, color: P.bg }}
            >
              Maak een afspraak
            </a>
            <Link
              href="/shop"
              className="rounded-xl px-5 py-3 text-sm font-semibold"
              style={{...CARD, color: P.ink}}
            >
              Toch de programma’s bekijken
            </Link>
          </div>
        )}

        {phase === 'result' && result && (
          <div className="space-y-4">
            <ResultCard product={result.recommended} primary />
            {result.alternative && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: P.inkDim }}>
                  Ook een optie
                </p>
                <ResultCard product={result.alternative} />
              </div>
            )}
            <p className="text-sm pt-1" style={{ color: P.inkMuted }}>
              Twijfel je nog?{' '}
              <a
                href="https://www.movementbasedtherapy.nl/contact"
                target="_blank"
                rel="noreferrer"
                className="underline"
                style={{ color: P.brand }}
              >
                Plan een intake bij ons in de praktijk.
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Bubble({ bubble }: { bubble: Bubble }) {
  const isUser = bubble.role === 'user'
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          'max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ' +
          (isUser ? 'rounded-br-sm' : 'rounded-bl-sm')
        }
        style={{
          background: isUser ? 'rgba(232,122,85,0.16)' : P.surface,
          border: `1px solid ${isUser ? 'rgba(232,122,85,0.3)' : P.line}`,
          color: P.ink,
        }}
      >
        {bubble.text}
      </div>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full animate-pulse"
      style={{ background: P.inkMuted, animationDelay: delay }}
    />
  )
}

type CardProduct = {
  slug: string
  name: string
  tagline: string | null
  level: string | null
  durationWeeks: number | null
  priceCents: number
  currency: string
  heroImageUrl: string | null
}

function ResultCard({ product, primary }: { product: CardProduct; primary?: boolean }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: P.surface, border: `1px solid ${primary ? 'rgba(232,122,85,0.4)' : P.line}` }}
    >
      <div className="flex">
        <div
          className="w-28 shrink-0 self-stretch"
          style={{
            minHeight: 112,
            background: product.heroImageUrl
              ? `center / cover no-repeat url(${product.heroImageUrl})`
              : heroGradient(product.slug),
          }}
        />
        <div className="p-4 flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {product.level && (
              <span className="text-[11px] font-semibold" style={{ color: P.brand }}>
                {LEVEL_LABELS[product.level] ?? product.level}
              </span>
            )}
            {product.durationWeeks ? (
              <span className="text-[11px]" style={{ color: P.inkDim }}>
                · {product.durationWeeks} weken
              </span>
            ) : null}
          </div>
          <h3 className="font-semibold leading-snug">{product.name}</h3>
          {product.tagline && (
            <p className="text-sm mt-0.5 line-clamp-2" style={{ color: P.inkMuted }}>
              {product.tagline}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <span className="font-bold">{formatPriceCents(product.priceCents, product.currency)}</span>
            <Link
              href={`/programma/${product.slug}`}
              className="rounded-lg px-3.5 py-2 text-sm font-bold"
              style={{ background: P.brand, color: P.bg }}
            >
              Bekijk programma
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
