/**
 * src/pages/WorkspaceHub.tsx
 *
 * Route: /workspace/hub
 *
 * Board management page — NOT a canvas / editor.
 * Inspired by Miro's home dashboard.
 *
 * Responsibilities:
 *  - List all boards for the current user
 *  - Create a new board (manual, never auto)
 *  - Rename a board (inline)
 *  - Delete a board (with confirmation)
 *  - Click a board card → navigate to /workspace/:boardId
 *
 * This page DOES call loadBoards on mount (it's the right place for that).
 * It does NOT render a canvas, toolbar, or any workspace editing UI.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useWorkspaceStore } from '../components/analytics/store/useWorkspaceStore'
import type { Board } from '../components/analytics/store/useWorkspaceStore'
import type { User } from '@supabase/supabase-js'

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkspaceHub() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  // Board creation state
  const [isCreating, setIsCreating] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')

  const [showCreateModal, setShowCreateModal] = useState(false)

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const boards = useWorkspaceStore((s) => s.boards)
  const loadBoards = useWorkspaceStore((s) => s.loadBoards)
  const createBoard = useWorkspaceStore((s) => s.createBoard)
  const renameBoard = useWorkspaceStore((s) => s.renameBoard)
  const deleteBoard = useWorkspaceStore((s) => s.deleteBoard)

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        const { data: { session }, error: sessErr } = await supabase.auth.getSession()
        if (sessErr) throw sessErr

        const u = session?.user ?? null
        if (!cancelled) setUser(u)

        if (u) await loadBoards(u.id)

        if (!cancelled) setStatus('ready')
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load boards.')
          setStatus('error')
        }
      }
    }

    boot()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        const u = session?.user ?? null
        setUser(u)
        if (u) loadBoards(u.id)
      }
    })

    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
    }
  }, [loadBoards])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCreateBoard = useCallback(async () => {
    if (!user || !newBoardName.trim()) return
    setIsCreating(false)
    try {
      const board = await createBoard(newBoardName.trim(), user.id)
      setNewBoardName('')
      navigate(`/workspace/${board.id}`)
    } catch (err) {
      console.error('[WorkspaceHub] createBoard error:', err)
    }
  }, [user, newBoardName, createBoard, navigate])

  const handleRenameCommit = useCallback(async () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return }
    try {
      await renameBoard(renamingId, renameValue.trim())
    } catch (err) {
      console.error('[WorkspaceHub] renameBoard error:', err)
    } finally {
      setRenamingId(null)
    }
  }, [renamingId, renameValue, renameBoard])

  const handleDeleteConfirm = useCallback(async () => {
    if (!confirmDeleteId) return
    try {
      await deleteBoard(confirmDeleteId)
    } catch (err) {
      console.error('[WorkspaceHub] deleteBoard error:', err)
    } finally {
      setConfirmDeleteId(null)
    }
  }, [confirmDeleteId, deleteBoard])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div style={styles.centred}>
        <div style={styles.spinner} />
        <span style={styles.loadingText}>Loading boards…</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={styles.centred}>
        <span style={styles.errorIcon}>⚠</span>
        <p style={styles.errorText}>Could not load boards.</p>
        <p style={styles.errorDetail}>{error}</p>
        <button style={styles.btn} onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <button
  style={styles.newBtn}
  onClick={() => setShowCreateModal(true)}
>
  + New Workspace
</button>
      {/* ── Header ── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate('/workspace')}>
            ← Temp Canvas
          </button>
          <h1 style={styles.title}>My Boards</h1>
          <span style={styles.subtitle}>
            {boards.length === 0
              ? 'No boards yet'
              : `${boards.length} board${boards.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* New board trigger */}
        <div style={styles.headerRight}>
          {isCreating ? (
            <div style={styles.createRow}>
              <input
                autoFocus
                style={styles.createInput}
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateBoard()
                  if (e.key === 'Escape') { setIsCreating(false); setNewBoardName('') }
                }}
                placeholder="Board name…"
                maxLength={60}
              />
              <button style={styles.btnPrimary} onClick={handleCreateBoard}>
                Create
              </button>
              <button
                style={styles.btnGhost}
                onClick={() => { setIsCreating(false); setNewBoardName('') }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button style={styles.btnPrimary} onClick={() => setIsCreating(true)}>
              + New Board
            </button>
          )}
        </div>
      </header>

      {/* ── Board grid ── */}
      {boards.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>You don't have any boards yet.</p>
          <p style={styles.emptyHint}>Create your first board to get started.</p>
          <button style={styles.btnPrimary} onClick={() => setIsCreating(true)}>
            + Create Board
          </button>
        </div>
      ) : (
        <div style={styles.grid}>
          {boards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              isRenaming={renamingId === board.id}
              renameValue={renameValue}
              onOpen={() => navigate(`/workspace/${board.id}`)}
              onStartRename={() => {
                setRenamingId(board.id)
                setRenameValue(board.name)
              }}
              onRenameChange={setRenameValue}
              onRenameCommit={handleRenameCommit}
              onRenameCancel={() => setRenamingId(null)}
              onDeleteRequest={() => setConfirmDeleteId(board.id)}
            />
          ))}
        </div>
      )}

      {/* ── Delete confirmation dialog ── */}
      {confirmDeleteId && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <p style={styles.dialogTitle}>Delete this board?</p>
            <p style={styles.dialogBody}>
              All widgets on this board will be permanently deleted.
            </p>
            <div style={styles.dialogActions}>
              <button style={styles.btnDanger} onClick={handleDeleteConfirm}>
                Delete
              </button>
              <button style={styles.btnGhost} onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
{showCreateModal && (
  <div style={styles.overlay}>
    <div style={styles.modalCard}>
      <p style={styles.modalEyebrow}>New workspace</p>

      <h2 style={styles.modalTitle}>
        Name your workspace
      </h2>

      <p style={styles.modalHint}>
        You can rename it anytime.
      </p>

      <input
        autoFocus
        style={styles.modalInput}
        value={newBoardName}
        onChange={(e) => setNewBoardName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCreateBoard()
          if (e.key === 'Escape') {
            setShowCreateModal(false)
            setNewBoardName('')
          }
        }}
        placeholder="My Workspace"
        maxLength={60}
      />

      <div style={styles.modalActions}>
        <button
          style={styles.btnPrimary}
          onClick={async () => {
            await handleCreateBoard()
            setShowCreateModal(false)
          }}
        >
          Create Workspace
        </button>

        <button
          style={styles.btnGhost}
          onClick={() => {
            setShowCreateModal(false)
            setNewBoardName('')
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}



    </div>
  )
}

// ─── BoardCard subcomponent ───────────────────────────────────────────────────

interface BoardCardProps {
  board: Board
  isRenaming: boolean
  renameValue: string
  onOpen: () => void
  onStartRename: () => void
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onDeleteRequest: () => void
}

function BoardCard({
  board, isRenaming, renameValue,
  onOpen, onStartRename, onRenameChange, onRenameCommit, onRenameCancel, onDeleteRequest
}: BoardCardProps) {
  return (
    <div style={{ ...styles.card }}>
      {/* Color swatch + clickable preview area */}
      <div
        style={{ ...styles.cardPreview, background: board.background_color }}
        onClick={onOpen}
        title="Open board"
      >
        <span style={styles.openHint}>Open →</span>
      </div>

      {/* Board info row */}
      <div style={styles.cardFooter}>
        {isRenaming ? (
          <input
            autoFocus
            style={styles.renameInput}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit()
              if (e.key === 'Escape') onRenameCancel()
            }}
            onBlur={onRenameCommit}
            maxLength={60}
          />
        ) : (
          <span style={styles.cardName} title={board.name}>{board.name}</span>
        )}

        <div style={styles.cardActions}>
          {!isRenaming && (
            <button
              style={styles.iconBtn}
              title="Rename"
              onClick={(e) => { e.stopPropagation(); onStartRename() }}
            >
              ✏️
            </button>
          )}
          <button
            style={styles.iconBtn}
            title="Delete"
            onClick={(e) => { e.stopPropagation(); onDeleteRequest() }}
          >
            🗑️
          </button>
        </div>
        
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#0a0a12',
    color: '#ddd',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    padding: '0 0 60px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '20px 32px',
    borderBottom: '1px solid #1e1e2e',
    flexWrap: 'wrap',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 14,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid #2a2a3a',
    color: '#666',
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#eee',
  },
  subtitle: {
    fontSize: 13,
    color: '#555',
  },
  createRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  createInput: {
    background: '#111',
    border: '1px solid #333',
    borderRadius: 7,
    padding: '7px 12px',
    color: '#eee',
    fontSize: 13,
    width: 200,
    outline: 'none',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 20,
    padding: '32px',
  },
  card: {
    background: '#111',
    border: '1px solid #1e1e2e',
    borderRadius: 12,
    overflow: 'hidden',
    transition: 'border-color 0.15s',
    cursor: 'default',
  },
  cardPreview: {
    height: 130,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    position: 'relative',
  },
  openHint: {
    opacity: 0,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    background: 'rgba(0,0,0,0.4)',
    padding: '4px 10px',
    borderRadius: 6,
    transition: 'opacity 0.15s',
    // Revealed via :hover in a real app; inline styles can't do pseudo-classes
    // so we leave it; in production replace with a CSS class
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    gap: 8,
  },
  cardName: {
    fontSize: 14,
    color: '#ccc',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  cardActions: {
    display: 'flex',
    gap: 4,
    flexShrink: 0,
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    padding: '2px 4px',
    borderRadius: 4,
    lineHeight: 1,
  },
  renameInput: {
    flex: 1,
    background: '#0a0a12',
    border: '1px solid #6b7ff0',
    borderRadius: 5,
    padding: '4px 8px',
    color: '#eee',
    fontSize: 13,
    outline: 'none',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '80px 32px',
    color: '#555',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    color: '#666',
    margin: 0,
  },
  emptyHint: {
    fontSize: 13,
    margin: 0,
  },
  centred: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: 12,
    background: '#0a0a12',
  },
  spinner: {
    width: 28,
    height: 28,
    border: '2px solid #2a2a2a',
    borderTop: '2px solid #6b7ff0',
    borderRadius: '50%',
    animation: 'workspace-spin 0.8s linear infinite',
  },
  loadingText: { fontSize: 13, color: '#555' },
  errorIcon: { fontSize: 32, color: '#e05555' },
  errorText: { fontSize: 15, color: '#ccc', margin: 0 },
  errorDetail: { fontSize: 12, color: '#555', margin: 0, maxWidth: 360, textAlign: 'center' },
  btn: {
    padding: '8px 20px',
    background: '#1e1e1e',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  btnPrimary: {
    background: '#6b7ff0',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnGhost: {
    background: 'transparent',
    color: '#888',
    border: '1px solid #333',
    borderRadius: 7,
    padding: '8px 14px',
    fontSize: 13,
    cursor: 'pointer',
  },
  btnDanger: {
    background: '#c0392b',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  dialog: {
    background: '#111',
    border: '1px solid #2e2e2e',
    borderRadius: 12,
    padding: '28px 32px',
    maxWidth: 380,
    width: '90%',
    textAlign: 'center',
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#eee',
    margin: '0 0 8px',
  },
  dialogBody: {
    fontSize: 13,
    color: '#777',
    margin: '0 0 24px',
  },
  dialogActions: {
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
  },
  newBtn: {
  position: 'fixed',
  bottom: 24,
  left: 24,
  zIndex: 10000,

  background: '#dc2626',
  color: '#FFFFFF',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  padding: '16px 28px',

  fontSize: '18px',
  fontWeight: 700,

  cursor: 'pointer',

  boxShadow: '0 8px 24px -2px rgba(0,0,0,0.35)',
},

modalCard: {
  background: '#ffffff',
  borderRadius: 16,
  padding: '36px 40px',
  width: 380,
  maxWidth: '90vw',

  display: 'flex',
  flexDirection: 'column',
  gap: 10,
},

modalEyebrow: {
  margin: 0,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#dc2626',
},

modalTitle: {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  color: '#111',
},

modalHint: {
  margin: 0,
  fontSize: 13,
  color: '#777',
},

modalInput: {
  width: '100%',
  boxSizing: 'border-box',

  background: '#f5f5f7',
  border: '1px solid #ddd',

  borderRadius: 8,
  padding: '10px 14px',

  fontSize: 15,
  color: '#111',
},

modalActions: {
  display: 'flex',
  gap: 10,
  marginTop: 10,
},
}
