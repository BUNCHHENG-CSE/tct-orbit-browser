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

interface PomodoroState {
  mode: 'work' | 'break'
  timeLeft: number
  isRunning: boolean
  blockDistractions: boolean
  isOpen: boolean

  setMode: (mode: 'work' | 'break') => void
  setTimeLeft: (seconds: number | ((prev: number) => number)) => void
  setIsRunning: (running: boolean) => void
  setBlockDistractions: (block: boolean) => void
  setIsOpen: (open: boolean) => void
  toggleRunning: () => void
  resetTimer: () => void
  tick: () => void
}

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
  mode: 'work',
  timeLeft: WORK_TIME,
  isRunning: false,
  blockDistractions: true,
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
  setBlockDistractions: (blockDistractions) => set({ blockDistractions }),
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
