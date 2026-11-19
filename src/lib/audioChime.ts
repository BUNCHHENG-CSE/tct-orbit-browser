/**
 * Gentle Audio Chime Generator using Web Audio API
 * Generates warm, non-jarring bell/chime tones 100% locally.
 */

export function playFocusChime(type: 'complete' | 'break' | 'start' = 'complete'): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const now = ctx.currentTime
    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0.2, now)
    masterGain.connect(ctx.destination)

    if (type === 'complete') {
      // Pleasant two-tone ascending bell (D5 -> A5)
      const freqs = [587.33, 880.0]
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const noteGain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now + idx * 0.18)

        noteGain.gain.setValueAtTime(0, now + idx * 0.18)
        noteGain.gain.linearRampToValueAtTime(0.25, now + idx * 0.18 + 0.04)
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 1.2)

        osc.connect(noteGain)
        noteGain.connect(masterGain)
        osc.start(now + idx * 0.18)
        osc.stop(now + idx * 0.18 + 1.3)
      })
    } else if (type === 'start') {
      // Soft single chime (C5)
      const osc = ctx.createOscillator()
      const noteGain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(523.25, now)

      noteGain.gain.setValueAtTime(0, now)
      noteGain.gain.linearRampToValueAtTime(0.2, now + 0.05)
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)

      osc.connect(noteGain)
      noteGain.connect(masterGain)
      osc.start(now)
      osc.stop(now + 0.9)
    } else {
      // Break chime (A4 -> E5)
      const freqs = [440.0, 659.25]
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const noteGain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, now + idx * 0.15)

        noteGain.gain.setValueAtTime(0, now + idx * 0.15)
        noteGain.gain.linearRampToValueAtTime(0.2, now + idx * 0.15 + 0.04)
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 1.0)

        osc.connect(noteGain)
        noteGain.connect(masterGain)
        osc.start(now + idx * 0.15)
        osc.stop(now + idx * 0.15 + 1.1)
      })
    }

    // Clean up audio context
    setTimeout(() => {
      ctx.close().catch(() => {})
    }, 2500)
  } catch (err) {
    console.warn('Failed to play focus chime:', err)
  }
}
