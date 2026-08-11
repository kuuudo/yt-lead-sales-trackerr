import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, CheckCircle2, ImagePlus, Star } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import TestimonialStars from './TestimonialStars';
import VideoRecorder from './VideoRecorder';
import { uploadTestimonialMedia } from '../../services/testimonial/uploadTestimonialMedia';
import { submitTestimonial } from '../../services/testimonial/submitTestimonial';

type LeaveTestimonialModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB, generous but sane for a profile photo

export default function LeaveTestimonialModal({ isOpen, onClose }: LeaveTestimonialModalProps) {
  const { user } = useAuth();

  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoResetKey, setVideoResetKey] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prefill name from the account once, and prevent background scroll
  // while the modal is open.
  useEffect(() => {
    if (!isOpen) return;
    const meta = (user?.user_metadata as { full_name?: string } | undefined) || {};
    setName((prev) => prev || meta.full_name || '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setRating(0);
    setContent('');
    setName('');
    setCompany('');
    setRole('');
    setAvatarFile(null);
    setAvatarPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVideoBlob(null);
    setVideoResetKey((k) => k + 1);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return; // don't let the modal be dismissed mid-upload
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setSuccess(false);
    onClose();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Photo is too large — please choose one under 5MB.');
      return;
    }
    setAvatarPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setAvatarFile(file);
  };

  const removeAvatar = () => {
    setAvatarPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setAvatarFile(null);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const canSubmit = rating > 0 && content.trim().length > 0 && name.trim().length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('You must be signed in to submit a testimonial.');
      return;
    }
    if (rating === 0) {
      setError('Please choose a star rating.');
      return;
    }
    if (!content.trim()) {
      setError('Please write a few words about your experience.');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const id = crypto.randomUUID();

      let avatarPath: string | null = null;
      let videoPath: string | null = null;

      if (avatarFile) {
        avatarPath = await uploadTestimonialMedia(user.id, id, 'avatar', avatarFile);
      }
      if (videoBlob) {
        videoPath = await uploadTestimonialMedia(user.id, id, 'video', videoBlob);
      }

      await submitTestimonial({
        id,
        rating,
        content,
        name,
        company: company || undefined,
        role: role || undefined,
        avatarPath,
        videoPath,
      });

      setSubmitting(false);
      setSuccess(true);
      resetForm();

      // Auto-close a beat after showing the success state; the user can
      // also close it manually with the X.
      closeTimerRef.current = setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2200);
    } catch (err: any) {
      setSubmitting(false);
      setError(err?.message || 'Something went wrong submitting your testimonial. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Leave a Testimonial"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative bento-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 md:p-8">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-colors disabled:opacity-40"
          disabled={submitting}
        >
          <X size={16} />
        </button>

        {success ? (
          <div className="flex flex-col items-center text-center gap-3 py-10">
            <CheckCircle2 className="text-green-500" size={40} />
            <h2 className="text-lg font-bold text-white">Thank you!</h2>
            <p className="text-zinc-500 text-sm max-w-xs">
              Your testimonial has been submitted and is pending review.
            </p>
          </div>
        ) : (
          <>
            <header className="mb-6">
              <div className="w-12 h-12 bg-red-600 rounded-xl mb-4 flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.3)]">
                <Star className="text-white" size={22} fill="currentColor" />
              </div>
              <h2 className="text-xl font-bold text-white">Leave a Testimonial</h2>
              <p className="text-zinc-500 text-sm mt-1">
                Tell other VSTRK users about your experience.
              </p>
            </header>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="label-caps">🎥 Record Video Testimonial (optional)</label>
                <VideoRecorder
                  onVideoReady={(blob) => setVideoBlob(blob)}
                  onClear={() => setVideoBlob(null)}
                  resetKey={videoResetKey}
                />
              </div>
              
              <div className="space-y-1">
                <label className="label-caps">Your Rating</label>
                <TestimonialStars value={rating} onChange={setRating} size={30} />
              </div>

              <div className="space-y-1">
                <label className="label-caps">Your Testimonial</label>
                <textarea
                  required
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What has VSTRK helped you achieve?"
                  className="w-full bg-zinc-950 border border-zinc-900 rounded-xl py-3 px-4 text-sm text-white focus:border-red-600 outline-none transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label-caps">Name</label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl py-3 px-4 text-sm text-white focus:border-red-600 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="label-caps">Company (optional)</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Inc."
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl py-3 px-4 text-sm text-white focus:border-red-600 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label-caps">Role (optional)</label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Founder"
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl py-3 px-4 text-sm text-white focus:border-red-600 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="label-caps">Photo (optional)</label>
                  <div className="flex items-center gap-3">
                    {avatarPreviewUrl ? (
                      <img
                        src={avatarPreviewUrl}
                        alt="Avatar preview"
                        className="w-11 h-11 rounded-full object-cover border border-zinc-800"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-zinc-950 border border-zinc-900 flex items-center justify-center text-zinc-600">
                        <ImagePlus size={16} />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
                    >
                      {avatarPreviewUrl ? 'Change' : 'Upload'}
                    </button>
                    {avatarPreviewUrl && (
                      <button
                        type="button"
                        onClick={removeAvatar}
                        className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-red-500 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
        
              {error && (
                <p className="text-red-500 text-[10px] font-bold uppercase">{error}</p>
              )}

              <button
                disabled={!canSubmit}
                type="submit"
                className="w-full bg-white text-zinc-950 h-12 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : 'Submit Testimonial'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
