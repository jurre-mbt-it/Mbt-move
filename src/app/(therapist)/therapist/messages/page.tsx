import { Card, CardContent } from '@/components/ui/card'
import { MessageSquare } from 'lucide-react'

export const metadata = {
  title: 'Berichten – MBT Gym',
}

export default function MessagesPage() {
  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Berichten</h1>
        <p className="text-muted-foreground text-sm">Communicatie met patiënten</p>
      </div>

      <Card style={{ borderRadius: '12px' }}>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: '#1C2425' }}
          >
            <MessageSquare className="w-7 h-7 text-[#7B8889]" />
          </div>
          <p className="font-semibold text-base">Geen berichten</p>
          <p className="text-sm text-muted-foreground mt-1">
            Berichtenmodule is beschikbaar zodra de database is gekoppeld.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
