import { sound, soundState } from '../interact/index.jsx'

// Courtyard sounds through the shared audio context: the fountain's water (a quiet positional loop that
// follows mute) and the chess pieces' stone-on-stone grinding (one-shots). Nothing is made before the first
// gesture starts audio. Like life/common.js the voices go straight to the destination, so mute is checked here.
let noiseBuf = null
function noise(ctx) {
  if (noiseBuf) return noiseBuf
  const len = ctx.sampleRate * 2
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return noiseBuf
}
function panner(ctx, [x, y, z], ref, roll) {
  const pn = ctx.createPanner()
  pn.panningModel = 'HRTF'
  pn.distanceModel = 'inverse'
  pn.refDistance = ref
  pn.rolloffFactor = roll
  if (pn.positionX) {
    pn.positionX.value = x
    pn.positionY.value = y
    pn.positionZ.value = z
  } else pn.setPosition(x, y, z)
  return pn
}

// Water: band-passed noise (a splash band near 1 kHz plus a low rumble), loudness 0.05 at 4 m and falling off
// with distance; from the cloisters (17 m or more) it is a faint hiss under everything else. My judgment: quiet
// enough that the classroom and footstep sounds stay on top.
export function waterLoop(pos) {
  let out = null
  return {
    // call now and then (about once a second): starts the loop once audio runs, follows mute
    poll() {
      const ctx = sound.context
      if (!ctx || ctx.state !== 'running') return
      const muted = soundState.get().muted
      if (!out) {
        const src = ctx.createBufferSource()
        src.buffer = noise(ctx)
        src.loop = true
        const hi = ctx.createBiquadFilter()
        hi.type = 'bandpass'
        hi.frequency.value = 1100
        hi.Q.value = 0.6
        const lo = ctx.createBiquadFilter()
        lo.type = 'lowpass'
        lo.frequency.value = 260
        const gHi = ctx.createGain()
        gHi.gain.value = 0.05
        const gLo = ctx.createGain()
        gLo.gain.value = 0.035
        out = ctx.createGain()
        out.gain.value = 0
        const pn = panner(ctx, pos, 4, 1.3)
        src.connect(hi).connect(gHi).connect(pn)
        src.connect(lo).connect(gLo).connect(pn)
        pn.connect(out).connect(ctx.destination)
        src.start()
      }
      out.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.3)
    },
  }
}

// a stone piece sliding one square: low filtered noise with a slow swell, `dur` seconds
export function grind([x, y, z], dur = 1.4) {
  const ctx = sound.context
  if (!ctx || ctx.state !== 'running' || soundState.get().muted) return
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = noise(ctx)
  src.loop = true
  src.playbackRate.value = 0.5
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 420
  f.Q.value = 2.5
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.2)
  g.gain.setValueAtTime(0.06, t + dur - 0.3)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  const pn = panner(ctx, [x, y, z], 2, 1.4)
  src.connect(f).connect(g).connect(pn).connect(ctx.destination)
  src.start(t, Math.random() * 1.5)
  src.stop(t + dur + 0.05)
}
