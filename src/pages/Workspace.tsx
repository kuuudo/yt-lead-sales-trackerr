/**
 * src/pages/Workspace.tsx
 *
 * Route: /workspace  —  TEMP SESSION CANVAS
 *
 * Flow:
 *  1. User enters /workspace → sees blank canvas + toolbar immediately
 *  2. First pointer/key interaction → soft "Name your workspace" card appears
 *  3. User types name → clicks "Create workspace"
 *  4. saveSessionAsBoard() runs → redirect to /workspace/:boardId
 *
 * No Supabase board calls here. Auth is resolved only to get userId for the
 * save step and to pass to WorkspaceToolbar.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useWorkspaceStore } from '../components/analytics/store/useWorkspaceStore'
import SessionCanvas from '../components/analytics/canvas/SessionCanvas'
import WorkspaceToolbar from '../components/analytics/toolbar/WorkspaceToolbar'
import type { User } from '@supabase/supabase-js'

export default function Workspace() {
  const navigate = useNavigate()

  const [user, setUser]         = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [showCard, setShowCard] = useState(false)
  const [boardName, setBoardName] = useState('My Workspace')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const saveSessionAsBoard = useWorkspaceStore((s) => s.saveSessionAsBoard)

  // Track whether the card has been triggered yet so the listener is removed
  const cardTriggered = useRef(false)

  // ── 1. Resolve auth session (no board DB calls) ────────────────────────────
  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        setUser(session?.user ?? null)
        setAuthReady(true)
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUser(session?.user ?? null)
    })

    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
    }
  }, [])

  // ── 2. Show onboarding card on first interaction ───────────────────────────
  useEffect(() => {
    function trigger() {
      if (cardTriggered.current) return
      cardTriggered.current = true
      setShowCard(true)
      window.removeEventListener('pointerdown', trigger)
      window.removeEventListener('keydown', trigger)
    }

    window.addEventListener('pointerdown', trigger)
    window.addEventListener('keydown', trigger)

    return () => {
      window.removeEventListener('pointerdown', trigger)
      window.removeEventListener('keydown', trigger)
    }
  }, [])

  // ── 3. Create workspace handler ────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (creating) return

    if (!user) {
      navigate('/login')
      return
    }

    setCreating(true)
    setCreateError(null)

    try {
      const newBoard = await saveSessionAsBoard(
        boardName.trim() || 'My Workspace',
        user.id
      )
      navigate(`/workspace/${newBoard.id}`)
    } catch (err) {
      console.error('[Workspace] saveSessionAsBoard error:', err)
      setCreateError('Something went wrong. Please try again.')
      setCreating(false)
    }
  }, [creating, user, boardName, saveSessionAsBoard, navigate])

  // ── Loading spinner (auth only — fast) ────────────────────────────────────
  if (!authReady) {
    return (
      <div style={styles.centred}>
        <div style={styles.spinner} />
        <span style={styles.loadingText}>Loading workspace…</span>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>

      {/* Blank session canvas — pure Zustand, no Supabase */}
      <SessionCanvas />

      {/* Floating widget toolbar — unchanged */}
      <WorkspaceToolbar userId={user?.id ?? null} />
      <button
        style={styles.hubBtn}
        onClick={() => navigate('/workspace/hub')}
>
        Hub
      </button>

      {/* ── Name-first onboarding card ── */}
      {showCard && (
        <>
          {/* Soft backdrop — does not block canvas interaction fully */}
          <div style={styles.backdrop} onClick={() => setShowCard(false)} />

          <div style={styles.card}>
            <p style={styles.cardEyebrow}>New workspace</p>
            <h2 style={styles.cardTitle}>Name your workspace</h2>
            <p style={styles.cardHint}>You can rename it anytime from the hub.</p>

            <input
              autoFocus
              style={styles.input}
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setShowCard(false)
              }}
              placeholder="My Workspace"
              maxLength={60}
            />

            {createError && (
              <p style={styles.errorText}>{createError}</p>
            )}

            <div style={styles.cardActions}>
              <button
                style={styles.createBtn}
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Creating…' : 'Create workspace'}
              </button>
              <button
                style={styles.skipBtn}
                onClick={() => setShowCard(false)}
              >
                Not now
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },

  // ── Loading state ──
  centred: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  spinner: {
    width: 28,
    height: 28,
    border: '2px solid #2a2a2a',
    borderTop: '2px solid #dc2626',
    borderRadius: '50%',
    animation: 'workspace-spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: 13,
    color: '#555',
    letterSpacing: '0.03em',
  },

  // ── Onboarding card ──
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.35)',
    zIndex: 300,
  },
  card: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 301,
    background: '#ffffff',
    borderRadius: 16,
    padding: '36px 40px',
    width: 380,
    maxWidth: '90vw',
    boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardEyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: '#dc2626',
  },
  cardTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#111',
    lineHeight: 1.2,
  },
  cardHint: {
    margin: '0 0 6px',
    fontSize: 13,
    color: '#888',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box' as const,
    background: '#f5f5f7',
    border: '1.5px solid #e0e0e0',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 15,
    color: '#111',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  errorText: {
    margin: 0,
    fontSize: 12,
    color: '#e05555',
  },
  cardActions: {
    display: 'flex',
    gap: 10,
    marginTop: 6,
  },
  createBtn: {
    flex: 1,
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '11px 0',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  skipBtn: {
    background: 'transparent',
    color: '#aaa',
    border: '1.5px solid #e8e8e8',
    borderRadius: 8,
    padding: '11px 18px',
    fontSize: 14,
    cursor: 'pointer',
  },
  hubBtn: {
    position: 'fixed',
    top: 68,
    left: 24,
    zIndex: 10000,

    background: '#16161f',
    color: '#FFFFFF',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '10px 18px',
    fontSize: '13.5px',
    fontWeight: 500,
    letterSpacing: '0.4px',
    cursor: 'pointer',

    display: 'flex',
    alignItems: 'center',
    gap: '8px',

    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 14px -2px rgba(0, 0, 0, 0.35)',
},
  
}

// Spinner keyframe (injected once)
if (typeof document !== 'undefined') {
  const styleId = 'workspace-spin-keyframe'
  if (!document.getElementById(styleId)) {
    const tag = document.createElement('style')
    tag.id = styleId
    tag.textContent = `@keyframes workspace-spin { to { transform: rotate(360deg); } }`
    document.head.appendChild(tag)
  }
}
