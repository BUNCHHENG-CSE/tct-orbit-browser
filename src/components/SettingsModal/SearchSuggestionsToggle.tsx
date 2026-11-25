import React, { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { searchSuggestionsEnabled, setSearchSuggestionsEnabled } from '@/hooks/useSearchSuggestions'

/** Settings > Search Engine: search-as-you-type suggestions */
export const SearchSuggestionsToggle: React.FC = () => {
  const [enabled, setEnabled] = useState(searchSuggestionsEnabled)
  return (
    <label className="flex items-center gap-3 p-3.5 rounded-2xl border border-border bg-muted/20 cursor-pointer">
      <Sparkles className="w-4 h-4 text-primary shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-semibold text-foreground">Show search suggestions</span>
        <span className="block text-[11px] text-muted-foreground mt-0.5">
          Suggests searches as you type in the address bar and start page. What you type is sent to your search engine. Never
          used in private tabs.
        </span>
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => {
          setEnabled(v)
          setSearchSuggestionsEnabled(v)
        }}
      />
    </label>
  )
}
