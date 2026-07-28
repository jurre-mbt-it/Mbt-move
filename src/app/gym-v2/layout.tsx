import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL('https://mbt-gym.nl'),
  // `absolute` omzeilt de template uit de root-layout, anders wordt het
  // "MBT·Gym — Belasting die je kunt zien – MBT Gym".
  title: { absolute: 'MBT·Gym — Belasting die je kunt zien' },
  description:
    'MBT·Gym legt elke set, je hartslag en je pijnscores naast elkaar en zet je fitheid af tegen je vermoeidheid. Je therapeut kijkt mee in dezelfde grafiek.',
  openGraph: {
    title: 'MBT·Gym — Belasting die je kunt zien',
    description:
      'Trainingsapp voor sporters onder begeleiding, met een belastingmodel dat fitheid tegen vermoeidheid zet.',
    images: ['/mbt-gym-icon.png'],
  },
  // Deze versie staat naast /gym zolang er gekozen wordt. Uit de index houden
  // voorkomt dat twee bijna identieke pagina's om dezelfde zoekwoorden vechten.
  // Weghalen zodra dit de echte landingspagina wordt.
  robots: { index: false, follow: false },
}

export default function GymV2Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
