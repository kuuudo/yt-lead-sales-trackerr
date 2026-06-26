/**
 * api/youtube/import.ts
 *
 * Vercel serverless API route — thin layer only.
 * Responsibilities:
 *   - Accept multipart/form-data with a CSV file
 *   - Authenticate the request
 *   - Delegate 100% of processing to youtubeImportService.runImport()
 *   - Return the ImportResult JSON
 *
 * Does NOT contain any parsing, matching, or ingestion logic.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';
import { runImport } from '../../src/lib/youtubeImportService';

// ---------------------------------------------------------------------------
// Disable Vercel's default body parser — formidable handles multipart
// ---------------------------------------------------------------------------
export const config = {
  api: { bodyParser: false },
};

// ---------------------------------------------------------------------------
// Auth helper — verifies the Bearer token and returns the user UUID
// ---------------------------------------------------------------------------
async function getUserFromRequest(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  // Use anon key to verify the JWT — getUser validates the token server-side
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return user.id;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {

  console.log("STEP 1 - request received");
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const userId = await getUserFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── Parse multipart form ──────────────────────────────────────────────────
  const form = formidable({ maxFileSize: 50 * 1024 * 1024 }); // 50MB max

  let csvText: string;
  let fileName: string;

  try {
    const [, files] = await form.parse(req);
    const uploaded = files['file'];
    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded. Send a CSV as form-data field "file".' });
    }

    fileName = file.originalFilename ?? file.newFilename ?? 'upload.csv';
    csvText = fs.readFileSync(file.filepath, 'utf-8');

    // Clean up tmp file
    fs.unlinkSync(file.filepath);

  } catch (parseErr: any) {
    console.error('[api/youtube/import] Form parse error:', parseErr);
    return res.status(400).json({ error: `Failed to parse upload: ${parseErr.message}` });
  }

  // ── Validate file is plausibly a CSV ─────────────────────────────────────
  if (!fileName.endsWith('.csv') && !csvText.includes(',')) {
    return res.status(400).json({ error: 'File does not appear to be a CSV.' });
  }

  // ── Delegate to service ───────────────────────────────────────────────────
  try {
    console.log("STEP 2 - before runImport");
    const result = await runImport(csvText, fileName, userId);

    console.log(
      `[api/youtube/import] ✅ Batch ${result.batchId} — ` +
      `total: ${result.totalRows}, inserted: ${result.insertedRaw}, ` +
      `dedup skipped: ${result.skippedDuplicates}, ` +
      `matched: ${result.matched}, unmapped: ${result.unmapped}, ` +
      `errors: ${result.errors.length}`
    );

    return res.status(200).json(result);

  } catch (svcErr: any) {
    console.error('[api/youtube/import] Service error:', svcErr);
    return res.status(500).json({ error: svcErr.message ?? 'Import failed' });
  }
}
