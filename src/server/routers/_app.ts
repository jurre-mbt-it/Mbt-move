import { createTRPCRouter } from '@/server/trpc'
import { authRouter } from './auth'
import { exercisesRouter } from './exercises'
import { patientsRouter } from './patients'
import { programsRouter } from './programs'
import { weekSchedulesRouter } from './weekSchedules'
import { researchRouter } from './research'
import { patientRouter } from './patient'
import { dpaRouter } from './dpa'
import { ghvRouter } from './ghv'
import { wellnessRouter } from './wellness'
import { adminRouter } from './admin'
import { inviteRouter } from './invite'
import { gdprRouter } from './gdpr'
import { insightsRouter } from './insights'
import { rehabRouter } from './rehab'
import { assessmentsRouter } from './assessments'
import { cohortRouter } from './cohort'
import { practiceRouter } from './practice'
import { shopRouter } from './shop'
import {
  clinicalTestsRouter,
  patientTestAssignmentsRouter,
  patientTestResultsRouter,
} from './clinicalTests'
import { educationRouter } from './education'
import { testReportsRouter } from './testReports'
import { runningAnalysisRouter } from './runningAnalysis'
import { wearablesRouter } from './wearables'
import { messagesRouter } from './messages'

export const appRouter = createTRPCRouter({
  auth: authRouter,
  exercises: exercisesRouter,
  patients: patientsRouter,
  practice: practiceRouter,
  programs: programsRouter,
  weekSchedules: weekSchedulesRouter,
  research: researchRouter,
  patient: patientRouter,
  dpa: dpaRouter,
  ghv: ghvRouter,
  wellness: wellnessRouter,
  admin: adminRouter,
  invite: inviteRouter,
  gdpr: gdprRouter,
  insights: insightsRouter,
  rehab: rehabRouter,
  assessments: assessmentsRouter,
  cohort: cohortRouter,
  clinicalTests: clinicalTestsRouter,
  patientTestAssignments: patientTestAssignmentsRouter,
  patientTestResults: patientTestResultsRouter,
  shop: shopRouter,
  education: educationRouter,
  testReports: testReportsRouter,
  runningAnalysis: runningAnalysisRouter,
  wearables: wearablesRouter,
  messages: messagesRouter,
})

export type AppRouter = typeof appRouter
