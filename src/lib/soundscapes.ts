/**
 * Ambient Soundscapes Engine for Zen Mode
 * 100% local Web Audio API synthesis - zero external audio assets required.
 */

export type SoundscapeType = 'none' | 'rain' | 'white-noise' | 'cafe'

class SoundscapeManager {
  private ctx: AudioContext | null = null
  private gainNode: GainNode | null = null
  private currentType: SoundscapeType = 'none'
  private activeNodes: { stop?: () => void; disconnect?: () => void }[] = []
  private lfoInterval: NodeJS.Timeout | null = null

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AudioCtx()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  public setSoundscape(type: SoundscapeType, volume = 0.3) {
    this.stop()
    if (type === 'none') {
      this.currentType = 'none'
      return
    }

    try {
      const ctx = this.getContext()
      this.currentType = type

      // Master gain node
      const masterGain = ctx.createGain()
      masterGain.gain.setValueAtTime(0, ctx.currentTime)
      masterGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.2) // smooth fade-in
      masterGain.connect(ctx.destination)
      this.gainNode = masterGain

      if (type === 'white-noise') {
        this.generateWhiteNoise(ctx, masterGain)
      } else if (type === 'rain') {
        this.generateRain(ctx, masterGain)
      } else if (type === 'cafe') {
        this.generateCafe(ctx, masterGain)
      }
    } catch (err) {
      console.warn('Failed to start soundscape:', err)
    }
  }

  private generateWhiteNoise(ctx: AudioContext, destination: AudioNode) {
    // 5 seconds looped buffer of filtered white noise
    const bufferSize = ctx.sampleRate * 5
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate)
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.15
      }
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    // Lowpass filter to make it gentle and pleasant, not harsh
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(4500, ctx.currentTime)

    source.connect(filter)
    filter.connect(destination)
    source.start()

    this.activeNodes.push(source, filter)
  }

  private generateRain(ctx: AudioContext, destination: AudioNode) {
    // Pink/Brown noise with undulating gentle LFO
    const bufferSize = ctx.sampleRate * 6
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.96900 * b2 + white * 0.1538520
        b3 = 0.86650 * b3 + white * 0.3104856
        b4 = 0.55000 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.0168980
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04
        b6 = white * 0.115926
      }
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.setValueAtTime(1200, ctx.currentTime)

    // Secondary subtle high-frequency sizzle for water droplets
    const highpass = ctx.createBiquadFilter()
    highpass.type = 'peaking'
    highpass.frequency.setValueAtTime(3200, ctx.currentTime)
    highpass.gain.setValueAtTime(3, ctx.currentTime)

    source.connect(lowpass)
    lowpass.connect(highpass)
    highpass.connect(destination)
    source.start()

    this.activeNodes.push(source, lowpass, highpass)
  }

  private generateCafe(ctx: AudioContext, destination: AudioNode) {
    // Warm low-frequency ambient chatter/room tone simulation
    const bufferSize = ctx.sampleRate * 6
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch)
      let lastVal = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        // Brownian noise integration
        lastVal = (lastVal + (0.02 * white)) / 1.02
        data[i] = lastVal * 0.4
      }
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.setValueAtTime(450, ctx.currentTime)
    bandpass.Q.setValueAtTime(0.8, ctx.currentTime)

    source.connect(bandpass)
    bandpass.connect(destination)
    source.start()

    this.activeNodes.push(source, bandpass)
  }

  public stop() {
    if (this.lfoInterval) {
      clearInterval(this.lfoInterval)
      this.lfoInterval = null
    }

    if (this.gainNode && this.ctx) {
      try {
        const now = this.ctx.currentTime
        this.gainNode.gain.cancelScheduledValues(now)
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now)
        this.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.5)
      } catch {}
    }

    setTimeout(() => {
      this.activeNodes.forEach((node) => {
        try {
          if (node.stop) node.stop()
          if (node.disconnect) node.disconnect()
        } catch {}
      })
      this.activeNodes = []
      this.gainNode = null
      this.currentType = 'none'
    }, 600)
  }

  public getCurrentType(): SoundscapeType {
    return this.currentType
  }
}

export const soundscape = new SoundscapeManager()
