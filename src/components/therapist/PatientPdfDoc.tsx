// @react-pdf/renderer — server-side NOT supported, only use via dynamic import
import {
  Document, Page, View, Text, Image, StyleSheet, Font,
} from '@react-pdf/renderer'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ExerciseData {
  name: string
  sets: number
  reps: number
  cues: string[]
  videoUrl: string
  muscleScores: Record<string, number>
  color: string
  data: { week: string; gewicht: number; volume: number; rpe: number; gevoel: number }[]
}

interface Props {
  patient: { name: string; program: string; therapist: string }
  exercises: Record<string, ExerciseData>
  qrCodes: Record<string, string>
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const MBT_GREEN = '#BEF264'
const MBT_DARK  = '#1C2425'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 0,
  },

  // Header
  header: {
    backgroundColor: MBT_DARK,
    paddingHorizontal: 36,
    paddingVertical: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'column',
    gap: 2,
  },
  logoText: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: MBT_GREEN,
    letterSpacing: 1,
  },
  logoSub: {
    fontSize: 8,
    color: '#ffffff',
    opacity: 0.6,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
  },
  headerInfo: {
    fontSize: 9,
    color: '#ffffff',
    opacity: 0.8,
  },
  headerInfoBold: {
    fontSize: 10,
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
  },

  // Green accent bar
  accentBar: {
    height: 3,
    backgroundColor: MBT_GREEN,
  },

  // Content
  content: {
    paddingHorizontal: 36,
    paddingTop: 24,
  },

  // Program title
  programTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: MBT_DARK,
    marginBottom: 4,
  },
  programSub: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 20,
  },

  // Section label
  sectionLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: MBT_GREEN,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 4,
  },

  // Exercise card
  exCard: {
    marginBottom: 18,
    borderRadius: 8,
    border: '1 solid #e2e8f0',
    overflow: 'hidden',
  },
  exHeader: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1 solid #e2e8f0',
  },
  exNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: MBT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  exNumberText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
  },
  exName: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: MBT_DARK,
    flex: 1,
  },

  exBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 14,
  },

  // Thumbnail placeholder
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 6,
    backgroundColor: MBT_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  thumbnailText: {
    color: MBT_GREEN,
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
  },

  // Exercise details
  exDetails: {
    flex: 1,
    flexDirection: 'column',
    gap: 6,
  },
  paramRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  paramChip: {
    borderRadius: 4,
    backgroundColor: 'rgba(190,242,100,0.10)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
  },
  paramLabel: {
    fontSize: 8,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  paramValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: MBT_DARK,
  },
  cuesTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  cueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 2,
  },
  cueBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: MBT_GREEN,
    marginTop: 3,
    flexShrink: 0,
  },
  cueText: {
    fontSize: 9,
    color: '#374151',
    flex: 1,
  },

  // QR code column
  qrColumn: {
    alignItems: 'center',
    flexShrink: 0,
    width: 80,
  },
  qrImage: {
    width: 72,
    height: 72,
    borderRadius: 4,
    border: '1 solid #e2e8f0',
  },
  qrLabel: {
    fontSize: 7,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 3,
  },
  qrPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 4,
    border: '1 solid #e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholderText: {
    fontSize: 8,
    color: '#94a3b8',
    textAlign: 'center',
  },

  // Muscle scores row
  muscleRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  muscleChip: {
    borderRadius: 3,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 5,
    paddingVertical: 2,
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
  },
  muscleName: {
    fontSize: 7.5,
    color: '#059669',
  },
  muscleScore: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: MBT_DARK,
  },

  // Progress snapshot (last week)
  snapshotRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1 solid #f1f5f9',
  },
  snapshotChip: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  snapshotLabel: {
    fontSize: 7,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  snapshotValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: MBT_DARK,
    marginTop: 2,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1 solid #e2e8f0',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7.5,
    color: '#94a3b8',
  },
  footerBrand: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: MBT_GREEN,
  },
})

// ─── Document ─────────────────────────────────────────────────────────────────
export function PatientPdfDocument({ patient, exercises, qrCodes }: Props) {
  const today = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  const exEntries = Object.entries(exercises)
  const lastWeek = (ex: ExerciseData) => ex.data[ex.data.length - 1]

  return (
    <Document title={`Programma ${patient.name}`} author="MBT Move">
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.logoText}>MBT MOVE</Text>
            <Text style={styles.logoSub}>Sport Revalidatie Platform</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerInfo}>{patient.therapist}</Text>
            <Text style={styles.headerInfoBold}>{patient.name}</Text>
            <Text style={styles.headerInfo}>Gegenereerd: {today}</Text>
          </View>
        </View>
        <View style={styles.accentBar} />

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.programTitle}>{patient.program}</Text>
          <Text style={styles.programSub}>Trainingsprogramma · {exEntries.length} oefeningen</Text>

          <Text style={styles.sectionLabel}>Oefeningen</Text>

          {exEntries.map(([key, ex], idx) => {
            const last = lastWeek(ex)
            const qr = qrCodes[key]

            return (
              <View key={key} style={styles.exCard}>
                {/* Exercise header */}
                <View style={styles.exHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={styles.exNumber}>
                      <Text style={styles.exNumberText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.exName}>{ex.name}</Text>
                  </View>
                  <Text style={{ fontSize: 8, color: '#94a3b8' }}>W8 — {last.gewicht} kg</Text>
                </View>

                {/* Exercise body */}
                <View style={styles.exBody}>
                  {/* Thumbnail placeholder */}
                  <View style={styles.thumbnail}>
                    <Text style={styles.thumbnailText}>{ex.name.charAt(0)}</Text>
                  </View>

                  {/* Details */}
                  <View style={styles.exDetails}>
                    {/* Params */}
                    <View style={styles.paramRow}>
                      {[
                        { label: 'Sets', value: String(ex.sets) },
                        { label: 'Reps', value: String(ex.reps) },
                        { label: 'Gewicht', value: `${last.gewicht} kg` },
                        { label: 'RPE', value: String(last.rpe) },
                        { label: 'Gevoel', value: `${last.gevoel}/5` },
                      ].map(({ label, value }) => (
                        <View key={label} style={styles.paramChip}>
                          <Text style={styles.paramLabel}>{label}</Text>
                          <Text style={styles.paramValue}>{value}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Muscle scores */}
                    <View style={styles.muscleRow}>
                      {Object.entries(ex.muscleScores).map(([muscle, score]) => (
                        <View key={muscle} style={styles.muscleChip}>
                          <Text style={styles.muscleName}>{muscle}</Text>
                          <Text style={styles.muscleScore}>{score}/5</Text>
                        </View>
                      ))}
                    </View>

                    {/* Coaching cues */}
                    <Text style={styles.cuesTitle}>Coaching cues</Text>
                    {ex.cues.map((cue, ci) => (
                      <View key={ci} style={styles.cueRow}>
                        <View style={styles.cueBullet} />
                        <Text style={styles.cueText}>{cue}</Text>
                      </View>
                    ))}

                    {/* Progress snapshot */}
                    <View style={styles.snapshotRow}>
                      {[
                        { label: 'Volume W8', value: `${last.volume.toLocaleString('nl-NL')} kg` },
                        { label: 'Vol. W1',   value: `${ex.data[0].volume.toLocaleString('nl-NL')} kg` },
                        { label: 'Toename',   value: `+${Math.round(((last.volume - ex.data[0].volume) / ex.data[0].volume) * 100)}%` },
                      ].map(({ label, value }) => (
                        <View key={label} style={styles.snapshotChip}>
                          <Text style={styles.snapshotLabel}>{label}</Text>
                          <Text style={[styles.snapshotValue, label === 'Toename' ? { color: MBT_GREEN } : {}]}>{value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* QR Code */}
                  <View style={styles.qrColumn}>
                    {qr ? (
                      <Image src={qr} style={styles.qrImage} />
                    ) : (
                      <View style={styles.qrPlaceholder}>
                        <Text style={styles.qrPlaceholderText}>QR{'\n'}Video</Text>
                      </View>
                    )}
                    <Text style={styles.qrLabel}>Scan voor video</Text>
                  </View>
                </View>
              </View>
            )
          })}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{patient.name} · {patient.program}</Text>
          <Text style={styles.footerBrand}>MBT MOVE</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  )
}
