'use client'

import { forwardRef, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * NumericInput — vervangt `<input type="number">` met betere UX:
 *
 *   • Veld mag leeg blijven tijdens edit (backspace clear je hele veld
 *     zonder dat er een "1" achterblijft die je moet selecteren).
 *   • Eerste keystroke vult het lege veld direct — geen "altijd 1 cijfer
 *     verplicht" gevoel.
 *   • Op blur, als allowEmpty=false: terugzetten naar laatste geldige
 *     waarde. Met allowEmpty=true: blijft leeg, callback krijgt null.
 *   • Sync vanuit external value-prop: als de bovenliggende state verandert
 *     (bv. door een PATCH), pakt de draft die over.
 *
 * Default voor de meeste plekken: `allowEmpty={false}` (waarde is verplicht,
 * leeg op blur snapt terug). Voor optionele velden (bv. range-max): pass
 * `allowEmpty={true}` zodat empty echt blijft staan en null wordt opgeslagen.
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined
  onChange: (value: number | null) => void
  /** Wanneer true: leeg veld is een geldige eindtoestand → onChange(null) op leeg.
   *  Wanneer false (default): leeg veld revert op blur naar de laatste numerieke waarde. */
  allowEmpty?: boolean
}

export const NumericInput = forwardRef<HTMLInputElement, Props>(function NumericInput(
  { value, onChange, allowEmpty = false, className, min, max, step, ...rest }, ref,
) {
  // Lokale string-state zodat we leeg/tussenstaten ("3.", "-") kunnen renderen.
  const [draft, setDraft] = useState<string>(() => value == null ? '' : String(value))

  // Externe value-prop wijziging (bv. server-patch, reset) → herlaad draft.
  // We slaan de laatst-geziene value op om alleen op echte externe veranderingen
  // te resyncen — niet op elke render.
  const lastValueRef = useRef(value)
  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value
      setDraft(value == null ? '' : String(value))
    }
  }, [value])

  return (
    <input
      ref={ref}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(e) => {
        const next = e.target.value
        setDraft(next)
        if (next === '') {
          if (allowEmpty) onChange(null)
          // Geen onChange wanneer !allowEmpty — value-prop blijft staan, blur
          // herstelt de display. Voorkomt dat tussentijds-clearen een 0 of min
          // commit naar de server.
          return
        }
        // Vang ongeldige tussen-staten zoals "" "-" "." — alleen geldige finite
        // nummers committen. De gebruiker kan typen, value-prop blijft staat-
        // van-laatst-geldige terwijl draft de tussenstand toont.
        const num = Number(next)
        if (Number.isFinite(num)) {
          onChange(num)
        }
      }}
      onBlur={(e) => {
        if (draft === '' && !allowEmpty) {
          // Herstel display naar laatste geldige value-prop.
          setDraft(value == null ? '' : String(value))
        }
        rest.onBlur?.(e)
      }}
      className={cn(className)}
      {...rest}
    />
  )
})
