/**
 * src/components/analytics/store/useWorkspaceStore.ts
 *
 * Zustand store — single source of truth for the entire workspace.
 *
 * Responsibilities:
 *  - Board CRUD (create / rename / delete / switch)
 *  - Widget CRUD (add / update / delete) per board
 *  - Canvas transform state (pan x/y + scale)
 *  - Supabase sync for all mutations
 *  - Optimistic in-memory updates: UI updates immediately, Supabase follows
 *  - Debounced position/size saves (widget move / resize generates many events)
 *  - Undo / Redo (Ctrl+Z / Ctrl+Y) for create, delete, and text edits
 *
 * No localStorage. Supabase is the only persistence layer.
 *
 * Dependencies:
 *   npm install zustand nanoid @supabase/supabase-js
 */

import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import type { SupabaseWidget, SupabaseBoard } from './types'

// ─── Public Types (re-exported for consumers) ─────────────────────────────────

export interface Widget {
  id: string
  board_id: string
  user_id: string
  title: string | null         // null → UI falls back to TYPE_LABELS[type]
  type: string                 // 'note' | 'kpi' | 'chart' | ...
  x: number                    // canvas-space coordinate
  y: number                    // canvas-space coordinate
  width: number                // canvas-space size
  height: number               // canvas-space size
  category?: string            // 'revenue' | 'conversion' | 'content' | 'notes'
  config: Record<string, unknown>   // user-defined intent (metric, dateRange, …)
  data: Record<string, unknown>     // last machine-written payload (fetched values)
  created_at: string
  updated_at: string
}

export interface Board {
  id: string
  user_id: string
  name: string
  background_color: string     // canvas background — defaults to '#111827'
  created_at: string
  updated_at: string
}

export interface CanvasTransform {
  x: number       // pan offset in px
  y: number       // pan offset in px
  scale: number   // zoom multiplier (1 = 100%)
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
  widgetsByBoard: Record<string, Widget[]>   // boardId → Widget[]
  transform: CanvasTransform
  isSaving: boolean
  clearWorkspace: () => void

  // ── History ────────────────────────────────────────────────────────────────
  canUndo: boolean
  canRedo: boolean
  undo: () => Promise<void>
  redo: () => Promise<void>
  /** Internal: push an entry onto history. Called by add/delete/update. */
  _recordHistory: (entry: HistoryEntry) => void

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  /** Load all boards (and their widgets) for the given user from Supabase. */
  loadBoards: (userId: string) => Promise<void>

  // ── Canvas ─────────────────────────────────────────────────────────────────
  pan: (dx: number, dy: number) => void
  zoom: (delta: number, originX: number, originY: number) => void
  resetView: () => void

  // ── Boards ─────────────────────────────────────────────────────────────────
  createBoard: (name: string, userId: string) => Promise<void>
  renameBoard: (boardId: string, name: string) => Promise<void>
  deleteBoard: (boardId: string) => Promise<void>
  switchBoard: (boardId: string) => void
  setBoardColor: (boardId: string, color: string) => Promise<void>

  // ── Widgets ────────────────────────────────────────────────────────────────
  addWidget: (partial: Omit<Widget, 'created_at' | 'updated_at'>) => Promise<void>
  updateWidget: (id: string, patch: Partial<Widget>) => void
  deleteWidget: (id: string) => Promise<void>

  /** Derived helper: widgets for the currently active board. */
  activeWidgets: () => Widget[]

  /** Convert a screen-space point to canvas-space coordinates. */
  toCanvasPoint: (screenX: number, screenY: number) => Point
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_SCALE = 0.1
const MAX_SCALE = 4.0
const INITIAL_TRANSFORM: CanvasTransform = { x: 0, y: 0, scale: 1 }
const DEFAULT_BG_COLOR = '#111827'

// Debounce map: widgetId → timeout handle
// Stored outside Zustand to avoid triggering re-renders
const saveDebounceMap = new Map<string, ReturnType<typeof setTimeout>>()
const SAVE_DEBOUNCE_MS = 600

// ─── History (module-level, outside Zustand state) ────────────────────────────
//
// Stored outside Zustand so the stacks don't trigger re-renders on every push.
// Only `canUndo` / `canRedo` booleans live in Zustand state and cause renders.

const MAX_HISTORY = 50

const historyStack = {
  past:   [] as HistoryEntry[],
  future: [] as HistoryEntry[],
}

// Prevents undo/redo from re-recording the inverse action as a new history entry
let _isUndoing = false

// Debounce for UPDATE_WIDGET history entries (text edits fire on every keystroke)
// Maps widgetId → { timeoutHandle, stateBeforeEdit }
const historyDebounceMap = new Map<string, {
  handle: ReturnType<typeof setTimeout>
  before: Partial<Widget>
}>()
const HISTORY_DEBOUNCE_MS = 800  // slightly longer than save debounce

// ─── Store Implementation ─────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  boards: [],
  activeBoardId: null,
  widgetsByBoard: {},
  transform: INITIAL_TRANSFORM,
  isSaving: false,

  // ── History state ──────────────────────────────────────────────────────────
  canUndo: false,
  canRedo: false,

  _recordHistory: (entry) => {
    // Skip recording when the mutation was triggered by undo/redo itself
    if (_isUndoing) return

    historyStack.past.push(entry)

    // Cap history at MAX_HISTORY entries
    if (historyStack.past.length > MAX_HISTORY) {
      historyStack.past.splice(0, historyStack.past.length - MAX_HISTORY)
    }

    // Any new action wipes the redo future
    historyStack.future = []

    set({ canUndo: true, canRedo: false })
  },

  undo: async () => {
    const entry = historyStack.past.pop()
    if (!entry) return

    historyStack.future.push(entry)
    set({
      canUndo: historyStack.past.length > 0,
      canRedo: true,
    })

    _isUndoing = true
    try {
      await applyInverse(entry, get())
    } finally {
      _isUndoing = false
    }
  },

  redo: async () => {
    const entry = historyStack.future.pop()
    if (!entry) return

    historyStack.past.push(entry)
    set({
      canUndo: true,
      canRedo: historyStack.future.length > 0,
    })

    _isUndoing = true
    try {
      await applyForward(entry, get())
    } finally {
      _isUndoing = false
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Bootstrap
  // ─────────────────────────────────────────────────────────────────────────

  loadBoards: async (userId) => {
    // Fetch all boards for this user
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

    // If user has no boards yet, create a default one
    if (boards.length === 0) {
      await get().createBoard('My Workspace', userId)
      return
    }

    // Fetch all widgets for all boards in a single query
    const boardIds = boards.map((b) => b.id)
    const { data: widgetRows, error: widgetError } = await supabase
      .from('widgets')
      .select('*')
      .in('board_id', boardIds)
      .eq('user_id', userId)

    if (widgetError) throw widgetError

    // Group widgets by board
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
    })
  },

  pan: (dx, dy) => {
    set((s) => ({
      transform: {
        ...s.transform,
        x: s.transform.x + dx,
        y: s.transform.y + dy,
      },
    }))
  },

  zoom: (delta, originX, originY) => {
    set((s) => {
      const { x, y, scale } = s.transform
      const factor = delta > 0 ? 1.08 : 0.926
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))

      // Zoom toward the pointer origin: keep the canvas point under the cursor
      // fixed as scale changes.
      // Formula: newPan = origin - (origin - oldPan) * (nextScale / oldScale)
      const nextX = originX - (originX - x) * (nextScale / scale)
      const nextY = originY - (originY - y) * (nextScale / scale)

      return { transform: { x: nextX, y: nextY, scale: nextScale } }
    })
  },

  resetView: () => {
    set({ transform: INITIAL_TRANSFORM })
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Boards
  // ─────────────────────────────────────────────────────────────────────────

  createBoard: async (name, userId) => {
    const now = new Date().toISOString()
    const optimisticId = crypto.randomUUID()

    const newBoard: Board = {
      id: optimisticId,
      user_id: userId,
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

    // Persist to Supabase
    const { data, error } = await supabase
      .from('boards')
      .insert({ name, user_id: userId, background_color: DEFAULT_BG_COLOR })
      .select()
      .single()

    if (error) {
      // Roll back optimistic board
      set((s) => ({
        boards: s.boards.filter((b) => b.id !== optimisticId),
        widgetsByBoard: Object.fromEntries(
          Object.entries(s.widgetsByBoard).filter(([k]) => k !== optimisticId)
        ),
        activeBoardId: s.boards[0]?.id ?? null,
      }))
      throw error
    }

    // Replace optimistic ID with real DB-assigned ID
    const realBoard = data as SupabaseBoard
    set((s) => ({
      boards: s.boards.map((b) =>
        b.id === optimisticId
          ? { ...b, id: realBoard.id, background_color: realBoard.background_color ?? DEFAULT_BG_COLOR }
          : b
      ),
      widgetsByBoard: Object.fromEntries(
        Object.entries(s.widgetsByBoard).map(([k, v]) =>
          k === optimisticId ? [realBoard.id, v] : [k, v]
        )
      ),
      activeBoardId: realBoard.id,
    }))
  },

  renameBoard: async (boardId, name) => {
    // Optimistic
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
    if (boards.length <= 1) return  // always keep at least one board

    const remainingBoards = boards.filter((b) => b.id !== boardId)

    set((s) => ({
      boards: remainingBoards,
      activeBoardId:
        s.activeBoardId === boardId ? remainingBoards[0]?.id ?? null : s.activeBoardId,
      widgetsByBoard: Object.fromEntries(
        Object.entries(s.widgetsByBoard).filter(([k]) => k !== boardId)
      ),
    }))

    const { error } = await supabase.from('boards').delete().eq('id', boardId)
    if (error) throw error
    // widgets are CASCADE deleted by the FK constraint
  },

  switchBoard: (boardId) => {
    set({ activeBoardId: boardId, transform: INITIAL_TRANSFORM })
  },

  setBoardColor: async (boardId, color) => {
    // Optimistic
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
  // Widgets
  // ─────────────────────────────────────────────────────────────────────────

  addWidget: async (partial) => {
    const now = new Date().toISOString()
    const widget: Widget = {
      ...partial,
      created_at: now,
      updated_at: now,
    }

    // Optimistic
    set((s) => ({
      widgetsByBoard: {
        ...s.widgetsByBoard,
        [widget.board_id]: [...(s.widgetsByBoard[widget.board_id] ?? []), widget],
      },
    }))

    // ── Record history ──────────────────────────────────────────────────────
    get()._recordHistory({ type: 'ADD_WIDGET', widget })

    if (widget.user_id === 'guest') return  // guest mode: no Supabase

    console.log('===================')
    console.log('WIDGET INSERT')
    console.log('widget.id =', widget.id)
    console.log('widget.board_id =', widget.board_id)
    console.log('widget.user_id =', widget.user_id)
    console.log('===================')

    const payload = widgetToRow(widget)

    console.log('INSERT PAYLOAD', payload)

    const { error } = await supabase
      .from('widgets')
      .insert(payload)

    if (error) {
      console.error('SUPABASE INSERT ERROR', error)

      // Roll back
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
    // ── Capture the widget state BEFORE this edit sequence starts ───────────
    // We only capture `before` on the first keystroke of a debounce window;
    // subsequent keystrokes extend the timer but keep the original `before`.
    if (!_isUndoing) {
      const existingDebounce = historyDebounceMap.get(id)

      // Snapshot the fields being patched, from the current (pre-patch) state
      const before: Partial<Widget> = existingDebounce?.before ?? (() => {
        const allWidgets = Object.values(get().widgetsByBoard).flat()
        const current = allWidgets.find((w) => w.id === id)
        if (!current) return patch
        // Capture only the keys that are changing
        return Object.fromEntries(
          Object.keys(patch).map((k) => [k, (current as Record<string, unknown>)[k]])
        ) as Partial<Widget>
      })()

      if (existingDebounce) clearTimeout(existingDebounce.handle)

      historyDebounceMap.set(id, {
        before,
        handle: setTimeout(() => {
          historyDebounceMap.delete(id)
          // Only record if something actually changed
          const allWidgets = Object.values(get().widgetsByBoard).flat()
          const current = allWidgets.find((w) => w.id === id)
          if (!current) return

          const after = Object.fromEntries(
            Object.keys(before).map((k) => [k, (current as Record<string, unknown>)[k]])
          ) as Partial<Widget>

          get()._recordHistory({ type: 'UPDATE_WIDGET', id, before, after })
        }, HISTORY_DEBOUNCE_MS),
      })
    }

    // Optimistic in-memory update (synchronous, no await — used for drag/resize)
    set((s) => {
      const updated: Record<string, Widget[]> = {}
      for (const [boardId, widgets] of Object.entries(s.widgetsByBoard)) {
        updated[boardId] = widgets.map((w) =>
          w.id === id
            ? { ...w, ...patch, updated_at: new Date().toISOString() }
            : w
        )
      }
      return { widgetsByBoard: updated }
    })

    // Debounced Supabase write
    const existing = saveDebounceMap.get(id)
    if (existing) clearTimeout(existing)

    saveDebounceMap.set(
      id,
      setTimeout(async () => {
        saveDebounceMap.delete(id)
        // Read the LATEST state at fire-time, not the captured patch closure.
        // This means a type-then-drag sequence always writes the full correct state.
        const allWidgets = Object.values(get().widgetsByBoard).flat()
        const widget = allWidgets.find((w) => w.id === id)
        if (!widget || widget.user_id === 'guest') return

        set({ isSaving: true })
        const { error } = await supabase
          .from('widgets')
          .update(widgetToRow(widget))   // ← full state, not patch
          .eq('id', id)

        if (error) console.error('[useWorkspaceStore] updateWidget save error:', error)
        set({ isSaving: false })
      }, SAVE_DEBOUNCE_MS)
    )
  },

  deleteWidget: async (id) => {
    // Find the board this widget belongs to
    const { widgetsByBoard } = get()
    let boardId: string | null = null
    for (const [bid, widgets] of Object.entries(widgetsByBoard)) {
      if (widgets.some((w) => w.id === id)) {
        boardId = bid
        break
      }
    }
    if (!boardId) return

    const widget = widgetsByBoard[boardId]?.find((w) => w.id === id)
    if (!widget) return

    // ── Record history BEFORE removal ───────────────────────────────────────
    get()._recordHistory({ type: 'DELETE_WIDGET', widget })

    // Optimistic
    set((s) => ({
      widgetsByBoard: {
        ...s.widgetsByBoard,
        [boardId!]: (s.widgetsByBoard[boardId!] ?? []).filter((w) => w.id !== id),
      },
    }))

    if (widget.user_id === 'guest') return

    const { error } = await supabase.from('widgets').delete().eq('id', id)
    if (error) {
      // Roll back
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
    return {
      x: (screenX - x) / scale,
      y: (screenY - y) / scale,
    }
  },
}))

// ─── History: Apply forward / inverse ────────────────────────────────────────
//
// These run actual store mutations (which go through Supabase normally).
// _isUndoing = true prevents them from re-recording history.

async function applyInverse(entry: HistoryEntry, store: WorkspaceStore): Promise<void> {
  switch (entry.type) {
    case 'ADD_WIDGET':
      await store.deleteWidget(entry.widget.id)
      break
    case 'DELETE_WIDGET':
      await store.addWidget(entry.widget)
      break
    case 'UPDATE_WIDGET':
      store.updateWidget(entry.id, entry.before)
      break
  }
}

async function applyForward(entry: HistoryEntry, store: WorkspaceStore): Promise<void> {
  switch (entry.type) {
    case 'ADD_WIDGET':
      await store.addWidget(entry.widget)
      break
    case 'DELETE_WIDGET':
      await store.deleteWidget(entry.widget.id)
      break
    case 'UPDATE_WIDGET':
      store.updateWidget(entry.id, entry.after)
      break
  }
}

// ─── Row ↔ Widget Mappers ─────────────────────────────────────────────────────

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
