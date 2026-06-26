/**
 * youtubeImportService.ts
 *
 * SINGLE SOURCE OF TRUTH for the YouTube CSV import pipeline.
 *
 * This file is the ONLY place where:
 *   - CSV parsing happens
 *   - Raw row insertion happens
 *   - Deduplication logic runs
 *   - Video matching (exact + fuzzy) happens
 *   - video_registry entries are created/updated
 *   - video_metrics rows are written
 *
 * ARCHITECTURE CONTRACT:
 *   Videos.tsx  → POST /api/youtube/import  → this service
 *   This service does NOT render anything.
 *   This service does NOT emit events or touch the tracking system.
 *
 * IMMUTABILITY CONTRACT:
 *   youtube_import_rows is APPEND-ONLY. No update, no delete, ever.
 *
 * DEDUPLICATION RULE:
 *   stable_dedup_key = "{platform}:id:{youtube_video_id}:{date}"    (when ID available)
 *                    = "{platform}:title:{normalized_title}:{date}"  (fallback)
 *   import_batch_id is NOT part of the dedup key.
 *
 * MATCHING PRIORITY:
 *   1. youtube_video_id exact match against videos.youtube_video_id  → score 1.0
 *   2. normalized title word-overlap (Jaccard) ≥ FUZZY_THRESHOLD      → score 0.0–1.0
 *   3. No match → video_registry entry with status = 'unmapped'
 */

import { createClient } from '@supabase/supabase-js';

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

/** Minimum Jaccard score to accept a fuzzy title match. */
const FUZZY_THRESHOLD = 0.6;

/** Platform identifier — only youtube supported in Phase 2.5 */
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
  date: string; // ISO date string YYYY-MM-DD
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

// ---------------------------------------------------------------------------
// CSV Column Name Mapping
// YouTube Studio exports use verbose column headers that vary by locale.
// This map normalizes them to our internal field names.
// ---------------------------------------------------------------------------

const YT_COLUMN_MAP: Record<string, keyof ParsedCSVRow> = {
  // Video ID — may appear under several names
  'video id':                    'youtube_video_id',
  'content id':                  'youtube_video_id',

  // Title
  'video title':                 'video_title',
  'title':                       'video_title',
  'content':                     'video_title',

  // Date
  'date':                        'date',
  'day':                         'date',

  // Core metrics
  'views':                       'views',
  'watch time (hours)':          'watch_time',
  'watch time':                  'watch_time',
  'watch_time':                  'watch_time',
  'likes':                       'likes',
  'comments':                    'comments',
  'impressions':                 'impressions',
  'impressions click-through rate (%)': 'ctr',
  'click-through rate (ctr)':    'ctr',
  'ctr':                         'ctr',
};

// ---------------------------------------------------------------------------
// Text Normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a video title for dedup key generation and fuzzy matching.
 * Lowercases, strips punctuation, collapses whitespace.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')   // replace punctuation with space
    .replace(/\s+/g, ' ')        // collapse whitespace
    .trim();
}

/**
 * Tokenizes a normalized title into a Set of words.
 * Filters out very short tokens (≤ 1 char) to reduce noise.
 */
function tokenize(normalized: string): Set<string> {
  return new Set(
    normalized.split(' ').filter(w => w.length > 1)
  );
}

/**
 * Jaccard similarity between two token sets.
 * score = |intersection| / |union|
 * Returns 0 when both sets are empty.
 */
export function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter(t => b.has(t)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

/**
 * Computes a title match score between a CSV title and a candidate title.
 * Returns 0.0–1.0.
 */
export function titleMatchScore(csvTitle: string, candidateTitle: string): number {
  const normA = normalizeTitle(csvTitle);
  const normB = normalizeTitle(candidateTitle);

  // Fast path: exact normalized match
  if (normA === normB) return 1.0;

  const tokensA = tokenize(normA);
  const tokensB = tokenize(normB);

  return jaccardScore(tokensA, tokensB);
}

// ---------------------------------------------------------------------------
// Stable Dedup Key
// ---------------------------------------------------------------------------

/**
 * Generates the stable deduplication key for a raw import row.
 * This key is used as the unique constraint — NOT import_batch_id.
 */
export function buildDedupKey(
  platform: string,
  youtubeVideoId: string | null,
  normalizedTitle: string,
  date: string // YYYY-MM-DD
): string {
  if (youtubeVideoId) {
    return `${platform}:id:${youtubeVideoId}:${date}`;
  }
  return `${platform}:title:${normalizedTitle}:${date}`;
}

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

/**
 * Parses a YouTube Studio CSV export into structured rows.
 * Handles BOM, variable column names, and missing fields gracefully.
 * Returns only rows that have at minimum a title and a date.
 */
export function parseYouTubeCSV(csvText: string): ParsedCSVRow[] {
  // Strip BOM if present
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');

  if (lines.length < 2) return [];

  // Parse header row — normalize to lowercase for matching
  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => h.toLowerCase().trim());

  // Build column index map
  const colIndex: Partial<Record<keyof ParsedCSVRow, number>> = {};
  headers.forEach((header, idx) => {
    const field = YT_COLUMN_MAP[header];
    if (field && !(field in colIndex)) {
      colIndex[field] = idx;
    }
  });

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

    // Skip rows without a title or a date — these are summary/aggregate rows
    if (!title || !rawDate) continue;

    const date = parseDate(rawDate);
    if (!date) continue;

    const row: ParsedCSVRow = {
      youtube_video_id: get('youtube_video_id'),
      video_title:      title,
      date,
      views:            parseIntOrNull(get('views')),
      likes:            parseIntOrNull(get('likes')),
      comments:         parseIntOrNull(get('comments')),
      watch_time:       parseFloatOrNull(get('watch_time')),
      impressions:      parseIntOrNull(get('impressions')),
      ctr:              parseFloatOrNull(get('ctr')),
    };

    rows.push(row);
  }

  return rows;
}

/** Parses a single CSV line, respecting quoted fields. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Parses a date string in various formats to YYYY-MM-DD. */
function parseDate(raw: string): string | null {
  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // MM/DD/YYYY or M/D/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Jan 1, 2024 format
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

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

// ---------------------------------------------------------------------------
// Internal Video Loader
// Loads all existing videos from the videos table for matching.
// Called once per import batch — not per row.
// ---------------------------------------------------------------------------

interface InternalVideo {
  id: string;
  youtube_video_id: string | null;
  video_title: string | null;
  normalized_title: string;
}

async function loadInternalVideos(): Promise<InternalVideo[]> {
  const { data, error } = await supabase
    .from('videos')
    .select('id, youtube_video_id, video_title')
    .eq('platform', PLATFORM);

  if (error) {
    throw new Error(`[youtubeImportService] Failed to load internal videos: ${error.message}`);
  }

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

interface MatchResult {
  internalVideoId: string;
  method: 'video_id' | 'fuzzy_title';
  score: number;
}

/**
 * Attempts to match a CSV row against known internal videos.
 *
 * Priority:
 *   1. youtube_video_id exact match (score = 1.0)
 *   2. Jaccard word-overlap on normalized title (score = 0.0–1.0, threshold 0.6)
 *   3. No match → returns null
 */
function matchRow(
  row: ParsedCSVRow,
  internalVideos: InternalVideo[]
): MatchResult | null {
  // ── Priority 1: exact youtube_video_id match ─────────────────────────────
  if (row.youtube_video_id) {
    const exact = internalVideos.find(
      v => v.youtube_video_id === row.youtube_video_id
    );
    if (exact) {
      return { internalVideoId: exact.id, method: 'video_id', score: 1.0 };
    }
  }

  // ── Priority 2: fuzzy title matching ─────────────────────────────────────
  const csvNorm = normalizeTitle(row.video_title);
  const csvTokens = tokenize(csvNorm);

  let bestScore = 0;
  let bestVideo: InternalVideo | null = null;

  for (const v of internalVideos) {
    const vTokens = tokenize(v.normalized_title);
    const score = jaccardScore(csvTokens, vTokens);

    if (score > bestScore) {
      bestScore = score;
      bestVideo = v;
    }
  }

  if (bestVideo && bestScore >= FUZZY_THRESHOLD) {
    return {
      internalVideoId: bestVideo.id,
      method: 'fuzzy_title',
      score: bestScore,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// video_registry Upsert
// ---------------------------------------------------------------------------

/**
 * Finds or creates a video_registry entry for this CSV row.
 * If a match was found, links to internal_video_id and marks as 'mapped'.
 * If no match, creates/updates entry with status = 'unmapped'.
 * Returns the registry row id.
 */
async function upsertVideoRegistry(
  row: ParsedCSVRow,
  match: MatchResult | null
): Promise<string> {
  const normalized = normalizeTitle(row.video_title);

  // Check if registry entry already exists (by youtube_video_id first, then title)
  let existingId: string | null = null;

  if (row.youtube_video_id) {
    const { data } = await supabase
      .from('video_registry')
      .select('id, status, internal_video_id')
      .eq('youtube_video_id', row.youtube_video_id)
      .eq('platform', PLATFORM)
      .maybeSingle();

    if (data) {
      existingId = data.id;

      // If previously unmapped and we now have a match, upgrade it
      if (data.status !== 'mapped' && match) {
        await supabase
          .from('video_registry')
          .update({
            internal_video_id: match.internalVideoId,
            status: 'mapped',
            match_method: match.method,
            match_score: match.score,
          })
          .eq('id', data.id);
      }
      return existingId;
    }
  } else {
    const { data } = await supabase
      .from('video_registry')
      .select('id, status, internal_video_id')
      .eq('normalized_title', normalized)
      .eq('platform', PLATFORM)
      .is('youtube_video_id', null)
      .maybeSingle();

    if (data) {
      existingId = data.id;

      if (data.status !== 'mapped' && match) {
        await supabase
          .from('video_registry')
          .update({
            internal_video_id: match.internalVideoId,
            status: 'mapped',
            match_method: match.method,
            match_score: match.score,
          })
          .eq('id', data.id);
      }
      return existingId;
    }
  }

  // Insert new registry entry
  const insertPayload = {
    platform:           PLATFORM,
    youtube_video_id:   row.youtube_video_id ?? null,
    canonical_title:    row.video_title,
    normalized_title:   normalized,
    internal_video_id:  match?.internalVideoId ?? null,
    status:             match ? 'mapped' : 'unmapped',
    match_method:       match?.method ?? null,
    match_score:        match?.score ?? null,
  };

  const { data: inserted, error } = await supabase
    .from('video_registry')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    // Conflict: another concurrent import created the row first — fetch it
    if (error.code === '23505') {
      const fallbackQuery = row.youtube_video_id
        ? supabase.from('video_registry').select('id')
            .eq('youtube_video_id', row.youtube_video_id)
            .eq('platform', PLATFORM)
            .maybeSingle()
        : supabase.from('video_registry').select('id')
            .eq('normalized_title', normalized)
            .eq('platform', PLATFORM)
            .is('youtube_video_id', null)
            .maybeSingle();

      const { data: fallback } = await fallbackQuery;
      if (fallback) return fallback.id;
    }
    throw new Error(`[youtubeImportService] Failed to upsert video_registry: ${error.message}`);
  }

  return inserted.id;
}

// ---------------------------------------------------------------------------
// video_metrics Upsert
// Writes one row per (video_registry_id, date).
// Only called when the registry entry is mapped.
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
      { onConflict: 'video_registry_id,date' }  // matches unique index
    );

  if (error) {
    // Non-fatal: log and continue. Raw data is already safe.
    console.error(`[youtubeImportService] video_metrics upsert failed for ${registryId} / ${row.date}:`, error.message);
  }
}

// ---------------------------------------------------------------------------
// Main Export: runImport
// ---------------------------------------------------------------------------

/**
 * Runs the full YouTube CSV import pipeline.
 *
 * Steps:
 *   1. Parse CSV text into structured rows
 *   2. Create import_batches record
 *   3. Load all internal videos for matching
 *   4. For every parsed row:
 *      a. Build stable_dedup_key
 *      b. Insert into youtube_import_rows (skip if duplicate, never overwrite)
 *      c. Run matching logic against internal videos
 *      d. Upsert video_registry (mapped or unmapped)
 *      e. If mapped → upsert video_metrics
 *   5. Update import_batches with final counts
 *   6. Return ImportResult
 *
 * @param csvText     Raw CSV file content as UTF-8 string
 * @param fileName    Original file name (for import_batches record)
 * @param uploadedBy  User UUID (for import_batches.uploaded_by)
 */
export async function runImport(
  csvText: string,
  fileName: string,
  uploadedBy: string
): Promise<ImportResult> {
  console.log("STEP A - service started");
  const errors: string[] = [];
  let insertedRaw = 0;
  let skippedDuplicates = 0;
  let matched = 0;
  let unmapped = 0;

  // ── Step 1: Parse CSV ────────────────────────────────────────────────────
  let rows: ParsedCSVRow[];
  try {
    rows = parseYouTubeCSV(csvText);
    console.log("STEP B - after CSV parse");
    console.log("rows count =", rows.length);
  } catch (e: any) {
    throw new Error(`[youtubeImportService] CSV parse failed: ${e.message}`);
  }

  if (rows.length === 0) {
    throw new Error('[youtubeImportService] No valid rows found in CSV. Check column headers and date format.');
  }
  console.log("STEP C - before insert import_batches");
  // ── Step 2: Create import_batches record ─────────────────────────────────
  const { data: batch, error: batchError } = await supabase
  .from('import_batches')
  .insert({
    platform: PLATFORM,
    file_name: fileName,
    row_count: rows.length,
    uploaded_by: uploadedBy,
  })
  .select('id')
  .single();
console.log("STEP D - after insert import_batches");
console.log("batch =", batch);
console.log("batchError =", batchError);
console.log("BATCH DATA:", batch);

  if (batchError || !batch) {
    throw new Error(`[youtubeImportService] Failed to create import batch: ${batchError?.message}`);
  }

  const batchId = batch.id;

  // ── Step 3: Load internal videos for matching ────────────────────────────
  let internalVideos: InternalVideo[];
  try {
    console.log("STEP E - before load internal videos");
    internalVideos = await loadInternalVideos();
    console.log("STEP F - after load internal videos");
    console.log("internalVideos count =", internalVideos.length);
  } catch (e: any) {
    errors.push(`Failed to load internal videos: ${e.message}`);
    internalVideos = []; // continue — all rows will be unmapped
  }

  // ── Step 4: Process each row ─────────────────────────────────────────────
  console.log("STEP G - start processing rows loop");
  for (const row of rows) {
    console.log("STEP H - processing row:", row.video_title);
    try {
      const normalizedTitle = normalizeTitle(row.video_title);
      const dedupKey = buildDedupKey(PLATFORM, row.youtube_video_id, normalizedTitle, row.date);

      // ── 4a: Insert raw row (append-only; skip on conflict = duplicate) ──
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
        if (rawError.code === '23505') {
          // Duplicate — raw row already exists. Still re-run mapping below
          // in case a previously unmapped video was since mapped.
          skippedDuplicates++;
        } else {
          errors.push(`Row insert failed (${row.video_title} / ${row.date}): ${rawError.message}`);
          continue; // skip mapping for this row if raw insert failed non-duplicate
        }
      } else {
        insertedRaw++;
      }

      // ── 4b: Match against internal videos ─────────────────────────────
      const match = matchRow(row, internalVideos);

      // ── 4c: Upsert video_registry ─────────────────────────────────────
      const registryId = await upsertVideoRegistry(row, match);

      // Back-link raw row to registry (best-effort — ignore errors)
      await supabase
        .from('youtube_import_rows')
        .update({ video_registry_id: registryId })
        .eq('stable_dedup_key', dedupKey);

      // ── 4d: Write video_metrics if matched ────────────────────────────
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

  // ── Step 5: Update batch with final counts ───────────────────────────────
  await supabase
    .from('import_batches')
    .update({
      matched_count: matched,
      skipped_count: skippedDuplicates,
    })
    .eq('id', batchId);

  // ── Step 6: Return result ────────────────────────────────────────────────
  return {
    batchId,
    totalRows:          rows.length,
    insertedRaw,
    skippedDuplicates,
    matched,
    unmapped,
    errors,
  };
}
