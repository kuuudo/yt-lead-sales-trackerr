import React, { useEffect, useRef, useState, useCallback } from 'react'

export type LoopVideoPreviewProps = {
  src: string
  label: string
  /** Optional short caption under the frame */
  caption?: string
  className?: string
  style?: React.CSSProperties
}

/**
 * Silent, looping product preview.
 * - Plays muted only while roughly in the viewport
 * - preload="none" until near viewport, then metadata/auto
 * - Click / Enter / Space opens the shared VideoLightbox via custom event
 *   (or pass onExpand if you prefer a controlled parent)
 * - Respects prefers-reduced-motion (static first frame, no autoplay)
 */
export default function LoopVideoPreview({
  src,
  label,
  caption,
  className,
  style,
  onExpand,
}: LoopVideoPreviewProps & { onExpand?: (src: string, label: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [inView, setInView] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.2),
      { rootMargin: '40px 0px', threshold: [0, 0.2, 0.5] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v || failed) return
    if (reducedMotion) {
      v.pause()
      return
    }
    if (inView) {
      // Ensure source is attached once near viewport
      if (!v.getAttribute('src')) {
        v.src = src
        v.load()
      }
      const p = v.play()
      if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay blocked — fine */ })
    } else {
      v.pause()
    }
  }, [inView, src, reducedMotion, failed])

  const open = useCallback(() => {
    if (failed) return
    if (onExpand) onExpand(src, label)
    else {
      window.dispatchEvent(
        new CustomEvent('vstrk:open-video-lightbox', { detail: { src, label } }),
      )
    }
  }, [src, label, onExpand, failed])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open()
    }
  }

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ marginTop: 14, ...style }}
    >
      <button
        type="button"
        onClick={open}
        onKeyDown={onKey}
        aria-label={`Play larger preview: ${label}`}
        style={{
          display: 'block',
          width: '100%',
          padding: 0,
          margin: 0,
          border: '0.5px solid #222',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#0d0d0d',
          cursor: failed ? 'default' : 'pointer',
          textAlign: 'left',
          position: 'relative',
        }}
      >
        {failed ? (
          <div
            style={{
              aspectRatio: '16 / 9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6a6a6a',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Preview unavailable
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              loop
              preload="none"
              aria-label={label}
              onError={() => setFailed(true)}
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                aspectRatio: '16 / 9',
                objectFit: 'cover',
                background: '#0d0d0d',
                pointerEvents: 'none',
              }}
            />
            {/* Expand affordance — not browser chrome */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                right: 10,
                bottom: 10,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#f2f2f2',
                background: 'rgba(0,0,0,0.65)',
                border: '0.5px solid #3a3a3a',
                borderRadius: 6,
                padding: '5px 9px',
                pointerEvents: 'none',
              }}
            >
              Expand
            </span>
          </>
        )}
      </button>
      {caption && (
        <div
          style={{
            marginTop: 8,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#6a6a6a',
          }}
        >
          {caption}
        </div>
      )}
    </div>
  )
}
