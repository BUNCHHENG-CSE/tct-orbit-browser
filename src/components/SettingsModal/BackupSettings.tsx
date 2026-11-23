import React, { useState, useRef } from 'react'
import {
  Download,
  Upload,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Layers,
  Settings as SettingsIcon,
  Bookmark,
  FileText,
  RotateCcw,
  HardDriveDownload,
  HardDriveUpload,
  Sparkles,
  History
} from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useThemeStore } from '@/store/useThemeStore'
import type { BackupInspectionResult, BackupCategory } from '@/types/api'

export const BackupSettings: React.FC = () => {
  // --- Export State ---
  const [exportSettings, setExportSettings] = useState(true)
  const [exportSpaces, setExportSpaces] = useState(true)
  const [exportPinned, setExportPinned] = useState(true)
  const [exportOpenTabs, setExportOpenTabs] = useState(true)
  const [exportPrivacy, setExportPrivacy] = useState(true)
  const [exportHistory, setExportHistory] = useState(true)
  const [isExporting, setIsExporting] = useState(false)

  // --- Import State ---
  const [inspectedFile, setInspectedFile] = useState<BackupInspectionResult | null>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [isInspecting, setIsInspecting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Store refresh hooks
  const setSpaces = useBrowserStore((s) => s.setSpaces)
  const setSettings = useBrowserStore((s) => s.setSettings)

  // Handle Export
  const handleExport = async () => {
    try {
      setIsExporting(true)

      const categories: BackupCategory[] = []
      if (exportSettings) categories.push('settings')
      if (exportSpaces) categories.push('spaces')
      if (exportPinned || exportOpenTabs) categories.push('tabs')
      if (exportPrivacy) categories.push('privacy')
      if (exportHistory) categories.push('history')

      if (categories.length === 0) {
        toast.error('Please select at least one data category to export.')
        setIsExporting(false)
        return
      }

      const res = await api.backup.exportData({
        categories,
        includePinnedTabs: exportPinned,
        includeOpenTabs: exportOpenTabs
      })

      if (res.canceled) {
        setIsExporting(false)
        return
      }

      if (res.success && res.filePath) {
        const counts = res.itemCounts
        toast.success('Backup file exported successfully!', {
          description: `Saved to ${res.filePath.split(/[\\/]/).pop()} (${counts?.spaces || 0} spaces, ${counts?.tabs || 0} tabs)`
        })
      } else {
        toast.error(res.error || 'Failed to export backup.')
      }
    } catch (err: any) {
      console.error('[BackupSettings] Export error:', err)
      toast.error(err?.message || 'Unexpected error during export.')
    } finally {
      setIsExporting(false)
    }
  }

  // Handle file inspection from OS dialog
  const handleChooseFile = async () => {
    try {
      setIsInspecting(true)
      const inspection = await api.backup.selectAndInspectFile()
      if (!inspection) return

      if (inspection.encrypted) {
        // Encrypted .orbitsync file: the sync panel asks for the passphrase
        window.dispatchEvent(new CustomEvent('tct:encrypted-backup-selected', { detail: { content: inspection.rawContent } }))
        toast.info('Encrypted file selected', { description: 'Enter its passphrase in the "Encrypted sync file" section.' })
      } else if (!inspection.valid) {
        toast.error('Invalid backup file', { description: inspection.error })
        setInspectedFile(null)
      } else {
        setInspectedFile(inspection)
        toast.info('Backup file loaded', {
          description: `Found ${inspection.spacesCount} space(s) and ${inspection.tabsCount} tab(s)`
        })
      }
    } catch (err: any) {
      console.error('[BackupSettings] File inspection error:', err)
      toast.error('Failed to read backup file.')
    } finally {
      setIsInspecting(false)
    }
  }

  // Handle drag-and-drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.json') && !file.name.endsWith('.orbitsync')) {
      toast.error('Please drop a .json or .orbitsync backup file.')
      return
    }

    try {
      setIsInspecting(true)
      const text = await file.text()
      const inspection = await api.backup.inspectJsonString(text)

      if (inspection.encrypted) {
        // Encrypted .orbitsync file: the sync panel asks for the passphrase
        window.dispatchEvent(new CustomEvent('tct:encrypted-backup-selected', { detail: { content: inspection.rawContent } }))
        toast.info('Encrypted file selected', { description: 'Enter its passphrase in the "Encrypted sync file" section.' })
      } else if (!inspection.valid) {
        toast.error('Invalid backup file', { description: inspection.error })
        setInspectedFile(null)
      } else {
        setInspectedFile(inspection)
        toast.info('Backup file inspected', {
          description: `Found ${inspection.spacesCount} space(s) and ${inspection.tabsCount} tab(s)`
        })
      }
    } catch (err: any) {
      console.error('[BackupSettings] Drop inspection error:', err)
      toast.error('Failed to parse dropped file.')
    } finally {
      setIsInspecting(false)
    }
  }

  // Handle file input fallback
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setIsInspecting(true)
      const text = await file.text()
      const inspection = await api.backup.inspectJsonString(text)

      if (inspection.encrypted) {
        // Encrypted .orbitsync file: the sync panel asks for the passphrase
        window.dispatchEvent(new CustomEvent('tct:encrypted-backup-selected', { detail: { content: inspection.rawContent } }))
        toast.info('Encrypted file selected', { description: 'Enter its passphrase in the "Encrypted sync file" section.' })
      } else if (!inspection.valid) {
        toast.error('Invalid backup file', { description: inspection.error })
        setInspectedFile(null)
      } else {
        setInspectedFile(inspection)
      }
    } catch (err: any) {
      toast.error('Failed to read file.')
    } finally {
      setIsInspecting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Handle Import execution
  const handleExecuteImport = async () => {
    if (!inspectedFile?.rawContent) return

    try {
      setIsImporting(true)
      const res = await api.backup.importData({
        rawContent: inspectedFile.rawContent,
        mode: importMode
      })

      if (res.success) {
        toast.success(`User data restored successfully (${res.mode === 'merge' ? 'Merged' : 'Replaced'})!`, {
          description: `Restored ${res.importedCounts.spaces} space(s) and ${res.importedCounts.tabs} tab(s).`
        })

        // Instantly refresh live store state across the whole browser
        try {
          const freshSpaces = await api.spaces.list()
          setSpaces(freshSpaces)

          const freshSettings = await api.settings.get()
          setSettings(freshSettings)

          // Re-sync theme store
          useThemeStore.getState().initTheme()
        } catch (refreshErr) {
          console.warn('[BackupSettings] Store refresh warning:', refreshErr)
        }

        // Reset inspection card
        setInspectedFile(null)
      } else {
        toast.error('Import failed', { description: res.error })
      }
    } catch (err: any) {
      console.error('[BackupSettings] Import execution error:', err)
      toast.error(err?.message || 'Error occurred during import. State was safely rolled back.')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <span>Data Backup & Restore</span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
            Local & Safe
          </span>
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Export your workspaces, bookmarks, settings, and privacy preferences to a portable backup file, or restore data anytime.
        </p>
      </div>

      {/* --- EXPORT SECTION --- */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <HardDriveDownload className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground">Export Browser Data</h4>
              <p className="text-[11px] text-muted-foreground">
                Download your configuration and bookmarks as an offline <code className="font-mono text-primary">.json</code> file.
              </p>
            </div>
          </div>
        </div>

        {/* Categories Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {/* Spaces */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="text-xs font-medium text-foreground">Spaces & Layout</div>
            </div>
            <Switch checked={exportSpaces} onCheckedChange={setExportSpaces} />
          </div>

          {/* Pinned Tabs / Bookmarks */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <Bookmark className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="text-xs font-medium text-foreground">Pinned Bookmarks</div>
            </div>
            <Switch checked={exportPinned} onCheckedChange={setExportPinned} />
          </div>

          {/* Open Tabs */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="text-xs font-medium text-foreground">Open Tabs</div>
            </div>
            <Switch checked={exportOpenTabs} onCheckedChange={setExportOpenTabs} />
          </div>

          {/* Settings */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <SettingsIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="text-xs font-medium text-foreground">Preferences & Theme</div>
            </div>
            <Switch checked={exportSettings} onCheckedChange={setExportSettings} />
          </div>

          {/* Privacy */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <div className="text-xs font-medium text-foreground">Privacy Shield Rules</div>
                <div className="text-[10px] text-muted-foreground">Ad-blocker & whitelisted sites</div>
              </div>
            </div>
            <Switch checked={exportPrivacy} onCheckedChange={setExportPrivacy} />
          </div>

          {/* Browsing History */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <div className="text-xs font-medium text-foreground">Browsing History</div>
                <div className="text-[10px] text-muted-foreground">Timeline of visited pages</div>
              </div>
            </div>
            <Switch checked={exportHistory} onCheckedChange={setExportHistory} />
          </div>
        </div>

        {/* Export Button */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">
            Saved passwords and active session cookies are strictly excluded for safety.
          </span>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Exporting...' : 'Export Backup'}</span>
          </Button>
        </div>
      </div>

      {/* --- IMPORT SECTION --- */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <HardDriveUpload className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground">Restore from Backup</h4>
              <p className="text-[11px] text-muted-foreground">
                Import and recover your browser spaces and tabs from an existing backup file.
              </p>
            </div>
          </div>
        </div>

        {/* Drag & Drop File Zone or Selection */}
        {!inspectedFile && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-colors ${
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-border/80 hover:border-primary/50 bg-muted/20'
            }`}
          >
            <div className="w-10 h-10 rounded-2xl bg-muted text-foreground flex items-center justify-center mb-2.5 shadow-xs">
              <Upload className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-xs font-medium text-foreground">
              Drop your <span className="font-mono text-primary">.json</span> backup file here
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
              or select a file from your system
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleChooseFile}
                disabled={isInspecting}
                className="gap-1.5 text-xs"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>{isInspecting ? 'Inspecting...' : 'Choose File'}</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>
          </div>
        )}

        {/* Inspected File Preview Card */}
        {inspectedFile && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <h5 className="text-xs font-bold text-foreground">
                    Valid Backup File Detected
                  </h5>
                  <p className="text-[11px] text-muted-foreground">
                    Created on {new Date(inspectedFile.exportedAt).toLocaleDateString()} with {inspectedFile.appName} v{inspectedFile.appVersion}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setInspectedFile(null)}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
            </div>

            {/* Quick Metrics Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-card border border-border font-medium text-foreground">
                📂 <strong>{inspectedFile.spacesCount}</strong> Spaces
              </span>
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-card border border-border font-medium text-foreground">
                📑 <strong>{inspectedFile.tabsCount}</strong> Tabs ({inspectedFile.pinnedCount} Pinned)
              </span>
              {inspectedFile.hasSettings && (
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-card border border-border font-medium text-foreground">
                  ⚙️ Settings Included
                </span>
              )}
              {inspectedFile.hasPrivacy && (
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-card border border-border font-medium text-foreground">
                  🛡️ Privacy Rules Included
                </span>
              )}
              {Boolean(inspectedFile.historyCount && inspectedFile.historyCount > 0) && (
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-card border border-border font-medium text-foreground">
                  📜 <strong>{inspectedFile.historyCount}</strong> History Visits
                </span>
              )}
            </div>

            {/* Restore Mode Radio / Card Selection */}
            <div className="pt-2 space-y-2">
              <div className="text-xs font-semibold text-foreground">Choose Restore Mode:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Merge Mode */}
                <div
                  onClick={() => setImportMode('merge')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    importMode === 'merge'
                      ? 'border-primary bg-primary/10 shadow-xs'
                      : 'border-border bg-card hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-foreground">Merge Data</span>
                    <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-primary/20 text-primary">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Adds imported spaces and tabs alongside your current data without deleting anything.
                  </p>
                </div>

                {/* Replace Mode */}
                <div
                  onClick={() => setImportMode('replace')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    importMode === 'replace'
                      ? 'border-destructive bg-destructive/10 shadow-xs'
                      : 'border-border bg-card hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-foreground">Replace Data</span>
                    <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-destructive/20 text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-2.5 h-2.5" /> Overwrite
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Completely replaces current spaces and tabs. An automatic rollback snapshot is saved first.
                  </p>
                </div>
              </div>
            </div>

            {/* Confirmation & Action */}
            <div className="pt-2 flex items-center justify-between border-t border-primary/20">
              <span className="text-[11px] text-muted-foreground">
                {importMode === 'replace'
                  ? 'Warning: Existing open tabs and spaces will be replaced.'
                  : 'Safe: Duplicate tabs will be gracefully skipped.'}
              </span>
              <Button
                size="sm"
                onClick={handleExecuteImport}
                disabled={isImporting}
                variant={importMode === 'replace' ? 'destructive' : 'default'}
                className="gap-2 shrink-0"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isImporting ? 'animate-spin' : ''}`} />
                <span>{isImporting ? 'Restoring...' : importMode === 'replace' ? 'Confirm & Replace All' : 'Confirm & Merge'}</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
