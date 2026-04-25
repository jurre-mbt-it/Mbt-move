import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL('https://mbt-gym.nl'),
  title: 'MBT·Gym — Train. Recover. Repeat.',
  description:
    'MBT·Gym is de athletic-first trainings-app voor sporters onder begeleiding van een Movement Based Therapy coach. Programma, workload, recovery en pijn in één.',
  openGraph: {
    title: 'MBT·Gym — Train. Recover. Repeat.',
    description:
      'Trainingen, workload-tracking en recovery in één app. Gebouwd met Movement Based Therapy.',
    images: ['/mbt-gym-icon.png'],
  },
}

export default function GymLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
