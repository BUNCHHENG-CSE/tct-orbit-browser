import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import {
  Download,
  Search,
  Trash2,
  FolderOpen,
  Folder,
  ExternalLink,
  Copy,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  ArrowDownToLine,
  FileArchive,
  FileCode,
  FileImage,
  FileAudio,
  FileVideo,
  File,
  Check,
  Pause,
  Play,
  Ban
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { modKey } from '@/lib/platform'
import type { DownloadRecord, DownloadProgress, DownloadCompleted } from '@/types/api'

interface DownloadsDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const idx = Math.min(i, sizes.length - 1)
  return parseFloat((bytes / Math.pow(k, idx)).toFixed(dm)) + ' ' + sizes[idx]
}

/** "3 min left", from the current speed */
function timeLeft(item: DownloadRecord): string {
  const speed = item.bytesPerSecond ?? 0
  if (item.isPaused || speed <= 0 || item.totalBytes <= 0) return ''
  const s = Math.ceil((item.totalBytes - item.receivedBytes) / speed)
  if (s < 60) return `${Math.max(1, s)} s left`
  if (s < 3600) return `${Math.ceil(s / 60)} min left`
  return `${Math.floor(s / 3600)} h ${Math.ceil((s % 3600) / 60)} min left`
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return <FileArchive className="w-5 h-5 text-amber-500" />
  }
  if (['exe', 'msi', 'dmg', 'app', 'sh', 'bat', 'js', 'ts', 'html', 'json', 'py'].includes(ext)) {
    return <FileCode className="w-5 h-5 text-indigo-500" />
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp', 'ico'].includes(ext)) {
    return <FileImage className="w-5 h-5 text-emerald-500" />
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) {
    return <FileAudio className="w-5 h-5 text-rose-500" />
  }
  if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) {
    return <FileVideo className="w-5 h-5 text-purple-500" />
  }
  return <File className="w-5 h-5 text-primary" />
}

export const DownloadsDialog: React.FC<DownloadsDialogProps> = ({
  open: propOpen,
  onOpenChange: propOnOpenChange
}) => {
  const storeOpen = useBrowserStore((s) => s.downloadsDialogOpen)
  const setStoreOpen = useBrowserStore((s) => s.setDownloadsDialogOpen)

  const isOpen = propOpen !== undefined ? propOpen : storeOpen
  const setIsOpen = propOnOpenChange || setStoreOpen

  const [downloads, setDownloads] = useState<DownloadRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'progressing' | 'completed' | 'failed'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Fetch all downloads from persistent storage
  const fetchDownloads = useCallback(async () => {
    if (!api.downloads?.list) return
    setLoading(true)
    try {
      const records = await api.downloads.list()
      setDownloads(records || [])
    } catch (err) {
      console.error('[Downloads] Failed to fetch downloads:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchDownloads()
    }
  }, [isOpen, fetchDownloads])

  // Global open-downloads event listener
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true)
    }
    window.addEventListener('open-downloads', handleOpen)
    return () => window.removeEventListener('open-downloads', handleOpen)
  }, [setIsOpen])

  // Live real-time download IPC event listeners
  useEffect(() => {
    const unsubs: (() => void)[] = []

    if (api.downloads?.onStarted) {
      unsubs.push(
        api.downloads.onStarted((data: DownloadCompleted) => {
          setDownloads((prev) => {
            const exists = prev.find((d) => d.id === data.id)
            if (exists) return prev
            const newRecord: DownloadRecord = {
              id: data.id,
              filename: data.filename,
              savePath: data.savePath,
              totalBytes: data.totalBytes,
              receivedBytes: 0,
              state: 'progressing',
              startTime: new Date().toISOString()
            }
            return [newRecord, ...prev]
          })
        })
      )
    }

    if (api.downloads?.onProgress) {
      unsubs.push(
        api.downloads.onProgress((data: DownloadProgress) => {
          setDownloads((prev) =>
            prev.map((d) =>
              d.id === data.id
                ? {
                    ...d,
                    receivedBytes: data.receivedBytes,
                    totalBytes: data.totalBytes,
                    state: data.state,
                    savePath: data.savePath || d.savePath,
                    isPaused: data.isPaused,
                    canResume: data.canResume,
                    bytesPerSecond: data.bytesPerSecond
                  }
                : d
            )
          )
        })
      )
    }

    if (api.downloads?.onCompleted) {
      unsubs.push(
        api.downloads.onCompleted((data: DownloadCompleted) => {
          setDownloads((prev) =>
            prev.map((d) =>
              d.id === data.id
                ? {
                    ...d,
                    state: 'completed',
                    savePath: data.savePath || d.savePath,
                    totalBytes: data.totalBytes || d.totalBytes,
                    receivedBytes: data.totalBytes || d.receivedBytes,
                    endTime: new Date().toISOString()
                  }
                : d
            )
          )
        })
      )
    }

    if (api.downloads?.onFailed) {
      unsubs.push(
        api.downloads.onFailed((data: { id: string; filename: string; reason: string }) => {
          setDownloads((prev) =>
            prev.map((d) =>
              d.id === data.id
                ? {
                    ...d,
                    state: data.reason === 'Cancelled' ? 'cancelled' : 'interrupted',
                    endTime: new Date().toISOString()
                  }
                : d
            )
          )
        })
      )
    }

    return () => {
      unsubs.forEach((u) => u())
    }
  }, [])

  // Filtered downloads
  const filteredDownloads = useMemo(() => {
    let result = downloads

    if (statusFilter === 'progressing') {
      result = result.filter((d) => d.state === 'progressing')
    } else if (statusFilter === 'completed') {
      result = result.filter((d) => d.state === 'completed')
    } else if (statusFilter === 'failed') {
      result = result.filter((d) => d.state === 'cancelled' || d.state === 'interrupted')
    }

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (d) =>
          d.filename.toLowerCase().includes(q) ||
          (d.savePath && d.savePath.toLowerCase().includes(q)) ||
          (d.url && d.url.toLowerCase().includes(q))
      )
    }

    return result
  }, [downloads, statusFilter, searchQuery])

  // Stats
  const activeCount = useMemo(() => {
    return downloads.filter((d) => d.state === 'progressing').length
  }, [downloads])

  // Open file in default system application
  const handleOpenFile = async (record: DownloadRecord) => {
    if (!api.downloads?.openFile) return
    try {
      const opened = await api.downloads.openFile(record.savePath)
      if (!opened) {
        toast.error('File not found or was moved from its original folder.')
      }
    } catch {
      toast.error('Could not open file.')
    }
  }

  // Show in explorer / finder
  const handleShowInFolder = async (record: DownloadRecord) => {
    if (!api.downloads?.showInFolder) return
    try {
      await api.downloads.showInFolder(record.savePath)
    } catch {
      toast.error('Failed to locate file in folder.')
    }
  }

  // Copy full file path
  const handleCopyPath = (record: DownloadRecord) => {
    if (!record.savePath) return
    navigator.clipboard.writeText(record.savePath)
    setCopiedId(record.id)
    toast.success('File path copied to clipboard')
    setTimeout(() => {
      setCopiedId(null)
    }, 2000)
  }

  // Delete item from list
  const handleDeleteItem = async (record: DownloadRecord) => {
    try {
      if (api.downloads?.deleteFile) {
        await api.downloads.deleteFile(record.id)
        setDownloads((prev) => prev.filter((d) => d.id !== record.id))
        toast.success(record.state === 'progressing' ? 'Download cancelled' : 'Removed from download history')
      }
    } catch {
      toast.error('Failed to remove download item')
    }
  }

  // Clear all download history
  const handleClearHistory = async () => {
    try {
      if (api.downloads?.clear) {
        await api.downloads.clear()
        setDownloads((prev) => prev.filter((d) => d.state === 'progressing'))
        toast.success('Download history cleared')
      }
    } catch {
      toast.error('Failed to clear download history')
    }
  }

  // Open the system download folder
  const handleOpenFolder = async () => {
    try {
      if (api.downloads?.openFolder) {
        await api.downloads.openFolder()
      }
    } catch {
      toast.error('Failed to open downloads folder')
    }
  }

  // Format date helper
  const formatDate = (isoString?: string) => {
    if (!isoString) return ''
    try {
      const d = new Date(isoString)
      const now = new Date()
      const isToday = d.toDateString() === now.toDateString()
      if (isToday) {
        return `Today at ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
      }
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-3xl w-[92vw] h-[82vh] max-h-[750px] p-0 flex flex-col rounded-3xl bg-background border border-border shadow-2xl overflow-hidden z-50">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3.5 border-b border-border shrink-0 flex flex-row items-center justify-between space-y-0 pr-14">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2.5">
                <span>Downloads</span>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-muted/80 text-muted-foreground border border-border/50">
                  {downloads.length} {downloads.length === 1 ? 'file' : 'files'}
                </span>
                {activeCount > 0 && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {activeCount} downloading
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Manage downloaded files, active transfers, and storage.
              </DialogDescription>
            </div>
          </div>

          {/* Action Buttons: Open Folder & Clear History */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenFolder}
              className="px-3 py-1.5 rounded-xl border border-border/80 bg-muted/40 hover:bg-muted text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Open downloads folder in File Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-primary" />
              <span>Open Folder</span>
            </button>

            {downloads.some((d) => d.state !== 'progressing') && (
              <button
                onClick={handleClearHistory}
                className="px-3 py-1.5 rounded-xl border border-border/80 bg-muted/40 hover:bg-destructive/15 hover:border-destructive/40 hover:text-destructive text-muted-foreground text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                title="Clear finished downloads from list"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear List</span>
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Search & Filter Toolbar */}
        <div className="px-6 py-3 border-b border-border bg-muted/15 flex flex-wrap items-center gap-3 shrink-0">
          {/* Search Input */}
          <div className="flex-1 min-w-[260px] relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search downloads by file name or path..."
              className="w-full h-9 pl-10 pr-9 rounded-xl bg-background border border-border text-foreground text-xs placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="h-9 flex items-center gap-0.5 p-1 bg-muted/50 rounded-xl border border-border text-[11px] select-none">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'progressing', label: 'In Progress' },
                { id: 'completed', label: 'Completed' },
                { id: 'failed', label: 'Not finished' }
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`h-7 px-3 rounded-lg transition-all font-medium cursor-pointer flex items-center justify-center ${
                  statusFilter === tab.id
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Clock className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">Loading downloads...</span>
            </div>
          ) : filteredDownloads.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 select-none">
              <div className="w-14 h-14 rounded-3xl bg-muted/50 border border-border/80 flex items-center justify-center text-muted-foreground/70 mb-3 shadow-inner">
                <ArrowDownToLine className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-semibold text-foreground tracking-tight mb-1">
                {searchQuery ? 'No Matching Downloads' : 'No Downloads Yet'}
              </h3>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                {searchQuery
                  ? `No downloads match "${searchQuery}". Try a different filename.`
                  : 'Files you download while browsing in TCT Orbit will appear here.'}
              </p>
            </div>
          ) : (
            filteredDownloads.map((item) => {
              const isProgressing = item.state === 'progressing'
              const isCompleted = item.state === 'completed'
              const isFailed = item.state === 'cancelled' || item.state === 'interrupted'

              const progressPercent =
                item.totalBytes > 0
                  ? Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100))
                  : isCompleted
                  ? 100
                  : 0

              return (
                <div
                  key={item.id}
                  className={`group relative p-3.5 rounded-2xl border transition-all ${
                    isProgressing
                      ? 'bg-primary/5 border-primary/30 shadow-xs'
                      : 'bg-muted/20 hover:bg-muted/40 border-border/70 hover:border-border'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {/* File Icon Badge */}
                    <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                      {getFileIcon(item.filename)}
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenFile(item)}
                          disabled={!isCompleted}
                          className={`text-xs font-semibold truncate text-left transition-colors ${
                            isCompleted
                              ? 'text-foreground hover:text-primary hover:underline cursor-pointer'
                              : 'text-foreground cursor-default'
                          }`}
                          title={isCompleted ? `Open ${item.filename}` : item.filename}
                        >
                          {item.filename}
                        </button>

                        {/* Status Badge */}
                        {isCompleted && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Completed
                          </span>
                        )}
                        {isProgressing && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 shrink-0 flex items-center gap-1">
                            {item.isPaused ? <Pause className="w-2.5 h-2.5" /> : <ArrowDownToLine className="w-2.5 h-2.5 animate-bounce" />}
                            {item.isPaused ? `Paused · ${progressPercent}%` : `${progressPercent}%`}
                          </span>
                        )}
                        {isFailed && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-destructive/10 text-destructive border border-destructive/20 shrink-0 flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" />
                            {item.state === 'cancelled' ? 'Cancelled' : 'Interrupted'}
                          </span>
                        )}
                      </div>

                      {/* File Details / Size / Date */}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                        <span>
                          {isProgressing
                            ? `${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)}`
                            : formatBytes(item.totalBytes || item.receivedBytes)}
                        </span>
                        {isProgressing && !item.isPaused && (item.bytesPerSecond ?? 0) > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-primary tabular-nums">{formatBytes(item.bytesPerSecond!)}/s</span>
                            {timeLeft(item) && <span className="tabular-nums">{timeLeft(item)}</span>}
                          </>
                        )}
                        <span>•</span>
                        <span>{formatDate(item.startTime)}</span>
                        {item.savePath && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[260px] font-mono text-[10px] opacity-75">
                              {item.savePath}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Progress Bar for Active Downloads */}
                      {isProgressing && (
                        <div className="w-full bg-muted rounded-full h-1.5 mt-2.5 overflow-hidden">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 shrink-0 mt-0.5 opacity-90 group-hover:opacity-100 transition-opacity">
                      {isCompleted && (
                        <>
                          <button
                            onClick={() => handleOpenFile(item)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background border border-transparent hover:border-border transition-colors cursor-pointer"
                            title="Open file"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleShowInFolder(item)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background border border-transparent hover:border-border transition-colors cursor-pointer"
                            title="Show in folder"
                          >
                            <Folder className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {isProgressing && (
                        <>
                          {item.isPaused ? (
                            <button
                              onClick={async () => {
                                const ok = await api.downloads.resume(item.id)
                                if (!ok) toast.error("This download can't be resumed", { description: 'The server does not support resuming. Try downloading again.' })
                              }}
                              className="p-1.5 rounded-lg text-primary hover:bg-background border border-transparent hover:border-border transition-colors cursor-pointer"
                              title="Resume"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => void api.downloads.pause(item.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background border border-transparent hover:border-border transition-colors cursor-pointer"
                              title="Pause"
                            >
                              <Pause className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() =>
                              void api.downloads.cancel(item.id).then(() => {
                                setDownloads((prev) => prev.map((d) => (d.id === item.id && d.state === 'progressing' ? { ...d, state: 'cancelled' } : d)))
                              })
                            }
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-colors cursor-pointer"
                            title="Cancel download"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {item.savePath && (
                        <button
                          onClick={() => handleCopyPath(item)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background border border-transparent hover:border-border transition-colors cursor-pointer"
                          title="Copy file path"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteItem(item)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-colors cursor-pointer"
                        title={isProgressing ? 'Cancel and remove' : 'Remove from downloads'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono font-medium text-foreground">
              {modKey}+J
            </kbd>
            <span>opens downloads anytime.</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
