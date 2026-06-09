/**
 * src/pages/Workspace.tsx
 *
 * Root page component for the VSTRK Analytics Workspace.
 * Route: /workspace
 *
 * Responsibilities:
 *  - Bootstrap Supabase session and resolve the active user
 *  - Load boards + widgets from Supabase on mount
 *  - Render the full-screen workspace shell (canvas + toolbar + board switcher)
 *  - Show a loading state while initial data resolves
 *  - Show an error state if Supabase is unreachable
 *
 * Dependencies:
 *   npm install @supabase/supabase-js zustand nanoid @use-gesture/react recharts
 */

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useWorkspaceStore } from '../components/analytics/store/useWorkspaceStore'
import WorkspaceCanvas from '../components/analytics/canvas/WorkspaceCanvas'
import WorkspaceToolbar from '../components/analytics/toolbar/WorkspaceToolbar'
import BoardSwitcher from '../components/analytics/toolbar/BoardSwitcher'
import type { User } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

type BootStatus = 'loading' | 'ready' | 'error'

// ─── Component ────────────────────────────────────────────────────────────────

export default function Workspace() {
  const [status, setStatus] = useState<BootStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)

  const loadBoards = useWorkspaceStore((s) => s.loadBoards)
  const activeBoardId = useWorkspaceStore((s) => s.activeBoardId)

  // ── Bootstrap: resolve session then hydrate store ──────────────────────────
  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        // 1. Resolve current Supabase session
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) throw sessionError

        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (currentUser) {
          await loadBoards(currentUser.id)
        }
        // 2. Load boards (and their widgets) into the store
        await loadBoards(currentUser?.id ?? null)

        if (!cancelled) setStatus('ready')
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to connect to database.'
          setError(message)
          setStatus('error')
        }
      }
    }

    boot()

    // 3. Subscribe to auth changes (sign-in / sign-out while workspace is open)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!cancelled) {
          const nextUser = session?.user ?? null
          if (nextUser) {
            setUser(nextUser)
            loadBoards(nextUser.id)
          } else {
            setUser(null)
            clearWorkspace()   // see below
          }
    )

    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
    }
  }, [loadBoards])

  // ── Render: loading ────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div style={styles.centred}>
        <div style={styles.spinner} />
        <span style={styles.loadingText}>Loading workspace…</span>
      </div>
    )
  }

  // ── Render: error ──────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div style={styles.centred}>
        <span style={styles.errorIcon}>⚠</span>
        <p style={styles.errorText}>Could not load workspace.</p>
        <p style={styles.errorDetail}>{error}</p>
        <button style={styles.retryButton} onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    )
  }

  // ── Render: workspace ──────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      {/* Board tabs along the top */}
      <div style={styles.topBar}>
        <BoardSwitcher />
      </div>

      {/* Infinite canvas — fills remaining space */}
      {activeBoardId ? (
        <WorkspaceCanvas />
      ) : (
        <div style={styles.centred}>
          <p style={styles.emptyText}>Create a board to get started.</p>
        </div>
      )}

      {/* Floating add-widget toolbar */}
      {activeBoardId && (
        <WorkspaceToolbar userId={user?.id ?? null} />
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
//
// Inline styles are used for layout primitives only.
// Widget-level styling uses CSS classes or styled via widget components.

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    background: '#0f0f0f',
    overflow: 'hidden',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  topBar: {
    flexShrink: 0,
    height: 48,
    borderBottom: '1px solid #1e1e1e',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: 8,
    zIndex: 50,
    background: '#0f0f0f',
  },
  centred: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: '#666',
  },
  spinner: {
    width: 28,
    height: 28,
    border: '2px solid #2a2a2a',
    borderTop: '2px solid #6b7ff0',
    borderRadius: '50%',
    animation: 'workspace-spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: 13,
    color: '#555',
    letterSpacing: '0.03em',
  },
  errorIcon: {
    fontSize: 32,
    color: '#e05555',
  },
  errorText: {
    fontSize: 15,
    color: '#ccc',
    margin: 0,
  },
  errorDetail: {
    fontSize: 12,
    color: '#555',
    margin: 0,
    maxWidth: 360,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    padding: '8px 20px',
    background: '#1e1e1e',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  emptyText: {
    fontSize: 14,
    color: '#444',
    margin: 0,
  },
}

// Inject keyframe for spinner (runs once at module load)
if (typeof document !== 'undefined') {
  const styleId = 'workspace-spin-keyframe'
  if (!document.getElementById(styleId)) {
    const tag = document.createElement('style')
    tag.id = styleId
    tag.textContent = `@keyframes workspace-spin { to { transform: rotate(360deg); } }`
    document.head.appendChild(tag)
  }
}
