/**
 * api/youtube/import.ts
 *
 * Vercel serverless API route — self-contained single file.
 * All CSV parsing, deduplication, matching, and ingestion logic
 * is inlined here to avoid cross-file import issues on Vercel.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Disable Vercel's default body parser — formidable handles multipart
// ---------------------------------------------------------------------------
export const config = {
  api: { bodyParser: false },
};

// ---------------------------------------------------------------------------
// Supabase client (server-side: uses service key, bypasses RLS)
// ---------------------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FUZZY_THRESHOLD = 0.6;
const PLATFORM = 'youtube' as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ParsedCSVRow {
  youtube_video_id: string | null;
  video_title: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  watch_time: number | null;
  impressions: number | null;
  ctr: number | null;
  date: string;
}

export interface ImportResult {
  batchId: string;
  totalRows: number;
  insertedRaw: number;
  skippedDuplicates: number;
  matched: number;
  unmapped: number;
  errors: string[];
}

interface InternalVideo {
  id: string;
  youtube_video_id: string | null;
  video_title: string | null;
  normalized_title: string;
}

interface MatchResult {
  internalVideoId: string;
  method: 'video_id' | 'fuzzy_title';
  score: number;
}

// ---------------------------------------------------------------------------
// CSV Column Name Mapping
// ---------------------------------------------------------------------------
const YT_COLUMN_MAP: Record<string, keyof ParsedCSVRow> = {
  'video id':                           'youtube_video_id',
  'content id':                         'youtube_video_id',
  'video title':                        'video_title',
  'title':                              'video_title',
  'content':                            'video_title',
  'date':                               'date',
  'day':                                'date',
  'views':                              'views',
  'watch time (hours)':                 'watch_time',
  'watch time':                         'watch_time',
  'watch_time':                         'watch_time',
  'likes':                              'likes',
  'comments':                           'comments',
  'impressions':                        'impressions',
  'impressions click-through rate (%)': 'ctr',
  'click-through rate (ctr)':           'ctr',
  'ctr':                                'ctr',
};

// ---------------------------------------------------------------------------
// Text Normalization
// ---------------------------------------------------------------------------
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter(w => w.length > 1));
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter(t => b.has(t)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function titleMatchScore(csvTitle: string, candidateTitle: string): number {
  const normA = normalizeTitle(csvTitle);
  const normB = normalizeTitle(candidateTitle);
  if (normA === normB) return 1.0;
  return jaccardScore(tokenize(normA), tokenize(normB));
}

// ---------------------------------------------------------------------------
// Stable Dedup Key
// ---------------------------------------------------------------------------
function buildDedupKey(
  platform: string,
  youtubeVideoId: string | null,
  normalizedTitle: string,
  date: string
): string {
  if (youtubeVideoId) return `${platform}:id:${youtubeVideoId}:${date}`;
  return `${platform}:title:${normalizedTitle}:${date}`;
}

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseDate(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseIntOrNull(v: string | null): number | null {
  if (v === null) return null;
  const n = parseInt(v.replace(/,/g, ''), 10);
  return isNaN(n) ? null : n;
}

function parseFloatOrNull(v: string | null): number | null {
  if (v === null) return null;
  const n = parseFloat(v.replace(/,/g, '').replace(/%$/, ''));
  return isNaN(n) ? null : n;
}

function parseYouTubeCSV(csvText: string): ParsedCSVRow[] {
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];

  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => h.toLowerCase().trim());

  const colIndex: Partial<Record<keyof ParsedCSVRow, number>> = {};
  headers.forEach((header, idx) => {
    const field = YT_COLUMN_MAP[header];
    if (field && !(field in colIndex)) colIndex[field] = idx;
  });
console.log("[DEBUG] headers detected:", headers);
console.log("[DEBUG] colIndex:", colIndex);
console.log("[DEBUG] first CSV line:", lines[1]);

  const rows: ParsedCSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length === 0) continue;

    const get = (field: keyof ParsedCSVRow): string | null => {
      const idx = colIndex[field];
      if (idx === undefined || idx >= cells.length) return null;
      const val = cells[idx]?.trim();
      return val === '' || val === '--' ? null : val ?? null;
    };

    const title = get('video_title');
    const rawDate = get('date');
    console.log("[DEBUG] row extract", {
  title,
  rawDate,
  videoId: get('youtube_video_id'),
});
    if (!title || !rawDate) continue;

    const date = parseDate(rawDate);
    if (!date) continue;

    rows.push({
      youtube_video_id: get('youtube_video_id'),
      video_title:      title,
      date,
      views:            parseIntOrNull(get('views')),
      likes:            parseIntOrNull(get('likes')),
      comments:         parseIntOrNull(get('comments')),
      watch_time:       parseFloatOrNull(get('watch_time')),
      impressions:      parseIntOrNull(get('impressions')),
      ctr:              parseFloatOrNull(get('ctr')),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Internal Video Loader
// ---------------------------------------------------------------------------
async function loadInternalVideos(): Promise<InternalVideo[]> {
  const { data, error } = await supabase
    .from('videos')
    .select('id, youtube_video_id, video_title')
    .eq('platform', PLATFORM);

  if (error) throw new Error(`Failed to load internal videos: ${error.message}`);

  return (data ?? []).map(v => ({
    id: v.id,
    youtube_video_id: v.youtube_video_id ?? null,
    video_title: v.video_title ?? '',
    normalized_title: normalizeTitle(v.video_title ?? ''),
  }));
}

// ---------------------------------------------------------------------------
// Matching Logic
// ---------------------------------------------------------------------------
function matchRow(row: ParsedCSVRow, internalVideos: InternalVideo[]): MatchResult | null {
  if (row.youtube_video_id) {
    const exact = internalVideos.find(v => v.youtube_video_id === row.youtube_video_id);
    if (exact) return { internalVideoId: exact.id, method: 'video_id', score: 1.0 };
  }

  const csvTokens = tokenize(normalizeTitle(row.video_title));
  let bestScore = 0;
  let bestVideo: InternalVideo | null = null;

  for (const v of internalVideos) {
    const score = jaccardScore(csvTokens, tokenize(v.normalized_title));
    if (score > bestScore) { bestScore = score; bestVideo = v; }
  }

  if (bestVideo && bestScore >= FUZZY_THRESHOLD) {
    return { internalVideoId: bestVideo.id, method: 'fuzzy_title', score: bestScore };
  }
  return null;
}

// ---------------------------------------------------------------------------
// video_registry Upsert
// ---------------------------------------------------------------------------
async function upsertVideoRegistry(row: ParsedCSVRow, match: MatchResult | null): Promise<string> {
  const normalized = normalizeTitle(row.video_title);

  if (row.youtube_video_id) {
    const { data } = await supabase
      .from('video_registry')
      .select('id, status')
      .eq('youtube_video_id', row.youtube_video_id)
      .eq('platform', PLATFORM)
      .maybeSingle();

    if (data) {
      if (data.status !== 'mapped' && match) {
        await supabase.from('video_registry').update({
          internal_video_id: match.internalVideoId,
          status: 'mapped',
          match_method: match.method,
          match_score: match.score,
        }).eq('id', data.id);
      }
      return data.id;
    }
  } else {
    const { data } = await supabase
      .from('video_registry')
      .select('id, status')
      .eq('normalized_title', normalized)
      .eq('platform', PLATFORM)
      .is('youtube_video_id', null)
      .maybeSingle();

    if (data) {
      if (data.status !== 'mapped' && match) {
        await supabase.from('video_registry').update({
          internal_video_id: match.internalVideoId,
          status: 'mapped',
          match_method: match.method,
          match_score: match.score,
        }).eq('id', data.id);
      }
      return data.id;
    }
  }

  const { data: inserted, error } = await supabase
    .from('video_registry')
    .insert({
      platform:          PLATFORM,
      youtube_video_id:  row.youtube_video_id ?? null,
      canonical_title:   row.video_title,
      normalized_title:  normalized,
      internal_video_id: match?.internalVideoId ?? null,
      status:            match ? 'mapped' : 'unmapped',
      match_method:      match?.method ?? null,
      match_score:       match?.score ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const fallbackQuery = row.youtube_video_id
        ? supabase.from('video_registry').select('id').eq('youtube_video_id', row.youtube_video_id).eq('platform', PLATFORM).maybeSingle()
        : supabase.from('video_registry').select('id').eq('normalized_title', normalized).eq('platform', PLATFORM).is('youtube_video_id', null).maybeSingle();
      const { data: fallback } = await fallbackQuery;
      if (fallback) return fallback.id;
    }
    throw new Error(`Failed to upsert video_registry: ${error.message}`);
  }

  return inserted.id;
}

// ---------------------------------------------------------------------------
// video_metrics Upsert
// ---------------------------------------------------------------------------
async function upsertVideoMetrics(
  registryId: string,
  internalVideoId: string,
  row: ParsedCSVRow,
  batchId: string
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
        import_batch_id:   batchId,
      },
      { onConflict: 'video_registry_id,date' }
    );

  if (error) {
    console.error(`[import] video_metrics upsert failed for ${registryId} / ${row.date}:`, error.message);
  }
}

// ---------------------------------------------------------------------------
// runImport
// ---------------------------------------------------------------------------
async function runImport(
  csvText: string,
  fileName: string,
  uploadedBy: string
): Promise<ImportResult> {
  const errors: string[] = [];
  let insertedRaw = 0;
  let skippedDuplicates = 0;
  let matched = 0;
  let unmapped = 0;

  // Step 1: Parse CSV
  console.log('[import] STEP 1 - parsing CSV');
  let rows: ParsedCSVRow[];
  try {
    rows = parseYouTubeCSV(csvText);
  } catch (e: any) {
    throw new Error(`CSV parse failed: ${e.message}`);
  }

  if (rows.length === 0) {
    return { batchId: 'failed', totalRows: 0, insertedRaw: 0, skippedDuplicates: 0, matched: 0, unmapped: 0, errors: ['No valid rows found in CSV. Check column headers and date format.'] };
  }
  console.log(`[import] STEP 2 - parsed ${rows.length} rows`);

  // Step 2: Create batch record
  console.log('[import] STEP 3 - creating batch record');
  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({ platform: PLATFORM, file_name: fileName, row_count: rows.length, uploaded_by: uploadedBy })
    .select('id')
    .single();

  console.log('[import] STEP 4 - batch result:', { batch, batchError });

  if (batchError || !batch) {
    throw new Error(`Failed to create import batch: ${batchError?.message}`);
  }

  const batchId = batch.id;

  // Step 3: Load internal videos
  console.log('[import] STEP 5 - loading internal videos');
  let internalVideos: InternalVideo[] = [];
  try {
    internalVideos = await loadInternalVideos();
    console.log(`[import] STEP 6 - loaded ${internalVideos.length} internal videos`);
  } catch (e: any) {
    errors.push(`Failed to load internal videos: ${e.message}`);
  }

  // Step 4: Process rows
  console.log('[import] STEP 7 - processing rows');
  for (const row of rows) {
    try {
      const normalizedTitle = normalizeTitle(row.video_title);
      const dedupKey = buildDedupKey(PLATFORM, row.youtube_video_id, normalizedTitle, row.date);

      const { error: rawError } = await supabase
        .from('youtube_import_rows')
        .insert({
          import_batch_id:  batchId,
          platform:         PLATFORM,
          youtube_video_id: row.youtube_video_id,
          video_title:      row.video_title,
          normalized_title: normalizedTitle,
          views:            row.views,
          likes:            row.likes,
          comments:         row.comments,
          watch_time:       row.watch_time,
          impressions:      row.impressions,
          ctr:              row.ctr,
          date:             row.date,
          stable_dedup_key: dedupKey,
        });

      if (rawError) {
        if (rawError.code === '23505') { skippedDuplicates++; }
        else { errors.push(`Row insert failed (${row.video_title} / ${row.date}): ${rawError.message}`); continue; }
      } else {
        insertedRaw++;
      }

      const match = matchRow(row, internalVideos);
      const registryId = await upsertVideoRegistry(row, match);

      await supabase.from('youtube_import_rows').update({ video_registry_id: registryId }).eq('stable_dedup_key', dedupKey);

      if (match) {
        await upsertVideoMetrics(registryId, match.internalVideoId, row, batchId);
        matched++;
      } else {
        unmapped++;
      }
    } catch (rowErr: any) {
      errors.push(`Unexpected error on row (${row.video_title} / ${row.date}): ${rowErr.message}`);
    }
  }

  // Step 5: Update batch counts
  await supabase.from('import_batches').update({ matched_count: matched, skipped_count: skippedDuplicates }).eq('id', batchId);

  console.log(`[import] DONE — total: ${rows.length}, inserted: ${insertedRaw}, dedup: ${skippedDuplicates}, matched: ${matched}, unmapped: ${unmapped}, errors: ${errors.length}`);

  return { batchId, totalRows: rows.length, insertedRaw, skippedDuplicates, matched, unmapped, errors };
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
async function getUserFromRequest(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabaseAnon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
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

  console.log('[import] STEP 0 - handler hit');

  const userId = await getUserFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const form = formidable({ maxFileSize: 50 * 1024 * 1024 });
  let csvText: string;
  let fileName: string;

  try {
    const [, files] = await form.parse(req);
    const uploaded = files['file'];
    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    if (!file) return res.status(400).json({ error: 'No file uploaded. Send a CSV as form-data field "file".' });
    fileName = file.originalFilename ?? file.newFilename ?? 'upload.csv';
    csvText = fs.readFileSync(file.filepath, 'utf-8');
    fs.unlinkSync(file.filepath);
  } catch (parseErr: any) {
    console.error('[import] Form parse error:', parseErr);
    return res.status(400).json({ error: `Failed to parse upload: ${parseErr.message}` });
  }

  if (!fileName.endsWith('.csv') && !csvText.includes(',')) {
    return res.status(400).json({ error: 'File does not appear to be a CSV.' });
  }

  try {
    const result = await runImport(csvText, fileName, userId);
    return res.status(200).json(result);
  } catch (svcErr: any) {
    console.error('[import] Service error:', svcErr);
    return res.status(500).json({ error: svcErr.message ?? 'Import failed' });
  }
}