import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Analytics will not be saved.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

export type PixelPurchase = {
  id: string;
  token: string | null;
  session_id: string | null;
  video_id: string | null;
  campaign_id: string | null;
  user_id: string | null;
  amount: number | null;
  created_at: string;
};
export type Video = {
  id: string;
  user_id: string;
  organization_id: string;
  platform: string | null;
  platform_url: string | null;
  platform_post_id: string | null;
  youtube_video_id: string | null;
  video_title: string | null;
  thumbnail_url: string | null;
  video_goal: Array<'newsletter' | 'calls' | 'consult' | 'sales' | 'viral'>;
  campaign_id: string;
  status: 'active' | 'error' | 'installed' | 'missing' | 'no_data';
  selected_lead_magnet_ids: string[] | null;
  created_at: string;
  // Every Video has a corresponding Asset (Design Lock §1, Option A).
  // Column already exists in DB (Migration 003 backfilled it); type was
  // just missing it until now..
  asset_id: string;
  // Soft-delete marker (Migration 008). NULL = not deleted. Set instead of
  // hard-deleting a Video whose Asset has been added to the Library.
  // Internal system lifecycle state — not exposed in the UI.
  deleted_at: string | null;
  // Archive marker. NULL = active. User-controlled organizational state,
  // set only via an explicit Archive action in the UI. Independent of
  // deleted_at — archiving never touches deleted_at and vice versa.
  archived_at: string | null;
};

// Asset is Content Identity — intentionally minimal. It never stores title,
// thumbnail, platform, or URL; those are always retrieved by joining to the
// type-specific table (currently only `videos`). No owner_user_id either —
// ownership for Phase 1 is expressed via organization_id only.
export type Asset = {
  id: string;
  organization_id: string;
  asset_type: 'video';
  created_at: string;
  // NULL = not yet added to the Asset Library.
  added_to_library_at: string | null;
};

export type Campaign = {
  id: string;
  user_id: string;
  organization_id: string;
  campaign_name: string;
  landing_page_url: string;
  newsletter_url?: string | null;
  newsletter_thankyou_url?: string | null;
  checkout_url?: string | null;
  purchase_thankyou_url?: string | null;
  offer_price?: number | null;
  has_sales_call?: boolean | null;
  sales_call_booking_url?: string | null;
  sales_call_thankyou_url?: string | null;
  estimated_close_rate?: number | null;
  has_paid_consultation?: boolean | null;
  consultation_booking_url?: string | null;
  consultation_thankyou_url?: string | null;
  consultation_fee?: number | null;
  has_lead_magnet?: boolean | null;
  uses_stripe_consultation?: boolean | null;
  paid_consultation_checkout_url?: string | null;
  uses_stripe?: boolean | null;
  checkout_type?: string | null;
  consultation_checkout_type?: string | null;
  purchase_method?: string | null;
  sales_call_delivery?: string | null;
  average_upsell_value?: number | null;
  consultation_delivery?: string | null;
  consultation_payment_method?: string | null;
  base_offer_value?: number | null;
  upsell_probability?: number | null;
  is_system?: boolean | null;
  archived_at?: string | null;
  created_at?: string | null;
};

export type LeadMagnet = {
  id: string;
  campaign_id: string;
  lead_magnet_name: string;
  lead_magnet_url: string;
  lead_magnet_thankyou_url?: string | null;
};

export type Testimonial = {
  id: string;
  user_id: string;
  rating: number;
  content: string;
  name: string;
  company: string | null;
  role: string | null;
  // Storage object paths in the private `testimonial-media` bucket
  // (see uploadTestimonialMedia.ts), NOT public/signed URLs. Resolve to a
  // signed URL at render time wherever these are displayed.
  avatar_url: string | null;
  video_url: string | null;
  // Every insert lands as 'pending' — the testimonials_insert_own RLS
  // policy forces this regardless of what the client sends. Only the
  // admin moderator (Phase 2) can move a row to 'approved' / 'rejected'.
  status: 'pending' | 'approved' | 'rejected';
  // Independent publish flags, both default false and only settable by
  // the admin moderator. A testimonial can be approved but still hidden
  // from both public surfaces until these are explicitly turned on.
  show_on_testimonials: boolean;
  show_on_website: boolean;
  created_at: string;
  updated_at: string;
};