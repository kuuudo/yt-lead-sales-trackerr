import { supabase } from '../../lib/supabase';
import type { Testimonial } from '../../lib/supabase';
import { getSignedMediaUrl } from './adminTestimonials';

export type PublicTestimonial = Testimonial & {
  signedAvatarUrl?: string;
  signedVideoUrl?: string;
};

const PAGE_SIZE = 9;

/**
 * Public listing for /testimonials.
 * Only returns rows that are approved AND flagged for the testimonials page.
 * Relies on a public SELECT RLS policy (status = 'approved' AND show_on_testimonials = true).
 */
export async function fetchPublicTestimonials(
  page: number = 0
): Promise<{ items: PublicTestimonial[]; hasMore: boolean }> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('status', 'approved')
    .eq('show_on_testimonials', true)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  const rows = (data || []) as Testimonial[];

  // Best-effort signed URLs so one bad path doesn't kill the whole page
  const items: PublicTestimonial[] = await Promise.all(
    rows.map(async (t) => {
      const item: PublicTestimonial = { ...t };
      await Promise.all([
        t.avatar_url
          ? getSignedMediaUrl(t.avatar_url)
              .then((url) => {
                item.signedAvatarUrl = url;
              })
              .catch(() => {})
          : Promise.resolve(),
        t.video_url
          ? getSignedMediaUrl(t.video_url)
              .then((url) => {
                item.signedVideoUrl = url;
              })
              .catch(() => {})
          : Promise.resolve(),
      ]);
      return item;
    })
  );

  return {
    items,
    hasMore: rows.length === PAGE_SIZE,
  };
}

/**
 * Same filters, but for the website surface (show_on_website).
 * Used later by the /website landing section.
 */
export async function fetchWebsiteTestimonials(
  limit: number = 6
): Promise<PublicTestimonial[]> {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('status', 'approved')
    .eq('show_on_website', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (data || []) as Testimonial[];

  return Promise.all(
    rows.map(async (t) => {
      const item: PublicTestimonial = { ...t };
      await Promise.all([
        t.avatar_url
          ? getSignedMediaUrl(t.avatar_url)
              .then((url) => {
                item.signedAvatarUrl = url;
              })
              .catch(() => {})
          : Promise.resolve(),
        t.video_url
          ? getSignedMediaUrl(t.video_url)
              .then((url) => {
                item.signedVideoUrl = url;
              })
              .catch(() => {})
          : Promise.resolve(),
      ]);
      return item;
    })
  );
}