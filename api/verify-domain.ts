import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { resolveTxt } from 'dns/promises';
import { createHash } from 'crypto';
import { attachDomainToVercel } from './_lib/vercelDomains';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const config = {
  api: { bodyParser: true },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing authorization',
    });
  }
  const accessToken = authHeader.slice('Bearer '.length);

  const { domainId } = req.body;

  console.log('VERIFY DOMAIN BODY', { domainId });

  if (!domainId) {
    return res.status(400).json({
      error: 'domainId is required',
    });
  }

  // Service role key bypasses RLS entirely — unlike a per-request anon
  // client, this module-scope client has no automatic org-boundary
  // enforcement. Because this endpoint acts on behalf of a specific
  // logged-in user (not a public pixel or a Stripe-signed webhook), the
  // ownership check RLS would normally provide has to happen manually
  // here: resolve the caller's user_id from their JWT, then confirm they
  // belong to the organization that owns this domain, before touching
  // anything.
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);

  if (userErr || !userData?.user) {
    return res.status(401).json({
      error: 'Invalid session',
    });
  }

  const userId = userData.user.id;

  const { data: domain, error: fetchErr } = await supabase
    .from('branded_tracking_domains')
    .select('id, organization_id, hostname, status, verification_token_hash')
    .eq('id', domainId)
    .maybeSingle();

  if (fetchErr || !domain) {
    return res.status(404).json({
      error: 'Domain not found',
    });
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('organization_id', domain.organization_id)
    .maybeSingle();

  // Same response as a genuinely missing row — don't leak whether a
  // domain ID exists for an org the caller isn't a member of.
  if (!membership) {
    return res.status(404).json({
      error: 'Domain not found',
    });
  }

  if (domain.status === 'verified') {
    return res.status(200).json({
      status: 'verified',
      alreadyVerified: true,
    });
  }

  const recordName = `_vstrk-verify.${domain.hostname}`;

  let txtRecords: string[][] = [];
  try {
    txtRecords = await resolveTxt(recordName);
  } catch {
    // NXDOMAIN or no TXT record published yet — not an error, just
    // "not verified yet". User hasn't finished DNS setup.
    return res.status(200).json({
      status: 'pending',
      matched: false,
    });
  }

  // TXT records can be split into multiple quoted chunks by some DNS
  // providers — join each record's chunks before comparing.
  const flatValues = txtRecords.map((chunks) => chunks.join(''));
  const matched = flatValues.some(
    (value) =>
      createHash('sha256').update(value.trim()).digest('hex') === domain.verification_token_hash
  );

  console.log('VERIFY DOMAIN DNS CHECK', {
    domainId,
    hostname: domain.hostname,
    matched,
  });

  if (!matched) {
    return res.status(200).json({
      status: 'pending',
      matched: false,
    });
  }

  // DNS ownership is confirmed at this point. Per the locked MVP design,
  // "verified" means BOTH DNS ownership AND Vercel attachment succeeded —
  // there is no separate vercel_status column. If attach fails, we return
  // an error and do NOT write status: 'verified'. The DNS TXT record is
  // still in place, so the user can simply press Verify again — the DNS
  // check above is cheap and will pass immediately on retry, and this
  // call to Vercel is naturally idempotent (see attachDomainToVercel).
  const attachResult = await attachDomainToVercel(domain.hostname);

  if (!attachResult.ok) {
    console.error('VERIFY DOMAIN VERCEL ATTACH FAILED', {
      domainId,
      hostname: domain.hostname,
      error: attachResult.error,
    });

    return res.status(200).json({
      status: 'pending',
      matched: true,
      error: `DNS verified, but Vercel attachment failed: ${attachResult.error}. Please try Verify again.`,
    });
  }

  const { error: updateErr } = await supabase
    .from('branded_tracking_domains')
    .update({
      status: 'verified',
      verified_at: new Date().toISOString(),
    })
    .eq('id', domainId);

  if (updateErr) {
    console.error(
      'Failed to persist verified status:',
      updateErr
    );

    return res.status(500).json({
      error: 'Database update failed',
    });
  }

  console.log(
    `✅ Domain verified and attached to Vercel — hostname: ${domain.hostname}`,
    { alreadyAttached: attachResult.alreadyAttached }
  );

  return res.status(200).json({
    status: 'verified',
    matched: true,
  });
}
