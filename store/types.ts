/**
 * src/components/analytics/store/types.ts
 *
 * Raw Supabase row shapes — used only in store mappers.
 * The rest of the app works with the Widget / Board interfaces from useWorkspaceStore.
 */

export interface SupabaseBoard {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface SupabaseWidget {
  id: string
  board_id: string
  user_id: string
  title: string | null
  type: string
  x: number
  y: number
  width: number
  height: number
  category: string | null
  config: unknown      // JSONB — cast in mapper
  data: unknown        // JSONB — cast in mapper
  created_at: string
  updated_at: string
}
