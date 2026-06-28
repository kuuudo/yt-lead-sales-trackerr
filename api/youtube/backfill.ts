/**
 * api/youtube/backfill.ts
 *
 * Vercel serverless API route.
 *
 * Called after a manual Map or Create action in UnmappedVideos.tsx.
 * Writes video_metrics rows using the service role client (bypasses RLS),
 * reusing the same upsertVideoMetrics() function as the CSV import pipeline.
 *
 * POST /api/youtube/backfill
 * Body (JSON): { registryId: string, internalVideoId: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { upsertVideoMetrics } from './import';

// ---------------------------------------------------------------------------
// Service role client — same as import.ts, bypasses RLS
// ---------------------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ---------------------------------------------------------------------------
// Auth helper — verify the request comes from a logged-in org member
// ---------------------------------------------------------------------------
async function getOrgFromRequest(req: VercelRequest): Promise<{ userId: string; organizationId: string } | null> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const supabaseAnon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
  if (error || !user) return null;

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return null;
  return { userId: user.id, organizationId: member.organization_id };
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

  // Auth
  const auth = await getOrgFromRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const { organizationId } = auth;

  // Validate body
  const { registryId, internalVideoId } = req.body ?? {};
  if (!registryId || !internalVideoId) {
    return res.status(400).json({ error: 'Missing registryId or internalVideoId' });
  }

  // Fetch raw import rows for this registry entry
  const { data: rawRows, error: rowsError } = await supabase
    .from('youtube_import_rows')
    .select('*')
    .eq('video_registry_id', registryId);

  if (rowsError) {
    console.error('[backfill] Failed to fetch import rows:', rowsError.message);
    return res.status(500).json({ error: `Failed to fetch import rows: ${rowsError.message}` });
  }

  // If no import rows exist, insert a single stub so the video always has
  // at least one metrics record after mapping (matches UnmappedVideos stub logic).
  if (!rawRows || rawRows.length === 0) {
    const today = new Date().toISOString().split('T')[0];
    await upsertVideoMetrics(
      registryId,
      internalVideoId,
      {
        youtube_video_id: null,
        video_title: '',
        views: null,
        likes: null,
        comments: null,
        watch_time: null,
        impressions: null,
        ctr: null,
        date: today,
      },
      '', // no import_batch_id for stub
      organizationId
    );
    console.log('[backfill] No import rows found — inserted stub row');
    return res.status(200).json({ backfilled: 0, stub: true });
  }

  // Backfill one metrics row per import row, reusing upsertVideoMetrics()
  let backfilled = 0;
  const errors: string[] = [];

  for (const row of rawRows) {
    try {
      await upsertVideoMetrics(
        registryId,
        internalVideoId,
        {
          youtube_video_id: row.youtube_video_id,
          video_title: row.video_title,
          views: row.views,
          likes: row.likes,
          comments: row.comments,
          watch_time: row.watch_time,
          impressions: row.impressions,
          ctr: row.ctr,
          date: row.date,
        },
        row.import_batch_id ?? '',
        organizationId
      );
      backfilled++;
    } catch (err: any) {
      errors.push(`Row ${row.id} (${row.date}): ${err.message}`);
    }
  }

  console.log(`[backfill] Done — registryId=${registryId}, backfilled=${backfilled}, errors=${errors.length}`);

  return res.status(200).json({ backfilled, stub: false, errors });
}
