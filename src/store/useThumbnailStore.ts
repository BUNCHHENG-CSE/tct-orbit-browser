import { create } from 'zustand'

/** In-memory tab thumbnails for sidebar hover previews (never persisted) */
interface ThumbnailState {
  thumbs: Record<string, { dataUrl: string; at: number }>
  setThumb: (tabId: string, dataUrl: string) => void
  removeThumb: (tabId: string) => void
}

const MAX_THUMBS = 60

export const useThumbnailStore = create<ThumbnailState>((set) => ({
  thumbs: {},
  setThumb: (tabId, dataUrl) =>
    set((state) => {
      const next = { ...state.thumbs, [tabId]: { dataUrl, at: Date.now() } }
      const ids = Object.keys(next)
      if (ids.length > MAX_THUMBS) {
        // Drop the oldest captures
        ids.sort((a, b) => next[a].at - next[b].at)
        for (const id of ids.slice(0, ids.length - MAX_THUMBS)) delete next[id]
      }
      return { thumbs: next }
    }),
  removeThumb: (tabId) =>
    set((state) => {
      if (!state.thumbs[tabId]) return state
      const next = { ...state.thumbs }
      delete next[tabId]
      return { thumbs: next }
    })
}))
