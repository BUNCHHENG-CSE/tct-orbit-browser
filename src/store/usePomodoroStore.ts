import { create } from 'zustand'
import { playFocusChime } from '@/lib/audioChime'
import { toast } from 'sonner'

export const WORK_TIME = 25 * 60 // 25 minutes
export const BREAK_TIME = 5 * 60 // 5 minutes

export const DISTRACTING_DOMAINS = new Set([
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'reddit.com',
  'tiktok.com',
  'youtube.com',
  'netflix.com',
  'twitch.tv',
  'threads.net',
  '9gag.com',
  'pinterest.com'
])

const BLOCKLIST_KEY = 'tct_focus_blocklist_v1'
const BLOCK_ENABLED_KEY = 'tct_focus_block_enabled_v1'

function loadBlocklist(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BLOCKLIST_KEY) || 'null')
    if (Array.isArray(raw)) return raw.filter((d) => typeof d === 'string')
  } catch {}
  return Array.from(DISTRACTING_DOMAINS)
}

function loadBlockEnabled(): boolean {
  try {
    const v = localStorage.getItem(BLOCK_ENABLED_KEY)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

/** Normalize user input ("https://www.Reddit.com/r/x" -> "reddit.com"); invalid entries are dropped */
export function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null
}

interface PomodoroState {
  mode: 'work' | 'break'
  timeLeft: number
  isRunning: boolean
  blockDistractions: boolean
  /** Sites blocked during a work sprint (editable, persisted) */
  blockedDomains: string[]
  isOpen: boolean

  setMode: (mode: 'work' | 'break') => void
  setTimeLeft: (seconds: number | ((prev: number) => number)) => void
  setIsRunning: (running: boolean) => void
  setBlockDistractions: (block: boolean) => void
  setBlockedDomains: (domains: string[]) => void
  setIsOpen: (open: boolean) => void
  toggleRunning: () => void
  resetTimer: () => void
  tick: () => void
}

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
  mode: 'work',
  timeLeft: WORK_TIME,
  isRunning: false,
  blockDistractions: loadBlockEnabled(),
  blockedDomains: loadBlocklist(),
  isOpen: false,

  setMode: (mode) =>
    set({
      mode,
      isRunning: false,
      timeLeft: mode === 'work' ? WORK_TIME : BREAK_TIME
    }),

  setTimeLeft: (seconds) =>
    set((state) => ({
      timeLeft: typeof seconds === 'function' ? seconds(state.timeLeft) : seconds
    })),

  setIsRunning: (isRunning) => set({ isRunning }),
  setBlockDistractions: (blockDistractions) => {
    try {
      localStorage.setItem(BLOCK_ENABLED_KEY, blockDistractions ? '1' : '0')
    } catch {}
    set({ blockDistractions })
  },
  setBlockedDomains: (domains) => {
    const clean = Array.from(new Set(domains.map(normalizeDomain).filter((d): d is string => !!d)))
    try {
      localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(clean))
    } catch {}
    set({ blockedDomains: clean })
  },
  setIsOpen: (isOpen) => set({ isOpen }),

  toggleRunning: () => {
    const nextState = !get().isRunning
    if (nextState) {
      playFocusChime('start')
    }
    set({ isRunning: nextState })
  },

  resetTimer: () => {
    const currentMode = get().mode
    set({
      isRunning: false,
      timeLeft: currentMode === 'work' ? WORK_TIME : BREAK_TIME
    })
  },

  tick: () => {
    const { isRunning, timeLeft, mode } = get()
    if (!isRunning) return

    if (timeLeft <= 1) {
      if (mode === 'work') {
        playFocusChime('complete')
        toast.success('Sprint complete! Time for a well-deserved 5-minute break.')
        set({ mode: 'break', timeLeft: BREAK_TIME })
      } else {
        playFocusChime('break')
        toast.info('Break finished! Ready to begin your next focus sprint?')
        set({ mode: 'work', timeLeft: WORK_TIME })
      }
    } else {
      set({ timeLeft: timeLeft - 1 })
    }
  }
}))
