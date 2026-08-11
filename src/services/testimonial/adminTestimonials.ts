import { supabase } from '../../lib/supabase';
import type { Testimonial } from '../../lib/supabase';

// Single source of truth for who can see /testimonialss. The page also
// checks this, but any RLS policy protecting the table/bucket should use
// the same address.
export const ADMIN_EMAIL = 'alinospam2020@gmail.com';

const BUCKET = 'testimonial-media';
// Long enough to cover a full moderation session without the admin having
// to refresh mid-review, short enough not to leak a durable public link.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Every testimonial regardless of status/visibility — this is the private
 * moderation inbox, not a public listing. Relies on an admin-only RLS
 * SELECT policy (see supabase/admin_testimonial_policies.sql); a
 * non-admin caller will simply get an empty/error result from Supabase.
 */
export async function fetchAllTestimonials(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as Testimonial[];
}

/**
 * testimonial-media is a private bucket, so avatar_url/video_url (storage
 * object paths, not URLs) need to be exchanged for a short-lived signed
 * URL before they can be rendered in an <img>/<video>.
 */
export async function getSignedMediaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Could not create a signed URL for this file.');
  }
  return data.signedUrl;
}

type TestimonialPatch = {
  show_on_testimonials?: boolean;
  show_on_website?: boolean;
  status?: Testimonial['status'];
};

async function patchTestimonial(id: string, patch: TestimonialPatch): Promise<Testimonial> {
  const { data, error } = await supabase
    .from('testimonials')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Testimonial;
}

// --- Moderation actions -----------------------------------------------
//
// Turning a visibility flag ON always implies approval, so the admin never
// has to remember a separate "approve" step. Turning a flag OFF only hides
// the testimonial from that one surface — it never touches `status`, so a
// testimonial can stay approved while being shown on neither page.
// Rejecting is the only action that hides it from both surfaces at once.

export function sendToTestimonials(id: string): Promise<Testimonial> {
  return patchTestimonial(id, { show_on_testimonials: true, status: 'approved' });
}

export function removeFromTestimonials(id: string): Promise<Testimonial> {
  return patchTestimonial(id, { show_on_testimonials: false });
}

export function sendToWebsite(id: string): Promise<Testimonial> {
  return patchTestimonial(id, { show_on_website: true, status: 'approved' });
}

export function removeFromWebsite(id: string): Promise<Testimonial> {
  return patchTestimonial(id, { show_on_website: false });
}

export function rejectTestimonial(id: string): Promise<Testimonial> {
  return patchTestimonial(id, {
    status: 'rejected',
    show_on_testimonials: false,
    show_on_website: false,
  });
}

/** Pulls a rejected testimonial back into the pending queue. */
export function resetToPending(id: string): Promise<Testimonial> {
  return patchTestimonial(id, { status: 'pending' });
}
