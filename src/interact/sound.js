import { COURT_HX, SKY } from '../layout.js'
import { createStore } from './store.js'

// All sound is synthesized with the Web Audio API, so nothing is downloaded.
// The AudioContext starts on the first click, tap or key press (browser autoplay rule).
// Signal path: effects -> dry bus + reverb send -> master (mute) -> speakers; the music has its
// own bus (music on/off) and its own longer reverb, also into the master, so N mutes everything.
// There is no constant ambience bed: the HVAC hum and the formant-noise chatter read as wind
// and came out in round three. The background is the music loop, a few student sounds inside
// a classroom, and birdsong by the courtyard.

const LS_MUTE = 'evans.muted'
const LS_MUSIC = 'evans.music'
const readFlag = (key, fallback) => {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}
const writeFlag = (key, on) => {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    // private window or blocked storage: the setting still holds for this visit
  }
}

export const soundState = createStore({ started: false, muted: readFlag(LS_MUTE, false), music: readFlag(LS_MUSIC, true) })

// dev only: counts of what was scheduled, for headless checks (no audio capture there)
const stats = { steps: 0, stepsAirborne: 0, stepsBlocked: 0, musicNodes: 0, musicNotes: 0, musicStartedAt: null, murmurSyllables: 0, murmurOutside: 0, studentSounds: 0, chirps: 0, rustles: 0, room: -1 }

let ctx = null
let master = null
let dry = null
let verb = null
let noise = null // 2 s of white noise, reused by every percussive voice
let musicBus = null // music on/off gain
const taps = {} // dev meter: AnalyserNodes on the sfx sum and the music bus
let lx = 0 // listener position, from listen()
let lz = 0
let place = ''
const rand = (a, b) => a + Math.random() * (b - a)

function makeNoise(seconds, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    } else d[i] = w
  }
  return buf
}

// a small-room impulse response: decaying noise, ~1.1 s
function makeImpulse() {
  const len = Math.floor(ctx.sampleRate * 1.1)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  }
  return buf
}

function start() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume()
    return
  }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = soundState.get().muted ? 0 : 1
  master.connect(ctx.destination)
  // sfx: every effect (dings, steps, doors, students, birds) sums here before the master, so the
  // dev meter can compare it with the music bus
  const sfx = ctx.createGain()
  sfx.connect(master)
  dry = ctx.createGain()
  dry.connect(sfx)
  verb = ctx.createConvolver()
  verb.buffer = makeImpulse()
  const verbOut = ctx.createGain()
  verbOut.gain.value = 0.5
  verb.connect(verbOut).connect(sfx)
  if (import.meta.env?.DEV) taps.sfx = tap(sfx)
  noise = makeNoise(2)
  soundState.set({ started: true })
  startMusic()
  setInterval(scheduler, 100) // music, student sounds and birds are scheduled about 0.4 s ahead
}

// out(node, send): route a voice to the dry bus and optionally the reverb
function out(node, send = 0.15) {
  node.connect(dry)
  if (send > 0) {
    const g = ctx.createGain()
    g.gain.value = send
    node.connect(g).connect(verb)
  }
}

function burst({ t = ctx.currentTime, dur = 0.08, gain = 0.2, type = 'lowpass', freq = 800, q = 0.7, attack = 0.004, send = 0.1, dest = null }) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur)
  src.connect(f).connect(g)
  if (dest) g.connect(dest)
  else out(g, send)
  src.start(t, rand(0, 1.5))
  src.stop(t + attack + dur + 0.05)
  return f
}

function tone({ t = ctx.currentTime, f0 = 440, f1 = null, dur = 0.1, gain = 0.1, type = 'sine', attack = 0.005, send = 0.1, dest = null }) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur)
  o.connect(g)
  if (dest) g.connect(dest)
  else out(g, send)
  o.start(t)
  o.stop(t + attack + dur + 0.05)
}

// where: the location string from layout.locate(); kept for the room-aware layers
function setPlace(where = '') {
  place = where
}

// ---------- footsteps: surface 'carpet' | 'stone' | 'grass'; speed in m/s (2.4 crouch, 5.5 walk, 9.5 sprint)
// SoundLoop calls this once per 0.75 m walked on the ground (longer strides when sprinting), never
// in the air and never while pushing into a wall. Round three halved the level and moved the carpet
// step down to a soft low-passed thud; each step picks a pitch within 8% of the last one's base.
function step(surface = 'carpet', speed = 5.5) {
  if (!ctx) return
  stats.steps++
  if (stats.airborne) stats.stepsAirborne++
  const t = ctx.currentTime
  const v = 0.5 * Math.min(1.2, 0.55 + speed / 12) // half the round-two level; sprint lands a little harder
  const p = rand(0.92, 1.08)
  if (surface === 'stone') {
    burst({ t, dur: 0.04, gain: 0.06 * v, type: 'bandpass', freq: 1800 * p, q: 1.2, send: 0.3 }) // heel
    burst({ t, dur: 0.07, gain: 0.14 * v, type: 'lowpass', freq: 420 * p, send: 0.2 })
  } else if (surface === 'grass') {
    burst({ t, dur: 0.1, gain: 0.04 * v, type: 'bandpass', freq: 2600 * p, q: 0.6, send: 0 })
    burst({ t, dur: 0.06, gain: 0.08 * v, type: 'lowpass', freq: 260 * p, send: 0 })
  } else {
    // carpet: a muffled thud under 220 Hz with a slow 12 ms attack, so there is no click
    burst({ t, dur: 0.11, gain: 0.22 * v, type: 'lowpass', freq: 200 * p, q: 0.5, attack: 0.012, send: 0 })
    tone({ t, f0: 62 * p, f1: 44 * p, dur: 0.08, gain: 0.07 * v, attack: 0.01, send: 0 })
  }
}

// ---------- positional one-shots (doors): a PannerNode at (x, z)
function panner(x, z, y = 1.2) {
  const pn = ctx.createPanner()
  pn.panningModel = 'HRTF'
  pn.distanceModel = 'inverse'
  pn.refDistance = 1.5
  pn.rolloffFactor = 1.2
  if (pn.positionX) {
    pn.positionX.value = x
    pn.positionY.value = y
    pn.positionZ.value = z
  } else pn.setPosition(x, y, z)
  out(pn, 0.25)
  return pn
}

// glass door swing: an air whoosh that sweeps up, and a soft latch thunk when it closes
function door(x, z, opening = true) {
  if (!ctx) return
  const t = ctx.currentTime
  const pn = panner(x, z)
  const f = burst({ t, dur: 0.45, gain: 0.09, type: 'bandpass', freq: 350, q: 1.5, attack: 0.08, dest: pn })
  f.frequency.exponentialRampToValueAtTime(opening ? 1200 : 600, t + 0.45)
  tone({ t: t + 0.02, f0: 140, f1: 110, dur: 0.25, gain: 0.03, type: 'triangle', dest: pn }) // pivot hinge
  if (!opening) {
    burst({ t: t + 0.42, dur: 0.05, gain: 0.12, type: 'lowpass', freq: 700, dest: pn })
    tone({ t: t + 0.42, f0: 2400, dur: 0.12, gain: 0.015, dest: pn }) // glass ring
  }
}

// camera position and flat forward vector; call every frame
function listen(x, y, z, fx, fz) {
  lx = x
  lz = z
  if (!ctx) return
  const L = ctx.listener
  if (L.positionX) {
    const t = ctx.currentTime
    L.positionX.setValueAtTime(x, t)
    L.positionY.setValueAtTime(y, t)
    L.positionZ.setValueAtTime(z, t)
    L.forwardX.setValueAtTime(fx, t)
    L.forwardY.setValueAtTime(0, t)
    L.forwardZ.setValueAtTime(fz, t)
    L.upX.setValueAtTime(0, t)
    L.upY.setValueAtTime(1, t)
    L.upZ.setValueAtTime(0, t)
  } else {
    L.setPosition(x, y, z)
    L.setOrientation(fx, 0, fz, 0, 1, 0)
  }
}

// ---------- UI
function blip(level = 1) {
  if (!ctx) return
  tone({ f0: 660, f1: 990, dur: 0.07, gain: 0.05 * level, type: 'triangle', send: 0.05 })
}

function tick() {
  if (!ctx) return
  tone({ f0: rand(1700, 1900), dur: 0.015, gain: 0.012, type: 'square', send: 0 })
}

// discovery: a soft bell arpeggio, C6 E6 G6 C7, each with an inharmonic overtone
function chime() {
  if (!ctx) return
  const t = ctx.currentTime
  ;[1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
    tone({ t: t + i * 0.09, f0: f, dur: 1.4, gain: 0.05, send: 0.6, attack: 0.004 })
    tone({ t: t + i * 0.09, f0: f * 2.76, dur: 0.5, gain: 0.012, send: 0.6, attack: 0.004 })
  })
}

// ---------- music: a generated lo-fi loop, Cmaj7 Am7 Fmaj7 G6 at 70 bpm, one chord a bar
// Warm pad (two triangles 6 cents apart per note through a low-pass that a 0.07 Hz LFO opens and
// closes), a sine bass on the root, a plucked sine arpeggio in eighths with a light swing, a soft
// kick on beats 1 and 3 and a brushed hat on 2 and 4, all through a 2.8 s generated reverb.
// MUSIC_GAIN puts the loop's peaks about 18 dB under the discovery chime's (window.__sound.levels()
// in dev reads both; set by ear and by that meter, my judgment).
const MUSIC_GAIN = 0.03
const BEAT = 60 / 70
const CHORDS = [
  [48, 52, 55, 59], // Cmaj7
  [45, 48, 52, 55], // Am7
  [41, 45, 48, 52], // Fmaj7
  [43, 47, 50, 52], // G6
]
const ARP = [0, 2, 1, 3, 2, 1, 3, 2] // chord-tone index for each eighth of the bar
const hz = (m) => 440 * 2 ** ((m - 69) / 12)
let mDry = null
let mVerb = null
let padLP = null
let mNext = 0
let mStep = 0

function musicImpulse() {
  const len = Math.floor(ctx.sampleRate * 2.8)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let lp = 0
    for (let i = 0; i < len; i++) {
      lp += 0.25 * (Math.random() * 2 - 1 - lp) // one-pole low-pass: a darker, softer tail
      d[i] = lp * 2.2 * (1 - i / len) ** 2.5
    }
  }
  return buf
}

function startMusic() {
  musicBus = ctx.createGain()
  musicBus.gain.value = soundState.get().music ? MUSIC_GAIN : 0
  musicBus.connect(master)
  mDry = ctx.createGain()
  mDry.connect(musicBus)
  mVerb = ctx.createConvolver()
  mVerb.buffer = musicImpulse()
  const wet = ctx.createGain()
  wet.gain.value = 0.55
  mVerb.connect(wet).connect(musicBus)
  padLP = ctx.createBiquadFilter()
  padLP.type = 'lowpass'
  padLP.frequency.value = 900
  padLP.Q.value = 0.6
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.07
  const depth = ctx.createGain()
  depth.gain.value = 380
  lfo.connect(depth).connect(padLP.frequency)
  lfo.start()
  mout(padLP, 0.5)
  stats.musicNodes += 8
  stats.musicStartedAt = ctx.currentTime
  if (import.meta.env?.DEV) taps.music = tap(musicBus)
  mNext = ctx.currentTime + 0.3
  mStep = 0
}

function mout(node, send) {
  node.connect(mDry)
  if (send > 0) {
    const g = ctx.createGain()
    g.gain.value = send
    node.connect(g).connect(mVerb)
    stats.musicNodes++
  }
}

function env(g, t, peak, attack, hold, release) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.setValueAtTime(peak, t + attack + hold)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release)
}

function padChord(notes, t, dur) {
  const g = ctx.createGain()
  env(g, t, 1, 1.1, Math.max(0, dur - 1.1), 1.6)
  g.connect(padLP)
  for (const m of notes) {
    for (const cents of [-6, 6]) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = hz(m + 12)
      o.detune.value = cents
      const v = ctx.createGain()
      v.gain.value = 0.045
      o.connect(v).connect(g)
      o.start(t)
      o.stop(t + dur + 2.8)
      stats.musicNodes += 2
    }
  }
  // bass: the root two octaves under the pad, a soft sine
  const b = ctx.createOscillator()
  b.frequency.value = hz(notes[0] - 12)
  const bg = ctx.createGain()
  env(bg, t, 0.16, 0.08, dur * 0.7, 0.9)
  b.connect(bg)
  mout(bg, 0.1)
  b.start(t)
  b.stop(t + dur + 1)
  stats.musicNodes += 3
  stats.musicNotes += notes.length + 1
}

function pluck(m, t, gain) {
  const o = ctx.createOscillator()
  o.frequency.value = hz(m)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
  o.connect(g)
  mout(g, 0.55)
  o.start(t)
  o.stop(t + 0.5)
  stats.musicNodes += 2
  stats.musicNotes++
}

function kick(t) {
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(115, t)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
  o.connect(g)
  mout(g, 0.05)
  o.start(t)
  o.stop(t + 0.36)
  stats.musicNodes += 2
  stats.musicNotes++
}

function brush(t, gain, dur) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = rand(5500, 7000)
  f.Q.value = 0.8
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 3))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g)
  mout(g, 0.25)
  src.start(t, rand(0, 1.5))
  src.stop(t + dur + 0.05)
  stats.musicNodes += 3
  stats.musicNotes++
}

function scheduleMusic(until) {
  if (!soundState.get().music) {
    mNext = Math.max(mNext, until) // paused: no nodes, and no backlog when it comes back
    return
  }
  const eighth = BEAT / 2
  while (mNext < until) {
    const e = mStep % 8
    const chord = CHORDS[Math.floor(mStep / 8) % CHORDS.length]
    const t = mNext + (e % 2 ? eighth * 0.12 : 0) // light swing on the off-eighths
    if (e === 0) padChord(chord, t, BEAT * 4)
    if (Math.random() < (e % 2 ? 0.55 : 0.85)) {
      const m = chord[ARP[e]] + 24 + (e === 6 && Math.random() < 0.3 ? 12 : 0)
      pluck(m, t, rand(0.05, 0.08))
    }
    if (e === 0 || e === 4 || (e === 7 && Math.random() < 0.2)) kick(t)
    if (e === 2 || e === 6) brush(t, 0.05, 0.16)
    else if (e % 2 && Math.random() < 0.5) brush(t, 0.018, 0.05)
    mNext += eighth
    mStep++
  }
}

// ---------- the classroom you are in: students now and then turn a page or whisper. The professor's
// murmur was removed in round four (Lan found it unpleasant); professors talk in speech bubbles instead
// (life/ProfBubble.jsx). room: index into DRUMS (-1 outside a classroom); center: the drum's middle { x, z }.
// SoundLoop calls this when the listener crosses a drum wall.
let room = { i: -1, center: null }
let stuNext = 0

function setRoom(i, center = null) {
  room = { i, center }
  stats.room = i
  if (ctx) stuNext = ctx.currentTime + rand(2, 5)
}

function roomPanner(x, z, y, ref = 2, roll = 1.4) {
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
  out(pn, 0.2)
  return pn
}

// one Animal Crossing-style syllable: a triangle with a pitch glide through a vowel band-pass,
// often led by a 15 ms noise "consonant"
function syllable(t, f, dur, gain, dest, vowel = rand(500, 1300)) {
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(f, t)
  o.frequency.linearRampToValueAtTime(f * rand(0.88, 1.12), t + dur)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = vowel
  bp.Q.value = 1.6
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012)
  g.gain.setValueAtTime(gain, t + dur * 0.6)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(bp).connect(g).connect(dest)
  o.start(t)
  o.stop(t + dur + 0.03)
  if (Math.random() < 0.6) burst({ t: t - 0.012, dur: 0.015, gain: gain * 0.5, type: 'bandpass', freq: rand(2500, 4200), q: 1.2, attack: 0.003, dest })
}

function scheduleRoom(now, until) {
  if (room.i < 0) return
  // students: a whispered two or three syllables, or a page turn, every 8 to 15 s
  if (stuNext < until && room.center) {
    const t = Math.max(stuNext, now)
    const x = room.center.x + rand(-3, 3)
    const z = room.center.z + rand(-3, 3)
    const pn = roomPanner(x, z, 1.1, 1.5, 1.6)
    if (Math.random() < 0.5) {
      const f = burst({ t, dur: 0.28, gain: 0.018, type: 'bandpass', freq: 1500, q: 0.9, attack: 0.05, dest: pn })
      f.frequency.exponentialRampToValueAtTime(4200, t + 0.28) // paper sliding over paper
    } else {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 900
      lp.connect(pn)
      const f = rand(250, 330)
      let tt = t
      for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) {
        const d = rand(0.06, 0.1)
        syllable(tt, f * 2 * rand(0.9, 1.1), d, 0.012, lp)
        tt += d + 0.03
      }
    }
    stats.studentSounds++
    stuNext = t + rand(8, 15)
  }
}

// ---------- the courtyard: short chirps near the canopy rim every 3 to 8 s, and now and then a leaf
// rustle (a cluster of tiny high bursts, never a continuous noise bed). Only within about 30 m of the
// courtyard and never from inside a classroom.
let birdNext = 0
let rustleNext = 0
function nearCourtyard() {
  return room.i < 0 && Math.abs(lx) < COURT_HX + 8.25 && Math.abs(lz) < 28
}
function scheduleCourtyard(now, until) {
  if (!nearCourtyard()) {
    birdNext = Math.max(birdNext, now + rand(1, 3))
    rustleNext = Math.max(rustleNext, now + rand(3, 6))
    return
  }
  if (birdNext < until) {
    const t = Math.max(birdNext, now)
    // a point on the rim of the canopy's sky opening (43.5 x 25.5 m), 9 m up
    const side = Math.random() < 0.5
    const rx = SKY.hx + 0.25
    const x = side ? (Math.random() < 0.5 ? -rx : rx) : rand(-rx, rx)
    const z = side ? rand(-12.75, 12.75) : Math.random() < 0.5 ? -12.75 : 12.75
    const pn = roomPanner(x, z, 9, 6, 1)
    const f0 = rand(2800, 4200)
    let tt = t
    for (let k = 0; k < 2 + Math.floor(Math.random() * 4); k++) {
      const up = Math.random() < 0.6
      const d = rand(0.05, 0.11)
      tone({ t: tt, f0: f0 * rand(0.92, 1.08), f1: f0 * (up ? rand(1.2, 1.55) : rand(0.65, 0.8)), dur: d, gain: 0.018, attack: 0.008, dest: pn })
      tt += d + rand(0.04, 0.09)
      stats.chirps++
    }
    birdNext = t + rand(3, 8)
  }
  if (rustleNext < until) {
    const t = Math.max(rustleNext, now)
    const pn = roomPanner(rand(-10, 10), rand(-9, 9), 4, 4, 1)
    const span = rand(1.2, 2)
    for (let k = 0; k < 18 + Math.floor(Math.random() * 20); k++) {
      const u = Math.random()
      burst({ t: t + u * span, dur: rand(0.006, 0.02), gain: 0.008 * Math.sin(Math.PI * u) + 0.002, type: 'bandpass', freq: rand(4500, 7500), q: 1.4, attack: 0.002, dest: pn })
    }
    stats.rustles++
    rustleNext = t + rand(6, 12)
  }
}

function scheduler() {
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  const until = now + 0.4
  scheduleMusic(until)
  scheduleRoom(now, until)
  scheduleCourtyard(now, until)
  if (import.meta.env?.DEV) meterTick()
}

// ---------- dev meter: peak levels (dBFS) of the sfx sum and the music bus since load
function tap(node) {
  const a = ctx.createAnalyser()
  a.fftSize = 2048
  node.connect(a)
  return { a, buf: new Float32Array(2048), peak: 0, sum: 0, n: 0 }
}
function meterTick() {
  for (const k of ['sfx', 'music']) {
    const T = taps[k]
    if (!T) continue
    T.a.getFloatTimeDomainData(T.buf)
    let pk = 0
    let ss = 0
    for (const v of T.buf) {
      pk = Math.max(pk, Math.abs(v))
      ss += v * v
    }
    T.peak = Math.max(T.peak, pk)
    T.sum += ss / T.buf.length
    T.n++
  }
}
const db = (v) => (v > 0 ? +(20 * Math.log10(v)).toFixed(1) : -Infinity)
function meter() {
  const r = {}
  for (const k of ['sfx', 'music']) {
    const T = taps[k]
    if (T) r[k] = { peakDb: db(T.peak), rmsDb: db(Math.sqrt(T.sum / Math.max(1, T.n))) }
  }
  return r
}
function resetMeter() {
  for (const T of Object.values(taps)) {
    T.peak = 0
    T.sum = 0
    T.n = 0
  }
}

function setMuted(m) {
  soundState.set({ muted: m })
  writeFlag(LS_MUTE, m)
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05)
}

function setMusic(on) {
  soundState.set({ music: on })
  writeFlag(LS_MUSIC, on)
  if (musicBus) musicBus.gain.setTargetAtTime(on ? MUSIC_GAIN : 0, ctx.currentTime, 0.4)
}

export const sound = {
  start,
  step,
  door,
  listen,
  setPlace,
  blip,
  tick,
  chime,
  setMuted,
  toggleMute: () => setMuted(!soundState.get().muted),
  setMusic,
  toggleMusic: () => setMusic(!soundState.get().music),
  setRoom,
  stats,
  get context() {
    return ctx
  },
}

// first gesture starts audio (nothing is created before it); N toggles mute, B the music (M is the map)
if (typeof window !== 'undefined') {
  const first = () => start()
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, first, { passive: true })
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.code === 'KeyN') sound.toggleMute()
    if (e.code === 'KeyB') sound.toggleMusic()
  })
  if (import.meta.env?.DEV) window.__sound = { stats, state: () => soundState.get(), context: () => ctx, levels: meter, resetLevels: resetMeter, fx: sound }
}
