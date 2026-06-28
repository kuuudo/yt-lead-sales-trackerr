/**
 * api/youtube/backfill.ts
 *
 * Vercel serverless API route — self-contained single file.
 * (Same pattern as import.ts — no cross-file imports to avoid Vercel module resolution issues.)
 *
 * POST /api/youtube/backfill
 * Body (JSON): { registryId: string, internalVideoId: string }
 *
 * Called after a manual Map or Create in UnmappedVideos.tsx.
 * Uses service role to write video_metrics, bypassing RLS.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase clients
// ---------------------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!   // service role — bypasses RLS
);

const supabaseAnon = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!      // anon — used only to verify user JWT
);

const PLATFORM = 'youtube' as const;

// ---------------------------------------------------------------------------
// Inline upsertVideoMetrics — same logic as import.ts, self-contained
// ---------------------------------------------------------------------------
async function upsertVideoMetrics(
  registryId: string,
  internalVideoId: string,
  row: {
    date: string;
    views: number | null;
    likes: number | null;
    comments: number | null;
    watch_time: number | null;
    impressions: number | null;
    ctr: number | null;
    import_batch_id: string | null;
  },
  organizationId: string
): Promise<void> {
  const { error } = await supabase
    .from('video_metrics')
    .upsert(
      {
        video_registry_id: registryId,
        internal_video_id: internalVideoId,
        platform:          PLATFORM,
        date:              row.date,
        views:             row.views,
        likes:             row.likes,
        comments:          row.comments,
        watch_time:        row.watch_time,
        impressions:       row.impressions,
        ctr:               row.ctr,
        import_batch_id:   row.import_batch_id,
        organization_id:   organizationId,
      },
      { onConflict: 'organization_id,video_registry_id,date' }
    );

  if (error) {
    console.error(`[backfill] video_metrics upsert failed for ${registryId} / ${row.date}:`, error.message);
    throw new Error(error.message);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- Auth: verify JWT and get organizationId ---
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
  if (userError || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  if (memberError || !member) {
    return res.status(403).json({ error: 'User is not a member of any organization' });
  }

  const organizationId = member.organization_id;

  // --- Validate body ---
  const { registryId, internalVideoId } = req.body ?? {};
  if (!registryId || !internalVideoId) {
    return res.status(400).json({ error: 'Missing registryId or internalVideoId' });
  }

  console.log('[backfill] Starting', { registryId, internalVideoId, organizationId });

  // --- Fetch import rows for this registry entry ---
  const { data: rawRows, error: rowsError } = await supabase
    .from('youtube_import_rows')
    .select('*')
    .eq('video_registry_id', registryId);

  if (rowsError) {
    console.error('[backfill] Failed to fetch import rows:', rowsError.message);
    return res.status(500).json({ error: `Failed to fetch import rows: ${rowsError.message}` });
  }

  // --- Backfill metrics ---
  if (!rawRows || rawRows.length === 0) {
    // No import rows — insert a stub so the video always has a metrics record
    const today = new Date().toISOString().split('T')[0];
    await upsertVideoMetrics(registryId, internalVideoId, {
      date: today,
      views: null, likes: null, comments: null,
      watch_time: null, impressions: null, ctr: null,
      import_batch_id: null,
    }, organizationId);

    console.log('[backfill] No import rows — inserted stub row');
    return res.status(200).json({ backfilled: 0, stub: true });
  }

  let backfilled = 0;
  const errors: string[] = [];

  for (const row of rawRows) {
    try {
      await upsertVideoMetrics(registryId, internalVideoId, {
        date:            row.date,
        views:           row.views,
        likes:           row.likes,
        comments:        row.comments,
        watch_time:      row.watch_time,
        impressions:     row.impressions,
        ctr:             row.ctr,
        import_batch_id: row.import_batch_id ?? null,
      }, organizationId);
      backfilled++;
    } catch (err: any) {
      errors.push(`Row ${row.id} (${row.date}): ${err.message}`);
    }
  }

  console.log(`[backfill] Done — registryId=${registryId}, backfilled=${backfilled}, errors=${errors.length}`);
  return res.status(200).json({ backfilled, stub: false, errors });
}
