import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, MapPin, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FieldLabel, ToolHeader, toolDialogClass } from '@/components/ui/tool-dialog'
import { api } from '@/lib/ipc'
import { useT } from '@/lib/i18n'
import type { AddressInput, AddressProfile } from '@/types/essentials'

const EMPTY: AddressInput = { label: '', name: '', organization: '', street: '', street2: '', city: '', state: '', zip: '', country: '', email: '', phone: '' }

const FIELDS: Array<{ id: keyof Omit<AddressInput, 'id'>; label: string; wide?: boolean }> = [
  { id: 'label', label: 'Label (e.g. Home, Work)', wide: true },
  { id: 'name', label: 'Full name' },
  { id: 'organization', label: 'Company' },
  { id: 'street', label: 'Street address', wide: true },
  { id: 'street2', label: 'Apartment, floor …', wide: true },
  { id: 'city', label: 'City' },
  { id: 'state', label: 'State / province' },
  { id: 'zip', label: 'Postal code' },
  { id: 'country', label: 'Country' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' }
]

/** Addresses for form autofill. Open with `tct:open-addresses`. */
export const AddressesDialog: React.FC = () => {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<AddressProfile[]>([])
  const [encrypted, setEncrypted] = useState(true)
  const [editing, setEditing] = useState<AddressInput | null>(null)

  const refresh = useCallback(() => {
    api.essentials.addresses.list().then(setList).catch(() => setList([]))
    api.essentials.addresses.encrypted().then(setEncrypted).catch(() => setEncrypted(false))
  }, [])

  useEffect(() => {
    const onOpen = () => {
      setEditing(null)
      refresh()
      setOpen(true)
    }
    window.addEventListener('tct:open-addresses', onOpen)
    return () => window.removeEventListener('tct:open-addresses', onOpen)
  }, [refresh])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    if (!editing.street.trim() && !editing.name.trim()) {
      toast.error('Add at least a name or a street')
      return
    }
    try {
      setList(await api.essentials.addresses.save(editing))
      setEditing(null)
    } catch {
      toast.error('Could not save the address')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={`${toolDialogClass} w-[92vw] max-w-lg`}>
        <ToolHeader
          icon={MapPin}
          title={t('Addresses')}
          description="Fill in address forms with one click. Nothing enters a page until you pick an address."
          TitleAs={DialogTitle}
          DescriptionAs={DialogDescription}
        />
        <div className="px-5 pb-5 space-y-3">
          <p className={`text-[11px] flex items-center gap-1.5 ${encrypted ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
            {encrypted ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {encrypted ? 'Encrypted with your system account. Stays on this device.' : 'System encryption is not available, so addresses can not be saved.'}
          </p>
          {editing ? (
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 max-h-[52vh] overflow-y-auto pr-1" data-lenis-prevent>
                {FIELDS.map((f) => (
                  <div key={f.id} className={f.wide ? 'col-span-2' : ''}>
                    <FieldLabel htmlFor={`addr-${f.id}`}>{f.label}</FieldLabel>
                    <input
                      id={`addr-${f.id}`}
                      maxLength={200}
                      value={editing[f.id]}
                      onChange={(e) => setEditing({ ...editing, [f.id]: e.target.value })}
                      className="w-full h-8 px-2.5 rounded-lg bg-background border border-border focus:border-primary/60 text-xs outline-none"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} className="h-8 px-4 rounded-lg text-xs border border-border hover:bg-muted">
                  {t('Cancel')}
                </button>
                <button type="submit" className="h-8 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground">
                  {t('Save')}
                </button>
              </div>
            </form>
          ) : (
            <>
              <ul className="space-y-2 max-h-[46vh] overflow-y-auto pr-1" data-lenis-prevent>
                {list.length === 0 && <li className="py-8 text-center text-xs text-muted-foreground">No saved addresses yet.</li>}
                {list.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{p.label || p.name || p.street}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{[p.name, p.street, p.city, p.country].filter(Boolean).join(', ')}</div>
                    </div>
                    <button aria-label={t('Edit')} title={t('Edit')} onClick={() => setEditing({ ...p })} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      aria-label={t('Delete')}
                      title={t('Delete')}
                      onClick={() => void api.essentials.addresses.remove(p.id).then(setList)}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                disabled={!encrypted}
                onClick={() => setEditing({ ...EMPTY })}
                className="w-full h-9 rounded-lg text-xs font-semibold border border-dashed border-border hover:bg-muted inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" /> {t('Add')}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
