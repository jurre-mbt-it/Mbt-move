/**
 * Kleurenpalet voor de shop — hetzelfde palet als de rest van de app.
 *
 * Blijft bestaan als bekend importpad; de waarden staan in `@/lib/palette`.
 * Importeer voor de storefront NIET `P` uit `@/components/dark-ui`: dat is een
 * 'use client'-module, en in een servercomponent levert dat een client-
 * reference proxy op waardoor `P.lime` e.d. `undefined` zijn.
 */
export { P, CARD } from '@/lib/palette'
