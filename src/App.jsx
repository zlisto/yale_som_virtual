import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas, addAfterEffect } from '@react-three/fiber'
import { PerformanceMonitor, Stats } from '@react-three/drei'
import * as THREE from 'three'
import World from './World.jsx'
import Effects from './render/Effects.jsx'
import CameraFeel from './render/CameraFeel.jsx'
import Player, { motion } from './Player.jsx'
import Minimap from './Minimap.jsx'
import TouchControls from './TouchControls.jsx'
import { EYE, SPAWN } from './layout.js'
import { DPR, HUD, NOLOCK, OFF, QUALITY, STATS } from './render/debugCam.js'
import { InteractScene, ui } from './interact/index.jsx'
import { useStore } from './interact/store.js'
import InteractUI from './ui/InteractUI.jsx'
import { trackerState } from './ui/Tracker.jsx'
import { sound } from './interact/sound.js'
import EggsA from './eggs/eggsA.jsx'
import EggsB from './eggs/eggsB.jsx'
import Loading, { LoadingProbe, useLoaded } from './ui/Loading.jsx'

export default function App() {
  const [locked, setLocked] = useState(false)
  const [where, setWhere] = useState('')
  const [showMap, setShowMap] = useState(true)
  // high quality starts at the display's pixel ratio (capped at 2) and steps down a tier
  // (2, 1.5, 1) when the frame rate sits under 47 fps for 75% of a 6 s window; it steps back
  // up when it holds above 57 fps for 6 s. A switch remounts the effect chain and drops a few
  // frames, so it waits until the player is below 0.5 m/s (a step down under 30 fps does not
  // wait: a hitch costs less than walking on at that rate), and the last frame stays on screen
  // (a 2D copy over the canvas) until the new chain has drawn. The bounds are fixed: drei estimates the refresh
  // rate as the highest fps it has seen, so a view slow from the first frame reported its own
  // slow rate as the display rate and never stepped down. Windows are 500 ms: a 250 ms window
  // holds 10 to 12 frames at 40 to 48 fps, reads 44 or 48, and a view at 43 fps never stepped
  // down. After two up-down flips it settles
  // on the lower tier, so a machine that holds 2 keeps 2 and one that cannot stops searching.
  const [tiers] = useState(() => [2, 1.5, 1].filter((t) => t <= Math.max(1, Math.min(2, window.devicePixelRatio || 1))))
  const [tier, setTier] = useState(0)
  const worstTier = useRef(0)
  const tierRef = useRef(0)
  tierRef.current = tier
  const pendingTier = useRef(null) // { next(tier), urgent }: a tier change waiting for the player to slow down
  const glCanvas = useRef(null)
  const shotRef = useRef(null)
  useEffect(() => {
    let hold = null // { ratio, frames, changed } while the copy covers the canvas
    return addAfterEffect(() => {
      const shot = shotRef.current
      const src = glCanvas.current
      if (!shot || !src) return
      if (hold) {
        hold.frames++
        if (src.width !== hold.width && !hold.changed) hold.changed = hold.frames
        if ((hold.changed && hold.frames - hold.changed >= 3) || hold.frames >= 12) {
          shot.style.display = 'none'
          hold = null
        }
        return
      }
      const p = pendingTier.current
      if (!p || (motion.speed > 0.5 && !p.urgent)) return
      pendingTier.current = null
      const next = p.next(tierRef.current)
      if (next === tierRef.current) return
      // runs right after the frame is drawn, so the drawing buffer still holds it
      shot.width = src.width
      shot.height = src.height
      shot.getContext('2d').drawImage(src, 0, 0)
      shot.style.display = 'block'
      hold = { width: src.width, frames: 0, changed: 0 }
      setTier(next)
    })
  }, [])
  const dpr = DPR ?? tiers[tier]
  const loaded = useLoaded()
  const lockRef = useRef()
  const mapRef = useRef()
  const onLock = useCallback((v) => setLocked(v), [])
  // dev only: window.__lock(true) shows the locked HUD (aim dot) in a headless browser, and
  // window.__ui.set({ awaitLock: true }) the "click to look" hint
  if (import.meta.env.DEV) window.__lock = setLocked
  if (import.meta.env.DEV) window.__ui = ui
  const onWhere = useCallback((w) => setWhere(w), [])
  // phones have no pointer lock, so they get a joystick + drag-to-look instead
  const [isTouch] = useState(() => matchMedia('(pointer: coarse)').matches) // phones + tablets; touchscreen laptops still get mouse mode
  const [touchOn, setTouchOn] = useState(false)
  const touchRef = useRef({ active: false, move: [0, 0], look: [0, 0], jump: false })
  const setTouch = (on) => {
    touchRef.current.active = on
    touchRef.current.move = [0, 0]
    setTouchOn(on)
  }
  const frozen = useStore(ui, (s) => s.frozen) // a dialogue is open: keep the start overlay away
  const awaitLock = useStore(ui, (s) => s.awaitLock) // lock refused or pending: a hint, not the card
  const trackerOpen = useStore(trackerState, (s) => s.open)
  const playing = locked || touchOn || frozen || awaitLock
  // the start card: a click, tap, Enter or Space walks in and starts the audio
  const enter = () => {
    sound.start()
    if (isTouch) setTouch(true)
    else lockRef.current?.()
  }
  const cardUp = !playing && !NOLOCK && loaded
  useEffect(() => {
    if (!cardUp) return
    const k = (e) => {
      if (e.code !== 'Enter' && e.code !== 'Space') return
      e.preventDefault()
      enter()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  useEffect(() => {
    const k = (e) => e.code === 'KeyM' && setShowMap((v) => !v)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  return (
    <>
      <Canvas
        camera={{ fov: 72, near: 0.05, far: 800, position: [SPAWN.x, EYE, SPAWN.z] }}
        dpr={dpr}
        shadows={QUALITY === 'low' || OFF.has('shadow') ? false : 'soft'}
        gl={{ antialias: QUALITY === 'low', powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          glCanvas.current = gl.domElement
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.0
          gl.outputColorSpace = THREE.SRGBColorSpace
        }}
      >
        <Suspense fallback={null}>
          <World />
          <InteractScene />
          <EggsA />
          <EggsB />
        </Suspense>
        <Player lockRef={lockRef} mapRef={mapRef} touchRef={touchRef} onLock={onLock} onWhere={onWhere} />
        <CameraFeel />
        <LoadingProbe />
        {/* N8AO keeps stale half-res buffers across a pixel-ratio change, so the chain remounts */}
        <Effects key={dpr} />
        {QUALITY !== 'low' && !DPR && loaded && tiers.length > 1 && (
          <PerformanceMonitor
            ms={500}
            iterations={12}
            flipflops={2}
            bounds={() => [47, 57]}
            onDecline={(api) =>
              (pendingTier.current = {
                urgent: api.fps < 30,
                next: (t) => {
                  const next = Math.min(t + 1, tiers.length - 1)
                  worstTier.current = Math.max(worstTier.current, next)
                  return next
                },
              })
            }
            onIncline={() => (pendingTier.current = { next: (t) => Math.max(t - 1, 0) })}
            onFallback={() => (pendingTier.current = { next: () => worstTier.current })}
          />
        )}
        {STATS && <Stats />}
      </Canvas>
      <canvas ref={shotRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', display: 'none' }} />

      {HUD && <div className="where">
        <span className="dot" />
        {where}
      </div>}
      <div className={showMap && HUD ? 'mapwrap' : 'mapwrap hidden'}>
        <Minimap drawRef={mapRef} />
      </div>
      {HUD && <button className="maptoggle" onClick={() => setShowMap((s) => !s)}>
        {showMap ? 'hide map' : 'map'}
      </button>}
      {/* the aim dot shows only while the view is steering: pointer locked (or touch mode), no
          dialogue, no tracker panel; the start card and the "click to look" hint get none */}
      {(locked || touchOn) && !frozen && !trackerOpen && <div className="crosshair" />}
      {awaitLock && !locked && !frozen && <div className="lockhint">click to look</div>}
      <InteractUI />
      {touchOn && <TouchControls touchRef={touchRef} onPause={() => setTouch(false)} />}

      {!playing && !NOLOCK && (
        <div className="overlay" onClick={enter}>
          <div className="card">
            <div className="kicker">MGT 409 · Yale SOM</div>
            <h1>
              Evans Hall <span className="accent">·</span> Floor 2
            </h1>
            <p className="sub">Classroom drums, the cloister, Ross Library, the Beinecke Terrace Room, and the courtyard.</p>
            <button className="go">{isTouch ? 'Tap to enter' : 'Press to enter'}</button>
            {!isTouch && (
              <button
                className="go alt"
                onClick={(e) => {
                  e.stopPropagation()
                  sound.start()
                  setTouch(true)
                }}
              >
                Use on-screen joystick
              </button>
            )}
            {isTouch ? (
              <div className="keys">
                <span>
                  <kbd>Left thumb</kbd> joystick to walk (push all the way to hurry)
                </span>
                <span>
                  <kbd>Right thumb</kbd> drag to look
                </span>
              </div>
            ) : (
              <div className="keys">
                <span>
                  <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd> move
                </span>
                <span>
                  <kbd>mouse</kbd> or <kbd>arrows</kbd> look
                </span>
                <span>
                  <kbd>Space</kbd> hop
                </span>
                <span>
                  <kbd>Shift</kbd> sprint
                </span>
                <span>
                  <kbd>C</kbd> crouch
                </span>
                <span>
                  <kbd>E</kbd> interact
                </span>
                <span>
                  <kbd>M</kbd> map
                </span>
                <span>
                  <kbd>N</kbd> sound
                </span>
                <span>
                  <kbd>B</kbd> music
                </span>
                <span>
                  <kbd>T</kbd> easter eggs
                </span>
                <span>
                  <kbd>Esc</kbd> pause
                </span>
              </div>
            )}
            <div className="credit">Built for MGT 409 · Yale SOM</div>
          </div>
        </div>
      )}
      <Loading />
    </>
  )
}
