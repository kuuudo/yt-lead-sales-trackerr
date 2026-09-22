/**
 * Shared "Configure Campaign Links" modal.
 * Maps each campaign link type → tracking domain (campaigns.*_tracking_domain_id).
 * Includes a Campaign switcher so the same modal works from Videos and Create Assignment.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  listVerifiedBrandedDomains,
  type VerifiedDomainOption,
} from '../services/domain/brandedDomains';

export type CampaignLinkTypeKey =
  | 'landing_page'
  | 'newsletter'
  | 'consultation'
  | 'sales_call';

const CAMPAIGN_LINK_TYPE_META: Record<
  CampaignLinkTypeKey,
  { label: string; campaignUrlKey: string }
> = {
  landing_page: {
    label: 'Direct purchase / Landing',
    campaignUrlKey: 'landing_page_url',
  },
  newsletter: {
    label: 'Newsletter',
    campaignUrlKey: 'newsletter_url',
  },
  consultation: {
    label: 'Consultation',
    campaignUrlKey: 'consultation_booking_url',
  },
  sales_call: {
    label: 'Sales call',
    campaignUrlKey: 'sales_call_booking_url',
  },
};

const CAMPAIGN_LINK_DOMAIN_COL: Record<CampaignLinkTypeKey, string> = {
  landing_page: 'landing_page_tracking_domain_id',
  newsletter: 'newsletter_tracking_domain_id',
  consultation: 'consultation_tracking_domain_id',
  sales_call: 'sales_call_tracking_domain_id',
};

const ALL_KEYS: CampaignLinkTypeKey[] = [
  'landing_page',
  'newsletter',
  'consultation',
  'sales_call',
];

function domainMapFromCampaignRow(
  row: any
): Partial<Record<CampaignLinkTypeKey, string | null>> {
  if (!row) return {};
  const out: Partial<Record<CampaignLinkTypeKey, string | null>> = {};
  for (const k of ALL_KEYS) {
    out[k] = row[CAMPAIGN_LINK_DOMAIN_COL[k]] ?? null;
  }
  return out;
}

function availableCampaignLinkTypes(campaign: any): CampaignLinkTypeKey[] {
  if (!campaign) return [];
  const out: CampaignLinkTypeKey[] = [];
  if (campaign.landing_page_url) out.push('landing_page');
  if (campaign.newsletter_url) out.push('newsletter');
  if (campaign.consultation_booking_url || campaign.has_paid_consultation) {
    out.push('consultation');
  }
  if (campaign.sales_call_booking_url || campaign.has_sales_call) {
    out.push('sales_call');
  }
  return out;
}

export interface ConfigureCampaignLinksModalProps {
  open: boolean;
  organizationId: string;
  /** Pre-select this campaign when opening (e.g. from a Campaign Element card). */
  initialCampaignId?: string | null;
  onClose: () => void;
  /** Called after a successful save (any campaign). */
  onSaved?: (campaignId: string) => void;
}

interface CampaignOptionRow {
  id: string;
  campaign_name: string;
}

export function ConfigureCampaignLinksModal({
  open,
  organizationId,
  initialCampaignId,
  onClose,
  onSaved,
}: ConfigureCampaignLinksModalProps) {
  const [campaigns, setCampaigns] = useState<CampaignOptionRow[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [campaignRow, setCampaignRow] = useState<any | null>(null);
  const [domainByType, setDomainByType] = useState<
    Partial<Record<CampaignLinkTypeKey, string | null>>
  >({});
  const [domains, setDomains] = useState<VerifiedDomainOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load campaign list + domains when opened
  useEffect(() => {
    if (!open || !organizationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [campRes, domainList] = await Promise.all([
          supabase
            .from('campaigns')
            .select('id, campaign_name, is_system, archived_at')
            .eq('organization_id', organizationId)
            .eq('is_system', false)
            .is('archived_at', null)
            .order('campaign_name', { ascending: true }),
          listVerifiedBrandedDomains(organizationId),
        ]);
        if (cancelled) return;
        if (campRes.error) throw new Error(campRes.error.message);
        const list = (campRes.data ?? []).map(c => ({
          id: c.id as string,
          campaign_name: (c.campaign_name as string) || 'Campaign',
        }));
        setCampaigns(list);
        setDomains(domainList);
        const preferred =
          (initialCampaignId && list.some(c => c.id === initialCampaignId)
            ? initialCampaignId
            : null) ||
          list[0]?.id ||
          '';
        setSelectedCampaignId(preferred);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load campaigns');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, initialCampaignId]);

  // Load selected campaign row + domain map
  useEffect(() => {
    if (!open || !selectedCampaignId) {
      setCampaignRow(null);
      setDomainByType({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: qErr } = await supabase
        .from('campaigns')
        .select(
          `
          id,
          campaign_name,
          organization_id,
          landing_page_url,
          newsletter_url,
          consultation_booking_url,
          sales_call_booking_url,
          has_paid_consultation,
          has_sales_call,
          landing_page_tracking_domain_id,
          newsletter_tracking_domain_id,
          consultation_tracking_domain_id,
          sales_call_tracking_domain_id
        `
        )
        .eq('id', selectedCampaignId)
        .maybeSingle();
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setCampaignRow(null);
        setDomainByType({});
        return;
      }
      setCampaignRow(data);
      setDomainByType(domainMapFromCampaignRow(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedCampaignId]);

  if (!open) return null;

  const types = availableCampaignLinkTypes(campaignRow);

  const handleSave = async () => {
    if (!selectedCampaignId) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, string | null> = {
        landing_page_tracking_domain_id: domainByType.landing_page ?? null,
        newsletter_tracking_domain_id: domainByType.newsletter ?? null,
        consultation_tracking_domain_id: domainByType.consultation ?? null,
        sales_call_tracking_domain_id: domainByType.sales_call ?? null,
      };
      const { error: upErr } = await supabase
        .from('campaigns')
        .update(payload)
        .eq('id', selectedCampaignId)
        .eq('organization_id', organizationId);
      if (upErr) throw upErr;
      onSaved?.(selectedCampaignId);
      onClose();
    } catch (e: any) {
      setError(
        e?.message ||
          'Failed to save. Ensure campaigns.*_tracking_domain_id columns exist.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          Configure Campaign Links
        </p>
        <p className="text-xs text-zinc-400">
          Map each link type to a tracking domain. Saved on this Campaign for
          everyone who generates links (including Creative marketers).
        </p>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Campaign
          </label>
          <select
            value={selectedCampaignId}
            onChange={e => setSelectedCampaignId(e.target.value)}
            disabled={loading || campaigns.length === 0}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-100"
          >
            {campaigns.length === 0 && (
              <option value="">No campaigns</option>
            )}
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>
                {c.campaign_name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-xs text-amber-400 border border-amber-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-xs text-zinc-500">Loading…</p>
        ) : (
          <div className="space-y-3">
            {types.map(key => (
              <div key={key} className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  {CAMPAIGN_LINK_TYPE_META[key].label}
                </label>
                <select
                  value={domainByType[key] ?? ''}
                  onChange={e => {
                    const v = e.target.value || null;
                    setDomainByType(prev => ({ ...prev, [key]: v }));
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-100"
                >
                  <option value="">vstrk.com</option>
                  {domains.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.hostname}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {types.length === 0 && selectedCampaignId && (
              <p className="text-xs text-zinc-500">
                No campaign URLs configured for this campaign.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-zinc-700 text-zinc-400 text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !selectedCampaignId || loading}
            onClick={handleSave}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
