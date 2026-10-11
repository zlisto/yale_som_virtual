import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { createStore, useStore } from '../interact/store.js'

// Full-screen loading panel. Progress comes from drei's useProgress, which listens to
// THREE.DefaultLoadingManager: useGLTF, the HDRI, the Draco decoder and the raw
// TextureLoader calls in pbr.js and World.jsx all report through it. useProgress resets its
// percentage per loading wave, so the bar is built from loaded / total (below) and never
// moves backwards.
// The panel leaves once loading has been idle for 400 ms, the shaders have compiled and two
// frames have rendered, then fades over 400 ms into the start card.

const LINES = [
  'Warming up the Labubus',
  'Dumbledore is finding his wand',
  'Counting tokens',
  'Seating MGT 409',
  'Polishing the drum glass',
  'Waking Handsome Dan',
  'Briefing Lisa on the syllabus',
  'Hiding the easter eggs',
  'Teaching Froggy some manners',
  'Taking attendance in 2400',
]

// idle: no load in flight for 400 ms; ready: shaders compiled and two frames rendered since
const gate = createStore({ idle: false, ready: false })

// true once the loading panel has left (the scene is compiled and on screen)
export const useLoaded = () => useStore(gate, (s) => s.ready)

// Inside the Canvas: once loading is idle, compile every material against the camera so the
// first walk-in frame does not stall, then let two frames render before releasing the panel.
export function LoadingProbe() {
  const { gl, scene, camera } = useThree()
  const idle = useStore(gate, (s) => s.idle)
  const frames = useRef(-1)
  useEffect(() => {
    if (!idle) return
    let cancelled = false
    const done = () => !cancelled && (frames.current = 0)
    const timeout = setTimeout(done, 4000) // compileAsync can hang without the parallel-compile extension
    Promise.resolve(gl.compileAsync ? gl.compileAsync(scene, camera) : gl.compile(scene, camera))
      .catch(() => {})
      .then(() => {
        clearTimeout(timeout)
        done()
      })
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [idle, gl, scene, camera])
  useFrame(() => {
    if (frames.current < 0 || gate.get().ready) return
    if (++frames.current >= 2) gate.set({ ready: true })
  })
  return null
}

const mb = (b) => (b / 1048576).toFixed(1)
const shortName = (s) => (s || '').replace(/^.*\//, '').replace(/[?#].*$/, '')

// bytes: sum of resource entries the browser has finished (encodedBodySize is the size on
// the wire, or the cached size on a reload)
function useBytes(on) {
  const [bytes, setBytes] = useState(0)
  useEffect(() => {
    if (!on || typeof PerformanceObserver === 'undefined') return
    const count = () => performance.getEntriesByType('resource').reduce((s, e) => s + (e.encodedBodySize || e.transferSize || 0), 0)
    setBytes(count())
    const obs = new PerformanceObserver(() => setBytes(count()))
    try {
      obs.observe({ type: 'resource', buffered: true })
    } catch {
      return
    }
    return () => obs.disconnect()
  }, [on])
  return bytes
}

export default function Loading() {
  const { active, item, loaded, total } = useProgress()
  const ready = useStore(gate, (s) => s.ready)
  const [phase, setPhase] = useState('in') // in -> out (fading) -> gone
  const [line, setLine] = useState(0)
  const prog = useRef({ pct: 0, loaded: 0 })
  const bytes = useBytes(phase !== 'gone')

  // Each finished asset moves the bar by its share of the distance still left, with the share
  // taken from loaded / total at that moment. The bar never moves back, equals loaded / total
  // while the total holds, and reaches 100 only when every known asset has loaded. The old
  // running maximum of loaded / total stuck at 100% after a small first wave (100% beside
  // "66 of 101").
  const pr = prog.current
  if (loaded < pr.loaded) pr.loaded = loaded
  if (loaded > pr.loaded && total > pr.loaded) {
    pr.pct += ((100 - pr.pct) * (loaded - pr.loaded)) / (total - pr.loaded)
    pr.loaded = loaded
  }
  const pct = total && loaded >= total ? 100 : Math.min(99, Math.floor(pr.pct))

  // dev: keep every reported item so a headless check can compare it with the network log
  useEffect(() => {
    if (import.meta.env.DEV && item) (window.__progressItems ||= new Set()).add(item)
  }, [item])

  // idle: nothing in flight for 400 ms after at least one load finished; a lazily mounted
  // component that starts a new wave inside that window resets it
  useEffect(() => {
    if (active || !total || loaded < total) return gate.set({ idle: false })
    const t = setTimeout(() => gate.set({ idle: true }), 400)
    return () => clearTimeout(t)
  }, [active, loaded, total])

  useEffect(() => {
    if (ready && phase === 'in') setPhase('out')
  }, [ready, phase])
  useEffect(() => {
    if (phase !== 'out') return
    const t = setTimeout(() => {
      setPhase('gone')
      document.body.dataset.ready = '1'
    }, 400)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase === 'gone') return
    const t = setInterval(() => setLine((l) => (l + 1) % LINES.length), 2200)
    return () => clearInterval(t)
  }, [phase])

  if (phase === 'gone') return null
  const finishing = total && loaded >= total
  return (
    <div className={phase === 'out' ? 'loading out' : 'loading'} aria-live="polite">
      <div className="loading-inner">
        <div className="kicker">MGT 409 · Yale SOM</div>
        <h1>
          Evans Hall <span className="loading-dot">·</span> Floor 2
        </h1>
        <div className="loading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="loading-fill" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <div className="loading-meta">
          <span className="pct">{pct}%</span>
          <span>
            {loaded} of {total || '…'} assets{bytes ? ` · ${mb(bytes)} MB` : ''}
          </span>
        </div>
        <div className="loading-item">{finishing ? 'compiling shaders' : shortName(item) || 'starting'}</div>
        <div className="loading-line" key={line}>
          {LINES[line]}…
        </div>
      </div>
    </div>
  )
}
