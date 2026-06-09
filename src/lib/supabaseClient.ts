/**
 * src/lib/supabaseClient.ts
 *
 * Supabase client singleton.
 *
 * Set these environment variables in your .env (Vite) or .env.local (Next.js):
 *
 *   VITE_SUPABASE_URL=https://your-project.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-key
 *
 * For Next.js, replace VITE_ prefix with NEXT_PUBLIC_:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 *
 * Dependencies:
 *   npm install @supabase/supabase-js
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL ??
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL) ??
  ''

const supabaseAnonKey =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY ??
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
  ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabaseClient] SUPABASE_URL or SUPABASE_ANON_KEY is not set. ' +
    'Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (Vite) or ' +
    'NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (Next.js).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
