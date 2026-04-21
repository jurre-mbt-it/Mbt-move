import { Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'

export const metadata = {
  title: 'Berichten – MBT Gym',
}

export default function MessagesPage() {
  return (
    <div className="max-w-2xl w-full flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Kicker>Communicatie</Kicker>
        <h1
          className="athletic-display"
          style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
        >
          BERICHTEN
        </h1>
        <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
          Communicatie met patiënten
        </MetaLabel>
      </div>

      <Tile>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: P.surfaceHi }}
          >
            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 22, fontWeight: 900 }}>
              ✉
            </span>
          </div>
          <p style={{ color: P.ink, fontSize: 16, fontWeight: 800, letterSpacing: '0.04em' }}>
            GEEN BERICHTEN
          </p>
          <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 6 }}>
            Berichtenmodule is beschikbaar zodra de database is gekoppeld.
          </p>
        </div>
      </Tile>
    </div>
  )
}
