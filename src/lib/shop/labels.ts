/** Nederlandse labels voor de shop-UI (gedeeld tussen server- en client-componenten). */

export const BODY_REGION_LABELS: Record<string, string> = {
  KNEE: 'Knie',
  SHOULDER: 'Schouder',
  BACK: 'Rug',
  ANKLE: 'Enkel',
  HIP: 'Heup',
  FULL_BODY: 'Hele lichaam',
  CERVICAL: 'Nek',
  THORACIC: 'Borstwervelkolom',
  LUMBAR: 'Lage rug',
  ELBOW: 'Elleboog',
  WRIST: 'Pols',
  FOOT: 'Voet',
}

export const BODY_REGION_OPTIONS = Object.keys(BODY_REGION_LABELS)

export const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Gevorderd',
  ADVANCED: 'Vergevorderd',
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Concept',
  PUBLISHED: 'Gepubliceerd',
  ARCHIVED: 'Gearchiveerd',
}

export const KIND_LABELS: Record<string, string> = {
  PROGRAM: 'Schema',
  PHYSICAL: 'Artikel',
  SERVICE: 'Dienst',
}

export const KIND_OPTIONS = ['PROGRAM', 'PHYSICAL', 'SERVICE'] as const
