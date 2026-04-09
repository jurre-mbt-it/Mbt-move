/**
 * Diagnosis normalisation — server-side only.
 * Maps free-text diagnoses to standardised categories for anonymised research records.
 * Never stores the original free-text; only the normalised category is persisted.
 */

export const DIAGNOSIS_CATEGORIES = [
  'ACL',
  'PCL',
  'Meniscus',
  'Knie (overig)',
  'Schouder impingement',
  'Rotator cuff',
  'Schouder (overig)',
  'Lage rugpijn',
  'Hernia',
  'Rug (overig)',
  'Hamstring',
  'Quadriceps',
  'Kuit / Achilles',
  'Enkel',
  'Heup',
  'Elleboog',
  'Pols / Hand',
  'Cervicaal',
  'Postoperatief (overig)',
  'Overig',
] as const

export type DiagnosisCategory = (typeof DIAGNOSIS_CATEGORIES)[number]

// Keyword rules: first match wins (most specific first)
const RULES: Array<{ keywords: string[]; category: DiagnosisCategory }> = [
  { keywords: ['acl', 'voorste kruisband', 'anterior cruciate'], category: 'ACL' },
  { keywords: ['pcl', 'achterste kruisband', 'posterior cruciate'], category: 'PCL' },
  { keywords: ['meniscus', 'menisk', 'knieband'], category: 'Meniscus' },
  { keywords: ['impingement', 'impinging', 'klem'], category: 'Schouder impingement' },
  { keywords: ['rotator cuff', 'rotatormanchet', 'supraspinatus', 'infraspinatus', 'subscapularis', 'teres minor'], category: 'Rotator cuff' },
  { keywords: ['schouder', 'shoulder', 'sleutelbeen', 'ac-gewricht', 'labrum'], category: 'Schouder (overig)' },
  { keywords: ['hernia', 'diskus', 'discus', 'wervelzuil', 'prolaps', 'ischias', 'radiculopathie'], category: 'Hernia' },
  { keywords: ['lage rug', 'lower back', 'lumbaal', 'lumbale', 'spit'], category: 'Lage rugpijn' },
  { keywords: ['rug', 'ruggenwervel', 'thoracaal', 'thoracale', 'back pain', 'rugklacht'], category: 'Rug (overig)' },
  { keywords: ['hamstring', 'biceps femoris', 'semitendinosus', 'semimembranosus'], category: 'Hamstring' },
  { keywords: ['quadriceps', 'quad', 'patella', 'patellapees', 'rectus femoris', 'vastus'], category: 'Quadriceps' },
  { keywords: ['achilles', 'kuit', 'calf', 'gastrocnemius', 'soleus', 'achillespees'], category: 'Kuit / Achilles' },
  { keywords: ['enkel', 'ankle', 'peroneus', 'lateraal enkelbandletsel'], category: 'Enkel' },
  { keywords: ['heup', 'hip', 'gluteus', 'piriformis', 'trochanter', 'lies', 'groin'], category: 'Heup' },
  { keywords: ['knie', 'knee', 'patellofemorale'], category: 'Knie (overig)' },
  { keywords: ['elleboog', 'elbow', 'epicondyle', 'tenniselleboog', 'golferselleboog'], category: 'Elleboog' },
  { keywords: ['pols', 'wrist', 'hand', 'vinger', 'carpaal', 'carpal'], category: 'Pols / Hand' },
  { keywords: ['nek', 'cervicaal', 'cervicale', 'neck', 'whiplash'], category: 'Cervicaal' },
  { keywords: ['postoperatief', 'post-op', 'operatie', 'prothese', 'revalidatie na'], category: 'Postoperatief (overig)' },
]

/**
 * Normalise a free-text diagnosis string to a standard category.
 * Returns 'Overig' when no rule matches.
 */
export function normalizeDiagnosis(raw: string | null | undefined): DiagnosisCategory {
  if (!raw) return 'Overig'
  const lower = raw.toLowerCase()
  for (const rule of RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.category
    }
  }
  return 'Overig'
}
