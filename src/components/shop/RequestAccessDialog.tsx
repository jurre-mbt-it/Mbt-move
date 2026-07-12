'use client'

/**
 * "Account aanvragen"-dialog voor de shop. Kopen kan alleen mét account; wie er
 * geen heeft laat hier naam + e-mail achter. De praktijk nodigt de aanvrager
 * daarna uit via het reguliere invite-systeem. Toont een bevestiging na
 * versturen (of meldt dat er al een account bestaat).
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkDialog,
  DarkDialogContent,
  DarkDialogHeader,
  DarkDialogTitle,
  DarkDialogDescription,
  DarkInput,
  DarkTextarea,
} from '@/components/dark-ui'
import { P } from '@/lib/shop/palette'

export function RequestAccessDialog({
  productSlug,
  trigger,
}: {
  productSlug?: string
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [done, setDone] = useState<null | 'requested' | 'exists'>(null)

  const request = trpc.shop.requestAccess.useMutation({
    onSuccess: (res) => setDone(res.alreadyHasAccount ? 'exists' : 'requested'),
    onError: (e) => toast.error(e.message),
  })

  function submit() {
    if (!name.trim()) return toast.error('Vul je naam in')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return toast.error('Vul een geldig e-mailadres in')
    }
    request.mutate({
      name: name.trim(),
      email: email.trim(),
      note: note.trim() || undefined,
      productSlug,
    })
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    // Reset bij sluiten zodat een volgende opening schoon begint.
    if (!next) {
      setTimeout(() => {
        setDone(null)
        setName('')
        setEmail('')
        setNote('')
      }, 200)
    }
  }

  return (
    <DarkDialog open={open} onOpenChange={onOpenChange}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DarkDialogContent>
        <DarkDialogHeader>
          <DarkDialogTitle>
            {done === 'requested'
              ? 'Aanvraag ontvangen'
              : done === 'exists'
                ? 'Je hebt al een account'
                : 'Account aanvragen'}
          </DarkDialogTitle>
          <DarkDialogDescription>
            {done === 'requested'
              ? 'We nemen contact met je op en sturen je een uitnodiging om in te loggen. Daarna kun je het programma kopen en gebruiken.'
              : done === 'exists'
                ? 'Er bestaat al een account met dit e-mailadres. Log in om je programma te kopen.'
                : 'Je koopt onze programma’s met een account. Laat je gegevens achter, dan nodigen we je uit.'}
          </DarkDialogDescription>
        </DarkDialogHeader>

        {done ? (
          <div className="mt-4">
            <DarkButton onClick={() => onOpenChange(false)} className="w-full">
              Sluiten
            </DarkButton>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <DarkInput placeholder="Naam" value={name} onChange={(e) => setName(e.target.value)} />
            <DarkInput
              type="email"
              placeholder="E-mailadres"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <DarkTextarea
              placeholder="Bericht (optioneel) — bijvoorbeeld welk programma je zoekt"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ minHeight: 80 }}
            />
            <DarkButton onClick={submit} loading={request.isPending} className="w-full">
              Verstuur aanvraag
            </DarkButton>
            <p className="text-center text-xs" style={{ color: P.inkDim }}>
              We gebruiken je gegevens alleen om je uit te nodigen.
            </p>
          </div>
        )}
      </DarkDialogContent>
    </DarkDialog>
  )
}
