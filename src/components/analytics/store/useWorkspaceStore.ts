/**
 * src/components/analytics/store/useWorkspaceStore.ts
 *
 * Zustand store — single source of truth for the entire workspace.
 *
 * KEY CHANGES vs previous version:
 *  - loadBoards NO LONGER auto-creates a board when the user has none.
 *    Boards are ONLY created by explicit user action (createBoard / saveSessionAsBoard).
 *  - Added `tempWidgets` — in-memory widget list for the /workspace session canvas.
 *  - Added `addTempWidget` / `clearTempWidgets` helpers for session canvas.
 *  - Added `saveSessionAsBoard(name, userId)` — converts temp session into a real board.
 *  - deleteBoard guard changed: allows deleting the last board (user might want zero boards).
 */

import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import type { SupabaseWidget, SupabaseBoard } from './types'

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface Widget {
  id: string
  board_id: string
  user_id: string
  title: string | null
  type: string
  x: number
  y: number
  width: number
  height: number
  category?: string
  config: Record<string, unknown>
  data: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Board {
  id: string
  user_id: string
  organization_id: string | null
  name: string
  background_color: string
  created_at: string
  updated_at: string
}

export interface CanvasTransform {
  x: number
  y: number
  scale: number
}

export interface Point {
  x: number
  y: number
}

// ─── History Types ────────────────────────────────────────────────────────────

type HistoryEntry =
  | { type: 'ADD_WIDGET';    widget: Widget }
  | { type: 'DELETE_WIDGET'; widget: Widget }
  | { type: 'UPDATE_WIDGET'; id: string; before: Partial<Widget>; after: Partial<Widget> }

// ─── Store Interface ──────────────────────────────────────────────────────────

export interface WorkspaceStore {
  // ── State ──────────────────────────────────────────────────────────────────
  boards: Board[]
  activeBoardId: string | null
  widgetsByBoard: Record<string, Widget[]>
  transform: CanvasTransform
  isSaving: boolean

  /**
   * Temporary widgets for the /workspace session canvas.
   * These live in memory only — never persisted until saveSessionAsBoard() is called.
   */
  tempWidgets: Omit<Widget, 'board_id' | 'created_at' | 'updated_at'>[]

  clearWorkspace: () => void

  // ── History ────────────────────────────────────────────────────────────────
  canUndo: boolean
  canRedo: boolean
  undo: () => Promise<void>
  redo: () => Promise<void>
  _recordHistory: (entry: HistoryEntry) => void

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  loadBoards: (userId: string) => Promise<void>

  // ── Canvas ─────────────────────────────────────────────────────────────────
  pan: (dx: number, dy: number) => void
  zoom: (delta: number, originX: number, originY: number) => void
  resetView: () => void

  // ── Boards ─────────────────────────────────────────────────────────────────
  createBoard: (name: string, userId: string) => Promise<Board>
  renameBoard: (boardId: string, name: string) => Promise<void>
  deleteBoard: (boardId: string) => Promise<void>
  switchBoard: (boardId: string) => void
  setBoardColor: (boardId: string, color: string) => Promise<void>

  // ── Session canvas (temp, /workspace route) ────────────────────────────────
  /** Add a widget to the in-memory session canvas (no Supabase call). */
  addTempWidget: (partial: Omit<Widget, 'board_id' | 'created_at' | 'updated_at'>) => void
  /** Wipe all temp widgets (e.g. after user dismisses save prompt). */
  clearTempWidgets: () => void
  /**
   * Persist the current temp session as a new board.
   * Calls createBoard, migrates tempWidgets into the new board, then clears tempWidgets.
   * Returns the new board so the caller can redirect to /workspace/:boardId.
   */
  saveSessionAsBoard: (name: string, userId: string) => Promise<Board>

  // ── Widgets ────────────────────────────────────────────────────────────────
  addWidget: (partial: Omit<Widget, 'created_at' | 'updated_at'>) => Promise<void>
  updateWidget: (id: string, patch: Partial<Widget>) => void
  deleteWidget: (id: string) => Promise<void>

  activeWidgets: () => Widget[]
  toCanvasPoint: (screenX: number, screenY: number) => Point
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_SCALE = 0.1
const MAX_SCALE = 4.0
const INITIAL_TRANSFORM: CanvasTransform = { x: 0, y: 0, scale: 1 }
const DEFAULT_BG_COLOR = '#111827'

const saveDebounceMap = new Map<string, ReturnType<typeof setTimeout>>()
const SAVE_DEBOUNCE_MS = 600

const MAX_HISTORY = 50

const historyStack = {
  past:   [] as HistoryEntry[],
  future: [] as HistoryEntry[],
}

let _isUndoing = false

const historyDebounceMap = new Map<string, {
  handle: ReturnType<typeof setTimeout>
  before: Partial<Widget>
}>()
const HISTORY_DEBOUNCE_MS = 800

// ─── Store Implementation ─────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  boards: [],
  activeBoardId: null,
  widgetsByBoard: {},
  transform: INITIAL_TRANSFORM,
  isSaving: false,
  tempWidgets: [],   // ← NEW: session canvas state

  // ── History state ──────────────────────────────────────────────────────────
  canUndo: false,
  canRedo: false,

  _recordHistory: (entry) => {
    if (_isUndoing) return
    historyStack.past.push(entry)
    if (historyStack.past.length > MAX_HISTORY) {
      historyStack.past.splice(0, historyStack.past.length - MAX_HISTORY)
    }
    historyStack.future = []
    set({ canUndo: true, canRedo: false })
  },

  undo: async () => {
    const entry = historyStack.past.pop()
    if (!entry) return
    historyStack.future.push(entry)
    set({ canUndo: historyStack.past.length > 0, canRedo: true })
    _isUndoing = true
    try { await applyInverse(entry, get()) } finally { _isUndoing = false }
  },

  redo: async () => {
    const entry = historyStack.future.pop()
    if (!entry) return
    historyStack.past.push(entry)
    set({ canUndo: true, canRedo: historyStack.future.length > 0 })
    _isUndoing = true
    try { await applyForward(entry, get()) } finally { _isUndoing = false }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Bootstrap
  // ─────────────────────────────────────────────────────────────────────────

  loadBoards: async (userId) => {
    const { data: boardRows, error: boardError } = await supabase
      .from('boards')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (boardError) throw boardError

    const boards = (boardRows ?? []).map((row) => ({
      ...row,
      background_color: row.background_color ?? DEFAULT_BG_COLOR,
    })) as Board[]
    console.log('[loadBoards] boards from db', boards)
    console.log(
      '[loadBoards] organization_ids',
      boards.map((b) => ({
       id: b.id,
        organization_id: b.organization_id,
    }))
  )
    // ✅ FIX: Do NOT auto-create a board when the user has none.
    // The user will create boards manually from /workspace/hub.
    if (boards.length === 0) {
      set({ boards: [], widgetsByBoard: {}, activeBoardId: null })
      return
    }

    const boardIds = boards.map((b) => b.id)
    const { data: widgetRows, error: widgetError } = await supabase
      .from('widgets')
      .select('*')
      .in('board_id', boardIds)
      .eq('user_id', userId)

    if (widgetError) throw widgetError

    const widgetsByBoard: Record<string, Widget[]> = {}
    for (const b of boards) widgetsByBoard[b.id] = []
    for (const row of (widgetRows ?? []) as SupabaseWidget[]) {
      const w = rowToWidget(row)
      if (widgetsByBoard[w.board_id]) {
        widgetsByBoard[w.board_id].push(w)
      }
    }

    set({
      boards,
      widgetsByBoard,
      activeBoardId: boards[0].id,
    })
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Canvas
  // ─────────────────────────────────────────────────────────────────────────

  clearWorkspace: () => {
    set({
      boards: [],
      activeBoardId: null,
      widgetsByBoard: {},
      transform: { x: 0, y: 0, scale: 1 },
      tempWidgets: [],
    })
  },

  pan: (dx, dy) => {
    set((s) => ({
      transform: { ...s.transform, x: s.transform.x + dx, y: s.transform.y + dy },
    }))
  },

  zoom: (delta, originX, originY) => {
    set((s) => {
      const { x, y, scale } = s.transform
      const factor = delta > 0 ? 1.08 : 0.926
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
      const nextX = originX - (originX - x) * (nextScale / scale)
      const nextY = originY - (originY - y) * (nextScale / scale)
      return { transform: { x: nextX, y: nextY, scale: nextScale } }
    })
  },

  resetView: () => set({ transform: INITIAL_TRANSFORM }),

  // ─────────────────────────────────────────────────────────────────────────
  // Boards
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new board in Supabase.
   * ✅ Returns the created Board so callers can redirect to /workspace/:id.
   * ✅ NEVER called automatically — only from explicit user action.
   */


  
  createBoard: async (name, userId) => {

    const { data: org } = await supabase
  .from('organizations')
  .select('id')
  .eq('owner_id', userId)
  .single()

const organization_id = org?.id ?? null

    const now = new Date().toISOString()
    const optimisticId = crypto.randomUUID()

    const newBoard: Board = {
      id: optimisticId,
      user_id: userId,
      organization_id,
      name,
      background_color: DEFAULT_BG_COLOR,
      created_at: now,
      updated_at: now,
    }

    // Optimistic update
    set((s) => ({
      boards: [...s.boards, newBoard],
      widgetsByBoard: { ...s.widgetsByBoard, [optimisticId]: [] },
      activeBoardId: optimisticId,
    }))
console.log('[createBoard] org check:', {
  organization_id,
  boardsLength: get().boards.length,
})

    const { data, error } = await supabase
      .from('boards')
      .insert({ name, user_id: userId, background_color: DEFAULT_BG_COLOR, organization_id })
      .select()
      .single()

    if (error) {
      // Roll back
      set((s) => ({
        boards: s.boards.filter((b) => b.id !== optimisticId),
        widgetsByBoard: Object.fromEntries(
          Object.entries(s.widgetsByBoard).filter(([k]) => k !== optimisticId)
        ),
        activeBoardId: s.boards.find((b) => b.id !== optimisticId)?.id ?? null,
      }))
      throw error
    }

    const realBoard = data as SupabaseBoard
    const fullBoard: Board = {
      ...newBoard,
      id: realBoard.id,
      background_color: realBoard.background_color ?? DEFAULT_BG_COLOR,
    }

    set((s) => ({
      boards: s.boards.map((b) => (b.id === optimisticId ? fullBoard : b)),
      widgetsByBoard: Object.fromEntries(
        Object.entries(s.widgetsByBoard).map(([k, v]) =>
          k === optimisticId ? [realBoard.id, v] : [k, v]
        )
      ),
      activeBoardId: realBoard.id,
    }))

    return fullBoard
  },

  renameBoard: async (boardId, name) => {
    set((s) => ({
      boards: s.boards.map((b) =>
        b.id === boardId ? { ...b, name, updated_at: new Date().toISOString() } : b
      ),
    }))

    const { error } = await supabase
      .from('boards')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', boardId)

    if (error) throw error
  },

  deleteBoard: async (boardId) => {
    const { boards } = get()
    const remainingBoards = boards.filter((b) => b.id !== boardId)

    set((s) => ({
      boards: remainingBoards,
      activeBoardId:
        s.activeBoardId === boardId ? (remainingBoards[0]?.id ?? null) : s.activeBoardId,
      widgetsByBoard: Object.fromEntries(
        Object.entries(s.widgetsByBoard).filter(([k]) => k !== boardId)
      ),
    }))

    const { error } = await supabase.from('boards').delete().eq('id', boardId)
    if (error) throw error
    // widgets are CASCADE deleted by the FK constraint
  },

  switchBoard: (boardId) => set({ activeBoardId: boardId, transform: INITIAL_TRANSFORM }),

  setBoardColor: async (boardId, color) => {
    set((s) => ({
      boards: s.boards.map((b) =>
        b.id === boardId
          ? { ...b, background_color: color, updated_at: new Date().toISOString() }
          : b
      ),
    }))

    const { error } = await supabase
      .from('boards')
      .update({ background_color: color, updated_at: new Date().toISOString() })
      .eq('id', boardId)

    if (error) throw error
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Session canvas (temp, /workspace route)
  // ─────────────────────────────────────────────────────────────────────────

  addTempWidget: (partial) => {
    set((s) => ({ tempWidgets: [...s.tempWidgets, partial] }))
  },

  clearTempWidgets: () => set({ tempWidgets: [] }),

  saveSessionAsBoard: async (name, userId) => {
    const { tempWidgets } = get()

    // createBoard handles Supabase insert + optimistic update + returns the real Board
    const newBoard = await get().createBoard(name, userId)

    const now = new Date().toISOString()
    // Migrate each temp widget into the real board
    for (const tw of tempWidgets) {
      const widget: Widget = {
        ...tw,
        board_id: newBoard.id,
        created_at: now,
        updated_at: now,
      }
      await get().addWidget(widget)
    }

    // Clear temp state now that everything is persisted
    set({ tempWidgets: [] })

    return newBoard
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Widgets
  // ─────────────────────────────────────────────────────────────────────────

  addWidget: async (partial) => {
    const now = new Date().toISOString()
    const widget: Widget = { ...partial, created_at: now, updated_at: now }

    // Optimistic
    set((s) => ({
      widgetsByBoard: {
        ...s.widgetsByBoard,
        [widget.board_id]: [...(s.widgetsByBoard[widget.board_id] ?? []), widget],
      },
    }))

    get()._recordHistory({ type: 'ADD_WIDGET', widget })

    if (widget.user_id === 'guest') return

    console.log('===================')
    console.log('WIDGET INSERT')
    console.log('widget.id =', widget.id)
    console.log('widget.board_id =', widget.board_id)
    console.log('widget.user_id =', widget.user_id)
    console.log('===================')

    const board = get().boards.find((b) => b.id === widget.board_id)
    const payload = {
      ...widgetToRow(widget),
      organization_id: board?.organization_id ?? null,
    }
    console.log('[addWidget] org check:', {
  board,
  boardOrgId: board?.organization_id,
  payload,
})
    console.log('INSERT PAYLOAD', payload)

    const { error } = await supabase.from('widgets').insert(payload)

    if (error) {
      console.error('SUPABASE INSERT ERROR', error)
      set((s) => ({
        widgetsByBoard: {
          ...s.widgetsByBoard,
          [widget.board_id]: (s.widgetsByBoard[widget.board_id] ?? []).filter(
            (w) => w.id !== widget.id
          ),
        },
      }))
      throw error
    }
  },

  updateWidget: (id, patch) => {
    if (!_isUndoing) {
      const existingDebounce = historyDebounceMap.get(id)
      const before: Partial<Widget> = existingDebounce?.before ?? (() => {
        const allWidgets = Object.values(get().widgetsByBoard).flat()
        const current = allWidgets.find((w) => w.id === id)
        if (!current) return patch
        return Object.fromEntries(
          Object.keys(patch).map((k) => [k, (current as unknown as Record<string, unknown>)[k]])
        ) as Partial<Widget>
      })()

      if (existingDebounce) clearTimeout(existingDebounce.handle)
      historyDebounceMap.set(id, {
        before,
        handle: setTimeout(() => {
          historyDebounceMap.delete(id)
          const allWidgets = Object.values(get().widgetsByBoard).flat()
          const current = allWidgets.find((w) => w.id === id)
          if (!current) return
          const after = Object.fromEntries(
            Object.keys(before).map((k) => [k, (current as unknown as Record<string, unknown>)[k]])
          ) as Partial<Widget>
          get()._recordHistory({ type: 'UPDATE_WIDGET', id, before, after })
        }, HISTORY_DEBOUNCE_MS),
      })
    }

    set((s) => {
      const updated: Record<string, Widget[]> = {}
      for (const [boardId, widgets] of Object.entries(s.widgetsByBoard)) {
        updated[boardId] = widgets.map((w) =>
          w.id === id ? { ...w, ...patch, updated_at: new Date().toISOString() } : w
        )
      }
      return { widgetsByBoard: updated }
    })

    const existing = saveDebounceMap.get(id)
    if (existing) clearTimeout(existing)

    saveDebounceMap.set(
      id,
      setTimeout(async () => {
        saveDebounceMap.delete(id)
        const allWidgets = Object.values(get().widgetsByBoard).flat()
        const widget = allWidgets.find((w) => w.id === id)
        if (!widget || widget.user_id === 'guest') return

        set({ isSaving: true })
        const { error } = await supabase
          .from('widgets')
          .update(widgetToRow(widget))
          .eq('id', id)

        if (error) console.error('[useWorkspaceStore] updateWidget save error:', error)
        set({ isSaving: false })
      }, SAVE_DEBOUNCE_MS)
    )
  },

  deleteWidget: async (id) => {
    const { widgetsByBoard } = get()
    let boardId: string | null = null
    for (const [bid, widgets] of Object.entries(widgetsByBoard)) {
      if (widgets.some((w) => w.id === id)) { boardId = bid; break }
    }
    if (!boardId) return

    const widget = widgetsByBoard[boardId]?.find((w) => w.id === id)
    if (!widget) return

    get()._recordHistory({ type: 'DELETE_WIDGET', widget })

    set((s) => ({
      widgetsByBoard: {
        ...s.widgetsByBoard,
        [boardId!]: (s.widgetsByBoard[boardId!] ?? []).filter((w) => w.id !== id),
      },
    }))

    if (widget.user_id === 'guest') return

    const { error } = await supabase.from('widgets').delete().eq('id', id)
    if (error) {
      set((s) => ({
        widgetsByBoard: {
          ...s.widgetsByBoard,
          [boardId!]: [...(s.widgetsByBoard[boardId!] ?? []), widget],
        },
      }))
      throw error
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Derived helpers
  // ─────────────────────────────────────────────────────────────────────────

  activeWidgets: () => {
    const { activeBoardId, widgetsByBoard } = get()
    if (!activeBoardId) return []
    return widgetsByBoard[activeBoardId] ?? []
  },

  toCanvasPoint: (screenX, screenY) => {
    const { x, y, scale } = get().transform
    return { x: (screenX - x) / scale, y: (screenY - y) / scale }
  },
}))

// ─── History helpers ──────────────────────────────────────────────────────────

async function applyInverse(entry: HistoryEntry, store: WorkspaceStore): Promise<void> {
  switch (entry.type) {
    case 'ADD_WIDGET':    await store.deleteWidget(entry.widget.id); break
    case 'DELETE_WIDGET': await store.addWidget(entry.widget); break
    case 'UPDATE_WIDGET': store.updateWidget(entry.id, entry.before); break
  }
}

async function applyForward(entry: HistoryEntry, store: WorkspaceStore): Promise<void> {
  switch (entry.type) {
    case 'ADD_WIDGET':    await store.addWidget(entry.widget); break
    case 'DELETE_WIDGET': await store.deleteWidget(entry.widget.id); break
    case 'UPDATE_WIDGET': store.updateWidget(entry.id, entry.after); break
  }
}

// ─── Row ↔ Widget Mappers ─────────────────────────────────────────────────────
// same
function rowToWidget(row: SupabaseWidget): Widget {
  return {
    id: row.id,
    board_id: row.board_id,
    user_id: row.user_id,
    title: row.title ?? null,
    type: row.type,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    category: row.category ?? undefined,
    config: (row.config as Record<string, unknown>) ?? {},
    data: (row.data as Record<string, unknown>) ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function widgetToRow(w: Widget): SupabaseWidget {
  return {
    id: w.id,
    board_id: w.board_id,
    user_id: w.user_id,
    title: w.title,
    type: w.type,
    x: w.x,
    y: w.y,
    width: w.width,
    height: w.height,
    category: w.category ?? null,
    config: w.config,
    data: w.data,
    created_at: w.created_at,
    updated_at: w.updated_at,
  }
}