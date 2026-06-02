import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side toegang tot de privé-bucket `educational-resources`.
 *
 * De bucket is niet publiek (zie 20260602_educational_resources.sql). Uploads
 * doet de admin via de browser-client (storage-RLS staat alleen ADMIN toe);
 * het serveren van PDF's gebeurt via tijdelijke signed URLs die hier met de
 * service_role worden gegenereerd — die bypasst RLS.
 */

export const EDUCATION_BUCKET = 'educational-resources'

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Genereer een tijdelijke download/preview-URL voor een PDF-object.
 * Returnt null als er geen pad is of de signing faalt (best-effort, zodat een
 * los kapot bestand de hele lijst-query niet laat klappen).
 */
export async function signEducationFile(
  filePath: string | null | undefined,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  if (!filePath) return null
  const { data, error } = await serviceClient()
    .storage.from(EDUCATION_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds)
  if (error) return null
  return data?.signedUrl ?? null
}

/** Verwijder een PDF-object uit de bucket (best-effort). */
export async function removeEducationFile(
  filePath: string | null | undefined,
): Promise<void> {
  if (!filePath) return
  await serviceClient()
    .storage.from(EDUCATION_BUCKET)
    .remove([filePath])
    .catch(() => {
      // Best-effort: als verwijderen faalt blijft het object weeshangen, maar
      // de DB-rij is wel weg. Storage-cleanup-cron ruimt wezen later op.
    })
}
