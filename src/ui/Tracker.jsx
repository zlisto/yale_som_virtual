import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createStore, ui, useStore } from '../interact/store.js'
import { sound } from '../interact/sound.js'
import { dialogueState } from './dialogueStore.jsx'
import { EGGS, discover, discoveryState, resetDiscoveries } from './discoveries.js'
import { setHudItem } from './hudSlots.jsx'
import './tracker.css'

// Easter-egg tracker: a HUD pill "Easter eggs 3 / 8" (top right, under the sound button), and a panel that lists
// the eight eggs with a cryptic hint each until found. T or a click/tap on the pill opens and closes it.
// At 8 / 8: confetti in course pink and Yale blue for 4 s, a chime, and a certificate the student can copy
// as a line of text. discoveries.js loads this module, so App.jsx does not mount it.

const LS_CERT = 'evans.discoveries.cert.v1' // set once the 8 / 8 celebration has played
const LS_NAME = 'evans.hunter.name'
const read = (k, d = null) => {
  try {
    return localStorage.getItem(k) ?? d
  } catch {
    return d
  }
}
const write = (k, v) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    // storage blocked: lasts for this visit
  }
}

export const trackerState = createStore({ open: false, confetti: 0 })
const TOTAL = EGGS.length
const foundIds = (s) => EGGS.filter((e) => s.found.includes(e.id)).map((e) => e.id)

let wasPlaying = false
export function openTracker() {
  if (trackerState.get().open) return
  wasPlaying = ui.get().playing
  trackerState.set({ open: true })
  ui.set({ frozen: true })
  if (document.pointerLockElement) document.exitPointerLock()
  sound.blip()
}
// relock: true when a key or click closed it (a user gesture), so pointer lock can come back
export function closeTracker(relock = false) {
  if (!trackerState.get().open) return
  trackerState.set({ open: false })
  if (!dialogueState.get().script) ui.set({ frozen: false })
  if (relock && wasPlaying && !ui.get().touch) ui.get().relock?.()
}
const toggle = (relock) => (trackerState.get().open ? closeTracker(relock) : openTracker())

function celebrate() {
  write(LS_CERT, '1')
  trackerState.set({ confetti: Date.now() })
  setTimeout(() => sound.chime(), 650) // a second chime after the discovery toast's own
  setTimeout(() => sound.chime(), 1100)
  setTimeout(openTracker, 1400)
}

// celebrate when the eighth egg is found; if all eight were found before the tracker existed (or the
// certificate was never shown), celebrate once the player is in the building
let last = foundIds(discoveryState.get()).length
discoveryState.sub((s) => {
  const n = foundIds(s).length
  if (n === TOTAL && last < TOTAL) celebrate()
  if (n < TOTAL) write(LS_CERT, null)
  last = n
})
if (last === TOTAL && !read(LS_CERT)) {
  const off = ui.sub((s) => {
    if (!s.playing) return
    off()
    setTimeout(celebrate, 600)
  })
  if (ui.get().playing) {
    off()
    setTimeout(celebrate, 600)
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyT' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return
  if (dialogueState.get().script) return
  toggle(true)
})
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && trackerState.get().open) closeTracker(false)
})

const fmtTime = (ms) =>
  new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

function EggIcon({ found }) {
  return (
    <svg className="trk-egg" viewBox="0 0 20 24" aria-hidden="true">
      <path d="M10 1C5 1 1.5 9 1.5 14.5 1.5 19.5 5.3 23 10 23s8.5-3.5 8.5-8.5C18.5 9 15 1 10 1z" className={found ? 'on' : 'off'} />
      {found && <path d="M3.5 13l3-2 3 2 3-2 3 2 1.5-1" className="band" />}
    </svg>
  )
}

function Pill() {
  const n = useStore(discoveryState, (s) => foundIds(s).length)
  const [pulse, setPulse] = useState(false)
  const prev = useRef(n)
  useEffect(() => {
    if (n > prev.current) {
      setPulse(true)
      const id = setTimeout(() => setPulse(false), 2600)
      prev.current = n
      return () => clearTimeout(id)
    }
    prev.current = n
  }, [n])
  return (
    <button
      className={`hud-pill hud-btn trk-pill${pulse ? ' pulse' : ''}${n === TOTAL ? ' done' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        toggle(false)
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title="easter eggs (T)"
      aria-label={`easter eggs ${n} of ${TOTAL}`}
    >
      <EggIcon found={n > 0} />
      <span className="hud-label">Easter eggs</span>
      <span className="hud-num">
        {n}
        <span className="hud-total"> / {TOTAL}</span>
      </span>
      <kbd>T</kbd>
    </button>
  )
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const ta = document.createElement('textarea')
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
  return Promise.resolve()
}

function Certificate() {
  const [name, setName] = useState(() => read(LS_NAME, ''))
  const [copied, setCopied] = useState(false)
  const date = today()
  const line = `${name.trim() ? `${name.trim()}: ` : ''}I found all 8 easter eggs in Evans Hall · MGT 409 · ${date}`
  return (
    <div className="trk-cert">
      <div className="trk-kicker">Certificate of completion</div>
      <div className="trk-cert-title">MGT 409 Easter Egg Hunter</div>
      <label className="trk-cert-name">
        <span>awarded to</span>
        <input
          value={name}
          maxLength={60}
          placeholder="type your name"
          onChange={(e) => {
            setName(e.target.value)
            write(LS_NAME, e.target.value)
            setCopied(false)
          }}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>
      <div className="trk-cert-date">for finding all eight easter eggs on Floor 2 of Evans Hall · {date}</div>
      <div className="trk-cert-copy">
        <code>{line}</code>
        <button
          className="trk-btn primary"
          onClick={() => copyText(line).then(() => setCopied(true), () => setCopied(false))}
        >
          {copied ? 'Copied' : 'Copy for Tauhid'}
        </button>
      </div>
    </div>
  )
}

function Panel() {
  const open = useStore(trackerState, (s) => s.open)
  const { found, times } = useStore(discoveryState)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => setConfirm(false), [open])
  if (!open) return null
  const n = EGGS.filter((e) => found.includes(e.id)).length
  const done = n === TOTAL
  return (
    <div className="trk-scrim" onPointerDown={(e) => e.stopPropagation()} onClick={() => closeTracker(true)}>
      <div className="trk-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Easter egg tracker">
        <div className="trk-head">
          <div>
            <div className="trk-kicker">MGT 409 · Easter egg hunt</div>
            <h2>{done ? 'All eight found' : 'Easter eggs on Floor 2'}</h2>
          </div>
          <button className="trk-x" onClick={() => closeTracker(true)} aria-label="close">
            esc
          </button>
        </div>
        <div className="trk-progress">
          <div className="trk-bar">
            <i style={{ width: `${(100 * n) / TOTAL}%` }} />
          </div>
          <span className="trk-count">
            {n} <span>/ {TOTAL}</span>
          </span>
        </div>
        <p className="trk-line">
          {done ? 'Find them all: done. Copy your certificate below.' : `Find them all. ${TOTAL - n} still hidden somewhere on this floor.`}
        </p>
        {done && <Certificate />}
        <ol className="trk-list">
          {EGGS.map((e, i) => {
            const got = found.includes(e.id)
            return (
              <li key={e.id} className={got ? 'found' : 'hidden'}>
                <span className="trk-num">{i + 1}</span>
                <EggIcon found={got} />
                <div className="trk-body">
                  <div className="trk-name">
                    {got ? e.name : '? ? ?'}
                    {got && <span className="trk-time">{times?.[e.id] ? `found ${fmtTime(times[e.id])}` : 'found earlier'}</span>}
                  </div>
                  <div className="trk-text">{got ? e.desc : e.hint}</div>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="trk-foot">
          {confirm ? (
            <span className="trk-confirm">
              Reset all progress?
              <button
                className="trk-btn danger"
                onClick={() => {
                  resetDiscoveries()
                  setConfirm(false)
                }}
              >
                Yes, reset
              </button>
              <button className="trk-btn" onClick={() => setConfirm(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button className="trk-btn ghost" onClick={() => setConfirm(true)}>
              Reset
            </button>
          )}
          <button className="trk-btn" onClick={() => closeTracker(true)}>
            Close <kbd>T</kbd>
          </button>
        </div>
      </div>
    </div>
  )
}

const COLORS = ['#ff4fa3', '#ffd6ea', '#00356b', '#286dc0', '#ffffff']
function Confetti() {
  const start = useStore(trackerState, (s) => s.confetti)
  const ref = useRef()
  useEffect(() => {
    if (!start) return
    const c = ref.current
    const g = c.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = (c.width = innerWidth * dpr)
    const H = (c.height = innerHeight * dpr)
    const bits = Array.from({ length: 180 }, (_, i) => ({
      x: Math.random() * W,
      y: -Math.random() * H * 0.6,
      vx: (Math.random() - 0.5) * 2.2 * dpr,
      vy: (2 + Math.random() * 3.5) * dpr,
      w: (6 + Math.random() * 7) * dpr,
      h: (3 + Math.random() * 4) * dpr,
      a: Math.random() * 6.28,
      va: (Math.random() - 0.5) * 0.3,
      c: COLORS[i % COLORS.length],
    }))
    let raf
    const t0 = performance.now()
    const frame = (t) => {
      const k = (t - t0) / 4000
      g.clearRect(0, 0, W, H)
      if (k >= 1) return
      g.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1
      for (const b of bits) {
        b.x += b.vx + Math.sin(t / 300 + b.a) * 0.6 * dpr
        b.y += b.vy
        b.a += b.va
        g.save()
        g.translate(b.x, b.y)
        g.rotate(b.a)
        g.scale(1, Math.abs(Math.cos(b.a * 1.7)) + 0.2)
        g.fillStyle = b.c
        g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
        g.restore()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [start])
  return <canvas ref={ref} className="trk-confetti" />
}

function TrackerHud() {
  return (
    <>
      <Pill />
      {createPortal(
        <>
          <Panel />
          <Confetti />
        </>,
        document.body,
      )}
    </>
  )
}

setHudItem('counters', 'egg-tracker', <TrackerHud />, 5)

// dev only: window.__eggs.discover('merch') finds an egg from a test script (same module instance as the app)
if (import.meta.env.DEV) window.__eggs = { discover, reset: resetDiscoveries, open: openTracker, close: closeTracker }
