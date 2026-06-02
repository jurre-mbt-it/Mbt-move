/**
 * Intake-flow: gedeelde types, rode-vlaggen-lijst en de deterministische
 * matcher. Plain module (geen 'use client') zodat zowel de client-wizard als
 * de server-router (LLM-grounding/fallback) dit kunnen importeren.
 *
 * De AI kiest uiteindelijk het programma, maar deze deterministische matcher
 * is de grounding/hint en de fallback als de AI-call faalt.
 */

export type Goal = 'hardlopen' | 'klacht' | 'prehab'
export type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
export type Region = 'achilles' | 'patella' | 'rug' | 'heup'
export type Surgery = 'acl' | 'meniscus'
export type Days = '2' | '3' | '4+'
export type Place = 'thuis' | 'gym' | 'allebei'
export type Duration = 'kort' | 'middel' | 'lang'

export type IntakeAnswers = {
  goal: Goal
  level?: Level
  region?: Region
  surgery?: Surgery
  daysPerWeek?: Days
  location?: Place
  duration?: Duration
}

/** Alarmsignalen. Bij één of meer hiervan adviseren we eerst een consult,
 *  géén programma. Dit is de verplichte veiligheidscheck vóór elk advies. */
export const RED_FLAGS: Array<{ id: string; label: string }> = [
  { id: 'pijn', label: 'Hevige pijn, of pijn die je ’s nachts wakker maakt' },
  { id: 'uitstraling', label: 'Uitstralende pijn, tintelingen, een doof gevoel of krachtsverlies' },
  { id: 'trauma', label: 'Recent een ongeluk, val of ander trauma gehad' },
  { id: 'ziek', label: 'Koorts, je algemeen ziek voelen of onverklaard afvallen' },
  { id: 'operatie', label: 'Net geopereerd zonder begeleiding van een fysiotherapeut' },
]

/** Leesbare labels voor in de LLM-prompt en de UI. */
export const LABELS = {
  goal: {
    hardlopen: 'Sterker worden voor het hardlopen',
    klacht: 'Een specifieke klacht aanpakken',
    prehab: 'Voorbereiden op een operatie (prehab)',
  } as Record<Goal, string>,
  level: {
    BEGINNER: 'Weinig of geen ervaring met krachttraining',
    INTERMEDIATE: 'Traint al regelmatig met gewichten',
    ADVANCED: 'Ervaren met zwaardere krachttraining',
  } as Record<Level, string>,
  region: {
    achilles: 'Achillespees',
    patella: 'Knie (pees onder de knieschijf)',
    rug: 'Rug',
    heup: 'Heup',
  } as Record<Region, string>,
  surgery: {
    acl: 'Kruisband (ACL)',
    meniscus: 'Meniscus',
  } as Record<Surgery, string>,
  duration: {
    kort: 'Korter dan 6 weken',
    middel: '6 weken tot 3 maanden',
    lang: 'Langer dan 3 maanden',
  } as Record<Duration, string>,
}

/** Deterministische kandidaat-slug op basis van de antwoorden. */
export function matchSlug(a: IntakeAnswers): string {
  if (a.goal === 'hardlopen') {
    if (a.level === 'ADVANCED') return 'hardloop-kracht-vergevorderd'
    if (a.level === 'INTERMEDIATE') return 'hardloop-kracht-gevorderd'
    return 'hardloop-kracht-beginner'
  }
  if (a.goal === 'prehab') {
    return a.surgery === 'meniscus' ? 'meniscus-pre-operatie' : 'kruisband-acl-pre-operatie'
  }
  switch (a.region) {
    case 'achilles':
      return 'achillespees-tendinopathie'
    case 'patella':
      return 'patella-tendinopathie'
    case 'heup':
      return 'heup-fai'
    case 'rug':
    default:
      return 'sterke-rug'
  }
}
