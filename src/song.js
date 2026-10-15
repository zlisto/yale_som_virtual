import { bass, epiano, pad, playSong } from './audio.js'

// "Evans Hall, Floor 2": a slow, mellow lo-fi loop, generated in code.
// 66 bpm, eighth-note steps. Warm pads, a soft bass, and an electric piano that wanders
// over the chord tones without ever being in a hurry.

const BEAT = 60 / 66
const STEP = BEAT / 2 // eighth notes
const BAR = 8 // steps per bar

// two 4-bar phrases; each chord is [bass root, pad voicing, arpeggio tones]
const C = (root, voicing, tones) => ({ root, voicing, tones })
const CHORDS = [
  C(41, [57, 60, 64, 69], [65, 69, 72, 76, 79]), // Fmaj7
  C(40, [55, 59, 62, 67], [64, 67, 71, 74, 76]), // Em7
  C(38, [53, 57, 60, 65], [62, 65, 69, 72, 74]), // Dm7
  C(36, [52, 55, 59, 64], [60, 64, 67, 71, 72]), // Cmaj7
  C(45, [55, 60, 64, 67], [64, 67, 69, 72, 76]), // Am7
  C(41, [57, 60, 64, 69], [65, 69, 72, 74, 77]), // Fmaj7
  C(43, [55, 59, 62, 64], [62, 64, 67, 71, 74]), // G6
  C(36, [52, 55, 59, 64], [60, 64, 67, 71, 72]), // Cmaj7
]

// seeded random so the tune is the same every visit but doesn't sound like a metronome
let seed = 409
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

export function startSong() {
  let last = 2
  playSong(STEP, (i, t) => {
    const bar = Math.floor(i / BAR)
    const s = i % BAR
    const ch = CHORDS[bar % CHORDS.length]
    if (s === 0) {
      pad(t, ch.voicing, BEAT * 4.4, 0.035)
      bass(t, ch.root, BEAT * 1.8, 0.11)
    }
    if (s === 4) bass(t, ch.root + (bar % 2 ? 7 : 0), BEAT * 1.6, 0.08)
    // electric piano: sparse wandering line, mostly stepwise, more notes on the beat
    const p = s % 2 === 0 ? 0.55 : 0.25
    if (rnd() < p) {
      last = Math.max(0, Math.min(ch.tones.length - 1, last + Math.round((rnd() - 0.5) * 3)))
      const swing = s % 2 ? STEP * 0.12 : 0
      epiano(t + swing, ch.tones[last], 0.05 + rnd() * 0.03, (rnd() - 0.5) * 0.5)
    }
    // every fourth bar, a high bell note to close the phrase
    if (bar % 4 === 3 && s === 6) epiano(t, ch.tones[ch.tones.length - 1] + 12, 0.035, 0.3)
  })
}
