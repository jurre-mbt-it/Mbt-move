import styles from './base-site.module.css'

/**
 * PROEFBEELDEN, op verzoek van Jurre (21-08): de lege opnamekaders zeiden
 * niets over hoe de pagina voelt, dus staan hier composities in de stijl van
 * de app om het ontwerp mee te testen. Elk beeld draagt een "Proefbeeld"-label
 * in de hoek, en de afspraak blijft: zodra de echte, gemaskeerde opnames er
 * zijn gaan deze eruit. Namen zijn de bijnamen uit het opnameprotocol.
 *
 * De kleuren komen uit src/lib/palette.ts (soortkleuren) en de app-tokens in
 * base-site.module.css; hier staan ze bewust hardcoded zodat dit bestand
 * zelfstandig weg te gooien is.
 */
const KLEUR = {
  kracht: '#E9B45C',
  cardio: '#7FB3DE',
  mobiliteit: '#8FCFC4',
  ink: '#F5F2ED',
  mut: '#9EB5B3',
  brand: '#E87A55',
  groen: '#4ecb71',
}

function Chip({ tekst, kleur }: { tekst: string; kleur: string }) {
  return (
    <span className={styles.mockChip} style={{ background: kleur, color: '#0A1C1D' }}>
      {tekst}
    </span>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className={styles.mockLabel}>{children}</span>
}

export function MockDashboard() {
  return (
    <div className={styles.mock} aria-hidden="true">
      <div className={styles.mockTopbar}>
        <span className={styles.mockBrand}>BASE</span>
        <Label>Dashboard · week 34</Label>
      </div>
      <div className={styles.mockStats}>
        {[
          ['Signalen', '3', KLEUR.brand],
          ['Deze week', '12', KLEUR.ink],
          ['Therapietrouw', '86%', KLEUR.groen],
          ['Stil', '2', KLEUR.kracht],
        ].map(([l, v, k]) => (
          <div key={l as string} className={styles.mockStat}>
            <Label>{l}</Label>
            <b style={{ color: k as string }}>{v}</b>
          </div>
        ))}
      </div>
      <div className={styles.mockRows}>
        {[
          ['Kilometervreter', 'Belasting 52% boven de weekopbouw', 'Vandaag', KLEUR.brand],
          ['Vroege vogel', 'Zeven dagen niets gelogd', '2 dgn', KLEUR.kracht],
          ['Krachtpatser', 'Symmetrie van 71 naar 78 procent', 'Gisteren', KLEUR.mobiliteit],
          ['Snelheidsduivel', 'Hertest hop-batterij in week 36', 'Deze week', KLEUR.cardio],
        ].map(([naam, tekst, wanneer, kleur]) => (
          <div key={naam as string} className={styles.mockRow}>
            <i style={{ background: kleur as string }} />
            <b>{naam}</b>
            <span>{tekst}</span>
            <Label>{wanneer}</Label>
          </div>
        ))}
      </div>
      <span className={styles.mockTag}>Proefbeeld · wordt echte opname</span>
    </div>
  )
}

export function MockBuilder() {
  return (
    <div className={styles.mock} aria-hidden="true">
      <div className={styles.mockTopbar}>
        <span className={styles.mockBrand}>BASE</span>
        <Label>Builder · Knie 3B</Label>
      </div>
      <div className={styles.mockRows}>
        {[
          ['Split squat', '4 × 8 · RPE 7', KLEUR.kracht],
          ['Nordic curl', '3 × 6 · excentrisch', KLEUR.kracht],
          ['Calf raise', '3 × 12 · enkel zwaar', KLEUR.kracht],
          ['Fietsen rustig', '20 min · zone 2', KLEUR.cardio],
        ].map(([oef, dosis, kleur]) => (
          <div key={oef as string} className={styles.mockRow}>
            <span className={styles.mockVideo} style={{ borderColor: kleur as string }} />
            <b>{oef}</b>
            <span>{dosis}</span>
            <Label>video</Label>
          </div>
        ))}
      </div>
      <div className={styles.mockFoot}>
        <Chip tekst="Bewaar als sjabloon" kleur={KLEUR.ink} />
        <Chip tekst="Wijs toe" kleur={KLEUR.brand} />
      </div>
      <span className={styles.mockTag}>Proefbeeld · wordt echte opname</span>
    </div>
  )
}

export function MockCriteria() {
  return (
    <div className={styles.mock} aria-hidden="true">
      <div className={styles.mockTopbar}>
        <span className={styles.mockBrand}>BASE</span>
        <Label>VKB-traject · fase 5 van 8</Label>
      </div>
      <div className={styles.mockRows}>
        {[
          ['Symmetrie quadriceps', '78%', 'doel 90%', KLEUR.kracht, false],
          ['Single leg hop', '92%', 'Behaald', KLEUR.groen, true],
          ['Y-balance', '88%', 'Behaald', KLEUR.groen, true],
          ['Hop-batterij', '—', 'hertest week 36', KLEUR.cardio, false],
        ].map(([test, waarde, status, kleur, behaald]) => (
          <div key={test as string} className={styles.mockRow}>
            <i style={{ background: kleur as string }} />
            <b>{test}</b>
            <span className={styles.mockNum}>{waarde}</span>
            {behaald ? (
              <Chip tekst={status as string} kleur={KLEUR.groen} />
            ) : (
              <Label>{status}</Label>
            )}
          </div>
        ))}
      </div>
      <span className={styles.mockTag}>Proefbeeld · wordt echte opname</span>
    </div>
  )
}

export function MockWeek() {
  const dagen = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO']
  const cellen: ([string, string] | null)[] = [
    ['Knie 3B', KLEUR.kracht],
    null,
    ['Kracht A', KLEUR.kracht],
    ['Fietsen', KLEUR.cardio],
    ['Knie 3B', KLEUR.kracht],
    null,
    ['Lange duurloop', KLEUR.cardio],
  ]
  return (
    <div className={styles.mock} aria-hidden="true">
      <div className={styles.mockTopbar}>
        <span className={styles.mockBrand}>BASE</span>
        <Label>Weekschema · Kilometervreter · W34</Label>
      </div>
      <div className={styles.mockGrid}>
        {dagen.map((d, i) => (
          <div key={d} className={styles.mockDag}>
            <Label>{d}</Label>
            {cellen[i] ? (
              <span className={styles.mockPil} style={{ background: cellen[i]![1] }}>
                {cellen[i]![0]}
              </span>
            ) : (
              <span className={styles.mockRust}>rust</span>
            )}
          </div>
        ))}
      </div>
      <div className={styles.mockFoot}>
        <Label>Weektotaal · 5 sessies · 3 u 20 · belasting 342</Label>
      </div>
      <span className={styles.mockTag}>Proefbeeld · wordt echte opname</span>
    </div>
  )
}
