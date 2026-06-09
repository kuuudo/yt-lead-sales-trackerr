/**
 * src/components/analytics/toolbar/BoardSwitcher.tsx
 *
 * Board management UI — lives in the top bar of the workspace.
 *
 * Features:
 *  - Tab per board, click to switch
 *  - Double-click tab label to rename in place
 *  - Right-click (or × button) on active tab to delete
 *  - "+ Board" button to create a new board
 *
 * The userId prop is threaded in from Workspace.tsx via the store's auth state.
 * Boards created here go directly to Supabase (or guest memory if userId is null).
 */

import React, { useState, useRef } from 'react'
import { useWorkspaceStore } from '../store/useWorkspaceStore'

export default function BoardSwitcher() {
  const boards = useWorkspaceStore((s) => s.boards)
  const activeBoardId = useWorkspaceStore((s) => s.activeBoardId)
  const switchBoard = useWorkspaceStore((s) => s.switchBoard)
  const createBoard = useWorkspaceStore((s) => s.createBoard)
  const renameBoard = useWorkspaceStore((s) => s.renameBoard)
  const deleteBoard = useWorkspaceStore((s) => s.deleteBoard)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

  const handleCreate = async () => {
    // Find userId from any existing board
    const userId = boards[0]?.user_id ?? 'guest'
    const n = boards.length + 1
    await createBoard(`Board ${n}`, userId)
  }

  const startRename = (boardId: string, currentName: string) => {
    setEditingId(boardId)
    setNameDraft(currentName)
    setTimeout(() => editRef.current?.select(), 0)
  }

  const commitRename = async () => {
    if (!editingId) return
    const trimmed = nameDraft.trim()
    if (trimmed) await renameBoard(editingId, trimmed)
    setEditingId(null)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') commitRename()
  }

  const handleDelete = async (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (boards.length <= 1) return
    await deleteBoard(boardId)
  }

  return (
    <div style={styles.root}>
      {/* Board tabs */}
      {boards.map((board) => {
        const isActive = board.id === activeBoardId
        const isEditing = editingId === board.id

        return (
          <div
            key={board.id}
            style={{
              ...styles.tab,
              ...(isActive ? styles.tabActive : {}),
            }}
            onClick={() => !isEditing && switchBoard(board.id)}
            onDoubleClick={() => startRename(board.id, board.name)}
          >
            {isEditing ? (
              <input
                ref={editRef}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
                style={styles.renameInput}
                maxLength={60}
                autoFocus
              />
            ) : (
              <span style={styles.tabLabel}>{board.name}</span>
            )}

            {/* Delete button — only on active tab, only when >1 board */}
            {isActive && !isEditing && boards.length > 1 && (
              <button
                style={styles.deleteBtn}
                onClick={(e) => handleDelete(board.id, e)}
                title="Delete board"
              >
                ×
              </button>
            )}
          </div>
        )
      })}

      {/* Create board */}
      <button style={styles.createBtn} onClick={handleCreate} title="New board">
        + Board
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 10px',
    height: 30,
    borderRadius: 6,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.12s',
    border: '1px solid transparent',
    background: 'transparent',
  },
  tabActive: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
  },
  tabLabel: {
    fontSize: 12,
    color: '#777',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  renameInput: {
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #6b7ff0',
    outline: 'none',
    color: '#ccc',
    fontSize: 12,
    fontWeight: 500,
    width: 100,
    padding: '1px 0',
    fontFamily: 'inherit',
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#444',
    fontSize: 14,
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 1px',
    marginLeft: 2,
  },
  createBtn: {
    background: 'transparent',
    border: '1px dashed #2a2a2a',
    color: '#555',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '0 10px',
    height: 28,
    borderRadius: 6,
    flexShrink: 0,
    marginLeft: 4,
    transition: 'border-color 0.15s, color 0.15s',
    fontFamily: 'inherit',
    letterSpacing: '0.02em',
  },
}
