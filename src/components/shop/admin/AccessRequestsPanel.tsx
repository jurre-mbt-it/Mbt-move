'use client'

/**
 * Admin-paneel met openstaande toegangsaanvragen uit de shop. Iemand zonder
 * account laat via `requestAccess` z'n gegevens achter; hier ziet de praktijk
 * ze en markeert 'uitgenodigd' (na het versturen van een invite) of 'afgewezen'.
 * Rendert niets als er geen openstaande aanvragen zijn.
 */
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, P } from '@/components/dark-ui'

export function AccessRequestsPanel() {
  const utils = trpc.useUtils()
  const { data: requests = [] } = trpc.shop.adminAccessRequests.useQuery()
  const resolve = trpc.shop.adminResolveAccessRequest.useMutation({
    onSuccess: () => utils.shop.adminAccessRequests.invalidate(),
    onError: (e) => toast.error(e.message),
  })

  const pending = requests.filter((r) => r.status === 'PENDING')
  if (pending.length === 0) return null

  return (
    <div
      className="mb-8 rounded-2xl border p-5"
      style={{ borderColor: P.brand, background: P.surface }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ background: P.brand, color: P.bg }}
        >
          {pending.length}
        </span>
        <h2 className="font-semibold">Toegangsaanvragen</h2>
      </div>
      <p className="mb-4 text-xs" style={{ color: P.inkDim }}>
        Deze mensen willen kopen maar hebben nog geen account. Nodig ze uit via het
        uitnodigingsscherm en markeer daarna hieronder.
      </p>
      <div className="space-y-2">
        {pending.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border p-3 flex flex-wrap items-center gap-3"
            style={{ borderColor: P.line, background: P.surfaceLow }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{r.name}</span>
                <a
                  href={`mailto:${r.email}`}
                  className="text-sm truncate hover:text-white transition-colors"
                  style={{ color: P.brand }}
                >
                  {r.email}
                </a>
              </div>
              {r.note && (
                <p className="mt-0.5 text-xs truncate" style={{ color: P.inkMuted }}>
                  {r.note}
                </p>
              )}
              {r.productSlug && (
                <p className="mt-0.5 text-[11px]" style={{ color: P.inkDim }}>
                  interesse: /{r.productSlug}
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <DarkButton
                size="sm"
                onClick={() => resolve.mutate({ id: r.id, status: 'INVITED' })}
              >
                Uitgenodigd
              </DarkButton>
              <DarkButton
                size="sm"
                variant="ghost"
                onClick={() => resolve.mutate({ id: r.id, status: 'DISMISSED' })}
              >
                Afwijzen
              </DarkButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
