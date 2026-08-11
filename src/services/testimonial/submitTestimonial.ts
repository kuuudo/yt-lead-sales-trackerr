import { supabase } from '../../lib/supabase';
import type { Testimonial } from '../../lib/supabase';

export type SubmitTestimonialInput = {
  // Generated client-side before any upload happens, so the storage path
  // and the DB row agree on the same id. Passed through explicitly on
  // insert rather than relying on the column default.
  id: string;
  rating: number;
  content: string;
  name: string;
  company?: string;
  role?: string;
  // Storage object paths from uploadTestimonialMedia, or null if the
  // user skipped that field.
  avatarPath?: string | null;
  videoPath?: string | null;
};

/**
 * Inserts a new testimonial for the currently authenticated user.
 *
 * Does not (and cannot) set status/show_on_testimonials/show_on_website —
 * the testimonials_insert_own RLS policy forces those to
 * 'pending'/false/false regardless of what's sent, so a submission always
 * lands in the private moderation inbox first.
 */
export async function submitTestimonial(input: SubmitTestimonialInput): Promise<Testimonial> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('You must be signed in to submit a testimonial.');
  }

  const { data, error } = await supabase
    .from('testimonials')
    .insert({
      id: input.id,
      user_id: user.id,
      rating: input.rating,
      content: input.content.trim(),
      name: input.name.trim(),
      company: input.company?.trim() || null,
      role: input.role?.trim() || null,
      avatar_url: input.avatarPath || null,
      video_url: input.videoPath || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Testimonial;
}
