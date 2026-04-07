import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const isConfigured =
  supabaseUrl.startsWith('http') &&
  !!supabaseAnonKey &&
  !supabaseUrl.includes('your-supabase')

export function createClient() {
  if (!isConfigured) {
    // Return a stub so components can import it without crashing.
    // Auth calls will fail gracefully — connect Supabase to enable auth.
    return {
      auth: {
        signInWithPassword: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        signInWithOtp: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        signOut: async () => ({ error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    } as ReturnType<typeof createBrowserClient>
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

export const isSupabaseConfigured = isConfigured
