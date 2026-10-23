import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

type OpenDetail = { src: string; label: string }

/**
 * Full-screen video lightbox for marketing loop previews.
 * Listens for `vstrk:open-video-lightbox` or accept controlled props.
 *
 * Not the same as components/Modal.tsx (that is confirm/alert only).
 * Shares the dark backdrop language; no new dependencies.
 */
export type VideoLightboxProps = {
  /** Controlled mode — if omitted, listens to the custom event */
  open?: boolean
  src?: string
  label?: string
  onClose?: () => void
}

export default function VideoLightbox(props: VideoLightboxProps) {
  const controlled = props.open !== undefined
  const [internal, setInternal] = useState<OpenDetail | null>(null)

  const isOpen = controlled ? !!props.open && !!props.src : !!internal
  const src = controlled ? props.src : internal?.src
  const label = controlled ? props.label : internal?.label

  const close = useCallback(() => {
    if (controlled) props.onClose?.()
    else setInternal(null)
  }, [controlled, props])

  useEffect(() => {
    if (controlled) return
    const handler = (e: Event) => {
      const ce = e as CustomEvent<OpenDetail>
      if (ce.detail?.src) setInternal(ce.detail)
    }
    window.addEventListener('vstrk:open-video-lightbox', handler)
    return () => window.removeEventListener('vstrk:open-video-lightbox', handler)
  }, [controlled])

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  // Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  const dialogRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Focus management + pause/cleanup on close
  useEffect(() => {
    if (isOpen) {
      previouslyFocused.current = document.activeElement as HTMLElement | null
      // Focus close button shortly after mount
      requestAnimationFrame(() => closeBtnRef.current?.focus())
      return
    }
    const v = videoRef.current
    if (v) {
      v.pause()
      v.removeAttribute('src')
      v.load()
    }
    previouslyFocused.current?.focus?.()
  }, [isOpen])

  // Focus trap (Tab cycles inside dialog)
  useEffect(() => {
    if (!isOpen) return
    const root = dialogRef.current
    if (!root) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], video, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    root.addEventListener('keydown', onKey)
    return () => root.removeEventListener('keydown', onKey)
  }, [isOpen])

  if (!isOpen || !src) return null

  const node = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        onClick={close}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.92)',
        }}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label || 'Product preview'}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(960px, 96vw)',
          maxHeight: '90vh',
          background: '#0d0d0d',
          border: '0.5px solid #222',
          borderRadius: 14,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 14px',
            borderBottom: '0.5px solid #222',
          }}
        >
          <div
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#8a8a8a',
            }}
          >
            {label}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={close}
            aria-label="Close video"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#f2f2f2',
              background: 'transparent',
              border: '0.5px solid #3a3a3a',
              borderRadius: 8,
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            minHeight: 0,
          }}
        >
          <video
            ref={videoRef}
            key={src}
            src={src}
            controls
            playsInline
            autoPlay
            muted
            loop
            style={{
              display: 'block',
              width: '100%',
              maxHeight: 'calc(90vh - 56px)',
              objectFit: 'contain',
              background: '#000',
            }}
          />
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
