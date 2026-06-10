/**
 * src/pages/Workspace.tsx
 *
 * Route: /workspace
 *
 * This is a TEMPORARY session canvas — no Supabase calls are made here.
 * All widget state lives in Zustand's `tempWidgets` until the user
 * explicitly saves as a board.
 *
 * Flow:
 *  1. User lands on blank canvas
 *  2. User adds their first widget → "Save as Board" prompt appears
 *  3. User clicks "Save as Board" → saveSessionAsBoard() → redirect to /workspace/:id
 *  4. User clicks "Continue" → prompt dismisses, canvas keeps working
 *
 * Auth is still resolved so WorkspaceToolbar knows the userId.
 * loadBoards() is NOT called here — that's /workspace/hub's job.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useWorkspaceStore } from '../components/analytics/store/useWorkspaceStore'
import SessionCanvas from '../components/analytics/canvas/SessionCanvas'
import WorkspaceToolbar from '../components/analytics/toolbar/WorkspaceToolbar'
import type { User } from '@supabase/supabase-js'

// ─── Component ────────────────────────────────────────────────────────────────

export default function Workspace() {
  const navigate = useNavigate()

  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [promptDismissed, setPromptDismissed] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [boardName, setBoardName] = useState('My Workspace')

  const tempWidgets = useWorkspaceStore((s) => s.tempWidgets)
  const saveSessionAsBoard = useWorkspaceStore((s) => s.saveSessionAsBoard)
  const clearTempWidgets = useWorkspaceStore((s) => s.clearTempWidgets)

  // ── Resolve auth session (no DB board calls) ───────────────────────────────
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

  // ── Show save prompt on first widget add ───────────────────────────────────
  useEffect(() => {
    if (tempWidgets.length > 0 && !promptDismissed && !showSavePrompt) {
      setShowSavePrompt(true)
    }
  }, [tempWidgets.length, promptDismissed, showSavePrompt])

  // ── Save handler ───────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!user) {
      // Not logged in — redirect to login
      navigate('/login')
      return
    }
    if (isSaving) return

    setIsSaving(true)
    try {
      const newBoard = await saveSessionAsBoard(boardName.trim() || 'My Workspace', user.id)
      navigate(`/workspace/${newBoard.id}`)
    } catch (err) {
      console.error('[Workspace] saveSessionAsBoard error:', err)
      setIsSaving(false)
    }
  }, [user, boardName, isSaving, saveSessionAsBoard, navigate])

  const handleDismiss = useCallback(() => {
    setShowSavePrompt(false)
    setPromptDismissed(true)
  }, [])

  // ── Loading: wait for auth only ────────────────────────────────────────────
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
      {/* Temp session canvas — pure Zustand, no Supabase */}
      <SessionCanvas />

      {/* Floating add-widget toolbar */}
      <WorkspaceToolbar userId={user?.id ?? null} sessionMode />

      {/* ── Save-as-Board prompt ── */}
      {showSavePrompt && (
        <div style={styles.saveBar}>
          <span style={styles.saveIcon}>✨</span>
          <span style={styles.saveText}>Want to save this workspace?</span>
          <input
            style={styles.nameInput}
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            placeholder="Board name…"
            maxLength={60}
          />
          <button
            style={styles.saveBtn}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save as Board'}
          </button>
          <button style={styles.dismissBtn} onClick={handleDismiss}>
            Continue
          </button>
        </div>
      )}

      {/* Hub shortcut — always visible top-right */}
      <button style={styles.hubBtn} onClick={() => navigate('/workspace/hub')}>
        Workspace Hub
      </button>
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
    background: '#0f0f0f',
    backgroundImage: 'radial-gradient(#1f1f1f 1px, transparent 1px)',
    backgroundSize: '24px 24px',
    overflow: 'hidden',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
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
  saveBar: {
    position: 'fixed',
    bottom: 28,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#1a1a2e',
    border: '1px solid #3a3a6a',
    borderRadius: 12,
    padding: '10px 16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    zIndex: 200,
    backdropFilter: 'blur(12px)',
    maxWidth: '90vw',
  },
  saveIcon: {
    fontSize: 18,
  },
  saveText: {
    fontSize: 13,
    color: '#aaa',
    whiteSpace: 'nowrap',
  },
  nameInput: {
    background: '#0f0f1e',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '5px 10px',
    color: '#eee',
    fontSize: 13,
    width: 160,
    outline: 'none',
  },
  saveBtn: {
    background: '#6b7ff0',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  dismissBtn: {
    background: 'transparent',
    color: '#666',
    border: '1px solid #333',
    borderRadius: 7,
    padding: '7px 12px',
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  hubBtn: {
    position: 'fixed',
    top: 68,
    left: 24,
    zIndex: 10000,
    /* Modern styling */
    background: '#16161f',
    color: '#FFFFFF',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '10px 18px',
    fontSize: '13.5px',
    fontWeight: '500',
    letterSpacing: '0.4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)', /* Smooth animation */
    boxShadow: '0 4px 14px -2px rgba(0, 0, 0, 0.35)',     /* Depth */
    userSelect: 'none',
  },
}

if (typeof document !== 'undefined') {
  const styleId = 'workspace-spin-keyframe'
  if (!document.getElementById(styleId)) {
    const tag = document.createElement('style')
    tag.id = styleId
    tag.textContent = `@keyframes workspace-spin { to { transform: rotate(360deg); } }`
    document.head.appendChild(tag)
  }
}
