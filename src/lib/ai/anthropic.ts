/**
 * Anthropic-client + AI-concepttekst voor het Testrapport.
 *
 * Eén lichte wrapper rond de officiële SDK. Gebruikt voor het genereren van een
 * concept-interpretatie + vervolgadvies op basis van de testuitslagen; de
 * behandelaar redigeert dit daarna. Toon volgt de MBT-huisstijl: direct, "je",
 * evidence-based, criteria boven kalender.
 *
 * Model is overschrijfbaar via TESTRAPPORT_AI_MODEL (default Sonnet 4.6 —
 * snel/goedkoop genoeg voor een concept dat altijd nog geredigeerd wordt).
 */
import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY ontbreekt — AI-concept is niet beschikbaar.')
  }
  client ??= new Anthropic()
  return client
}

const MODEL = process.env.TESTRAPPORT_AI_MODEL || 'claude-sonnet-4-6'

export type NarrativeTestLine = {
  category: string
  name: string
  subtitle?: string | null
  /** Compacte weergave van de waarden, bv "L 56 kg · R 46 kg". */
  values: string
  /** Geplotte waarde + eenheid, bv "82%". */
  headline: string
  /** ONVOLDOENDE | IN OPBOUW | DOELZONE */
  zone: string
}

export type NarrativeInput = {
  patientName: string
  injuryGoal?: string | null
  rehabPhaseLabel?: string | null
  measurementNumber?: number | null
  tests: NarrativeTestLine[]
}

export type DraftAdvice = { title: string; body: string }

export type NarrativeDraft = {
  interpretation: string
  advice: DraftAdvice[]
  nextTestMoment: string
  nextTestGoal: string
}

const SYSTEM_PROMPT = `Je bent sportfysiotherapeut bij Movement Based Therapy (MBT) en schrijft de slottekst van een testrapport voor een patiënt.

Toon en stijl (MBT-huisstijl):
- Schrijf direct in de tweede persoon ("je", "jouw"), nuchter en bemoedigend.
- Evidence-based en concreet; geen loze geruststelling. Benoem het belangrijkste aandachtspunt eerlijk.
- Stuur op criteria (LSI, doelzones), niet op de kalender.
- Nederlands. Geen Engelse vaktermen waar een Nederlandse bestaat. Geen emoji, geen kopjes, geen opsommingstekens in de interpretatie.
- Gebruik NOOIT een lang gedachtestreepje (— em-dash of – en-dash). Dat is AI-opmaak die wij niet gebruiken. Splits zinnen met een komma, punt of haakjes; gebruik hooguit een gewoon koppelteken (-) waar dat echt nodig is.

Je krijgt de testuitslagen en levert een JSON-object met:
- "interpretation": 2-4 korte alinea's (gescheiden door een lege regel) die het algemene beeld duiden, de sterke punten benoemen en het belangrijkste aandachtspunt eruit lichten. Verwijs naar concrete testen/percentages.
- "advice": 3-5 vervolgadvies-punten, elk met een korte vette aanhef ("title", bv "Quadriceps zwaarder belasten") en een "body" van 1-2 zinnen met concrete trainingsrichting.
- "nextTestMoment": korte aanduiding van het volgende testmoment (bv "Over 6 weken").
- "nextTestGoal": het meetbare doel voor de volgende meting (bv "LSI > 90% op alle krachttesten").

Verzin geen waarden die niet in de data staan. Antwoord uitsluitend met het JSON-object.`

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    interpretation: { type: 'string' },
    advice: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { title: { type: 'string' }, body: { type: 'string' } },
        required: ['title', 'body'],
      },
    },
    nextTestMoment: { type: 'string' },
    nextTestGoal: { type: 'string' },
  },
  required: ['interpretation', 'advice', 'nextTestMoment', 'nextTestGoal'],
} as const

function buildUserPrompt(input: NarrativeInput): string {
  const lines = input.tests
    .map(
      (t) =>
        `- [${t.category}] ${t.name}${t.subtitle ? ` (${t.subtitle})` : ''}: ${t.values} → ${t.headline} · ${t.zone}`,
    )
    .join('\n')
  const ctx = [
    `Patiënt: ${input.patientName}`,
    input.injuryGoal ? `Blessure/doel: ${input.injuryGoal}` : null,
    input.rehabPhaseLabel ? `Fase: ${input.rehabPhaseLabel}` : null,
    input.measurementNumber ? `Meting nummer: ${input.measurementNumber}` : null,
  ]
    .filter(Boolean)
    .join('\n')
  return `${ctx}\n\nTestuitslagen:\n${lines}`
}

/** Genereert een concept-slottekst. Gooit bij ontbrekende key of API-fout. */
export async function draftTestReportNarrative(
  input: NarrativeInput,
): Promise<NarrativeDraft> {
  const resp = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
  })

  const text = resp.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') {
    throw new Error('AI gaf geen tekst-antwoord terug.')
  }
  const parsed = JSON.parse(text.text) as NarrativeDraft
  return {
    interpretation: stripAiDashes(parsed.interpretation ?? ''),
    advice: (Array.isArray(parsed.advice) ? parsed.advice : []).map((a) => ({
      title: stripAiDashes(a.title ?? ''),
      body: stripAiDashes(a.body ?? ''),
    })),
    nextTestMoment: stripAiDashes(parsed.nextTestMoment ?? ''),
    nextTestGoal: stripAiDashes(parsed.nextTestGoal ?? ''),
  }
}

/**
 * Vangnet: haal em-/en-dashes uit AI-tekst (MBT-huisstijl gebruikt ze niet).
 * " — " / " – " → ", " (zinssplitsing); een overig los streepje → gewoon "-".
 * Laat de "·" middot met rust (die hoort wél bij de huisstijl).
 */
function stripAiDashes(s: string): string {
  return s
    .replace(/\s+[—–]\s+/g, ', ')
    .replace(/[—–]/g, '-')
}
