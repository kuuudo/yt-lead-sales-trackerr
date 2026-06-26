import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;
// 👇 加這裡（最正確）
console.log("ENV CHECK:", {
  url: supabaseUrl,
  anon: supabaseAnonKey,
});
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
};

export type Campaign = {
  id: string;
  organization_id: string;
  campaign_name: string;
  landing_page_url: string;
  newsletter_url?: string | null;
  sales_call_booking_url?: string | null;
  consultation_booking_url?: string | null;
  checkout_url?: string | null;
  purchase_thankyou_url?: string | null;
  newsletter_thankyou_url?: string | null;
};

export type LeadMagnet = {
  id: string;
  campaign_id: string;
  lead_magnet_name: string;
  lead_magnet_url: string;
};