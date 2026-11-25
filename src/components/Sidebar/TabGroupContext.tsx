import React from 'react'
import type { TabGroup } from '@/types/api'

export interface TabGroupActions {
  groups: TabGroup[]
  createGroup: (opts?: { name?: string; parentId?: string | null; tabIds?: string[]; color?: string | null }) => Promise<TabGroup | null>
  moveTabToGroup: (tabId: string, groupId: string | null) => Promise<void>
  /** Group whose name should open in edit mode right after creation */
  editingGroupId: string | null
  setEditingGroupId: (id: string | null) => void
}

export const TabGroupContext = React.createContext<TabGroupActions | null>(null)

export const TAB_DRAG_TYPE = 'application/x-tct-tab-id'
export const GROUP_DRAG_TYPE = 'application/x-tct-group-id'
