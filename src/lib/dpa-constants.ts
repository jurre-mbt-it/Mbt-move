/** Huidige versie van de Verwerkingsovereenkomst (DPA).
 *  Bump deze bij elke materiële tekstwijziging: bestaande patiënten met een
 *  oudere `dpaAcceptedVersion` worden dan automatisch naar /onboarding/dpa
 *  geleid om opnieuw te accepteren (afgedwongen in require-role.ts).
 *  v1.1 (2026-06-07): bewaartermijn 20j, KvK gecorrigeerd, Supabase-regio
 *  Londen (eu-west-2), subverwerkers Anthropic + Mollie toegevoegd. */
export const DPA_VERSION = 'v1.1'
