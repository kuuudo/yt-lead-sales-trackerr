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

// Helper to check connection
export const checkSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from('campaigns').select('id').limit(1);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Supabase connection check failed:', err);
    return false;
  }
};

export type Campaign = {
  id: string;
  user_id: string;
  campaign_name: string;
  landing_page_url: string;
  newsletter_url: string;
  newsletter_thankyou_url: string;
  checkout_url: string;
  purchase_thankyou_url: string;
  offer_price: number;
  uses_stripe: boolean;
  has_sales_call: boolean;
  sales_call_booking_url: string | null;
  sales_call_thankyou_url: string | null;
  estimated_close_rate: number | null;
  has_paid_consultation: boolean;
  consultation_booking_url: string | null;
  paid_consultation_checkout_url: string | null;
  consultation_thankyou_url: string | null;
  consultation_fee: number | null;
  uses_stripe_consultation: boolean;
  has_lead_magnet: boolean;
  created_at: string;
};

export type LeadMagnet = {
  id: string;
  campaign_id: string;
  lead_magnet_name: string;
  lead_magnet_url: string;
  lead_magnet_thankyou_url: string;
  created_at: string;
};

export type Video = {
  id: string;
  user_id: string;
  campaign_id: string;
  youtube_video_id: string;
  video_title: string;
  thumbnail_url: string;
  video_goal: ('newsletter' | 'calls' | 'consult' | 'sales' | 'viral')[];
  selected_lead_magnet_ids: string[] | null;
  status: 'active' | 'no_data' | 'installed' | 'missing' | 'error';
  created_at: string;
  published_at: string | null;
};

export type SessionData = {
  id: string;
  video_id: string | null;
  campaign_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  token: string | null;
  created_at: string;
};

export type EventData = {
  session_id: string;
  event_type: string;
  value: number | null;
};

export type LeadData = {
  session_id: string;
  email: string;
  utm_content: string | null;
};

export type StripeConfig = {
  id: string;
  user_id: string;
  stripe_webhook_secret: string;
  created_at: string;
};

export type StripePurchase = {
  id: string;
  stripe_session_id: string;
  token: string;
  video_id: string;
  campaign_id: string;
  user_id: string | null;
  amount: number | null;
  currency: string | null;
  customer_email: string | null;
  created_at: string;
};

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
