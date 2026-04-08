import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MOCK_PATIENT } from '@/lib/patient-constants'
import { User, Mail, Stethoscope, ClipboardList } from 'lucide-react'

export default function PatientProfilePage() {
  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-8" style={{ background: '#1A1A1A' }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl text-white"
            style={{ background: '#3ECF6A' }}
          >
            {MOCK_PATIENT.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="text-center">
            <h1 className="text-white text-xl font-bold">{MOCK_PATIENT.name}</h1>
            <p className="text-zinc-400 text-sm mt-0.5">{MOCK_PATIENT.email}</p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-6">
        <Card style={{ borderRadius: '14px' }}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Mijn gegevens</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <InfoRow icon={<User className="w-4 h-4" />} label="Naam" value={MOCK_PATIENT.name} />
            <InfoRow icon={<Mail className="w-4 h-4" />} label="E-mail" value={MOCK_PATIENT.email} />
            <InfoRow icon={<Stethoscope className="w-4 h-4" />} label="Therapeut" value={MOCK_PATIENT.therapistName} />
            <InfoRow icon={<ClipboardList className="w-4 h-4" />} label="Programma" value={MOCK_PATIENT.programName} />
          </CardContent>
        </Card>

        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="flex items-center justify-center py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Profielbewerking beschikbaar zodra de database is gekoppeld.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-zinc-400" style={{ background: '#f4f4f5' }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
