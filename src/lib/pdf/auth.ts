import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { decodeAalClaim } from '@/lib/auth/aal'

export type PrintActor = {
  id: string
  email: string
  name: string | null
  role: string
  practiceId: string | null
  canUseAssessment: boolean
  mfaEnabled: boolean
  /** `aal`-claim uit het geverifieerde access-token: 'aal2' = tweede factor gehaald. */
  aal: string | null
}

/**
 * Ophalen van de huidige user voor een print-route. Resolved supabase
 * cookie → Prisma User. Geeft null als niet ingelogd of niet bekend.
 *
 * Bindt UITSLUITEND op `supabaseUserId`, net als `resolveUser` in
 * src/server/trpc.ts. Hier stond een `OR` met een email-tak, en die accepteerde
 * een User-row die aan een ánder Supabase-account hangt (of aan geen enkel) —
 * precies het account-takeover-scenario dat de tRPC-kant bewust weigert, en bij
 * twee matchende rows was de winnaar van `findFirst` willekeurig. Print-routes
 * zijn per definitie staff, en voor THERAPIST/ADMIN weigert `resolveUser` de
 * email-fallback óók, dus dit is geen functieverlies: wie hier niet doorkomt,
 * komt vandaag al nergens in de app binnen.
 */
export async function getPrintActor(): Promise<PrintActor | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const dbUser = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      practiceId: true,
      canUseAssessment: true,
      mfaEnabled: true,
    },
  })
  if (!dbUser) return null

  // Token pas ná de geslaagde getUser() lezen, uitsluitend voor de aal-claim.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return { ...dbUser, aal: decodeAalClaim(session?.access_token) }
}

/**
 * Reden waarom deze staff-actor géén dossier mag ophalen, of null als het mag.
 *
 * Print-routes vallen buiten `protectedPrefixes` in src/proxy.ts en buiten de
 * tRPC-procedures, dus de MFA-plicht die daar wél geldt (`assertMfaSatisfied` +
 * `assertStaffMfaEnrolled`, en de `/mfa/enroll`-redirect in require-role.ts)
 * werd hier helemaal niet afgedwongen. Een therapeut die de tweede factor nog
 * niet had ingesteld — of van wie alleen het wachtwoord gestolen was — kon zo
 * volledige dossiers als HTML ophalen. Dit is de ontbrekende poort.
 */
export function staffMfaBlock(actor: PrintActor): string | null {
  if (!actor.mfaEnabled) {
    return 'Tweestapsverificatie is verplicht voor deze gegevens. Stel die eerst in via /mfa/enroll.'
  }
  if (actor.aal !== 'aal2') {
    return 'Bevestig eerst de tweede stap van je login voordat je dossiers opvraagt.'
  }
  return null
}

/**
 * Spiegel van `hasPatientAccess` uit `patients.ts`: directe
 * PatientTherapist-koppeling, of dezelfde praktijk, of ADMIN.
 */
export async function actorCanSeePatient(
  actor: PrintActor,
  patientId: string,
): Promise<boolean> {
  if (actor.role === 'ADMIN') return true
  const found = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        {
          patientTherapists: {
            some: {
              therapistId: actor.id,
              isActive: true,
              status: { in: ['APPROVED', 'PENDING'] },
            },
          },
        },
        // Praktijk-tak expliciet aan THERAPIST gebonden, zoals AGENTS.md
        // voorschrijft: nooit op de lege practiceId van een coach vertrouwen.
        // De rol-gate in de routes dekt dit al, dit is defense-in-depth.
        ...(actor.role === 'THERAPIST' && actor.practiceId
          ? [{ practiceId: actor.practiceId }]
          : []),
      ],
    },
    select: { id: true },
  })
  return !!found
}

/**
 * Strictere check voor assessment: actieve APPROVED behandelrelatie of admin.
 * Spiegelt `assertTreating` uit `assessments.ts` — we volgen daar bewust niet
 * de praktijk-route omdat assessment-data extra gevoelig is.
 */
export async function actorIsTreating(
  actor: PrintActor,
  patientId: string,
): Promise<boolean> {
  if (actor.role === 'ADMIN') return true
  const relation = await prisma.patientTherapist.findFirst({
    where: {
      therapistId: actor.id,
      patientId,
      isActive: true,
      status: 'APPROVED',
    },
    select: { id: true },
  })
  return !!relation
}
