/**
 * Voortgang van de quick start (`lib/quick-start.ts`).
 *
 * De vinkjes komen uit de database, niet uit localStorage: een checklist die
 * zichzelf afvinkt zodra je de handeling echt hebt gedaan is eerlijk, en hij
 * klopt ook op een tweede apparaat.
 *
 * Scoping is BEWUST per gebruiker, niet per praktijk. Inhoudelijk klopt dat
 * ("heb jíj al een patiënt uitgenodigd", niet "heeft een collega dat ooit
 * gedaan"), en het zet de multi-tenant vraag helemaal buitenspel: zonder
 * praktijk-tak is er ook geen tak die voor een coach verkeerd kan uitvallen.
 * Zie AGENTS.md over de coach-rol.
 */
import { createTRPCRouter, coachStaffProcedure } from '@/server/trpc'
import { EMPTY_DRAFT_WHERE } from './programs'

export const onboardingRouter = createTRPCRouter({
  progress: coachStaffProcedure.query(async ({ ctx }) => {
    const me = ctx.user.id

    const [patients, exercises, programs, weeks, sessions] = await Promise.all([
      ctx.prisma.patientTherapist.count({ where: { therapistId: me } }),
      ctx.prisma.exercise.count({ where: { createdById: me } }),
      ctx.prisma.program.count({ where: { creatorId: me, NOT: EMPTY_DRAFT_WHERE(me) } }),
      ctx.prisma.weekSchedule.count({ where: { creatorId: me } }),
      ctx.prisma.sessionLog.count({ where: { therapistId: me } }),
    ])

    return {
      patient: patients > 0,
      exercise: exercises > 0,
      program: programs > 0,
      week: weeks > 0,
      session: sessions > 0,
    }
  }),
})
