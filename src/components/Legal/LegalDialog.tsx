import React, { useEffect, useRef, useState } from 'react'
import { FileText, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { LEGAL_DOCUMENTS, LEGAL_LAST_UPDATED, LEGAL_CONTACT_EMAIL, type LegalDocument } from '@/lib/legal'

/** Open with: window.dispatchEvent(new CustomEvent('tct:open-legal', { detail: { doc: 'terms' | 'privacy' } })) */
export function openLegal(doc: LegalDocument['id']): void {
  window.dispatchEvent(new CustomEvent('tct:open-legal', { detail: { doc } }))
}

export const LegalDialog: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [docId, setDocId] = useState<LegalDocument['id']>('terms')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onOpen = (e: Event) => {
      const doc = (e as CustomEvent).detail?.doc
      setDocId(doc === 'privacy' ? 'privacy' : 'terms')
      setOpen(true)
    }
    window.addEventListener('tct:open-legal', onOpen)
    return () => window.removeEventListener('tct:open-legal', onOpen)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [docId, open])

  const doc = LEGAL_DOCUMENTS.find((d) => d.id === docId) || LEGAL_DOCUMENTS[0]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[92vw] max-w-2xl h-[85vh] max-h-[720px] p-0 overflow-hidden flex flex-col bg-card border border-border rounded-2xl">
        <DialogHeader className="px-5 pt-4 pb-0 border-b border-border">
          <DialogTitle className="text-base">Legal</DialogTitle>
          <DialogDescription className="text-xs">Last updated {LEGAL_LAST_UPDATED}</DialogDescription>
          <div className="flex gap-1 mt-2" role="tablist">
            {LEGAL_DOCUMENTS.map((d) => {
              const Icon = d.id === 'privacy' ? ShieldCheck : FileText
              const active = d.id === docId
              return (
                <button
                  key={d.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDocId(d.id)}
                  className={`px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
                    active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {d.title}
                </button>
              )
            })}
          </div>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 select-text" data-lenis-prevent>
          <article className="max-w-[62ch] mx-auto text-[13px] leading-relaxed text-foreground">
            <h1 className="text-xl font-bold mb-1">{doc.title}</h1>
            <p className="text-[11.5px] text-muted-foreground mb-4">Last updated {LEGAL_LAST_UPDATED}</p>
            <p className="mb-5 text-muted-foreground">{doc.intro}</p>
            {doc.sections.map((section) => (
              <section key={section.heading} className="mb-5">
                <h2 className="text-sm font-semibold mb-1.5">{section.heading}</h2>
                {section.blocks.map((block, i) =>
                  'p' in block ? (
                    <p key={i} className="mb-2 text-muted-foreground">
                      {block.p}
                    </p>
                  ) : (
                    <ul key={i} className="mb-2 pl-5 list-disc space-y-1 text-muted-foreground marker:text-muted-foreground/60">
                      {block.list.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )
                )}
              </section>
            ))}
            <p className="pt-3 border-t border-border text-[11.5px] text-muted-foreground">
              Contact: <span className="font-mono text-foreground">{LEGAL_CONTACT_EMAIL}</span>
            </p>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  )
}
