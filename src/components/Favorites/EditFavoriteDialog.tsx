import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, Folder, FolderOpen, FolderPlus, Globe, Link2, Pencil, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/ipc'
import {
  FAVORITES_BAR,
  FOLDER_SEP,
  OTHER_FAVORITES,
  READING_LIST,
  addActiveTabToFavorites,
  faviconFor,
  folderName,
  useFavorites
} from '@/lib/favorites'
import type { BookmarkItem } from '@/types/api'

export type EditTarget =
  | { kind: 'link'; item: BookmarkItem }
  | { kind: 'folder'; path: string }
  | { kind: 'new-folder'; parent: string }
  | { kind: 'empty-folder'; parent: string }

const field =
  'w-full h-9 rounded-lg bg-muted/40 border border-border text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:bg-background focus:border-primary focus:ring-2 focus:ring-primary/20'
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5'

const inBar = (f: string) => f === FAVORITES_BAR || f.startsWith(FAVORITES_BAR + FOLDER_SEP)
const displayName = (path: string) => (path === OTHER_FAVORITES ? 'Other favorites' : folderName(path))
const cleanFolderName = (s: string) => s.trim().replace(/\s*\/\s*/g, '-')

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Site icon in a tile, for the dialog header */
const SiteTile: React.FC<{ item: BookmarkItem; url: string }> = ({ item, url }) => {
  const [broken, setBroken] = useState(false)
  const src = faviconFor({ ...item, url })
  return (
    <div className="w-11 h-11 shrink-0 rounded-xl bg-muted/60 border border-border flex items-center justify-center">
      {src && !broken ? (
        <img src={src} alt="" className="w-6 h-6 object-contain" onError={() => setBroken(true)} />
      ) : (
        <Globe className="w-5 h-5 text-muted-foreground" />
      )}
    </div>
  )
}

/**
 * Edit a favorite (name, URL, folder tree with "New folder"), rename a folder, or create a folder
 * holding the current page.
 */
export const EditFavoriteDialog: React.FC<{ target: EditTarget | null; onClose: () => void; barOrderIds: string[] }> = ({
  target,
  onClose,
  barOrderIds
}) => {
  const items = useFavorites((s) => s.items)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [folder, setFolder] = useState(FAVORITES_BAR)
  const [extraFolders, setExtraFolders] = useState<string[]>([])
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!target) return
    setNewFolder(null)
    setExtraFolders([])
    if (target.kind === 'link') {
      setName(target.item.title)
      setUrl(target.item.url)
      setFolder(target.item.folder || OTHER_FAVORITES)
    } else if (target.kind === 'folder') {
      setName(folderName(target.path))
    } else {
      setName('New folder')
    }
    setTimeout(() => nameRef.current?.select(), 50)
  }, [target])

  // Every folder (and parent path), Favorites bar first, then Other favorites, then imports
  const ownFolders = useFavorites((s) => s.folders)
  const folders = useMemo(() => {
    const set = new Set<string>([FAVORITES_BAR, OTHER_FAVORITES, ...ownFolders, ...extraFolders])
    for (const b of items) {
      if (!b.folder || b.isReadingList || b.folder === READING_LIST) continue
      const parts = b.folder.split(FOLDER_SEP)
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join(FOLDER_SEP))
    }
    const rank = (p: string) => (p.startsWith(FAVORITES_BAR) ? 0 : p.startsWith(OTHER_FAVORITES) ? 1 : 2)
    return [...set].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  }, [items, ownFolders, extraFolders])

  const addNewFolder = () => {
    const clean = cleanFolderName(newFolder || '')
    if (!clean) return setNewFolder(null)
    const path = folder + FOLDER_SEP + clean
    setExtraFolders((f) => [...f, path])
    setFolder(path)
    setNewFolder(null)
  }

  const save = async () => {
    if (!target) return
    try {
      if (target.kind === 'link') {
        const cleanUrl = url.trim()
        if (!/^(https?|file):/i.test(cleanUrl)) return toast.error('Enter a full address, like https://example.com')
        await api.bookmarks.update?.(target.item.id, { title: name.trim() || cleanUrl, url: cleanUrl, folder })
        // Moved onto the bar: put it at the end
        if (folder !== target.item.folder && inBar(folder)) {
          await api.bookmarks.reorder?.([...barOrderIds.filter((id) => id !== target.item.id), target.item.id])
        }
        toast.success('Favorite saved')
      } else if (target.kind === 'folder') {
        const parent = target.path.split(FOLDER_SEP).slice(0, -1).join(FOLDER_SEP)
        const clean = cleanFolderName(name)
        if (!clean) return
        await api.bookmarks.renameFolder?.(target.path, parent ? parent + FOLDER_SEP + clean : clean)
        toast.success('Folder renamed')
      } else if (target.kind === 'empty-folder') {
        const clean = cleanFolderName(name)
        if (!clean) return
        if (!(await api.bookmarks.createFolder(target.parent + FOLDER_SEP + clean))) return toast.error(`There is already a folder "${clean}" here`)
        toast.success(`Folder "${clean}" created`)
      } else {
        const clean = cleanFolderName(name)
        if (!clean) return
        const added = await addActiveTabToFavorites(target.parent + FOLDER_SEP + clean)
        if (!added) return toast('Open a web page first: it goes into the new folder')
        toast.success(`Folder "${clean}" created`)
      }
      onClose()
    } catch {
      toast.error('Could not save')
    }
  }

  const isLink = target?.kind === 'link'
  const heading = isLink ? 'Edit favorite' : target?.kind === 'folder' ? 'Rename folder' : 'New folder'
  const sub = isLink ? hostOf(url || target.item.url) : target?.kind === 'folder' ? displayName(target.path) : target?.kind === 'empty-folder' ? `In ${displayName(target.parent)}` : 'The current page goes into it'

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          {isLink ? (
            <SiteTile item={target.item} url={url} />
          ) : (
            <div className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              {target?.kind === 'folder' ? <Pencil className="w-5 h-5 text-primary" /> : <FolderPlus className="w-5 h-5 text-primary" />}
            </div>
          )}
          <div className="min-w-0 pr-6">
            <DialogTitle className="text-[15px] font-semibold leading-tight">{heading}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground truncate mt-0.5">{sub}</DialogDescription>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="px-5 pb-4 space-y-4">
            <div>
              <label className={labelCls}>{isLink ? 'Name' : 'Folder name'}</label>
              <input ref={nameRef} className={`${field} px-3`} value={name} aria-label="Name" onChange={(e) => setName(e.target.value)} />
            </div>

            {isLink && (
              <>
                <div>
                  <label className={labelCls}>Address</label>
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input className={`${field} pl-8 pr-3 font-mono text-[12px]`} value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={labelCls.replace(' mb-1.5', '')}>Folder</span>
                    <button
                      type="button"
                      onClick={() => setNewFolder('')}
                      className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      <FolderPlus className="w-3 h-3" /> New folder
                    </button>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 max-h-44 overflow-y-auto p-1" role="listbox" aria-label="Folder">
                    {folders.map((f) => {
                      const depth = f.split(FOLDER_SEP).length - 1
                      const selected = f === folder
                      const Icon = selected ? FolderOpen : f === FAVORITES_BAR ? Star : Folder
                      return (
                        <React.Fragment key={f}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => setFolder(f)}
                            className={`w-full flex items-center gap-2 h-8 pr-2 rounded-md text-[13px] text-left transition-colors ${
                              selected ? 'bg-primary/15 text-foreground font-medium' : 'text-foreground/85 hover:bg-muted'
                            }`}
                            style={{ paddingLeft: 8 + depth * 16 }}
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className="flex-1 truncate">{displayName(f)}</span>
                            {selected && <Check className="w-3.5 h-3.5 text-primary" />}
                          </button>
                          {/* New subfolder of the selected folder */}
                          {selected && newFolder !== null && (
                            <div className="flex items-center gap-2 h-8 pr-1" style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
                              <FolderPlus className="w-4 h-4 shrink-0 text-primary" />
                              <input
                                autoFocus
                                value={newFolder}
                                onChange={(e) => setNewFolder(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    addNewFolder()
                                  } else if (e.key === 'Escape') {
                                    e.stopPropagation()
                                    setNewFolder(null)
                                  }
                                }}
                                onBlur={addNewFolder}
                                placeholder="Folder name"
                                className="flex-1 h-6 px-2 rounded-md bg-background border border-primary text-[12.5px] outline-none"
                              />
                            </div>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="h-8 px-3.5 rounded-lg text-xs font-medium hover:bg-muted transition-colors">
                Cancel
              </button>
              <button type="submit" className="h-8 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                Save
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
