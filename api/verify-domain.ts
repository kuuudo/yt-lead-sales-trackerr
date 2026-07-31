import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { resolveTxt } from 'dns/promises';
import { createHash } from 'crypto';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  const accessToken = authHeader.slice('Bearer '.length);

  const { domainId } = req.body ?? {};
  if (!domainId) {
    return res.status(400).json({ error: 'domainId is required' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[verify-domain] missing Supabase env vars');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // Bound to the caller's own JWT — RLS applies exactly as it would for
  // any authenticated client action. No service-role key used here, so
  // a caller can only ever verify a domain that belongs to their own org
  // (RLS on branded_tracking_domains already enforces this on SELECT/UPDATE).
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: domain, error: fetchErr } = await supabase
    .from('branded_tracking_domains')
    .select('id, hostname, status, verification_token_hash')
    .eq('id', domainId)
    .maybeSingle();

  if (fetchErr || !domain) {
    // RLS makes this null for domains outside the caller's org —
    // indistinguishable from "not found", which is the correct response.
    return res.status(404).json({ error: 'Domain not found' });
  }

  if (domain.status === 'verified') {
    return res.status(200).json({ status: 'verified', alreadyVerified: true });
  }

  const recordName = `_vstrk-verify.${domain.hostname}`;

  let txtRecords: string[][] = [];
  try {
    txtRecords = await resolveTxt(recordName);
  } catch {
    // NXDOMAIN or no TXT record published yet — not an error condition,
    // just "not verified yet". User hasn't finished DNS setup.
    return res.status(200).json({ status: 'pending', matched: false });
  }

  // TXT records can be split into multiple quoted chunks by DNS providers —
  // join each record's chunks before comparing.
  const flatValues = txtRecords.map((chunks) => chunks.join(''));
  const matched = flatValues.some(
    (value) =>
      createHash('sha256').update(value.trim()).digest('hex') === domain.verification_token_hash
  );

  if (!matched) {
    return res.status(200).json({ status: 'pending', matched: false });
  }

  const { error: updateErr } = await supabase
    .from('branded_tracking_domains')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('id', domainId);

  if (updateErr) {
    console.error('[verify-domain] failed to persist verified status:', updateErr.message);
    return res.status(500).json({ error: 'Verification succeeded but failed to save status' });
  }

  return res.status(200).json({ status: 'verified', matched: true });
}