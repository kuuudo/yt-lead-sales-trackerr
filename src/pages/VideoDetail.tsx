
// VideoDetail.tsx
//
// ARCHITECTURE: This component is a thin UI layer.
// ALL metric computation is delegated to analyticsEngine (processVideoMetrics +
// computeConversionMetrics). No revenue arithmetic, no conversion arithmetic,
// and no timeline arithmetic live inside this file.
//
// FETCH PIPELINE (mirrors Analytics.tsx exactly):
//   • events         — direct + session-resolved, merged into RawEvent[]
//   • stripe         — stripe_purchase_type (HAS payment_type), NOT stripe_purchases
//   • pixel          — pixel_purchases, session-enriched via enrichPixelPurchases
//   • activeSource   — always 'total' (no toggle exposed in this view)
//
// SECTIONS (layout order):
//   1. Header
//   2. Summary Cards
//   3. Revenue Section
//   4. Conversion System Section  ← new
//   5. Breakdown + Timeline
//   6. Tracking Links
//   7. Edit Modal

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../lib/hooks';
import { supabase, Video, Campaign, LeadMagnet, Asset } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useOrganization } from '../lib/useOrganization';
import { useViewing } from '../lib/ViewingContext';
import { getRedirectLinksDisplay, CATEGORY_LABEL, buildTrackingLinkUrl, type RedirectLinksDisplayGroups } from '../services/redirect/getPromotedAssetDisplay';
import { getAsset } from '../services/asset/getAsset';
import { addToLibrary } from '../services/asset/addToLibrary';
import { useTutorial } from '../lib/tutorial-overlay';
import {
  ArrowLeft, Youtube, DollarSign, Users, Activity,
  TrendingUp, MousePointer2, Phone, Briefcase,
  ExternalLink, BarChart3, Clock, Edit2, Archive, ArchiveRestore, Save, X, Loader2, Check, Link2, Plus, Copy, HelpCircle,
  BookmarkPlus, ArrowRight, ChevronRight,
  // Phase 2 (Video Archive)
  EyeOff,
} from 'lucide-react';
// Phase 2 (Video Archive): central resolver + Level 1/2 UI-visibility service
import { getVideoArchiveContext, type VideoArchiveContext } from '../services/video/getVideoArchiveContext';
import { hideVideoForUser, unhideVideoForUser } from '../services/video/archiveUiVisibility';
import { motion, AnimatePresence } from 'motion/react';

import { Modal } from '../components/Modal';
import { createRedirectLink, RedirectLinkType } from '../lib/redirects';
import { PromotedAssetPicker, type PromotedAssetRow } from '../components/PromotedAssetPicker';
import { PromotedAssetsPathBPanel } from '../components/PromotedAssetsPathBPanel';
import {
  listCreativeEligibleAssignmentsForMarketer,
  loadAssignmentAssetsForCreative,
  type CreativeEligibleAssignment,
} from '../services/promotion/listCreativeEligibleCampaigns';
import {
  resolvePromotionContextForAsset,
} from '../services/asset/resolvePromotionContextForAsset';

import type { PromotionContext } from '../services/asset/resolvePromotionContextForAsset';

import { generateAssetRedirectLinks } from '../services/asset/generateAssetRedirectLinks';
import { resolveUpstreamDomainForVideo } from '../lib/resolveSourceUpstreamDomain';
import {
  listEligibleTrackingDomainsForAssignmentAsset,
  defaultTrackingDomainIdFromEligible,
} from '../services/domain/listEligibleTrackingDomainsForAssignmentAsset';



const MANAGE_LINK_TYPES = ['landing_page', 'newsletter', 'consultation', 'sales_call'] as const;
const SHOW_ADD_LINK_BUTTON = false; // Add Link UI is hidden; lead-magnet creation kept in code for future use
type ManageLinkType = (typeof MANAGE_LINK_TYPES)[number];
const MANAGE_LINK_LABELS: Record<ManageLinkType, string> = {
  landing_page: 'Direct purchase / Landing',
  newsletter: 'Newsletter',
  consultation: 'Consultation',
  sales_call: 'Sales call',
};
function campaignUrlForLinkType(campaign: any, linkType: string): string | null {
  if (!campaign) return null;
  if (linkType === 'landing_page') return campaign.landing_page_url || null;
  if (linkType === 'newsletter') return campaign.newsletter_url || null;
  if (linkType === 'consultation') return campaign.consultation_booking_url || null;
  if (linkType === 'sales_call') return campaign.sales_call_booking_url || null;
  return null;
}
function campaignDomainIdForLinkType(campaign: any, linkType: string): string | null {
  if (!campaign) return null;
  if (linkType === 'landing_page') return campaign.landing_page_tracking_domain_id ?? null;
  if (linkType === 'newsletter') return campaign.newsletter_tracking_domain_id ?? null;
  if (linkType === 'consultation') return campaign.consultation_tracking_domain_id ?? null;
  if (linkType === 'sales_call') return campaign.sales_call_tracking_domain_id ?? null;
  return null;
}
function normalizeDest(url: string | null | undefined): string {
  return (url || '').trim().replace(/\/$/, '');
}

const ASSET_LIBRARY_ILLUSTRATION_VIEW_LIMIT = 5;
const ASSET_LIBRARY_ILLUSTRATION_STORAGE_KEY = 'vs-track:asset-library-illustration-views';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────



function AssetReachIllustration() {
  return (
    <div className="flex items-center justify-center gap-1 py-2 overflow-x-auto" aria-hidden="true">
      <svg width="0" height="0">
        <defs>
          <radialGradient id="assetGlow">
            <stop offset="0%" stopColor="currentColor" className="text-red-600" stopOpacity={0.45} />
            <stop offset="100%" stopColor="currentColor" className="text-red-600" stopOpacity={0} />
          </radialGradient>
        </defs>
      </svg>

      <AssetOrbitCard
        title="You"
        glow
        satellites={[
          { label: 'LinkedIn', position: 'top' },
          { label: 'YT', position: 'left' },
          { label: 'Reddit', position: 'bottom' },
        ]}
      />

      <div className="flex flex-col items-center gap-1 px-2 shrink-0">
        <span className="text-[7px] font-black uppercase tracking-widest text-zinc-600">Assigned</span>
        <ArrowRight size={14} className="text-zinc-700" />
      </div>

      <AssetOrbitCard
        title="Marketer A"
        satellites={[
          { label: 'Instagram', position: 'top' },
          { label: 'X', position: 'left' },
          { label: 'TikTok', position: 'bottom' },
        ]}
      />

      <span className="text-zinc-700 text-lg font-black tracking-widest pl-1 self-center shrink-0" aria-hidden="true">
        ...
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function VideoDetail() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { t }        = useLanguage();
  const { user }     = useAuth();

  // ── Data state ───────────────────────────────────────────────────────────────
  const [loading, setLoading]     = useState(true);
  const [video, setVideo]         = useState<Video | null>(null);
  const [asset, setAsset]         = useState<Asset | null>(null);
  const [addingToLibrary, setAddingToLibrary] = useState(false);
  const { notify } = useTutorial();
  const [campaign, setCampaign]   = useState<Campaign | null>(null);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);



  // ── UI state ─────────────────────────────────────────────────────────────────
  const [showEdit, setShowEdit]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [archiving, setArchiving]   = useState(false);
  const [restoring, setRestoring]   = useState(false);
  // Phase 2 (Video Archive): resolver output for this single video —
  // reasons[] (video / campaign, both may be present), isHiddenByViewer,
  // and the derived level. Consumed instead of reading video.archived_at
  // directly.
  const [archiveContext, setArchiveContext] = useState<VideoArchiveContext | null>(null);
  const [hiding, setHiding] = useState(false);
  const [availableCampaignLeadMagnets, setAvailableCampaignLeadMagnets] = useState<LeadMagnet[]>([]);
  const [copiedLinkToken, setCopiedLinkToken] = useState<string | null>(null);
  const { organizationId } = useOrganization();
  const { viewingOrgId, viewingMemberId, isReadOnly } = useViewing();
  const effectiveOrgId = isReadOnly ? viewingOrgId : organizationId;
  const effectiveUserId = isReadOnly ? viewingMemberId : (user?.id ?? null);
  const [displayGroups, setDisplayGroups] = useState<RedirectLinksDisplayGroups>({ campaignLinks: [], assets: [] });
  const [updatingLinkToken, setUpdatingLinkToken] = useState<string | null>(null);
  const [expandedCardKey, setExpandedCardKey] = useState<string | null>(null);
  const [editingLinkToken, setEditingLinkToken] = useState<string | null>(null);
  const [editDestinationValue, setEditDestinationValue] = useState('');
  const [savingManualDestination, setSavingManualDestination] = useState(false);
  const [helpOpenToken, setHelpOpenToken] = useState<string | null>(null);
  const [redirectLinks, setRedirectLinks]         = useState<any[]>([]);
  const [allLeadMagnetNames, setAllLeadMagnetNames] = useState<Record<string, string>>({});

  const [showAddLink, setShowAddLink]             = useState(false);
  const [extraLinkType, setExtraLinkType]         = useState<RedirectLinkType>('lead_magnet');
  const [extraLinkUrl, setExtraLinkUrl]           = useState('');
  const [extraLinkLeadMagnetId, setExtraLinkLeadMagnetId] = useState('');
  const [savingExtraLink, setSavingExtraLink]     = useState(false);

  // Track / Generate links — Videos.tsx-style modal with locked video + campaign
  const [showTrackContentModal, setShowTrackContentModal] = useState(false);
  const [trackPromotedAssets, setTrackPromotedAssets] = useState<PromotedAssetRow[]>([]);
  const [trackLinkTypes, setTrackLinkTypes] = useState<ManageLinkType[]>([]);
  const [trackSaving, setTrackSaving] = useState(false);
  const [trackPromotionLabel, setTrackPromotionLabel] = useState<string | null>(null);
  const [showTrackAssetPicker, setShowTrackAssetPicker] = useState(false);
  const [creativeOnlyAssetIds, setCreativeOnlyAssetIds] = useState<string[]>([]);
  const [creativeRestrictionsLoading, setCreativeRestrictionsLoading] = useState(false);
  const [creativeEligibleAssignments, setCreativeEligibleAssignments] = useState<CreativeEligibleAssignment[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    listCreativeEligibleAssignmentsForMarketer(user.id)
      .then(setCreativeEligibleAssignments)
      .catch(() => setCreativeEligibleAssignments([]));
  }, [user?.id]);

  // Same as Videos.tsx: when opening asset picker, compute creative-only asset ids
  useEffect(() => {
    if (!showTrackAssetPicker || !user?.id) {
      setCreativeRestrictionsLoading(false);
      return;
    }
    let cancelled = false;
    setCreativeRestrictionsLoading(true);
    (async () => {
      try {
        const creativeIds = new Set(creativeEligibleAssignments.map(a => a.assignmentId));
        if (creativeIds.size === 0) {
          if (!cancelled) setCreativeOnlyAssetIds([]);
          return;
        }
        const candidateIds = new Set<string>();
        for (const a of creativeEligibleAssignments) {
          try {
            const rows = await loadAssignmentAssetsForCreative(a.assignmentId);
            for (const r of rows) candidateIds.add(r.asset_id);
          } catch { /* ignore */ }
        }
        if (cancelled || candidateIds.size === 0) {
          if (!cancelled) setCreativeOnlyAssetIds([]);
          return;
        }
        const only: string[] = [];
        await Promise.all(
          [...candidateIds].map(async assetId => {
            try {
              const options = await resolvePromotionContextForAsset(assetId, user.id);
              if (options.length > 0 && options.every(o => creativeIds.has(o.assignmentId))) {
                only.push(assetId);
              }
            } catch { /* ignore */ }
          }),
        );
        if (!cancelled) setCreativeOnlyAssetIds(only);
      } finally {
        if (!cancelled) setCreativeRestrictionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showTrackAssetPicker, user?.id, creativeEligibleAssignments]);

  const [trackDomainByAssetId, setTrackDomainByAssetId] = useState<Map<string, string | null>>(new Map());
  const [trackPromoCtxByAssetId, setTrackPromoCtxByAssetId] = useState<Map<string, PromotionContext | null>>(new Map());
  const [deletingLinkToken, setDeletingLinkToken] = useState<string | null>(null);

  // YouTube Import Status (only relevant when video.platform === 'youtube')
  type YTImportStatus = 'loading' | 'no_analytics' | 'unmapped' | 'mapped';
  const [ytImportStatus, setYtImportStatus] = useState<YTImportStatus>('loading');
  const [ytRegistryId, setYtRegistryId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    campaign_id:              '',
    video_goal:               [] as string[],
    has_lead_magnet:          false,
    selected_lead_magnet_ids: [] as string[],
  });

  const [modalConfig, setModalConfig] = useState<{
    isOpen:     boolean;
    title:      string;
    message:    string;
    variant:    'info' | 'danger' | 'success';
    onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'info' });

  const showAlert = (
    title: string, message: string,
    variant: 'info' | 'danger' | 'success' = 'info',
    onConfirm?: () => void,
  ) => setModalConfig({ isOpen: true, title, message, variant, onConfirm });

  const showConfirm = (title: string, message: string, onConfirm: () => void, variant: 'info' | 'danger' | 'success' = 'danger') =>
    setModalConfig({ isOpen: true, title, message, variant, onConfirm });

  // ── Fetch ────────────────────────────────────────────────────────────────────

  // Single effect: re-runs when id OR user changes. Guard ensures both are
  // present before fetching. This prevents the duplicate-fetch race condition
  // that occurred with two separate effects (one on [id], one on [user]).
  useEffect(() => {
    if (!id || !user || !organizationId) return;
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id, organizationId, effectiveOrgId]);

  const fetchData = useCallback(async () => {
    console.log('[VideoDetail] fetchData START — id:', id, 'user:', (user as any)?.id ?? 'null');
    console.log('[VideoDetail] loading → true');
    setLoading(true);
    try {
      // ── Video + campaign ────────────────────────────────────────────────────
      const { data: vData, error: vErr } = await supabase
        .from('videos').select('*').eq('id', id).single();
      console.log('[VideoDetail] video query — error:', vErr?.message ?? 'none', 'found:', !!vData);
      if (vErr) throw vErr;
      setVideo(vData);

      // ── Asset (Content Identity) ────────────────────────────────────────────
      // Every Video has an Asset (Design Lock §1, Option A). Fetched
      // separately rather than joined into the videos query above, reusing
      // the existing Asset Module service instead of a raw query here.
      // Non-fatal: if this fails, the Add to Library button just renders in
      // its default (not-yet-in-library) state instead of blocking the page.
      try {
        const assetData = await getAsset(vData.asset_id);
        setAsset(assetData);
      } catch (assetErr: any) {
        console.warn('[VideoDetail] Could not load asset:', assetErr?.message);
      }

      // ── YouTube Import Status ───────────────────────────────────────────────
      if (vData.platform === 'youtube') {
        const orgId = vData.organization_id;

        // Step 1: mapped rows have internal_video_id set
        const { data: mappedReg } = await supabase
          .from('video_registry')
          .select('id, status')
          .eq('organization_id', orgId)
          .eq('internal_video_id', vData.id)
          .limit(1)
          .maybeSingle();

        if (mappedReg) {
          setYtImportStatus('mapped');
        } else {
          // Step 2: unmapped rows have internal_video_id = null, match by youtube_video_id
          const { data: unmappedReg } = await supabase
            .from('video_registry')
            .select('id, status')
            .eq('organization_id', orgId)
            .eq('youtube_video_id', vData.youtube_video_id)
            .eq('status', 'unmapped')
            .limit(1)
            .maybeSingle();

          if (unmappedReg) {
            setYtImportStatus('unmapped');
            setYtRegistryId(unmappedReg.id);
          } else {
            setYtImportStatus('no_analytics');
          }
        }
      }

      setEditForm({
        campaign_id:              vData.campaign_id,
        video_goal:               vData.video_goal ?? [],
        has_lead_magnet:          !!(vData.selected_lead_magnet_ids?.length),
        selected_lead_magnet_ids: vData.selected_lead_magnet_ids || [],
      });

      const { data: cData } = await supabase
        .from('campaigns').select('*').eq('id', vData.campaign_id).single();
      console.log('[VideoDetail] campaign query — found:', !!cData);
      setCampaign(cData);

      // Phase 2 (Video Archive): resolver call — single source of both
      // reasons ('video' = this video's own archived_at, 'campaign' = the
      // parent Campaign's) and the Level 1/2 isHiddenByViewer state.
      if (effectiveUserId) {
        try {
          const ctx = await getVideoArchiveContext(vData.id, effectiveUserId);
          setArchiveContext(ctx);
        } catch (archiveErr: any) {
          console.warn('[VideoDetail] Could not load archive context:', archiveErr?.message);
        }
      }

      if (vData.selected_lead_magnet_ids?.length) {
        const { data: lmData } = await supabase
          .from('lead_magnets').select('*').in('id', vData.selected_lead_magnet_ids);
        setLeadMagnets(lmData || []);
      }

      const { data: campaignLms } = await supabase
        .from('lead_magnets').select('*').eq('campaign_id', vData.campaign_id);
      setAvailableCampaignLeadMagnets(campaignLms || []);

      if (campaignLms?.length) {
        const nameMap: Record<string, string> = {};
        campaignLms.forEach((lm: any) => { nameMap[lm.id] = lm.lead_magnet_name; });
        setAllLeadMagnetNames(nameMap);
      }

      // ── Redirect links ──────────────────────────────────────────────────────
      const { data: linksData } = await supabase
        .from('redirect_links')
        .select('token, link_type, destination_url, lead_magnet_id, created_at')
        .eq('video_id', id)
        .order('created_at', { ascending: true });
      setRedirectLinks(linksData || []);

      // ── Display cards for the redesigned Tracking Links UI ──
if (effectiveOrgId && effectiveUserId) {
  try {
    const cards = await getRedirectLinksDisplay({
      videoId: id!,
      viewerOrganizationId: effectiveOrgId,
      viewerUserId: effectiveUserId,
    });

    setDisplayGroups(cards);
  } catch (err) {
    console.error('[VideoDetail] getRedirectLinksDisplay failed:', err);
  }
}


    } catch (err: any) {
      console.error('[VideoDetail] fetchData CATCH — error:', err?.message ?? err, err?.stack ?? '');
    } finally {
      console.log('[VideoDetail] fetchData FINALLY — loading → false');
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, organizationId]);

  // ── Link helpers ─────────────────────────────────────────────────────────────

  const getLinkLabel = (linkType: string, leadMagnetId?: string, dupIndex?: number) => {
    const suffix = dupIndex && dupIndex > 1 ? ` ${dupIndex}` : '';
    if (linkType === 'lead_magnet' && leadMagnetId && allLeadMagnetNames[leadMagnetId]) {
      return `📦 ${allLeadMagnetNames[leadMagnetId]}${suffix}`;
    }
    const labels: Record<string, string> = {
      landing_page:         '🏠 Landing Page',
      newsletter:           '📧 Newsletter',
      newsletter_thankyou:  '✅ Newsletter Thank You',
      checkout:             '🛒 Checkout',
      purchase_thankyou:    '✅ Purchase Thank You',
      sales_call:           '📞 Sales Call',
      sales_call_thankyou:  '✅ Sales Call Thank You',
      consultation:         '💼 Consultation',
      consultation_thankyou:'✅ Consultation Thank You',
      lead_magnet:          '📦 Lead Magnet',
    };
    return (labels[linkType] || linkType) + suffix;
  };

  const LINKS_ORDER = ['landing_page', 'checkout', 'newsletter', 'consultation', 'sales_call', 'lead_magnet'];

  const sortedLinks = [...redirectLinks].sort((a, b) => {
    const ai = LINKS_ORDER.indexOf(a.link_type);
    const bi = LINKS_ORDER.indexOf(b.link_type);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const isExtraLink = (link: any) => {
    if (!video) return false;
    return new Date(link.created_at).getTime() - new Date(video.created_at).getTime() > 2 * 60 * 1000;
  };

  // ── Action handlers ───────────────────────────────────────────────────────────


  const refreshRedirectDisplay = async () => {
    if (!video || !organizationId || !user) return;
    const { data: linksData } = await supabase
      .from('redirect_links')
      .select('token, link_type, destination_url, lead_magnet_id, created_at')
      .eq('video_id', video.id)
      .order('created_at', { ascending: true });
    setRedirectLinks(linksData || []);
    try {
      const cards = await getRedirectLinksDisplay({
        videoId: video.id,
        viewerOrganizationId: organizationId,
        viewerUserId: user.id,
      });
      setDisplayGroups(cards);
    } catch (err) {
      console.error('[VideoDetail] getRedirectLinksDisplay refresh failed:', err);
    }
  };

  const handleUpdateOutdatedLink = async (link: any) => {
    if (!video || !campaign || isReadOnly) return;
    const expected = campaignUrlForLinkType(campaign, link.link_type);
    if (!expected) {
      showAlert('No campaign URL', 'This campaign has no destination for this link type.', 'info');
      return;
    }
    setUpdatingLinkToken(link.token);
    try {
      const { error } = await supabase
        .from('redirect_links')
        .update({ destination_url: expected })
        .eq('token', link.token)
        .eq('video_id', video.id);
      if (error) throw error;
      await refreshRedirectDisplay();
      showAlert('Updated', 'Destination updated. Tracking URL unchanged.', 'success');
    } catch (e: any) {
      showAlert('Update failed', e?.message || 'Could not update destination', 'danger');
    } finally {
      setUpdatingLinkToken(null);
    }
  };

  const handleSaveManualDestination = async (link: any) => {
    if (!video || isReadOnly) return;
    const trimmed = editDestinationValue.trim();
    if (!trimmed) {
      showAlert('Enter a url', 'Destination url cannot be empty.', 'info');
      return;
    }
    setSavingManualDestination(true);
    try {
      const { error } = await supabase
        .from('redirect_links')
        .update({ destination_url: trimmed })
        .eq('token', link.token)
        .eq('video_id', video.id);
      if (error) throw error;
      await refreshRedirectDisplay();
      setEditingLinkToken(null);
      showAlert('Updated', 'Destination updated. Tracking url unchanged.', 'success');
    } catch (e: any) {
      showAlert('Update failed', e?.message || 'Could not update destination', 'danger');
    } finally {
      setSavingManualDestination(false);
    }
  };

  const openTrackContentModal = () => {
    if (!video || !campaign || isReadOnly) return;
    const available = MANAGE_LINK_TYPES.filter(t => !!campaignUrlForLinkType(campaign, t));
    setTrackLinkTypes(available);
    setTrackPromotedAssets([]);
    setShowTrackContentModal(true);
  };

  // Load locked Creative promotion label when modal opens / video changes
  useEffect(() => {
    if (!showTrackContentModal || !video) return;
    const cpid = (video as any).creative_promotion_id as string | null | undefined;
    if (!cpid) {
      setTrackPromotionLabel(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: promo } = await supabase
        .from('promotions')
        .select('id, assignment_id')
        .eq('id', cpid)
        .maybeSingle();
      if (cancelled || !promo?.assignment_id) {
        if (!cancelled) setTrackPromotionLabel('Creative promotion');
        return;
      }
      const { data: asn } = await supabase
        .from('assignments')
        .select('title')
        .eq('id', promo.assignment_id)
        .maybeSingle();
      if (!cancelled) {
        setTrackPromotionLabel(
          asn?.title ? `${asn.title} (CREATIVE)` : 'Creative promotion',
        );
      }
    })();
    return () => { cancelled = true; };
  }, [showTrackContentModal, video?.id, (video as any)?.creative_promotion_id]);

  const handleTrackContentGenerate = async () => {
    if (!video || !campaign || isReadOnly) return;
    if (trackLinkTypes.length === 0 && trackPromotedAssets.length === 0) {
      showAlert('Nothing selected', 'Choose campaign link types and/or promoted assets.', 'info');
      return;
    }
    setTrackSaving(true);
    try {
      const appBaseUrl = window.location.origin;
      // P1: upstream_domain = this Video's Campaign ROOT (creation-time snapshot).
      // Same for every new edge from this source; does not rewrite existing rows.
      const sourceUpstreamDomain = await resolveUpstreamDomainForVideo(video.id);
      const existingTypes = new Set(
        (redirectLinks || []).filter((l: any) => !(l as any).asset_id).map((l: any) => l.link_type as string),
      );

      // Campaign links (locked campaign destinations; reuse existing token when type exists)
      for (const type of trackLinkTypes) {
        const dest = campaignUrlForLinkType(campaign, type);
        if (!dest) continue;
        const domainCol =
          type === 'landing_page' ? 'landing_page_tracking_domain_id'
          : type === 'newsletter' ? 'newsletter_tracking_domain_id'
          : type === 'consultation' ? 'consultation_tracking_domain_id'
          : type === 'sales_call' ? 'sales_call_tracking_domain_id'
          : null;
        const trackingDomainId = domainCol ? ((campaign as any)[domainCol] as string | null) : null;

        if (existingTypes.has(type)) {
          const row = (redirectLinks || []).find((l: any) => l.link_type === type && !(l as any).asset_id);
          if (row && normalizeDest(row.destination_url) !== normalizeDest(dest)) {
            await supabase
              .from('redirect_links')
              .update({ destination_url: dest })
              .eq('token', row.token)
              .eq('video_id', video.id);
          }
          continue;
        }
        // Prefer campaign-configured domain when createRedirectLink supports options;
        // fall back to the same signature Manage Links already uses.
        try {
          await createRedirectLink(
            video.id,
            video.campaign_id,
            type as RedirectLinkType,
            dest,
            appBaseUrl,
            undefined as any,
            true,
            {
              trackingDomainId: trackingDomainId ?? null,
              upstreamDomain: sourceUpstreamDomain,
            } as any,
          );
        } catch {
          await createRedirectLink(
            video.id,
            video.campaign_id,
            type as RedirectLinkType,
            dest,
            appBaseUrl,
            undefined as any,
            true,
            { upstreamDomain: sourceUpstreamDomain } as any,
          );
        }
      }

      // Promoted assets (same pipeline as Videos.tsx after createVideo)
      if (trackPromotedAssets.length > 0) {
        const cpid = (video as any).creative_promotion_id as string | null | undefined;
        const asgId = (video as any).creative_assignment_id as string | null | undefined;

        // Phase 2A: when this video has an Assignment, resolve CURRENT Campaign eligibility
        const domainByAsset = new Map<string, string | null>(trackDomainByAssetId);
        if (asgId) {
          for (const asset of trackPromotedAssets) {
            const eligible = await listEligibleTrackingDomainsForAssignmentAsset(
              asgId,
              asset.asset_id
            );
            if (eligible.mode === 'misconfigured') {
              throw new Error(
                'A promoted asset’s Campaign has a root domain but no verified tracking hostname. VSTRK is not allowed.'
              );
            }
            const prev = domainByAsset.has(asset.asset_id)
              ? domainByAsset.get(asset.asset_id) ?? null
              : null;
            if (eligible.mode === 'multi' && !prev) {
              throw new Error(
                'Select a tracking hostname for assets with multiple eligible Campaign domains.'
              );
            }
            if (eligible.mode !== 'unauthorized') {
              domainByAsset.set(
                asset.asset_id,
                defaultTrackingDomainIdFromEligible(eligible, prev)
              );
            }
          }
        }

        const assetsWithContext = trackPromotedAssets.map((asset) => ({
          asset_id: asset.asset_id,
          promotionContext:
            trackPromoCtxByAssetId.get(asset.asset_id) ||
            (cpid
              ? ({
                  promotionId: cpid,
                  assignmentId: asgId ?? null,
                } as any)
              : null),
          trackingDomainId: domainByAsset.has(asset.asset_id)
            ? domainByAsset.get(asset.asset_id) ?? null
            : null,
        }));
        await generateAssetRedirectLinks({
          videoId: video.id,
          selectedAssets: assetsWithContext,
          upstreamDomain: sourceUpstreamDomain,
        });
      }

      await refreshRedirectDisplay();
      const { data: linksData } = await supabase
        .from('redirect_links')
        .select('token, link_type, destination_url, lead_magnet_id, created_at, asset_id')
        .eq('video_id', video.id)
        .order('created_at', { ascending: true });
      setRedirectLinks(linksData || []);

      setShowTrackContentModal(false);
      setTrackPromotedAssets([]);
      if (returnJourneyPromotionId) {
        showAlert(
          'Links ready',
          'Tracking links generated for this video. You can return to the Journey Map.',
          'success',
          () => navigate(`/marketplace/promotions/${returnJourneyPromotionId}/journey`),
        );
      } else {
        showAlert('Links ready', 'Tracking links generated for this video.', 'success');
      }
    } catch (e: any) {
      showAlert('Generate failed', e?.message || 'Could not generate links', 'danger');
    } finally {
      setTrackSaving(false);
    }
  };

  const handleAddExtraLink = async () => {
    if (!video || !campaign) return;
    if (isReadOnly) return;
    setSavingExtraLink(true);
    try {
      const appBaseUrl = window.location.origin;
      const urlToUse = extraLinkType === 'lead_magnet'
        ? availableCampaignLeadMagnets.find(lm => lm.id === extraLinkLeadMagnetId)?.lead_magnet_url || ''
        : extraLinkUrl;

      if (!urlToUse) { showAlert('URL Required', 'Please enter a destination URL.', 'info'); return; }

      const leadMagnetId = extraLinkType === 'lead_magnet' ? extraLinkLeadMagnetId : undefined;
      // P1: same source-video campaign ROOT as Track Content generate path.
      const sourceUpstreamDomain = await resolveUpstreamDomainForVideo(video.id);
      await createRedirectLink(
        video.id,
        video.campaign_id,
        extraLinkType,
        urlToUse,
        appBaseUrl,
        leadMagnetId,
        true,
        { upstreamDomain: sourceUpstreamDomain },
      );

      const { data: linksData } = await supabase
        .from('redirect_links')
        .select('token, link_type, destination_url, lead_magnet_id, created_at')
        .eq('video_id', video.id)
        .order('created_at', { ascending: true });
      setRedirectLinks(linksData || []);

      if (organizationId && user) {
        getRedirectLinksDisplay({
          videoId: video.id,
          viewerOrganizationId: organizationId,
          viewerUserId: user.id,
        })
          .then(setDisplayGroups)
          .catch(err =>
            console.error('[VideoDetail] getRedirectLinksDisplay refresh failed:', err)
          );
      }

      setShowAddLink(false);
      setExtraLinkUrl('');
      setExtraLinkLeadMagnetId('');
      setExtraLinkType('landing_page');
    } catch (err: any) {
      showAlert('Error', err.message || 'Could not create link.', 'danger');
    } finally {
      setSavingExtraLink(false);
    }
  };

  const handleDeleteExtraLink = async (token: string) => {
    if (isReadOnly) return;
    setDeletingLinkToken(token);
    try {
      const { error } = await supabase.from('redirect_links').delete().eq('token', token);
      if (error) throw error;
      setRedirectLinks(prev => prev.filter(l => l.token !== token));
      if (organizationId && user) {
  getRedirectLinksDisplay({ videoId: video!.id, viewerOrganizationId: organizationId, viewerUserId: user.id })
    .then(setDisplayGroups)
    .catch(err => console.error('[VideoDetail] getRedirectLinksDisplay refresh failed:', err));
}
    } catch (err: any) {
      showAlert('Error', err.message || 'Could not delete link.', 'danger');
    } finally {
      setDeletingLinkToken(null);
    }
  };

  const handleAddToLibrary = async () => {
    if (!video?.asset_id) return;
    if (isReadOnly) return;
    setAddingToLibrary(true);
    try {
      const { asset: updated } = await addToLibrary(video.asset_id);
      setAsset(updated);
      notify('follow-along-video-added-to-library');
    } catch (err: any) {
      showAlert('Error', err.message || 'Could not add to library.', 'danger');
    } finally {
      setAddingToLibrary(false);
    }
  };

  // Archive is only ever triggered by an explicit user click below — there
  // is no automatic/time-based archiving anywhere. This is fully
  // independent of deleted_at / deleteVideo(), which remain untouched
  // internal system logic (still used elsewhere for the asset-linked
  // soft-delete path; simply no longer exposed as a user-facing action here).
  const handleArchive = () => {
    if (isReadOnly) return;
    showConfirm(
      'Archive Video?',
      'Archived videos will be hidden from your active content library. You can restore them anytime.',
      async () => {
        setArchiving(true);
        try {
          const { error } = await supabase
            .from('video_user_states')
            .upsert(
              { video_id: id!, user_id: effectiveUserId!, archived_at: new Date().toISOString() },
              { onConflict: 'video_id,user_id' }
            );
          if (error) throw error;
          setArchiveContext(prev => {
            const base = prev ?? { videoId: id!, isArchived: false, reasons: [], isHiddenByViewer: false, level: 'normal' as const };
            const reasons = [...base.reasons.filter(r => r.sourceType !== 'video'), { sourceType: 'video' as const, sourceId: id!, sourceName: video?.video_title ?? null }];
            return { ...base, isArchived: true, reasons, level: base.isHiddenByViewer ? 'level2' : 'level1' };
          });
          showAlert('Video Archived', 'This video has been moved to your archive. You can restore it anytime.', 'success', () => navigate('/videos'));
        } catch (err: any) {
          showAlert('Archive Failed', `Could not archive the video. Error: ${err.message}`, 'danger');
        } finally {
          setArchiving(false);
        }
      },
      'info',
    );
  };

  const handleRestore = async () => {
    if (!id) return;
    if (isReadOnly) return;
    setRestoring(true);
    try {
      const { error } = await supabase
        .from('video_user_states')
        .upsert(
          { video_id: id, user_id: effectiveUserId!, archived_at: null },
          { onConflict: 'video_id,user_id' }
        );
      if (error) throw error;
      setVideo(prev => (prev ? ({ ...prev, archived_at: null } as any) : prev));
      setArchiveContext(prev => {
        if (!prev) return prev;
        const remainingReasons = prev.reasons.filter(r => r.sourceType !== 'video');
        return {
          ...prev,
          reasons: remainingReasons,
          isArchived: remainingReasons.length > 0,
          level: remainingReasons.length === 0 ? 'normal' : prev.isHiddenByViewer ? 'level2' : 'level1',
        };
      });
    } catch (err: any) {
      showAlert('Restore Failed', err.message || 'Could not restore the video.', 'danger');
    } finally {
      setRestoring(false);
    }
  };

  const handleUpdate = async () => {
    if (isReadOnly) return;
    setSaving(true);
    try {
      const payload = {
        campaign_id:              editForm.campaign_id,
        video_goal:               editForm.video_goal,
        selected_lead_magnet_ids: editForm.has_lead_magnet ? editForm.selected_lead_magnet_ids : null,
      };
      const { error } = await supabase.from('videos').update(payload).eq('id', id);
      if (error) throw error;
      setShowEdit(false);
      await fetchData();
      showAlert('Changes Saved', 'Video tracking settings have been updated successfully.', 'success');
    } catch (err: any) {
      showAlert('Update Failed', `Could not update video: ${err.message || 'Unknown error'}`, 'danger');
    } finally {
      setSaving(false);
    }
  };

  // ── Guard renders ─────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Activity className="animate-spin text-red-600" size={32} />
    </div>
  );

  if (!video) return (
    <div className="text-center py-20">
      <h2 className="text-white font-bold">Video not found</h2>
      <Link to="/videos" className="text-red-500 text-xs uppercase font-bold mt-4 inline-block">Back to list</Link>
    </div>
  );



  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-12 pb-20">

      {/* ── 1. Header ──────────────────────────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
        <div className="flex gap-6 items-center">
          <button
            onClick={() => navigate(-1)}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-black text-white leading-tight flex items-center gap-2">
                {video.video_title}
                {archiveContext?.reasons.map(reason => (
                  reason.sourceType === 'video' ? (
                    <span key="video" className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full">
                      <ArchiveRestore size={10} /> Video Archived
                    </span>
                  ) : (
                    <span key="campaign" className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-orange-500 bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded-full">
                      <ArchiveRestore size={10} /> Campaign Archived{reason.sourceName ? `: ${reason.sourceName}` : ''}
                    </span>
                  )
                ))}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[9px] font-black uppercase text-red-600 tracking-widest">{campaign?.campaign_name}</span>
                <span className="w-1 h-1 bg-zinc-800 rounded-full" />
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
                  {new Date(video.created_at).toLocaleDateString()}
                </span>
                {asset?.added_to_library_at && (
                  <>
                    <span className="w-1 h-1 bg-zinc-800 rounded-full" />
                    <button
                      onClick={() => navigate(`/assets/${asset.id}`)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 tracking-widest transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded-sm"
                    >
                      View Asset <ArrowRight size={10} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {!isReadOnly && (
          <>
          {/* Phase 2 (Video Archive): Restore only applies to the video's
              own archive — a Campaign-derived reason gets "Go to Campaign"
              instead, never an auto-restore. */}
          {archiveContext?.reasons.some(r => r.sourceType === 'video') && (
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="flex items-center gap-2 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all disabled:opacity-50"
              title="Restore Video"
            >
              {restoring ? <Loader2 size={16} className="animate-spin" /> : <ArchiveRestore size={16} />}
              {restoring ? 'Restoring...' : 'Restore'}
            </button>
          )}
          {archiveContext?.reasons.some(r => r.sourceType === 'campaign') && (
            <button
              onClick={() => {
                const campaignReason = archiveContext.reasons.find(r => r.sourceType === 'campaign');
                if (campaignReason) navigate(`/campaigns/${campaignReason.sourceId}`);
              }}
              className="flex items-center gap-2 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all"
              title="Go to Campaign"
            >
              Go to Campaign <ArrowRight size={16} />
            </button>
          )}
          {archiveContext?.isArchived && !isReadOnly && (
            <button
              onClick={async () => {
                if (!effectiveUserId || !id) return;
                setHiding(true);
                try {
                  if (archiveContext.isHiddenByViewer) {
                    await unhideVideoForUser(id, effectiveUserId);
                    setArchiveContext(prev => prev ? { ...prev, isHiddenByViewer: false, level: 'level1' } : prev);
                  } else {
                    await hideVideoForUser(id, effectiveUserId);
                    setArchiveContext(prev => prev ? { ...prev, isHiddenByViewer: true, level: 'level2' } : prev);
                  }
                } catch (err: any) {
                  showAlert(archiveContext.isHiddenByViewer ? 'Unhide Failed' : 'Hide Failed', err.message, 'danger');
                } finally {
                  setHiding(false);
                }
              }}
              disabled={hiding}
              className="flex items-center gap-2 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all disabled:opacity-50"
              title={archiveContext.isHiddenByViewer ? 'Unhide' : 'Hide'}
            >
              <EyeOff size={16} />
              {hiding ? '...' : archiveContext.isHiddenByViewer ? 'Unhide' : 'Hide'}
            </button>
          )}
          <button
            onClick={() => setShowEdit(true)}
            className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-all"
            title="Edit Video"
          >
            <Edit2 size={20} />
          </button>
          <button
            onClick={handleArchive}
            disabled={archiving}
            className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-all disabled:opacity-50"
            title="Archive Video"
          >
            {archiving ? <Loader2 size={20} className="animate-spin" /> : <Archive size={20} />}
          </button>
          </>
          )}
          <a
            href={`https://youtube.com/watch?v=${video.youtube_video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-white text-zinc-950 rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center"
          >
            <ExternalLink size={20} />
          </a>
        </div>
      </header>

      {/* ── 1b. YouTube Import Status (YouTube only) ──────────────────────────── */}
      {video.platform === 'youtube' && ytImportStatus !== 'loading' && (
        <section className="bento-card p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {ytImportStatus === 'no_analytics' && (
              <>
                <span className="text-base leading-none">⬜</span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">YouTube Import Status</p>
                  <p className="text-sm text-zinc-400">No analytics have been imported for this video yet.</p>
                </div>
              </>
            )}
            {ytImportStatus === 'unmapped' && (
              <>
                <span className="text-base leading-none">🟨</span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">YouTube Import Status</p>
                  <p className="text-sm text-zinc-400">Imported analytics are waiting to be mapped.</p>
                </div>
              </>
            )}
            {ytImportStatus === 'mapped' && (
              <>
                <span className="text-base leading-none">🟩</span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">YouTube Import Status</p>
                  <p className="text-sm text-zinc-400">Analytics have been successfully mapped.</p>
                </div>
              </>
            )}
          </div>

          <div className="shrink-0">
            {!isReadOnly && (
            <>
            {ytImportStatus === 'no_analytics' && (
              <button
                onClick={() => navigate('/videos?openImport=true')}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
              >
                Import Analytics
              </button>
            )}
            {ytImportStatus === 'unmapped' && (
              <Link
                to={`/unmapped-videos${ytRegistryId ? `?highlight=${ytRegistryId}` : ''}`}
                className="px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
              >
                Review &amp; Map
              </Link>
            )}
            {ytImportStatus === 'mapped' && (
              <Link
                to="/unmapped-videos"
                className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
              >
                View Analytics Mapping
              </Link>
            )}
            </>
            )}
          </div>
        </section>
      )}



      {/* ── 6. Tracking Links ───────────────────────────────────────────────────── */}
      <section className="bento-card p-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
            <Link2 size={14} className="text-red-600" /> Tracking Links
          </h3>
          {!isReadOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openTrackContentModal}
              className="flex items-center gap-2 h-9 px-4 rounded-xl border border-emerald-900/50 bg-emerald-600/10 hover:bg-emerald-600/20 text-[10px] font-black uppercase tracking-widest text-emerald-400 transition-all"
            >
              + Add New Links
            </button>
            {SHOW_ADD_LINK_BUTTON && (
            <button
              onClick={() => setShowAddLink(!showAddLink)}
              className="flex items-center gap-2 h-9 px-4 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all"
            >
              <Plus size={14} /> Add Link
            </button>
            )}
          </div>
          )}
        </div>

        {/* Add Extra Link Form */}
        <AnimatePresence>
          {showAddLink && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-5 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-4"
            >
              <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Generate New Tracking Link</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label-caps">Link Type</label>
                  <select
                    value={extraLinkType}
                    onChange={e => { setExtraLinkType(e.target.value as RedirectLinkType); setExtraLinkUrl(''); setExtraLinkLeadMagnetId(''); }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-[11px] font-bold uppercase outline-none focus:border-red-600 appearance-none"
                  >
                    <option value="lead_magnet">📦 Lead Magnet</option>
                  </select>
                </div>
                {extraLinkType === 'lead_magnet' ? (
                  <div className="space-y-1">
                    <label className="label-caps">Select Lead Magnet</label>
                    {availableCampaignLeadMagnets.length === 0 ? (
                      <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                        <p className="text-[10px] text-zinc-500 font-bold">No lead magnets found.</p>
                        <a href="/campaigns" className="text-[10px] text-red-500 font-bold underline mt-1 inline-block">
                          Go to Campaign to add one first →
                        </a>
                      </div>
                    ) : (
                      <select
                        value={extraLinkLeadMagnetId}
                        onChange={e => setExtraLinkLeadMagnetId(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-[11px] font-bold uppercase outline-none focus:border-red-600 appearance-none"
                      >
                        <option value="">Select lead magnet...</option>
                        {availableCampaignLeadMagnets.map(lm => (
                          <option key={lm.id} value={lm.id}>{lm.lead_magnet_name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="label-caps">Destination URL</label>
                    <input
                      value={extraLinkUrl}
                      onChange={e => setExtraLinkUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm font-mono text-zinc-400 outline-none focus:border-red-600 transition-all"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowAddLink(false); setExtraLinkUrl(''); setExtraLinkLeadMagnetId(''); }}
                  className="flex-1 h-10 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddExtraLink}
                  disabled={savingExtraLink || (extraLinkType === 'lead_magnet' ? !extraLinkLeadMagnetId : !extraLinkUrl)}
                  className="flex-1 h-10 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {savingExtraLink ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Generate</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {showTrackContentModal && video && campaign && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                + Add New Links
              </p>
              <p className="text-[11px] text-zinc-500 mb-4">
                Same flow as Track New Content, with video and campaign locked to this page.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">

              <div className="space-y-2 text-xs">
                <div className="border border-zinc-800 rounded-xl px-3 py-2.5 bg-zinc-900/40">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1">YouTube / URL</p>
                  <p className="text-zinc-200 truncate" title={(video as any).platform_url || video.youtube_url || ''}>
                    {(video as any).platform_url || video.youtube_url || video.youtube_video_id || '—'}
                  </p>
                  <p className="text-[9px] text-zinc-600 mt-0.5">Locked · this video</p>
                </div>
                <div className="border border-zinc-800 rounded-xl px-3 py-2.5 bg-zinc-900/40">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1">Campaign</p>
                  <p className="text-zinc-200">{(campaign as any).campaign_name || '—'}</p>
                  <p className="text-[9px] text-zinc-600 mt-0.5">Locked · belongs to this video</p>
                </div>
                <div className="border border-zinc-800 rounded-xl px-3 py-2.5 bg-zinc-900/40">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1">Promotion</p>
                  {(video as any).creative_promotion_id ? (
                    <>
                      <p className="text-emerald-400 font-bold">{trackPromotionLabel || 'Creative promotion'}</p>
                      <p className="text-[9px] text-zinc-600 mt-0.5">Locked · Creative promotion on this video</p>
                    </>
                  ) : (
                    <>
                      <p className="text-zinc-500">None (optional for assets)</p>
                      <p className="text-[9px] text-zinc-600 mt-0.5">Not a Creative video — pick assets below if needed</p>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Links to include</p>
                <div className="space-y-1.5">
                  {MANAGE_LINK_TYPES.filter(t => !!campaignUrlForLinkType(campaign, t)).map(t => {
                    const checked = trackLinkTypes.includes(t);
                    const exists = (redirectLinks || []).some(
                      (l: any) => l.link_type === t && !(l as any).asset_id,
                    );
                    return (
                      <label
                        key={t}
                        className="flex items-center gap-3 border border-zinc-800 rounded-xl px-3 py-2.5 cursor-pointer hover:border-zinc-600"
                      >
                        <input
                          type="checkbox"
                          className="accent-emerald-600"
                          checked={checked}
                          onChange={() => {
                            setTrackLinkTypes(prev =>
                              checked ? prev.filter(x => x !== t) : [...prev, t],
                            );
                          }}
                        />
                        <span className="text-sm text-zinc-200 flex-1">{MANAGE_LINK_LABELS[t]}</span>
                        {exists && (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">exists</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-zinc-600">
                  Domain for each type comes from Campaign configuration (Configure Campaign Links).
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Promoted Asset · tracking domains
                </p>
                <PromotedAssetsPathBPanel
                  organizationId={(organizationId || effectiveOrgId || '') as string}
                  userId={(user?.id || effectiveUserId || '') as string}
                  lockedPromotion={
                    (video as any).creative_promotion_id && (video as any).creative_assignment_id
                      ? {
                          promotionId: (video as any).creative_promotion_id,
                          assignmentId: (video as any).creative_assignment_id,
                          label: trackPromotionLabel || 'Creative promotion',
                        }
                      : null
                  }
                  assets={trackPromotedAssets}
                  onAssetsChange={setTrackPromotedAssets}
                  selectedDomainByAssetId={trackDomainByAssetId}
                  onSelectedDomainByAssetIdChange={setTrackDomainByAssetId}
                  onPromotionContextChange={setTrackPromoCtxByAssetId}
                  onRequestAddAssets={() => setShowTrackAssetPicker(true)}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowTrackContentModal(false);
                    setTrackPromotedAssets([]);
                  }}
                  className="flex-1 border border-zinc-700 text-zinc-400 text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={trackSaving}
                  onClick={() => handleTrackContentGenerate()}
                  className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl"
                >
                  {trackSaving ? 'Working...' : 'Generate Tracking Links'}
                </button>
              </div>
              </div>
              <div className="hidden md:flex min-h-[280px] items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 px-6 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">
                  Generated link will appear here
                </p>
              </div>
              </div>
            </div>
          </div>
        )}

        {showTrackAssetPicker && (effectiveOrgId || organizationId) && (
          <PromotedAssetPicker
            organizationId={(effectiveOrgId || organizationId)!}
            initialSelectedAssetIds={trackPromotedAssets.map(a => a.asset_id)}
            creativeOnlyAssetIds={creativeOnlyAssetIds}
            creativeRestrictionsLoading={creativeRestrictionsLoading}
            onClose={() => setShowTrackAssetPicker(false)}
            onSelect={(assets) => {
              setTrackPromotedAssets(assets);
              setShowTrackAssetPicker(false);
            }}
          />
        )}

{displayGroups.campaignLinks.length === 0 && displayGroups.assets.length === 0 ? (
  <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest text-center py-6">No tracking links found</p>
) : (
  <div className="space-y-4">
    {displayGroups.campaignLinks.length > 0 && (
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2">Campaign Links</p>
        <div className="space-y-1.5">
          {displayGroups.campaignLinks.map((link) => {
            const raw = redirectLinks.find((r: any) => r.token === link.token);
            const linkType = (raw?.link_type || '') as string;
            const expected = campaign ? campaignUrlForLinkType(campaign, linkType) : null;
            const outdated =
              !!expected &&
              !!raw?.destination_url &&
              normalizeDest(raw.destination_url) !== normalizeDest(expected);
            const isManualEditable = MANAGE_LINK_TYPES.includes(linkType as ManageLinkType);
            const isEditingDestination = editingLinkToken === link.token;
            return (
            <div key={link.key} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span>{link.icon}</span>
                  <span className="text-xs font-bold text-white shrink-0">{link.label}</span>
                  <span className="font-mono text-[11px] text-blue-400 truncate">{buildTrackingLinkUrl(link.token, link.trackingHostname)}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 relative">
                  {isManualEditable && !isReadOnly && (
                    <>
<button 
  type="button" 
  onClick={() => setHelpOpenToken(helpOpenToken === link.token ? null : link.token)} 
  className="h-7 w-7 flex items-center justify-center rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-all" 
  aria-label="How updating the destination works" 
> 
  <HelpCircle size={13} className="text-zinc-400" /> 
</button> 

{helpOpenToken === link.token && ( 
  <div className="absolute right-0 top-8 z-10 w-56 bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-[10px] text-zinc-300 leading-relaxed shadow-xl"> 
    If your URL has changed, you can update it here so existing links redirect to the new destination. Changing the URL in your campaign settings only affects future links—it won’t update links that were already created. Use this option to update those existing links.
  </div> 
)} 

<button 
  type="button" 
  onClick={() => { 
    setEditingLinkToken(isEditingDestination ? null : link.token); 
    setEditDestinationValue(raw?.destination_url || ''); 
  }} 
  className="h-7 px-2.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-all text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-white" 
> 
  Update destination URL
</button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(buildTrackingLinkUrl(link.token, link.trackingHostname));
                      setCopiedLinkToken(link.token);
                      setTimeout(() => setCopiedLinkToken(null), 2000);
                    }}
                    className="h-7 w-7 flex items-center justify-center rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-all"
                  >
                    {copiedLinkToken === link.token ? <Check size={13} className="text-green-500" /> : <Copy size={13} className="text-zinc-400" />}
                  </button>
                </div>
              </div>
              {raw?.destination_url && (
                <p className="text-[10px] text-zinc-500 truncate pl-6">
                  Destination: <span className="text-zinc-400 font-mono">{raw.destination_url}</span>
                </p>
              )}
              {isEditingDestination && (
                <div className="pl-6 space-y-2 pt-1">
                  <input
                    type="text"
                    value={editDestinationValue}
                    onChange={e => setEditDestinationValue(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-[10px] font-mono text-white outline-none focus:border-red-600"
                  />
                  <p className="text-[9px] text-amber-500 leading-relaxed">
                    Updating this destination won't erase past clicks or conversions.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setEditingLinkToken(null)}
                      className="h-6 px-2.5 rounded-lg border border-zinc-700 text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={savingManualDestination}
                      onClick={() => handleSaveManualDestination(link)}
                      className="h-6 px-2.5 rounded-lg bg-white text-zinc-950 text-[9px] font-black uppercase tracking-widest hover:bg-zinc-200 disabled:opacity-50"
                    >
                      {savingManualDestination ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
              {outdated && !isReadOnly && (
                <div className="flex items-center justify-between gap-2 pl-6">
                  <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">
                    Destination changed
                  </p>
                  <button
                    type="button"
                    disabled={updatingLinkToken === link.token}
                    onClick={() => handleUpdateOutdatedLink(raw)}
                    className="h-7 px-3 rounded-lg border border-amber-700/50 text-[9px] font-black uppercase tracking-widest text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                  >
                    {updatingLinkToken === link.token ? 'Updating...' : 'Update link'}
                  </button>
                </div>
              )}
              {outdated && expected && (
                <p className="text-[10px] text-zinc-600 pl-6 truncate">
                  Campaign now: <span className="font-mono text-zinc-500">{expected}</span>
                </p>
              )}
            </div>
            );
          })}
        </div>
      </div>
    )}

    {displayGroups.assets.length > 0 && (
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2">Assets</p>
        {(['library', 'shared', 'assigned'] as const).map((cat) => {
          const rowsForCategory = displayGroups.assets.filter(a => a.category === cat);
          if (rowsForCategory.length === 0) return null;
          return (
            <div key={cat} className="mb-3">
              <p className="text-[9px] font-bold text-zinc-600 mb-1">{CATEGORY_LABEL[cat].label}s</p>
              <div className="space-y-1.5">
                {rowsForCategory.map((asset) => {
                  const isExpanded = expandedCardKey === asset.key;
                  return (
                    <div key={asset.key} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span>{CATEGORY_LABEL[asset.category].icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">
                              {asset.title}
                              {asset.subtitle && (
                                <span className="ml-2 text-[10px] font-bold text-zinc-500 uppercase">{asset.subtitle}</span>
                              )}
                            </p>
                            <p className="font-mono text-[11px] text-blue-400 truncate">{buildTrackingLinkUrl(asset.token, asset.trackingHostname)}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(buildTrackingLinkUrl(asset.token, asset.trackingHostname));
                            setCopiedLinkToken(asset.token);
                            setTimeout(() => setCopiedLinkToken(null), 2000);
                          }}
                          className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-all"
                        >
                          {copiedLinkToken === asset.token ? <Check size={13} className="text-green-500" /> : <Copy size={13} className="text-zinc-400" />}
                        </button>
                      </div>
                      <button
                        onClick={() => setExpandedCardKey(isExpanded ? null : asset.key)}
                        className="mt-1.5 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-all"
                      >
                        {isExpanded ? '▲ Less' : '▼ More'}
                      </button>
                      {isExpanded && (
                        <div className="mt-2 space-y-1.5 pt-2 border-t border-zinc-900">
                          <div>
                            <p className="text-[9px] font-black uppercase text-zinc-600">Destination</p>
                            <p className="font-mono text-[10px] text-zinc-400 break-all">{asset.destinationUrl}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase text-zinc-600">Asset Type</p>
                            <p className="text-xs text-zinc-300">{CATEGORY_LABEL[asset.category].label}</p>
                          </div>
                          {asset.more.owner && (
                            <div><p className="text-[9px] font-black uppercase text-zinc-600">Owner</p><p className="text-xs text-zinc-300">{asset.more.owner}</p></div>
                          )}
                          {asset.more.sharedBy && (
                            <div><p className="text-[9px] font-black uppercase text-zinc-600">Shared By</p><p className="text-xs text-zinc-300">{asset.more.sharedBy}</p></div>
                          )}
                          {asset.more.assignment && (
                            <div><p className="text-[9px] font-black uppercase text-zinc-600">Assignment</p><p className="text-xs text-zinc-300">{asset.more.assignment}</p></div>
                          )}
                          {asset.more.created && (
                            <div><p className="text-[9px] font-black uppercase text-zinc-600">Created</p><p className="text-xs text-zinc-300">{new Date(asset.more.created).toLocaleDateString()}</p></div>
                          )}
                          <div>
                            <p className="text-[9px] font-black uppercase text-zinc-600">Used By</p>
                            <p className="text-xs text-zinc-300">{asset.more.usedByVideoCount} {asset.more.usedByVideoCount === 1 ? 'video' : 'videos'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
)}
      </section>

      {/* ── Asset Library (setup action — one-time, low frequency) ────────────────
          Shown only before the video has an Asset in the library. Once added,
          this block disappears entirely — the "View Asset" link in the header
          metadata row (above) is the ongoing navigation entry point, so no
          redundant "already added" state needs to live here.

          Progressive onboarding: the illustration itself shows in full for
          the first ASSET_LIBRARY_ILLUSTRATION_VIEW_LIMIT views (tracked via
          the effect above), then collapses to a one-line toggle so it stops
          dominating the page for returning users. The copy and the Add to
          Asset Library button are unaffected either way. */}
      {!asset?.added_to_library_at && (
        <section className="bento-card p-10 space-y-8 text-center">


          {!isReadOnly && (
          <button
            data-tutorial-id="video-add-to-library"
            onClick={handleAddToLibrary}
            disabled={addingToLibrary}
            className="flex items-center gap-2 h-9 px-4 mx-auto rounded-xl border border-zinc-800 hover:bg-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all disabled:opacity-50"
          >
            {addingToLibrary ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add to Asset Library
          </button>
          )}
        </section>
      )}

      {/* ── 7. Edit Modal ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showEdit && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEdit(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">Edit Tracked Video</h2>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-1">Update tracking parameters</p>
                </div>
                <button onClick={() => setShowEdit(false)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                  <X size={20} className="text-zinc-500" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-1">
                  <label className="label-caps">Campaign</label>
                  <select
                    value={editForm.campaign_id}
                    onChange={e => setEditForm({ ...editForm, campaign_id: e.target.value })}
                    disabled
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] font-bold uppercase outline-none focus:border-red-600 appearance-none opacity-50 cursor-not-allowed"
                  >
                    <option value={campaign?.id}>{campaign?.campaign_name}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="label-caps">Goals / Objectives</label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(['newsletter', 'calls', 'consult', 'sales', 'viral'] as const).map(obj => (
                      <button
                        key={obj}
                        type="button"
                        onClick={() => {
                          const newObj = editForm.video_goal.includes(obj)
                            ? editForm.video_goal.filter(o => o !== obj)
                            : [...editForm.video_goal, obj];
                          if (newObj.length > 0) setEditForm({ ...editForm, video_goal: newObj });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                          editForm.video_goal.includes(obj)
                            ? 'bg-red-600 border-red-600 text-white'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                        }`}
                      >
                        {(t.videos.objectives as any)[obj] || obj}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-zinc-800">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={editForm.has_lead_magnet}
                        onChange={e => setEditForm({ ...editForm, has_lead_magnet: e.target.checked })}
                        className="peer appearance-none w-5 h-5 border border-zinc-800 rounded bg-zinc-950 checked:bg-red-600"
                      />
                      <Check size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 group-hover:text-zinc-200">
                      Video uses lead magnets
                    </span>
                  </label>

                  {editForm.has_lead_magnet && (
                    <div className="space-y-2 p-4 bg-zinc-950/50 border border-zinc-800 rounded-2xl overflow-hidden">
                      <label className="label-caps !text-zinc-600">Select Active Lead Magnets</label>
                      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        {availableCampaignLeadMagnets.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              const newSelected = editForm.selected_lead_magnet_ids.includes(m.id)
                                ? editForm.selected_lead_magnet_ids.filter(i => i !== m.id)
                                : [...editForm.selected_lead_magnet_ids, m.id];
                              setEditForm({ ...editForm, selected_lead_magnet_ids: newSelected });
                            }}
                            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                              editForm.selected_lead_magnet_ids.includes(m.id)
                                ? 'bg-zinc-900 border-red-600/50 text-white'
                                : 'bg-zinc-950 border-zinc-900 text-zinc-500 hover:border-zinc-800'
                            }`}
                          >
                            <span className="text-[10px] font-bold uppercase tracking-wide truncate">{m.lead_magnet_name}</span>
                            {editForm.selected_lead_magnet_ids.includes(m.id) && <Check size={14} className="text-red-500" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-6">
                  <button
                    onClick={() => setShowEdit(false)}
                    className="flex-1 bg-zinc-950 border border-zinc-800 text-zinc-400 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={saving}
                    className="flex-1 bg-white text-zinc-950 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Save Changes</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        title={modalConfig.title}
        message={modalConfig.message}
        variant={modalConfig.variant}
        onConfirm={modalConfig.onConfirm}
      />
    </div>
  );
}
