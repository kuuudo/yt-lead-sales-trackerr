import React, { useState } from 'react';
import { Star } from 'lucide-react';

type TestimonialStarsProps = {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  // Read-only mode is what /testimonials and /website will use later to
  // display an already-submitted rating; this form uses the editable mode.
  readOnly?: boolean;
};

export default function TestimonialStars({
  value,
  onChange,
  size = 28,
  readOnly = false,
}: TestimonialStarsProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value;

  return (
    <div
      className="flex items-center gap-1"
      role={readOnly ? undefined : 'radiogroup'}
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= display;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => !readOnly && setHovered(star)}
            onMouseLeave={() => !readOnly && setHovered(null)}
            className={`transition-transform ${
              readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
            }`}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
          >
            <Star
              size={size}
              className={filled ? 'text-red-500' : 'text-zinc-700'}
              fill={filled ? 'currentColor' : 'none'}
              strokeWidth={filled ? 0 : 1.5}
            />
          </button>
        );
      })}
    </div>
  );
}
