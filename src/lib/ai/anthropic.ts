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
    throw new Error('ANTHROPIC_API_KEY ontbreekt. AI-concept is niet beschikbaar.')
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

// AVG-dataminimalisatie (art. 5(1)(c)): we sturen BEWUST geen patiëntnaam of
// ander direct identificerend gegeven naar de externe AI. Het model schrijft in
// de "je"-vorm en heeft de naam niet nodig; wat overblijft is pseudonieme
// klinische context (rehab-fase + testwaarden). Vrije-tekstvelden zoals
// blessure/doel worden bewust NIET meegestuurd (kunnen een naam bevatten).
export type NarrativeInput = {
  // NB: geen `injuryGoal` — vrije tekst gaat niet naar de externe AI (zie
  // buildUserPrompt). Alleen gestructureerde, pseudonieme velden.
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
  // AVG-dataminimalisatie: het vrije-tekstveld `injuryGoal` gaat BEWUST NIET
  // naar de externe AI. Het is door de therapeut ingetypte vrije tekst en kan
  // (on)bedoeld een naam of ander direct identificerend gegeven bevatten,
  // waarmee de pseudonieme casus alsnog herleidbaar wordt bij de sub-processor.
  // Alleen het gestructureerde fase-label + meetnummer + de testwaarden gaan mee.
  const ctx = [
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

// ── Hardloopanalyse ────────────────────────────────────────────────────────
// Zie NarrativeInput: geen naam/identifier naar de externe AI (dataminimalisatie).
export type RunningNarrativeInput = {
  // NB: geen `goal` — vrije tekst gaat niet naar de externe AI (zie buildRunningPrompt).
  rearTotal?: number | null
  rear: Array<{ label: string; score: number | null; status: string }>
  side: Array<{ label: string; value: number | null; ideal: string; status: string }>
  metrics: Array<{ label: string; value: number | null; unit: string }>
}

export type RunningNarrativeDraft = {
  comments: string
  advice: DraftAdvice[]
  nextMoment: string
}

const RUNNING_SYSTEM_PROMPT = `Je bent sportfysiotherapeut bij Movement Based Therapy (MBT) en schrijft de slottekst van een 2D-hardloopanalyse voor een hardloper.

Toon en stijl (MBT-huisstijl):
- Schrijf direct in de tweede persoon ("je", "jouw"), nuchter en bemoedigend.
- Concreet en evidence-based; benoem het belangrijkste verbeterpunt eerlijk en geef een trainbaar perspectief.
- Nederlands, geen Engelse termen waar een Nederlandse bestaat. Geen emoji, geen kopjes.
- Gebruik NOOIT een lang gedachtestreepje (— of –). Splits zinnen met komma, punt of haakjes; hooguit een gewoon koppelteken (-).

Je krijgt de scores van het achteraanzicht (0-100), de hoekmetingen van het zijaanzicht (met ideale range en status), en de loopmetrics. Lever een JSON-object:
- "comments": 1 alinea (4-7 zinnen) opmerkingen van de therapeut die het beeld duidt, de belangrijkste afwijking(en) benoemt en een concreet, trainbaar advies geeft (bv. cadans verhogen, voorwaartse lean, gerichte kracht). Verwijs naar concrete bevindingen/getallen.
- "advice": 3-4 vervolg-punten, elk met korte vette aanhef ("title") en "body" van 1 zin met concrete trainingsrichting (bv. cadansdrills, krachtoefeningen, techniek).
- "nextMoment": korte aanduiding van het volgende analysemoment (bv "Over 6 weken").

Verzin geen waarden die niet in de data staan. Antwoord uitsluitend met het JSON-object.`

const RUNNING_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    comments: { type: 'string' },
    advice: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { title: { type: 'string' }, body: { type: 'string' } },
        required: ['title', 'body'],
      },
    },
    nextMoment: { type: 'string' },
  },
  required: ['comments', 'advice', 'nextMoment'],
} as const

function buildRunningPrompt(i: RunningNarrativeInput): string {
  const rear = i.rear
    .map((r) => `- ${r.label}: ${r.score ?? '—'}/100 (${r.status})`)
    .join('\n')
  const side = i.side
    .map((s) => `- ${s.label}: ${s.value ?? '—'}° (ideaal ${s.ideal}) → ${s.status}`)
    .join('\n')
  const metrics = i.metrics
    .map((m) => `- ${m.label}: ${m.value ?? '—'} ${m.unit}`)
    .join('\n')
  // AVG-dataminimalisatie: `goal` is vrije tekst van de therapeut en gaat
  // BEWUST NIET mee naar de externe AI (kan een naam/identifier bevatten).
  // De numerieke scores/hoeken/metrics zijn pseudonieme klinische data.
  return [
    i.rearTotal != null ? `Totaalscore achteraanzicht: ${i.rearTotal}%` : null,
    '',
    'Achteraanzicht (score 0-100):',
    rear,
    '',
    'Zijaanzicht (hoeken):',
    side,
    '',
    'Loopmetrics:',
    metrics,
  ]
    .filter((l) => l !== null)
    .join('\n')
}

/** Concept-slottekst voor een hardloopanalyse. Gooit bij ontbrekende key/API-fout. */
export async function draftRunningAnalysisNarrative(
  input: RunningNarrativeInput,
): Promise<RunningNarrativeDraft> {
  const resp = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: RUNNING_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildRunningPrompt(input) }],
    output_config: { format: { type: 'json_schema', schema: RUNNING_OUTPUT_SCHEMA } },
  })
  const text = resp.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('AI gaf geen tekst-antwoord terug.')
  const parsed = JSON.parse(text.text) as RunningNarrativeDraft
  return {
    comments: stripAiDashes(parsed.comments ?? ''),
    advice: (Array.isArray(parsed.advice) ? parsed.advice : []).map((a) => ({
      title: stripAiDashes(a.title ?? ''),
      body: stripAiDashes(a.body ?? ''),
    })),
    nextMoment: stripAiDashes(parsed.nextMoment ?? ''),
  }
}
