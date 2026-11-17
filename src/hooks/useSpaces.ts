import { useEffect, useState, useCallback } from 'react'
import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import type { CreateSpaceData, UpdateSpaceData, Space } from '@/types/api'

export function useSpaces() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const spaces = useBrowserStore((s) => s.spaces)
  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const setSpaces = useBrowserStore((s) => s.setSpaces)
  const setActiveSpaceId = useBrowserStore((s) => s.setActiveSpaceId)
  const addSpaceToStore = useBrowserStore((s) => s.addSpaceToStore)
  const updateSpaceInStore = useBrowserStore((s) => s.updateSpaceInStore)
  const removeSpaceFromStore = useBrowserStore((s) => s.removeSpaceFromStore)

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || spaces[0] || null

  const loadSpaces = useCallback(async () => {
    try {
      setLoading(true)
      const list = await api.spaces.list()
      setSpaces(list)
      setError(null)
    } catch (err) {
      console.error('[useSpaces] Error loading spaces:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [setSpaces])

  useEffect(() => {
    loadSpaces()
  }, [loadSpaces])

  const createSpace = async (data: CreateSpaceData): Promise<Space> => {
    try {
      const newSpace = await api.spaces.create(data)
      addSpaceToStore(newSpace)
      return newSpace
    } catch (err) {
      console.error('[useSpaces] Error creating space:', err)
      throw err
    }
  }

  const updateSpace = async (id: string, data: UpdateSpaceData): Promise<Space> => {
    try {
      updateSpaceInStore(id, data)
      const updated = await api.spaces.update(id, data)
      updateSpaceInStore(id, updated)
      return updated
    } catch (err) {
      console.error('[useSpaces] Error updating space:', err)
      loadSpaces() // rollback on error
      throw err
    }
  }

  const removeSpace = async (id: string): Promise<boolean> => {
    try {
      removeSpaceFromStore(id)
      await api.spaces.remove(id)
      return true
    } catch (err) {
      console.error('[useSpaces] Error removing space:', err)
      loadSpaces()
      throw err
    }
  }

  const setActive = async (id: string): Promise<Space> => {
    try {
      setActiveSpaceId(id)
      // optimistic update
      for (const space of spaces) {
        updateSpaceInStore(space.id, { isActive: space.id === id })
      }
      const updated = await api.spaces.setActive(id)
      updateSpaceInStore(id, updated)
      return updated
    } catch (err) {
      console.error('[useSpaces] Error setting active space:', err)
      loadSpaces()
      throw err
    }
  }

  return {
    spaces,
    activeSpace,
    activeSpaceId,
    loading,
    error,
    createSpace,
    updateSpace,
    removeSpace,
    setActive,
    reloadSpaces: loadSpaces
  }
}
