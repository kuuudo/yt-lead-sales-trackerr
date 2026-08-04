/**
 * src/pages/TrackingDomainDetail.tsx
 *
 * Scaffold only, per explicit instruction — routing, page, data loading
 * structure, and navigation established now; analytics and content
 * (which redirect_links used this domain, click counts, etc.) land in a
 * later PR.
 *
 * Reads the single branded_tracking_domains row directly by id. This is
 * NOT a new domain-resolution concept — branded_tracking_domains is
 * already the root entity (see brandedDomains.ts); this page just
 * displays one row of it, the same way AssetDetail.tsx displays one
 * asset. No assignment_tracking_domains query here — that table answers
 * "is this domain currently shared with this Assignment," a different
 * question from "what is this domain," which is all this page needs for
 * now.
 *
 * Linked from PromotionDetail.tsx's read-only Tracking Domains list.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Globe } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TrackingDomainRow {
  id: string;
  hostname: string;
  status: string;
  organization_id: string;
}

export default function TrackingDomainDetail() {
  const { domainId } = useParams<{ domainId: string }>();

  const [domain, setDomain] = useState<TrackingDomainRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!domainId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('branded_tracking_domains')
      .select('id, hostname, status, organization_id')
      .eq('id', domainId)
      .maybeSingle()
      .then(({ data, error: fetchErr }) => {
        if (cancelled) return;
        if (fetchErr) {
          setError(fetchErr.message);
        } else if (!data) {
          setError('Tracking domain not found.');
        } else {
          setDomain(data);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [domainId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="text-red-600 animate-spin" size={28} />
      </div>
    );
  }

  if (error || !domain) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-3">
        <AlertCircle className="text-red-500" size={28} />
        <p className="text-zinc-400 text-sm">{error || 'Tracking domain not found.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link
          to="/marketplace"
          className="flex items-center gap-2 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest mb-6"
        >
          <ArrowLeft size={14} /> Back to Marketplace
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <Globe size={18} className="text-zinc-500" />
          <h1 className="text-2xl font-bold text-white">{domain.hostname}</h1>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-8">
          Tracking Domain Detail
        </p>

        {/* Placeholder — analytics and content (redirect_links using
            this domain, click counts, per-asset breakdown) land in a
            later PR. Scaffold only, per current scope. */}
        <div className="text-zinc-600 text-sm border border-dashed border-zinc-800 rounded-lg p-6 text-center">
          Domain usage and analytics coming soon.
        </div>
      </div>
    </div>
  );
}
