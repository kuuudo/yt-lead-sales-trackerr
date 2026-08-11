import { supabase } from '../../lib/supabase';

const BUCKET = 'testimonial-media';

function extFromMime(mime: string, kind: 'video' | 'avatar'): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  // Fallback if the browser didn't set a usable type (e.g. some
  // MediaRecorder outputs omit codecs in `.type`).
  return kind === 'video' ? 'webm' : 'jpg';
}

/**
 * Uploads a testimonial video or avatar to the private testimonial-media
 * bucket and returns the storage object path (NOT a signed URL).
 *
 * Path convention: {userId}/{testimonialId}/{kind}.{ext}
 * This matches the storage.objects RLS policies (owner/admin/public-join)
 * from the migration — the owner-access policy checks that the first path
 * segment equals auth.uid(), so this path shape is load-bearing, not
 * cosmetic.
 */
export async function uploadTestimonialMedia(
  userId: string,
  testimonialId: string,
  kind: 'video' | 'avatar',
  file: Blob
): Promise<string> {
  const ext = extFromMime(file.type || '', kind);
  const path = `${userId}/${testimonialId}/${kind}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: true,
  });

  if (error) {
    throw new Error(`Failed to upload ${kind}: ${error.message}`);
  }

  return path;
}
