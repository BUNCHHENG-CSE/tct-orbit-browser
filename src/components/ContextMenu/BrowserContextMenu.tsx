import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Save,
  Printer,
  QrCode,
  Camera,
  ChevronRight,
  Code2,
  RefreshCcw,
  Copy,
  ExternalLink,
  BookmarkPlus,
  FileCode,
  Search,
  Undo,
  Redo,
  Scissors,
  Clipboard,
  ClipboardPaste,
  Check,
  Download,
  FileDown,
  X,
  Volume2,
  VolumeX,
  Pin,
  PinOff,
  ShieldCheck
} from 'lucide-react'
import { cleanUrl } from '@/lib/urlCleaner'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useThemeStore } from '@/store/useThemeStore'
import { useSettings } from '@/hooks/useSettings'
import { modKey } from '@/lib/platform'
import { buildSearchUrl, SEARCH_ENGINES, type SearchEngineId } from '@/lib/searchEngines'
import { resolveIsDark } from '@/lib/theme'
import { toast } from 'sonner'
import type { ContextMenuEventData } from '@/types/api'

interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  webContentsId: number
  webContentsX: number
  webContentsY: number
  canGoBack: boolean
  canGoForward: boolean
  pageURL: string
  linkURL?: string
  srcURL?: string
  mediaType?: string
  hasImageContents?: boolean
  selectionText?: string
  isEditable?: boolean
  dictionarySuggestions?: string[]
}

export const BrowserContextMenu: React.FC = () => {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [activeSubmenu, setActiveSubmenu] = useState<'moreTools' | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const menuRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  const submenuTimerRef = useRef<NodeJS.Timeout | null>(null)

  const clearSubmenuTimer = useCallback(() => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current)
      submenuTimerRef.current = null
    }
  }, [])

  const openSubmenu = useCallback(() => {
    clearSubmenuTimer()
    setActiveSubmenu('moreTools')
  }, [clearSubmenuTimer])

  const scheduleCloseSubmenu = useCallback((delay = 450) => {
    clearSubmenuTimer()
    submenuTimerRef.current = setTimeout(() => {
      setActiveSubmenu(null)
    }, delay)
  }, [clearSubmenuTimer])

  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)
  const setQrModal = useBrowserStore((s) => s.setQrModal)
  const setDevToolsOpen = useBrowserStore((s) => s.setDevToolsOpen)
  const { settings } = useSettings()

  const activeTab = activeSpaceId ? tabsBySpace[activeSpaceId]?.find((t) => t.id === activeTabId) : null

  // Close context menu
  const closeMenu = useCallback(() => {
    clearSubmenuTimer()
    setMenu(null)
    setActiveSubmenu(null)
    setFocusedIndex(-1)
  }, [clearSubmenuTimer])

  useEffect(() => {
    return () => {
      clearSubmenuTimer()
    }
  }, [clearSubmenuTimer])

  // Listen to IPC context-menu:open from Electron main
  useEffect(() => {
    if (!api.contextMenu?.onOpen) return

    const unsub = api.contextMenu.onOpen((data: ContextMenuEventData) => {
      // Find the active webview element to get its exact viewport coordinates
      const activeWebview = document.querySelector('div[style*="display: flex"] webview') || document.querySelector('webview')
      let windowX = data.params.x
      let windowY = data.params.y

      if (activeWebview) {
        const rect = activeWebview.getBoundingClientRect()
        windowX = rect.left + data.params.x
        windowY = rect.top + data.params.y
      }

      setMenu({
        isOpen: true,
        x: windowX,
        y: windowY,
        webContentsId: data.webContentsId,
        webContentsX: data.params.x,
        webContentsY: data.params.y,
        canGoBack: data.canGoBack,
        canGoForward: data.canGoForward,
        pageURL: data.pageURL || activeTab?.url || '',
        linkURL: data.params.linkURL,
        srcURL: data.params.srcURL,
        mediaType: data.params.mediaType,
        hasImageContents: data.params.hasImageContents,
        selectionText: data.params.selectionText,
        isEditable: data.params.isEditable,
        dictionarySuggestions: data.params.dictionarySuggestions
      })
      setActiveSubmenu(null)
      setFocusedIndex(-1)
    })

    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [activeTab?.url])

  // Listen to IPC context-menu:close from main process (e.g. when webview gains focus or is clicked)
  useEffect(() => {
    if (!api.contextMenu?.onClose) return
    const unsub = api.contextMenu.onClose(() => {
      closeMenu()
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [closeMenu])

  // Close menu on tab switch, window resize, or active tab navigation
  useEffect(() => {
    closeMenu()
  }, [activeTabId, activeTab?.url, closeMenu])

  useEffect(() => {
    const handleResize = () => closeMenu()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [closeMenu])

  // Click outside and scroll listener
  useEffect(() => {
    if (!menu?.isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }

    const handleWindowBlur = () => closeMenu()
    const handleScroll = () => closeMenu()

    window.addEventListener('mousedown', handleClickOutside, true)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [menu?.isOpen, closeMenu])

  // Keyboard navigation
  useEffect(() => {
    if (!menu?.isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (activeSubmenu) {
          setActiveSubmenu(null)
        } else {
          closeMenu()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menu?.isOpen, activeSubmenu, closeMenu])

  if (!menu || !menu.isOpen) return null

  // Calculate clamped viewport positions (collision detection)
  const MENU_WIDTH = 240
  const MENU_HEIGHT = 420
  const SUBMENU_WIDTH = 220

  let posX = menu.x
  let posY = menu.y

  if (posX + MENU_WIDTH > window.innerWidth) {
    posX = Math.max(8, window.innerWidth - MENU_WIDTH - 12)
  }
  if (posY + MENU_HEIGHT > window.innerHeight) {
    posY = Math.max(8, window.innerHeight - MENU_HEIGHT - 12)
  }

  // Submenu placement: flush with 4px overlap to eliminate dead gap
  const fitsOnRight = posX + MENU_WIDTH + SUBMENU_WIDTH + 8 <= window.innerWidth
  const subPlacement: 'right' | 'left' = fitsOnRight ? 'right' : 'left'
  const subOffsetX = subPlacement === 'right' ? MENU_WIDTH - 4 : -(SUBMENU_WIDTH - 4)

  // Action helpers
  const handleInspect = async () => {
    closeMenu()
    setDevToolsOpen(true)
    if (api.devtools?.inspect) {
      await api.devtools.inspect(menu.webContentsId, menu.webContentsX, menu.webContentsY)
    }
  }

  const handleDevTools = async () => {
    closeMenu()
    setDevToolsOpen(true)
    if (api.devtools?.open) {
      await api.devtools.open(menu.webContentsId)
    }
  }

  const handleBack = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'goBack')
  }

  const handleForward = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'goForward')
  }

  const handleRefresh = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'reload')
  }

  const handleHardReload = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'reloadIgnoringCache')
    toast.info('Reloading without cache')
  }

  const handleSaveAs = async () => {
    closeMenu()
    await api.webview.saveAs(menu.webContentsId)
  }

  const handlePrint = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'print', [{ silent: false, printBackground: true }])
  }

  const handleSavePdf = async () => {
    closeMenu()
    try {
      const res = await api.webview?.saveAsPdf(menu.webContentsId)
      if (res?.success && res.filePath) {
        toast.success('Page saved as PDF', {
          description: res.filePath,
          action: {
            label: 'Show in Folder',
            onClick: () => {
              api.downloads?.showInFolder(res.filePath!)
            }
          }
        })
      } else if (res?.error) {
        toast.error(res.error)
      }
    } catch {
      toast.error('Failed to export PDF')
    }
  }

  const handleCreateQr = (urlToUse: string, title: string) => {
    closeMenu()
    setQrModal({
      isOpen: true,
      url: urlToUse,
      title: title || 'QR Code'
    })
  }

  const handleScreenshot = async () => {
    closeMenu()
    const success = await api.webview.captureScreenshot(menu.webContentsId)
    if (success) {
      toast.success('Screenshot copied to clipboard!')
    } else {
      toast.error('Failed to capture screenshot')
    }
  }

  const handleCopyPageUrl = () => {
    closeMenu()
    const pageUrl = menu.pageURL || activeTab?.url || ''
    navigator.clipboard.writeText(pageUrl)
    toast.success('Page URL copied to clipboard')
  }

  const handleCopyCleanPageUrl = () => {
    closeMenu()
    const pageUrl = menu.pageURL || activeTab?.url || ''
    if (pageUrl) {
      const sanitized = cleanUrl(pageUrl)
      navigator.clipboard.writeText(sanitized)
      toast.success('Clean page URL copied (trackers stripped)')
    }
  }

  const handleOpenExternal = () => {
    closeMenu()
    const pageUrl = menu.pageURL || activeTab?.url || ''
    if (pageUrl) {
      api.navigation.openExternal(pageUrl)
    }
  }

  const handleBookmark = () => {
    closeMenu()
    toast.success('Bookmark saved!')
  }

  const handleViewSource = async () => {
    closeMenu()
    const targetSpace = activeSpaceId || useBrowserStore.getState().spaces[0]?.id
    if (targetSpace && menu.pageURL) {
      const srcUrl = menu.pageURL.startsWith('view-source:') ? menu.pageURL : `view-source:${menu.pageURL}`
      const newTab = await api.tabs.create({
        spaceId: targetSpace,
        url: srcUrl,
        title: `Source of ${activeTab?.title || 'page'}`
      })
      useBrowserStore.getState().addTabToStore(targetSpace, newTab, activeTabId, true)
    }
  }

  // Link actions
  const handleOpenLinkInNewTab = async () => {
    closeMenu()
    if (menu.linkURL && activeSpaceId) {
      const newTab = await api.tabs.create({
        spaceId: activeSpaceId,
        url: menu.linkURL,
        title: 'Loading...'
      })
      useBrowserStore.getState().addTabToStore(activeSpaceId, newTab, activeTabId, true)
    }
  }

  const handleCopyLink = () => {
    closeMenu()
    if (menu.linkURL) {
      navigator.clipboard.writeText(menu.linkURL)
      toast.success('Link copied to clipboard')
    }
  }

  const handleCopyCleanLink = () => {
    closeMenu()
    if (menu.linkURL) {
      const sanitized = cleanUrl(menu.linkURL)
      navigator.clipboard.writeText(sanitized)
      toast.success('Clean link copied (trackers stripped)')
    }
  }

  const handleSaveLink = () => {
    closeMenu()
    if (menu.linkURL) {
      api.webview.call(menu.webContentsId, 'downloadURL', menu.linkURL)
    }
  }

  // Image actions
  const handleOpenImageInNewTab = async () => {
    closeMenu()
    if (menu.srcURL && activeSpaceId) {
      const newTab = await api.tabs.create({
        spaceId: activeSpaceId,
        url: menu.srcURL,
        title: 'Image'
      })
      useBrowserStore.getState().addTabToStore(activeSpaceId, newTab, activeTabId, true)
    }
  }

  const handleSaveImage = () => {
    closeMenu()
    if (menu.srcURL) {
      api.webview.call(menu.webContentsId, 'downloadURL', menu.srcURL)
    }
  }

  const handleCopyImage = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'copyImageAt', menu.webContentsX, menu.webContentsY)
    toast.success('Image copied to clipboard')
  }

  const handleCopyImageAddress = () => {
    closeMenu()
    if (menu.srcURL) {
      navigator.clipboard.writeText(menu.srcURL)
      toast.success('Image address copied to clipboard')
    }
  }

  // Text Selection actions
  const handleCopyText = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'copy')
    toast.success('Copied to clipboard')
  }

  const handleSearchSelection = async () => {
    closeMenu()
    if (menu.selectionText && activeSpaceId) {
      const engine = (settings?.defaultSearchEngine as SearchEngineId) || 'duckduckgo'
      const isDark = resolveIsDark(settings?.theme)
      const searchUrl = buildSearchUrl(menu.selectionText.trim(), engine, isDark)
      const newTab = await api.tabs.create({
        spaceId: activeSpaceId,
        url: searchUrl,
        title: `${menu.selectionText.trim()} - Search`
      })
      useBrowserStore.getState().addTabToStore(activeSpaceId, newTab, activeTabId, true)
    }
  }

  // Editable input actions
  const handleUndo = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'undo')
  }
  const handleRedo = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'redo')
  }
  const handleCut = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'cut')
  }
  const handlePaste = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'paste')
  }
  const handlePastePlain = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'pasteAndMatchStyle')
  }
  const handleSelectAll = () => {
    closeMenu()
    api.webview.call(menu.webContentsId, 'selectAll')
  }

  const isLink = !!menu.linkURL
  const isImage = !!menu.srcURL || !!menu.hasImageContents || menu.mediaType === 'image'
  const isTextSelected = !!menu.selectionText && menu.selectionText.trim().length > 0
  const isEditable = !!menu.isEditable

  return (
    <>
      {/* Invisible full-screen backdrop layer covering the entire window and webview to guarantee
          immediate dismissal whenever the user clicks or scrolls outside the context menu */}
      <div
        className="fixed inset-0 z-[99] cursor-default select-none pointer-events-auto"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.001)' }}
        onMouseDown={(e) => {
          e.stopPropagation()
          closeMenu()
        }}
        onWheel={(e) => {
          e.stopPropagation()
          closeMenu()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          closeMenu()
        }}
      />

      <div
        ref={menuRef}
        style={{ top: posY, left: posX }}
        className="fixed z-[100] w-[240px] rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-xl p-1 select-none animate-in fade-in-50 zoom-in-95 duration-100 text-xs font-medium"
        onContextMenu={(e) => e.preventDefault()}
      >
      {/* 1. LINK CONTEXT */}
      {isLink && (
        <>
          <MenuItem
            icon={<ExternalLink className="w-4 h-4 text-primary" />}
            label="Open link in new tab"
            onClick={handleOpenLinkInNewTab}
          />
          <MenuItem
            icon={<ExternalLink className="w-4 h-4" />}
            label="Open link in new window"
            onClick={handleOpenLinkInNewTab}
          />
          <MenuItem
            icon={<Copy className="w-4 h-4" />}
            label="Copy link address"
            onClick={handleCopyLink}
          />
          <MenuItem
            icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
            label="Copy Clean Link (No Trackers)"
            onClick={handleCopyCleanLink}
          />
          <MenuItem
            icon={<Save className="w-4 h-4" />}
            label="Save link as..."
            onClick={handleSaveLink}
          />
          <MenuItem
            icon={<QrCode className="w-4 h-4 text-emerald-500" />}
            label="Create QR Code for this link"
            onClick={() => handleCreateQr(menu.linkURL!, 'Link QR Code')}
          />
          <Divider />
        </>
      )}

      {/* 2. IMAGE CONTEXT */}
      {isImage && (
        <>
          <MenuItem
            icon={<ExternalLink className="w-4 h-4 text-primary" />}
            label="Open image in new tab"
            onClick={handleOpenImageInNewTab}
          />
          <MenuItem
            icon={<Save className="w-4 h-4" />}
            label="Save image as..."
            onClick={handleSaveImage}
          />
          <MenuItem
            icon={<Copy className="w-4 h-4" />}
            label="Copy image"
            onClick={handleCopyImage}
          />
          <MenuItem
            icon={<Copy className="w-4 h-4" />}
            label="Copy image address"
            onClick={handleCopyImageAddress}
          />
          <Divider />
        </>
      )}

      {/* 3. TEXT SELECTION CONTEXT */}
      {isTextSelected && !isEditable && (
        <>
          <MenuItem
            icon={<Copy className="w-4 h-4" />}
            label="Copy"
            shortcut={`${modKey}+C`}
            onClick={handleCopyText}
          />
          <MenuItem
            icon={<Search className="w-4 h-4 text-primary" />}
            label={`Search for "${menu.selectionText!.length > 18 ? menu.selectionText!.slice(0, 18) + '…' : menu.selectionText}"`}
            onClick={handleSearchSelection}
          />
          <Divider />
          <MenuItem
            icon={<Printer className="w-4 h-4" />}
            label="Print..."
            shortcut={`${modKey}+P`}
            onClick={handlePrint}
          />
          <MenuItem
            icon={<FileDown className="w-4 h-4 text-primary" />}
            label="Save as PDF..."
            onClick={handleSavePdf}
          />
          <Divider />
        </>
      )}

      {/* 4. EDITABLE INPUT CONTEXT */}
      {isEditable && (
        <>
          {menu.dictionarySuggestions && menu.dictionarySuggestions.length > 0 && (
            <>
              {menu.dictionarySuggestions.slice(0, 3).map((sug, i) => (
                <MenuItem
                  key={i}
                  icon={<Check className="w-4 h-4 text-primary" />}
                  label={sug}
                  onClick={() => {
                    closeMenu()
                    api.webview.call(menu.webContentsId, 'replaceMisspelling', sug)
                  }}
                />
              ))}
              <Divider />
            </>
          )}
          <MenuItem
            icon={<Undo className="w-4 h-4" />}
            label="Undo"
            shortcut={`${modKey}+Z`}
            onClick={handleUndo}
          />
          <MenuItem
            icon={<Redo className="w-4 h-4" />}
            label="Redo"
            shortcut={`${modKey}+Y`}
            onClick={handleRedo}
          />
          <Divider />
          <MenuItem
            icon={<Scissors className="w-4 h-4" />}
            label="Cut"
            shortcut={`${modKey}+X`}
            onClick={handleCut}
          />
          <MenuItem
            icon={<Copy className="w-4 h-4" />}
            label="Copy"
            shortcut={`${modKey}+C`}
            onClick={handleCopyText}
          />
          <MenuItem
            icon={<Clipboard className="w-4 h-4" />}
            label="Paste"
            shortcut={`${modKey}+V`}
            onClick={handlePaste}
          />
          <MenuItem
            icon={<ClipboardPaste className="w-4 h-4" />}
            label="Paste as plain text"
            shortcut={`${modKey}+Shift+V`}
            onClick={handlePastePlain}
          />
          <MenuItem
            icon={<Check className="w-4 h-4" />}
            label="Select all"
            shortcut={`${modKey}+A`}
            onClick={handleSelectAll}
          />
          <Divider />
        </>
      )}

      {/* 5. BLANK PAGE CONTEXT (when neither Link, Image, Selection, nor Editable) */}
      {!isLink && !isImage && !isTextSelected && !isEditable && (
        <>
          <MenuItem
            icon={<ArrowLeft className="w-4 h-4" />}
            label="Back"
            shortcut="Alt+←"
            disabled={!menu.canGoBack}
            onClick={handleBack}
          />
          <MenuItem
            icon={<ArrowRight className="w-4 h-4" />}
            label="Forward"
            shortcut="Alt+→"
            disabled={!menu.canGoForward}
            onClick={handleForward}
          />
          <MenuItem
            icon={<RotateCw className="w-4 h-4" />}
            label="Refresh"
            shortcut={`${modKey}+R`}
            onClick={handleRefresh}
          />
          <Divider />
          <MenuItem
            icon={<Save className="w-4 h-4" />}
            label="Save as..."
            shortcut={`${modKey}+S`}
            onClick={handleSaveAs}
          />
          <MenuItem
            icon={<Printer className="w-4 h-4" />}
            label="Print..."
            shortcut={`${modKey}+P`}
            onClick={handlePrint}
          />
          <MenuItem
            icon={<FileDown className="w-4 h-4 text-primary" />}
            label="Save as PDF..."
            onClick={handleSavePdf}
          />
          <Divider />
          <MenuItem
            icon={<QrCode className="w-4 h-4 text-emerald-500" />}
            label="Create QR Code for this page"
            onClick={() => handleCreateQr(menu.pageURL, activeTab?.title || 'Page QR Code')}
          />
          <Divider />
          <MenuItem
            icon={<Camera className="w-4 h-4 text-amber-500" />}
            label="Screenshot"
            shortcut={`${modKey}+Shift+S`}
            onClick={handleScreenshot}
            onMouseEnter={() => {
              if (activeSubmenu) scheduleCloseSubmenu(400)
            }}
          />

          {/* More Tools Submenu */}
          <div
            className="relative"
            onMouseEnter={openSubmenu}
            onMouseLeave={() => scheduleCloseSubmenu(450)}
          >
            <div
              onClick={() => {
                clearSubmenuTimer()
                setActiveSubmenu((prev) => (prev === 'moreTools' ? null : 'moreTools'))
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors group ${
                activeSubmenu === 'moreTools'
                  ? 'bg-accent text-accent-foreground font-semibold'
                  : 'hover:bg-accent text-foreground'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Code2
                  className={`w-4 h-4 transition-colors ${
                    activeSubmenu === 'moreTools'
                      ? 'text-primary'
                      : 'text-muted-foreground group-hover:text-foreground'
                  }`}
                />
                <span>More tools</span>
              </div>
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${
                  activeSubmenu === 'moreTools'
                    ? 'text-primary translate-x-0.5'
                    : 'text-muted-foreground'
                }`}
              />
            </div>

            {/* Docked / Detached Submenu Pane */}
            {activeSubmenu === 'moreTools' && (
              <div
                ref={submenuRef}
                style={{ top: -6, left: subOffsetX }}
                onMouseEnter={openSubmenu}
                onMouseLeave={() => scheduleCloseSubmenu(450)}
                className="absolute z-[110] w-[220px] rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-xl p-1 select-none animate-in fade-in-50 zoom-in-95 duration-100"
              >
                {/* Generous hover corridor between main menu item and submenu pane */}
                <div
                  className={`absolute -top-3 -bottom-3 pointer-events-auto ${
                    subPlacement === 'right' ? '-left-6 w-8' : '-right-6 w-8'
                  }`}
                />

                <MenuItem
                  icon={<Code2 className="w-4 h-4 text-primary" />}
                  label="Developer Tools"
                  shortcut="F12"
                  onClick={handleDevTools}
                />
                <MenuItem
                  icon={<RefreshCcw className="w-4 h-4" />}
                  label="Hard Reload & Clear Cache"
                  shortcut={`${modKey}+Shift+R`}
                  onClick={handleHardReload}
                />
                <MenuItem
                  icon={<Copy className="w-4 h-4" />}
                  label="Copy Page URL"
                  onClick={handleCopyPageUrl}
                />
                <MenuItem
                  icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
                  label="Copy Clean Page URL"
                  onClick={handleCopyCleanPageUrl}
                />
                <MenuItem
                  icon={<ExternalLink className="w-4 h-4" />}
                  label="Open in External Browser"
                  onClick={handleOpenExternal}
                />
                <MenuItem
                  icon={<BookmarkPlus className="w-4 h-4" />}
                  label="Bookmark this page"
                  shortcut={`${modKey}+D`}
                  onClick={handleBookmark}
                />
              </div>
            )}
          </div>

          <Divider />
          <MenuItem
            icon={<FileCode className="w-4 h-4" />}
            label="View page source"
            shortcut={`${modKey}+U`}
            onClick={handleViewSource}
            onMouseEnter={() => {
              if (activeSubmenu) scheduleCloseSubmenu(400)
            }}
          />
        </>
      )}

      {/* ALWAYS PRESENT: Inspect */}
      <MenuItem
        icon={<Code2 className="w-4 h-4 text-primary" />}
        label="Inspect"
        shortcut={`${modKey}+Shift+I`}
        onClick={handleInspect}
        onMouseEnter={() => {
          if (activeSubmenu) scheduleCloseSubmenu(120)
        }}
      />
    </div>
    </>
  )
}

// Subcomponent: Menu Item
interface MenuItemProps {
  icon?: React.ReactNode
  label: string
  shortcut?: string
  disabled?: boolean
  onClick: () => void
  onMouseEnter?: () => void
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, shortcut, disabled, onClick, onMouseEnter }) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer outline-none focus:bg-accent focus:text-accent-foreground ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-muted-foreground'
          : 'hover:bg-accent text-foreground'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      {shortcut && (
        <span className="text-[10.5px] font-mono text-muted-foreground tracking-tighter shrink-0 pl-2">
          {shortcut}
        </span>
      )}
    </button>
  )
}

// Subcomponent: Divider
const Divider: React.FC = () => <div className="h-px bg-border my-1 mx-1" />

// QR Code Modal Dialog
export const QrCodeModal: React.FC = () => {
  const qrModal = useBrowserStore((s) => s.qrModal)
  const setQrModal = useBrowserStore((s) => s.setQrModal)
  const [copied, setCopied] = useState(false)

  if (!qrModal.isOpen) return null

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrModal.url)}`

  const handleCopy = () => {
    navigator.clipboard.writeText(qrModal.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('URL copied to clipboard!')
  }

  const handleDownload = async () => {
    try {
      const response = await fetch(qrImageUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'tct-orbit-qr.png'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('QR Code downloaded!')
    } catch {
      toast.error('Could not download QR Code')
    }
  }

  return (
    <div className="fixed inset-0 z-[120] bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card text-card-foreground shadow-2xl p-6 relative animate-in fade-in-50 zoom-in-95 duration-150">
        <button
          onClick={() => setQrModal({ isOpen: false, url: '', title: '' })}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-4">
          <h3 className="text-base font-bold text-foreground">{qrModal.title || 'QR Code'}</h3>
          <p className="text-xs text-muted-foreground mt-1 truncate max-w-xs mx-auto font-mono">
            {qrModal.url}
          </p>
        </div>

        <div className="flex justify-center my-4">
          <div className="p-3 bg-white rounded-2xl shadow-md border border-border">
            <img
              src={qrImageUrl}
              alt="QR Code"
              className="w-48 h-48 object-contain"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={handleCopy}
            className="flex-1 py-2 px-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 border border-border transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy URL'}</span>
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 py-2 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PNG</span>
          </button>
        </div>
      </div>
    </div>
  )
}
