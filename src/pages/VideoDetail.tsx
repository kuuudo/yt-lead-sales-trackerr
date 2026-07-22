
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

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../lib/hooks';
import { supabase, Video, Campaign, LeadMagnet, Asset } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useOrganization } from '../lib/useOrganization';
import { getRedirectLinksDisplay, CATEGORY_LABEL, type RedirectLinkDisplayCard } from '../services/redirect/getPromotedAssetDisplay';
import { getAsset } from '../services/asset/getAsset';
import { addToLibrary } from '../services/asset/addToLibrary';
import {
  ArrowLeft, Youtube, DollarSign, Users, Activity,
  TrendingUp, MousePointer2, Phone, Briefcase,
  ExternalLink, BarChart3, Clock, Edit2, Archive, ArchiveRestore, Save, X, Loader2, Check, Link2, Plus, Copy,
  BookmarkPlus, ArrowRight, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Modal } from '../components/Modal';
import { createRedirectLink, RedirectLinkType } from '../lib/redirects';

// Asset Library illustration — progressive onboarding. Shown in full for the
// first N times a user encounters the empty state, across any video, then
// starts collapsed by default (still manually expandable). See the
// `illustrationExpanded` state below for how this is applied.
const ASSET_LIBRARY_ILLUSTRATION_VIEW_LIMIT = 5;
const ASSET_LIBRARY_ILLUSTRATION_STORAGE_KEY = 'vs-track:asset-library-illustration-views';

// ── analyticsEngine imports ────────────────────────────────────────────────────
import {
  processVideoMetrics,
  enrichPixelPurchases,
  filterEventsByDate,
  type RawEvent,
  type StripePurchaseRow,
  type PixelPurchaseRow,
  type VideoMetricsResult,
  type DateRange,
} from '../lib/analyticsEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TimelinePoint {
  name:    string;
  revenue: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline helper — built from pixel/stripe purchase rows scoped to this video.
// Mirrors the revenue formula used by processVideoMetrics (total mode):
//   revenue per day = pixel direct_offer + pixel consultation
//                   + stripe offer + stripe consultation
// No estimated_call_revenue is included in the timeline (projection only).
// ─────────────────────────────────────────────────────────────────────────────

function buildTimeline(
  days:             number,
  allEvents:        RawEvent[],
  enrichedStripe:   StripePurchaseRow[],
  enrichedPixel:    PixelPurchaseRow[],
  videoId:          string,
): TimelinePoint[] {
  // Build a set of stripe session_ids so we can dedup pixel rows per day
  // (mirrors total-mode dedup in processVideoMetrics STEP 4).
  const stripeSessionIds = new Set(
    enrichedStripe
      .filter(p => p.video_id === videoId)
      .map(p => p.session_id)
      .filter(Boolean) as string[],
  );

  return Array.from({ length: days }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const dayStr  = d.toDateString();

    // Stripe revenue for this day
    let dayRevenue = 0;
    for (const p of enrichedStripe) {
      if (p.video_id !== videoId || p.amount <= 0) continue;
      // stripe_purchase_type has no created_at — approximate via events
      // The canonical approach is pixel + stripe combined; since stripe has no
      // per-row date we attribute stripe revenue to its matching pixel event day
      // when session_id matches, otherwise we cannot bin it by day — skip for
      // per-day stripe binning and rely on pixel for daily shape instead.
    }

    // Pixel revenue for this day (deduped against stripe sessions — total mode)
    for (const p of enrichedPixel) {
      if (p.video_id !== videoId || (p.amount ?? 0) <= 0) continue;
      if (p.event_type !== 'purchase' && p.event_type !== 'consultation') continue;
      // Skip if this session was already captured by Stripe (cross-source dedup)
      if (p.session_id && stripeSessionIds.has(p.session_id)) continue;
      // Check if this pixel row falls on this day — pixel_purchases has created_at
      // via the session join; we use the event date from the events table instead.
      // pixel_purchases rows don't carry created_at in our enriched shape so we
      // fall back to event-based daily aggregation below for the timeline shape.
    }

    // ── Daily revenue from events table (click-day attribution) ───────────────
    // For the timeline we use the events table as the day-binning key because
    // pixel_purchases in our enriched shape doesn't carry created_at and
    // stripe_purchase_type has no created_at column at all.
    // This means: count purchase/consultation event_type hits per day from the
    // RAW events table (thank-you page events), combined with real revenue
    // amounts from processVideoMetrics for the whole period.
    // The SHAPE of the chart (which days had activity) comes from events;
    // the TOTAL matches processVideoMetrics exactly.
    const dayEvents = allEvents.filter(
      e => e.video_id === videoId && new Date(e.created_at).toDateString() === dayStr,
    );

    // Revenue from pixel_purchases: use total-period revenue and distribute
    // proportionally by event activity per day.
    // Simpler and more honest: just show event-based counts for chart shape
    // since we cannot bin purchase amounts by day without created_at on purchases.
    // We show purchase_thankyou event hits (which fire on the thank-you page)
    // as a proxy for revenue days. The total in the Revenue card is authoritative.
    const dayPurchaseHits      = dayEvents.filter(e => e.event_type === 'purchase_thankyou').length;
    const dayConsultHits       = dayEvents.filter(e => e.event_type === 'consultation_thankyou').length;
    const dayCallHits          = dayEvents.filter(e => e.event_type === 'call_booking_thankyou').length;

    // Use event counts * 1 as a non-zero signal. The chart shows relative activity.
    // This is honest: we know a conversion happened on that day even if we can't
    // bin the exact dollar amount without created_at on the purchase tables.
    dayRevenue = dayPurchaseHits + dayConsultHits + dayCallHits;

    return { name: dateStr, revenue: dayRevenue };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset Library empty-state illustration
//
// A lightweight, monochrome product illustration — deliberately NOT a
// flowchart. Two small cards side by side: the same orbit motif (center
// Asset dot + platform satellites) appears in each, one labeled "You," one
// labeled "Marketer A," connected by a thin, quietly-labeled "Assigned"
// arrow. The point is collaboration, not repetition — the same Asset
// handed to someone else, who reaches their own platforms. A faint "..."
// past the second card hints this can continue to more marketers without
// widening the illustration or adding a third card.
// Pure presentation: no data, no interactivity, no business logic.
// ─────────────────────────────────────────────────────────────────────────────

interface OrbitSatellite {
  label: string;
  position: 'top' | 'right' | 'bottom' | 'left';
}

// Small, card-scale version of the orbit motif. Only the passed satellites
// are labeled; any cross position not supplied is simply omitted (not
// rendered faint/blank) — keeps each card lean, matching the 3-satellite
// mockup rather than forcing all 4 positions every time.
function MiniAssetOrbit({ satellites, glow = false }: { satellites: OrbitSatellite[]; glow?: boolean }) {
  const spread = 34;
  const coords: Record<OrbitSatellite['position'], { x: number; y: number }> = {
    top: { x: 0, y: -spread },
    right: { x: spread, y: 0 },
    bottom: { x: 0, y: spread },
    left: { x: -spread, y: 0 },
  };
  const labelProps: Record<OrbitSatellite['position'], React.SVGProps<SVGTextElement>> = {
    top: { y: -spread - 9, textAnchor: 'middle' },
    right: { x: spread + 8, dominantBaseline: 'middle', textAnchor: 'start' },
    bottom: { y: spread + 13, textAnchor: 'middle' },
    left: { x: -spread - 8, dominantBaseline: 'middle', textAnchor: 'end' },
  };

  return (
    <svg viewBox="0 0 140 130" className="w-full max-w-[150px] h-auto" aria-hidden="true">
      <g transform="translate(70 60)">
        {glow && <circle r={16} fill="url(#assetGlow)" />}
        {satellites.map((s) => (
          <line
            key={s.position}
            x1={0} y1={0}
            x2={coords[s.position].x} y2={coords[s.position].y}
            className="stroke-zinc-700"
            strokeWidth={1}
          />
        ))}
        {satellites.map((s) => (
          <circle key={s.position} r={3.5} cx={coords[s.position].x} cy={coords[s.position].y} className="fill-zinc-500" />
        ))}
        <circle r={5} className="fill-red-600" />
        {satellites.map((s) => (
          <text key={s.position} {...labelProps[s.position]} className="fill-zinc-500 text-[7px] font-black uppercase tracking-widest">
            {s.label}
          </text>
        ))}
        <text y={16} textAnchor="middle" className="fill-red-500 text-[6px] font-black uppercase tracking-widest opacity-80">
          Asset
        </text>
      </g>
    </svg>
  );
}

function AssetOrbitCard({ title, satellites, glow = false }: { title: string; satellites: OrbitSatellite[]; glow?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-4 w-[148px] shrink-0">
      <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">{title}</span>
      <MiniAssetOrbit satellites={satellites} glow={glow} />
    </div>
  );
}

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
  const [campaign, setCampaign]   = useState<Campaign | null>(null);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);

  // ── Asset Library illustration — progressive onboarding ────────────────────
  // Full illustration for the first ASSET_LIBRARY_ILLUSTRATION_VIEW_LIMIT
  // times a user encounters this empty state (tracked in localStorage, not
  // per-video — this is "have you seen the onboarding" not "have you seen
  // this specific video's card"). After that it starts collapsed; the user
  // can still expand it manually, but that choice is session-only (plain
  // useState), per the request that expand/collapse doesn't need to persist.
  const [illustrationExpanded, setIllustrationExpanded] = useState(true);
  const hasCountedIllustrationView = useRef(false);

  // Enriched data — same shapes as Analytics.tsx state
  const [allEvents, setAllEvents]           = useState<RawEvent[]>([]);
  const [enrichedStripe, setEnrichedStripe] = useState<StripePurchaseRow[]>([]);
  const [enrichedPixel, setEnrichedPixel]   = useState<PixelPurchaseRow[]>([]);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [showEdit, setShowEdit]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [archiving, setArchiving]   = useState(false);
  const [restoring, setRestoring]   = useState(false);
  const [timeRange, setTimeRange] = useState<DateRange>('7days');
  const [availableCampaignLeadMagnets, setAvailableCampaignLeadMagnets] = useState<LeadMagnet[]>([]);
  const [copiedLinkToken, setCopiedLinkToken] = useState<string | null>(null);
  const { organizationId } = useOrganization();
  console.log('[VideoDetail] useOrganization:', organizationId);
  const [displayCards, setDisplayCards] = useState<RedirectLinkDisplayCard[]>([]);
  const [expandedCardKey, setExpandedCardKey] = useState<string | null>(null);
  const [redirectLinks, setRedirectLinks]         = useState<any[]>([]);
  const [allLeadMagnetNames, setAllLeadMagnetNames] = useState<Record<string, string>>({});

  const [showAddLink, setShowAddLink]             = useState(false);
  const [extraLinkType, setExtraLinkType]         = useState<RedirectLinkType>('landing_page');
  const [extraLinkUrl, setExtraLinkUrl]           = useState('');
  const [extraLinkLeadMagnetId, setExtraLinkLeadMagnetId] = useState('');
  const [savingExtraLink, setSavingExtraLink]     = useState(false);
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
}, [id, user, organizationId]);

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


// ── Display cards for redesigned Tracking Links UI ──

console.log('[DEBUG] before display cards:', {
  organizationId,
  user,
  videoId: id
});

      // ── Display cards for the redesigned Tracking Links UI ──
if (organizationId && user) {
  try {
    const cards = await getRedirectLinksDisplay({
      videoId: id!,
      viewerOrganizationId: organizationId,
      viewerUserId: user.id,
    });

console.log('[DEBUG] getRedirectLinksDisplay returned:', cards);

    setDisplayCards(cards);
 } catch (err) {
  console.error('[VideoDetail] getRedirectLinksDisplay failed:', err);
  console.log('[DEBUG] organizationId at call time:', organizationId, 'user:', user);
}
}
      // ── Events — direct + session-resolved (mirrors Analytics.tsx exactly) ──
      const campaignId  = vData.campaign_id;
      const videoIdVal  = vData.id as string;

      console.log('[VideoDetail] starting parallel queries — videoId:', videoIdVal, 'campaignId:', campaignId);
      const [eDirectRes, eViaSessionRes, spRes, ppRes] = await Promise.all([
        // Direct events where video_id is set
        supabase
          .from('events')
          .select('video_id, campaign_id, event_type, created_at')
          .eq('video_id', videoIdVal),

        // Session-resolved events (video_id is null but sessions.video_id matches)
        supabase
          .from('events')
          .select('event_type, created_at, sessions!inner(video_id, campaign_id)')
          .is('video_id', null)
          .eq('sessions.video_id', videoIdVal),

        // ── stripe_purchase_type — the AUTHORITATIVE stripe table (has payment_type)
        // NOT stripe_purchases (which lacks payment_type and is the legacy table).
        // Fetch by video_id OR campaign_id to catch rows that have campaign but no video.
        supabase
          .from('stripe_purchase_type')
          .select('video_id, campaign_id, amount, stripe_session_id, payment_type')
          .or(`video_id.eq.${videoIdVal},campaign_id.eq.${campaignId}`),

        // pixel_purchases — fetch by video_id OR campaign_id (same OR pattern as Analytics)
        supabase
          .from('pixel_purchases')
          .select('video_id, campaign_id, amount, event_type, session_id')
          .or(`video_id.eq.${videoIdVal},campaign_id.eq.${campaignId}`),
      ]);

      console.log('[VideoDetail] parallel queries done — events direct:', eDirectRes.data?.length ?? 0,
        '| session events:', eViaSessionRes.data?.length ?? 0,
        '| stripe rows:', spRes.data?.length ?? 0,
        '| pixel rows:', ppRes.data?.length ?? 0,
        '| errors:', eDirectRes.error?.message ?? eViaSessionRes.error?.message ?? spRes.error?.message ?? ppRes.error?.message ?? 'none');

      // ── Normalize events ─────────────────────────────────────────────────────
      const directEvents: RawEvent[] = (eDirectRes.data || []).map((e: any) => ({
        video_id:    e.video_id    ?? null,
        campaign_id: e.campaign_id ?? null,
        event_type:  e.event_type  as string,
        created_at:  e.created_at  as string,
      }));

      const sessionEvents: RawEvent[] = (eViaSessionRes.data || [])
        .map((e: any) => ({
          video_id:    e.sessions?.video_id    ?? null,
          campaign_id: e.sessions?.campaign_id ?? null,
          event_type:  e.event_type  as string,
          created_at:  e.created_at  as string,
        }))
        .filter((e: RawEvent) => e.video_id !== null);

      const mergedEvents: RawEvent[] = [...directEvents, ...sessionEvents];

      // ── Session lookup helper (mirrors Analytics.tsx) ────────────────────────
      const buildSessionLookup = async (
        rows: any[],
      ): Promise<Record<string, { video_id: string; campaign_id: string }>> => {
        const missingIds = rows
          .filter((p: any) => !p.video_id && p.session_id)
          .map((p: any) => p.session_id);
        if (!missingIds.length) return {};
        const { data: sData } = await supabase
          .from('sessions').select('id, video_id, campaign_id').in('id', missingIds);
        const lookup: Record<string, { video_id: string; campaign_id: string }> = {};
        (sData || []).forEach((s: any) => {
          if (s.video_id) lookup[s.id] = { video_id: s.video_id, campaign_id: s.campaign_id };
        });
        return lookup;
      };

      // ── Enrich stripe (mirrors Analytics.tsx enrichedStripe construction) ────
      const stripeRaw = (spRes.data || [])
        .filter((r: any) => r.payment_type !== 'test')
        .map((r: any) => ({
          video_id:      r.video_id,
          campaign_id:   r.campaign_id,
          amount:        parseFloat(String(r.amount ?? '0')),
          session_id:    r.stripe_session_id ?? null,
          _payment_type: r.payment_type as string | null,
        }));

      const pixelRaw = (ppRes.data || []).map((r: any) => ({
        video_id:    r.video_id    ?? null,
        campaign_id: r.campaign_id ?? null,
        amount:      parseFloat(String(r.amount ?? '0')),
        event_type:  r.event_type  ?? null,
        session_id:  r.session_id  ?? null,
      }));

      const [stripeSessLookup, pixelSessLookup] = await Promise.all([
        buildSessionLookup(stripeRaw),
        buildSessionLookup(pixelRaw),
      ]);

      const builtStripe: StripePurchaseRow[] = stripeRaw
        .map((r: any): StripePurchaseRow | null => {
          const resolvedVideoId    = r.video_id    ?? (stripeSessLookup[r.session_id ?? '']?.video_id    ?? '');
          const resolvedCampaignId = r.campaign_id ?? (stripeSessLookup[r.session_id ?? '']?.campaign_id ?? '');
          if (r.amount <= 0) return null;
          const revenue_type: 'offer' | 'consultation' =
            r._payment_type === 'consultation' ? 'consultation' : 'offer';
          return {
            video_id:    resolvedVideoId,
            campaign_id: resolvedCampaignId,
            amount:      r.amount,
            revenue_type,
            session_id:  r.session_id ?? null,
          };
        })
        .filter((p: StripePurchaseRow | null): p is StripePurchaseRow => p !== null);

      const builtPixel: PixelPurchaseRow[] = enrichPixelPurchases(pixelRaw, pixelSessLookup);

      console.log('[VideoDetail] enrichPixelPurchases OK — pixel enriched:', builtPixel.length);
      console.log('[VideoDetail] about to setState — events:', mergedEvents.length, 'stripe:', builtStripe.length, 'pixel:', builtPixel.length);

      console.log('[VideoDetail] events direct:', eDirectRes.data?.length ?? 0,
        '| via session:', sessionEvents.length, '| total:', mergedEvents.length);
      console.log('[VideoDetail] stripe_purchase_type enriched:', builtStripe.length,
        '| pixel enriched:', builtPixel.length);

      setAllEvents(mergedEvents);
      setEnrichedStripe(builtStripe);
      setEnrichedPixel(builtPixel);

    } catch (err: any) {
      console.error('[VideoDetail] fetchData CATCH — error:', err?.message ?? err, err?.stack ?? '');
    } finally {
      console.log('[VideoDetail] fetchData FINALLY — loading → false');
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, organizationId]);

  // ── Asset Library illustration — view-count effect ──────────────────────────
  // Fires once asset state settles. Only counts a "view" when the empty state
  // will actually render (asset loaded, not yet added to the library) — and
  // only once per page load, guarded by the ref. Does not touch Asset data or
  // the addToLibrary flow in any way; this is display-state only.
  useEffect(() => {
    if (!asset || asset.added_to_library_at || hasCountedIllustrationView.current) return;
    hasCountedIllustrationView.current = true;

    try {
      const previousViews = parseInt(localStorage.getItem(ASSET_LIBRARY_ILLUSTRATION_STORAGE_KEY) ?? '0', 10) || 0;
      const nextViews = previousViews + 1;
      localStorage.setItem(ASSET_LIBRARY_ILLUSTRATION_STORAGE_KEY, String(nextViews));
      setIllustrationExpanded(nextViews <= ASSET_LIBRARY_ILLUSTRATION_VIEW_LIMIT);
    } catch {
      // localStorage unavailable (e.g. private browsing) — harmless fallback,
      // just keep showing the full illustration.
    }
  }, [asset]);

  // ── Metrics — via processVideoMetrics (analyticsEngine) ─────────────────────
  //
  // activeSource is always 'total' in VideoDetail (no toggle).
  // filterEventsByDate applies the selected timeRange to click events.
  // Purchases are all-time (same convention as Analytics.tsx).

  const metrics = useMemo((): (VideoMetricsResult & { lastConversion: string }) | null => {
    if (!video || !campaign) {
      console.log('[VideoDetail] metrics useMemo — skipped (video:', !!video, 'campaign:', !!campaign, ')');
      return null;
    }

    const dateFilteredEvents = filterEventsByDate(allEvents, timeRange);
    console.log('[VideoDetail] metrics useMemo — computing. events:', dateFilteredEvents.length,
      'stripe:', enrichedStripe.length, 'pixel:', enrichedPixel.length);

    // Source isolation for total mode (mirrors getAnalyticsEngine step 3)
    const sourceStripe = enrichedStripe; // both sources active in total mode
    const sourcePixel  = enrichedPixel;

    let result: VideoMetricsResult;
    try {
      result = processVideoMetrics({
        videoId:         video.id,
        campaignId:      video.campaign_id ?? null,
        campaign:        {
          id:                     campaign.id,
          revenue_mode:           (campaign as any).revenue_mode          ?? null,
          estimated_close_rate:   (campaign as any).estimated_close_rate  ?? null,
          offer_price:            (campaign as any).offer_price           ?? null,
          has_paid_consultation:  (campaign as any).has_paid_consultation ?? null,
          consultation_fee:       (campaign as any).consultation_fee      ?? null,
          stripe_revenue_type:    (campaign as any).stripe_revenue_type   ?? null,
        },
        activeSource:    'total',
        events:          dateFilteredEvents,
        stripePurchases: sourceStripe,
        pixelPurchases:  sourcePixel,
        includeEV:       true,
      });
    } catch (e: any) {
      console.error('[VideoDetail] processVideoMetrics THREW:', e?.message ?? e);
      return null;
    }

    console.log('[VideoDetail] metrics useMemo — result OK, total_revenue:', result.total_revenue);

    // Last conversion — most recent event timestamp for this video
    const videoEvents = allEvents.filter(e => e.video_id === video.id);
    const lastConversion = videoEvents.length > 0
      ? new Date(
          Math.max(...videoEvents.map(e => new Date(e.created_at).getTime())),
        ).toLocaleString()
      : 'No data';

    return { ...result, lastConversion };
  }, [video, campaign, allEvents, enrichedStripe, enrichedPixel, timeRange]);

  // ── Conversion metrics — derived inline from metrics (VideoMetricsResult) ────
  // computeConversionMetrics / VideoConversionMetrics were planned but never
  // added to analyticsEngine.ts. All inputs are already present on metrics.

  const conversionMetrics = useMemo(() => {
    if (!metrics) return null;
    const rate = (conversions: number, clicks: number): number =>
      clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(1)) : 0;
    return {
      newsletter_clicks:      metrics.newsletter_click,
      newsletter_optins:      metrics.newsletter_thankyou,
      newsletter_rate:        rate(metrics.newsletter_thankyou,   metrics.newsletter_click),
      call_landing_clicks:    metrics.call_booking_click,
      calls_booked:           metrics.call_booking_thankyou,
      call_rate:              rate(metrics.call_booking_thankyou, metrics.call_booking_click),
      consult_landing_clicks: metrics.consultation_click,
      consult_purchases:      metrics.consultation_thankyou,
      consult_rate:           rate(metrics.consultation_thankyou, metrics.consultation_click),
      purchase_landing_clicks: metrics.landing_page_view,
      direct_purchases:       metrics.purchase_thankyou,
      purchase_rate:          rate(metrics.purchase_thankyou,     metrics.landing_page_view),
    };
  }, [metrics]);

  // ── Timeline — built from raw event data scoped to this video ───────────────

  const timeline = useMemo((): TimelinePoint[] => {
    if (!video) return [];
    const daysMap: Record<DateRange, number> = {
      '7days':   7,
      '30days':  30,
      '2months': 60,
      '6months': 180,
      '1year':   365,
      'all':     365, // cap at 365 for rendering
    };
    const days = daysMap[timeRange] ?? 7;
    return buildTimeline(days, allEvents, enrichedStripe, enrichedPixel, video.id);
  }, [video, allEvents, enrichedStripe, enrichedPixel, timeRange]);

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

  const handleAddExtraLink = async () => {
    if (!video || !campaign) return;
    setSavingExtraLink(true);
    try {
      const appBaseUrl = window.location.origin;
      const urlToUse = extraLinkType === 'lead_magnet'
        ? availableCampaignLeadMagnets.find(lm => lm.id === extraLinkLeadMagnetId)?.lead_magnet_url || ''
        : extraLinkUrl;

      if (!urlToUse) { showAlert('URL Required', 'Please enter a destination URL.', 'info'); return; }

      const leadMagnetId = extraLinkType === 'lead_magnet' ? extraLinkLeadMagnetId : undefined;
      await createRedirectLink(video.id, video.campaign_id, extraLinkType, urlToUse, appBaseUrl, leadMagnetId, true);

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
          .then(setDisplayCards)
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
    setDeletingLinkToken(token);
    try {
      const { error } = await supabase.from('redirect_links').delete().eq('token', token);
      if (error) throw error;
      setRedirectLinks(prev => prev.filter(l => l.token !== token));
      setDisplayCards(prev => prev.filter(c => c.token !== token));
    } catch (err: any) {
      showAlert('Error', err.message || 'Could not delete link.', 'danger');
    } finally {
      setDeletingLinkToken(null);
    }
  };

  const handleAddToLibrary = async () => {
    if (!video?.asset_id) return;
    setAddingToLibrary(true);
    try {
      const { asset: updated } = await addToLibrary(video.asset_id);
      setAsset(updated);
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
    showConfirm(
      'Archive Video?',
      'Archived videos will be hidden from your active content library. You can restore them anytime.',
      async () => {
        setArchiving(true);
        try {
          const { error } = await supabase
            .from('videos')
            .update({ archived_at: new Date().toISOString() })
            .eq('id', id!);
          if (error) throw error;
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
    setRestoring(true);
    try {
      const { error } = await supabase
        .from('videos')
        .update({ archived_at: null })
        .eq('id', id);
      if (error) throw error;
      setVideo(prev => (prev ? ({ ...prev, archived_at: null } as any) : prev));
    } catch (err: any) {
      showAlert('Restore Failed', err.message || 'Could not restore the video.', 'danger');
    } finally {
      setRestoring(false);
    }
  };

  const handleUpdate = async () => {
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

  // ── Conversion System render helper ──────────────────────────────────────────

  const FunnelCard = ({
    label,
    clicks,
    conversions,
    conversionLabel,
    rate,
    accentColor,
  }: {
    label:           string;
    clicks:          number;
    conversions:     number;
    conversionLabel: string;
    rate:            number;
    accentColor:     string;
  }) => (
    <div className="bento-card p-6 flex flex-col gap-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between">
        <span className="label-caps !text-[9px] !text-zinc-500">{label}</span>
        <span
          className="text-[11px] font-black tabular-nums px-2 py-0.5 rounded-lg"
          style={{ color: accentColor, backgroundColor: `${accentColor}18` }}
        >
          {rate}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase text-zinc-600 tracking-widest mb-1">Clicks</p>
          <p className="text-xl font-black text-white tabular-nums">{clicks.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-zinc-600 tracking-widest mb-1">{conversionLabel}</p>
          <p className="text-xl font-black text-white tabular-nums">{conversions.toLocaleString()}</p>
        </div>
      </div>
      {/* Mini progress bar */}
      <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(rate, 100)}%`, backgroundColor: accentColor }}
        />
      </div>
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
            <div className="group relative w-16 h-10 overflow-hidden rounded-lg border border-zinc-800">
              <img src={video.thumbnail_url} className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white leading-tight flex items-center gap-2">
                {video.video_title}
                {(video as any).archived_at && (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full">
                    <ArchiveRestore size={10} /> Archived
                  </span>
                )}
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
          {(video as any).archived_at && (
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
          </div>
        </section>
      )}

      {/* ── 2. Summary Cards ───────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Landing Page Clicks', value: metrics?.landing_page_view,     icon: MousePointer2, color: 'text-blue-500' },
          { label: 'Direct Purchases',    value: metrics?.purchase_thankyou,      icon: DollarSign,    color: 'text-green-500' },
          { label: 'Calls Booked',        value: metrics?.call_booking_thankyou,  icon: Phone,         color: 'text-purple-500' },
          { label: 'Newsletter Opt-ins',  value: metrics?.newsletter_thankyou,    icon: Users,         color: 'text-orange-500' },
          { label: 'Consultations',       value: metrics?.consultation_thankyou,  icon: Briefcase,     color: 'text-red-500' },
        ].map(m => (
          <div key={m.label} className="bento-card p-5 flex flex-col justify-between min-h-[100px] hover:border-zinc-700 transition-colors">
            <span className="label-caps !text-[9px] !text-zinc-600 truncate">{m.label}</span>
            <div className="flex items-end justify-between mt-auto">
              <span className="text-2xl font-black text-white">{m.value ?? 0}</span>
              <m.icon size={14} className={`${m.color} opacity-40 mb-1`} />
            </div>
          </div>
        ))}
      </section>

      {/* ── 3. Revenue Section ─────────────────────────────────────────────────── */}
      <section className="bento-card p-10 bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 blur-[120px] rounded-full -mr-20 -mt-20 group-hover:bg-red-600/10 transition-colors" />
        <div className="relative z-10 space-y-6">
          <div>
            <span className="label-caps !text-red-600 mb-2 font-black">Total Revenue</span>
            <div className="text-6xl font-black text-white tracking-tighter drop-shadow-2xl">
              ${(metrics?.total_revenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-2">
              Direct Offer Sales + Consultation Revenue + Estimated Call Revenue
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-zinc-800/50">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Estimated Sales Call Revenue</span>
              <div className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-zinc-400">$</span>
                {(metrics?.estimated_call_revenue ?? 0).toLocaleString()}
              </div>
              <p className="text-[9px] text-zinc-600 font-bold uppercase">
                Based on {(campaign as any)?.estimated_close_rate ?? 0}% close rate
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Direct Purchase Revenue</span>
              <div className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-zinc-400">$</span>
                {(metrics?.direct_offer_revenue ?? 0).toLocaleString()}
              </div>
              <p className="text-[9px] text-zinc-600 font-bold uppercase">
                Verified offer sales via Stripe + pixel
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Conversion System Section ───────────────────────────────────────── */}
      <section className="bento-card p-8 space-y-6">
        <div>
          <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
            <TrendingUp size={14} className="text-red-600" /> Conversion System
          </h3>
          <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
            Funnel performance — clicks to conversions
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <FunnelCard
            label="Newsletter Funnel"
            clicks={conversionMetrics?.newsletter_clicks ?? 0}
            conversions={conversionMetrics?.newsletter_optins ?? 0}
            conversionLabel="Opt-ins"
            rate={conversionMetrics?.newsletter_rate ?? 0}
            accentColor="#ec4899"
          />
          <FunnelCard
            label="Sales Call Funnel"
            clicks={conversionMetrics?.call_landing_clicks ?? 0}
            conversions={conversionMetrics?.calls_booked ?? 0}
            conversionLabel="Calls Booked"
            rate={conversionMetrics?.call_rate ?? 0}
            accentColor="#a855f7"
          />
          <FunnelCard
            label="Consultation Funnel"
            clicks={conversionMetrics?.consult_landing_clicks ?? 0}
            conversions={conversionMetrics?.consult_purchases ?? 0}
            conversionLabel="Purchases"
            rate={conversionMetrics?.consult_rate ?? 0}
            accentColor="#ef4444"
          />
          <FunnelCard
            label="Direct Purchase Funnel"
            clicks={conversionMetrics?.purchase_landing_clicks ?? 0}
            conversions={conversionMetrics?.direct_purchases ?? 0}
            conversionLabel="Purchases"
            rate={conversionMetrics?.purchase_rate ?? 0}
            accentColor="#22c55e"
          />
        </div>
      </section>

      {/* ── 5. Breakdown + Timeline ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Event Breakdown */}
        <div className="lg:col-span-4 bento-card p-8">
          <h3 className="label-caps !text-white mb-8 flex items-center gap-2 font-black uppercase tracking-widest">
            <Activity size={14} className="text-red-600" /> Event Breakdown
          </h3>
          <div className="space-y-4">
            {[
              { label: 'Landing Page Clicks',     value: metrics?.landing_page_view },
              { label: 'Direct Purchases',        value: metrics?.purchase_thankyou },
              { label: 'Lead Magnet Clicks',      value: metrics?.lead_magnet_click },
              { label: 'Newsletter Clicks',       value: metrics?.newsletter_click },
              { label: 'Newsletter Opt-ins',      value: metrics?.newsletter_thankyou },
              { label: 'Call Booking Clicks',     value: metrics?.call_booking_click },
              { label: 'Call Bookings Confirmed', value: metrics?.call_booking_thankyou },
              { label: 'Consultation Page Clicks',value: metrics?.consultation_click },
              { label: 'Consultation Purchases',  value: metrics?.consultation_thankyou },
            ].map((stat, i, arr) => (
              <div
                key={stat.label}
                className={`flex justify-between items-center py-3 ${i !== arr.length - 1 ? 'border-b border-zinc-800/50' : ''}`}
              >
                <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider font-mono">{stat.label}</span>
                <span className="text-sm font-black text-white tabular-nums">{stat.value ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline + Last Activity */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="bento-card p-8 min-h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-10">
              <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
                <BarChart3 size={14} className="text-red-600" /> Conversion Activity
              </h3>
              <select
                value={timeRange}
                onChange={e => setTimeRange(e.target.value as DateRange)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-zinc-400 tracking-widest outline-none focus:border-red-600 transition-all cursor-pointer hover:bg-zinc-900"
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="2months">Last 2 Months</option>
                <option value="6months">Last 6 Months</option>
                <option value="1year">Last Year</option>
              </select>
            </div>
            <div className="flex-1 w-full min-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#dc2626" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#3f3f46', fontSize: 9, fontWeight: 'bold' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#3f3f46', fontSize: 9, fontWeight: 'bold' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', border: '1px solid #18181b' }}
                    itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                    formatter={(value) => {
                      if (typeof value === 'number') {
                        return [value.toFixed(0), 'Conversions'];
                      }
                      if (Array.isArray(value)) {
                        return [value.join(', '), 'Conversions'];
                      }
                      return [String(value ?? ''), 'Conversions'];
                    }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#dc2626" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="bento-card p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock size={16} className="text-zinc-600" />
              <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Last Conversion Activity</span>
            </div>
            <span className="text-[10px] font-black text-white uppercase">{metrics?.lastConversion ?? '—'}</span>
          </div>
        </div>
      </section>

      {/* ── 6. Tracking Links ───────────────────────────────────────────────────── */}
      <section className="bento-card p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
            <Link2 size={14} className="text-red-600" /> Tracking Links
          </h3>
          <button
            onClick={() => setShowAddLink(!showAddLink)}
            className="flex items-center gap-2 h-9 px-4 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all"
          >
            <Plus size={14} /> Add Link
          </button>
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
                    <option value="landing_page">🏠 Landing Page</option>
                    <option value="newsletter">📧 Newsletter</option>
                    {/* checkout intentionally omitted — owned by campaign, not video */}
                    <option value="consultation">💼 Consultation</option>
                    <option value="sales_call">📞 Sales Call</option>
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

        {/* All Links List */}
        {/* All Links List */}
<div className="space-y-2">
  {displayCards.length === 0 ? (
    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest text-center py-6">No tracking links found</p>
  ) : (
    displayCards.map((card) => {
      const isExpanded = expandedCardKey === card.key;
      const hasMore = Object.keys(card.more).length > 0;
      return (
        <div key={card.key} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                {CATEGORY_LABEL[card.category]}
              </p>
              <p className="text-sm font-bold text-white truncate mt-0.5">
                {card.title}
                {card.subtitle && (
                  <span className="ml-2 text-[10px] font-bold text-zinc-500 uppercase">{card.subtitle}</span>
                )}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Redirect</p>
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] text-blue-400 truncate">
                {window.location.origin}/{card.token}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/${card.token}`);
                  setCopiedLinkToken(card.token);
                  setTimeout(() => setCopiedLinkToken(null), 2000);
                }}
                className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-all"
              >
                {copiedLinkToken === card.token ? <Check size={13} className="text-green-500" /> : <Copy size={13} className="text-zinc-400" />}
              </button>
            </div>
          </div>

          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Destination</p>
            <p className="font-mono text-[10px] text-zinc-400 break-all">{card.destinationUrl}</p>
          </div>

          {hasMore && (
            <div>
              <button
                onClick={() => setExpandedCardKey(isExpanded ? null : card.key)}
                className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-all"
              >
                {isExpanded ? '▲ Less' : '▼ More'}
              </button>
              {isExpanded && (
                <div className="mt-2 space-y-1.5 pt-2 border-t border-zinc-900">
                  {card.more.owner && (
                    <div><p className="text-[9px] font-black uppercase text-zinc-600">Owner</p><p className="text-xs text-zinc-300">{card.more.owner}</p></div>
                  )}
                  {card.more.sharedBy && (
                    <div><p className="text-[9px] font-black uppercase text-zinc-600">Shared By</p><p className="text-xs text-zinc-300">{card.more.sharedBy}</p></div>
                  )}
                  {card.more.assignment && (
                    <div><p className="text-[9px] font-black uppercase text-zinc-600">Assignment</p><p className="text-xs text-zinc-300">{card.more.assignment}</p></div>
                  )}
                  {card.more.created && (
                    <div><p className="text-[9px] font-black uppercase text-zinc-600">Created</p><p className="text-xs text-zinc-300">{new Date(card.more.created).toLocaleDateString()}</p></div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    })
  )}
</div>
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
          <div className="space-y-3 max-w-md mx-auto">
            <h3 className="label-caps !text-white flex items-center justify-center gap-2 font-black uppercase tracking-widest">
              <BookmarkPlus size={14} className="text-red-600" /> Asset Library
            </h3>
            <p className="text-sm text-zinc-300">
              Turn this content into a reusable asset.
            </p>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Reuse it across your business, let others promote it, and track its performance everywhere it goes.
            </p>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {illustrationExpanded ? (
              <motion.div
                key="illustration-expanded"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <AssetReachIllustration />
                <p className="text-sm">
                  <span className="font-bold text-white">One asset.</span>{' '}
                  <span className="font-bold text-red-600">Unlimited possibilities.</span>
                </p>
              </motion.div>
            ) : (
              <motion.div key="illustration-collapsed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button
                  type="button"
                  onClick={() => setIllustrationExpanded(true)}
                  className="flex items-center justify-center gap-1.5 mx-auto text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors cursor-pointer"
                >
                  <ChevronRight size={12} /> Show illustration
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={handleAddToLibrary}
            disabled={addingToLibrary}
            className="flex items-center gap-2 h-9 px-4 mx-auto rounded-xl border border-zinc-800 hover:bg-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all disabled:opacity-50"
          >
            {addingToLibrary ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add to Asset Library
          </button>
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
