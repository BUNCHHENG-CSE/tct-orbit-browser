import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared look for tool dialogs (Focus Timer, Meeting mode, Task Manager…): one header style,
 * one segmented control, one footer bar, so they read as parts of the same browser.
 */

export type ToolTone = 'primary' | 'rose' | 'emerald' | 'amber'

const TONE: Record<ToolTone, string> = {
  primary: 'bg-primary/10 text-primary ring-primary/20',
  rose: 'bg-rose-500/10 text-rose-500 ring-rose-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-500 ring-amber-500/20'
}

/** Content classes for a tool dialog: padding lives in the sections, not the shell */
export const toolDialogClass = 'p-0 gap-0 overflow-hidden rounded-2xl bg-popover text-popover-foreground border-border shadow-2xl'

export const ToolHeader: React.FC<{
  icon: React.ComponentType<{ className?: string }>
  tone?: ToolTone
  title: React.ReactNode
  description?: React.ReactNode
  /** Rendered next to the title (status pill, live dot…) */
  badge?: React.ReactNode
  /** Rendered at the right edge, left of the dialog's close button */
  actions?: React.ReactNode
  /** DialogTitle / DialogDescription from the dialog, for accessibility */
  TitleAs: React.ElementType
  DescriptionAs: React.ElementType
}> = ({ icon: Icon, tone = 'primary', title, description, badge, actions, TitleAs, DescriptionAs }) => (
  <div className="flex items-start gap-3 px-5 pt-5 pb-4 pr-12 select-none">
    <div className={cn('w-9 h-9 shrink-0 rounded-xl ring-1 flex items-center justify-center', TONE[tone])}>
      <Icon className="w-[18px] h-[18px]" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 min-w-0">
        <TitleAs className="text-[15px] font-semibold leading-tight tracking-tight truncate">{title}</TitleAs>
        {badge}
      </div>
      {description && <DescriptionAs className="text-xs text-muted-foreground mt-1 leading-snug">{description}</DescriptionAs>}
    </div>
    {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
  </div>
)

export interface SegmentOption<T extends string> {
  value: T
  label: React.ReactNode
  /** Small secondary text (e.g. "25 min") */
  hint?: React.ReactNode
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'md'
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" className={cn('flex items-center p-1 gap-1 rounded-xl bg-muted/60 ring-1 ring-border/60', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              active ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.label}
            {o.hint && <span className={cn('text-[11px] tabular-nums', active ? 'text-muted-foreground' : 'text-muted-foreground/70')}>{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Muted bar at the bottom of a tool dialog (secondary settings, hints, actions) */
export const ToolFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('px-5 py-3.5 border-t border-border bg-muted/25', className)}>{children}</div>
)

export const FieldLabel: React.FC<{ children: React.ReactNode; hint?: React.ReactNode; htmlFor?: string }> = ({ children, hint, htmlFor }) => (
  <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-xs font-medium text-foreground mb-1.5">
    {children}
    {hint && <span className="text-[11px] font-normal text-muted-foreground">{hint}</span>}
  </label>
)
