import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import * as LAYOUT from './layout.js'
import { DEBUG_CAM, NOLOCK } from './render/debugCam.js'
import { ui } from './interact/store.js'
import { sound } from './interact/sound.js'
import { pushOut } from './interact/registry.js'

const { COLLIDERS, EYE, MAX_STEP, R_PLAYER, SPAWN, floorAt, locate } = LAYOUT
const CROUCH_EYE = 1.05
const GRAVITY = 12
// a 1.1 m hop (v = sqrt(2 g h)), so a desk top (0.75 m on the floor, about 0.95 m with its
// modesty panel) is reachable from the floor; the old 4.2 m/s gave 0.74 m and fell short
const JUMP_SPEED = Math.sqrt(2 * GRAVITY * 1.1)
// walk-up height without a jump: MAX_STEP (0.4 m) covers the 0.32 m risers and anything up to
// the 0.35 m step the brief asks for; taller surfaces need a hop
const STEP_UP = Math.max(0.35, MAX_STEP)
const TAU = Math.PI * 2

// ---------- what you can stand on
// Low colliders (desks, tables, benches: anything under 1.5 m) are floor once your feet are
// within STEP_UP of their top, and a wall until then. layout.js collide() treats every collider
// as a wall, so the player runs its own copy of that loop that skips the ones it can stand on.
const LOW = COLLIDERS.filter((c) => c.h < 1.5).map((c) => ({ ...c, top: c.y0 + c.h }))
// Desk arcs from layout.js (r3-g): per room, rings { cx, cz, rotation, innerR, outerR, startAngle,
// endAngle, topY }. Read defensively: the export may be missing, an object keyed by room or an
// array, and a ring without angles is a full annulus. Angles use the layout convention
// atan2(dx, dz) (ellPt: x = sin, z = cos), measured after subtracting `rotation`.
const RINGS = (() => {
  const raw = LAYOUT.DESK_SURFACES
  if (!raw) return []
  const rooms = Array.isArray(raw) ? raw : Object.values(raw)
  return rooms.flatMap((r) => (Array.isArray(r) ? r : r?.rings ?? [r])).filter((r) => r && Number.isFinite(r.cx) && Number.isFinite(r.topY))
})()
function inRing(r, x, z) {
  const dx = x - r.cx
  const dz = z - r.cz
  const d = Math.hypot(dx, dz)
  if (d < (r.innerR ?? 0) || d > (r.outerR ?? 0)) return false
  if (r.startAngle == null || r.endAngle == null) return true
  const a = (((Math.atan2(dx, dz) - (r.rotation || 0) - r.startAngle) % TAU) + TAU) % TAU
  return a <= (((r.endAngle - r.startAngle) % TAU) + TAU) % TAU || r.endAngle - r.startAngle >= TAU
}
function onSegment(c, x, z) {
  if (x < c.minx - c.t / 2 || x > c.maxx + c.t / 2 || z < c.minz - c.t / 2 || z > c.maxz + c.t / 2) return false
  const dx = c.b[0] - c.a[0]
  const dz = c.b[1] - c.a[1]
  const l2 = dx * dx + dz * dz
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - c.a[0]) * dx + (z - c.a[1]) * dz) / l2)) : 0
  return Math.hypot(x - (c.a[0] + dx * u), z - (c.a[1] + dz * u)) <= c.t / 2
}
// ground under (x, z) for feet at height `feet`: the riser floor, raised by any desk or table top
// within STEP_UP of the feet; wall: a surface there is too tall to step onto
const probeOut = { ground: 0, wall: false }
export function probe(x, z, feet) {
  let ground = floorAt(x, z)
  let wall = ground > feet + STEP_UP + 1e-3
  const reach = feet + STEP_UP + 1e-3
  for (const c of LOW) {
    if (!onSegment(c, x, z)) continue
    if (c.top <= reach) ground = Math.max(ground, c.top)
    else wall = true
  }
  for (const r of RINGS) {
    if (!inRing(r, x, z)) continue
    if (r.topY <= reach) ground = Math.max(ground, r.topY)
    else wall = true
  }
  probeOut.ground = ground
  probeOut.wall = wall
  return probeOut
}
// layout.js collide() minus the low colliders your feet are already above (or can step onto)
function collideAt(pos, feet) {
  const reach = feet + STEP_UP + 1e-3
  for (let it = 0; it < 3; it++) {
    for (const s of COLLIDERS) {
      if (s.h < 1.5 && s.y0 + s.h <= reach) continue
      const rr = R_PLAYER + s.t / 2
      if (pos.x < s.minx - rr || pos.x > s.maxx + rr || pos.z < s.minz - rr || pos.z > s.maxz + rr) continue
      const dx = s.b[0] - s.a[0]
      const dz = s.b[1] - s.a[1]
      const l2 = dx * dx + dz * dz
      const u = l2 > 0 ? Math.max(0, Math.min(1, ((pos.x - s.a[0]) * dx + (pos.z - s.a[1]) * dz) / l2)) : 0
      const ex = pos.x - (s.a[0] + dx * u)
      const ez = pos.z - (s.a[1] + dz * u)
      const d = Math.hypot(ex, ez)
      if (d < rr && d > 1e-6) {
        pos.x += (ex / d) * (rr - d)
        pos.z += (ez / d) * (rr - d)
      }
    }
  }
  return pos
}
const LOOK_SPEED = 0.005 // radians per touch pixel
const KEY_YAW = (120 * Math.PI) / 180 // arrow-key look, radians per second
const KEY_PITCH = (80 * Math.PI) / 180
// Movement runs at a fixed 120 Hz substep and the camera is drawn between the last two
// substeps, so a long or short frame (shadow redraw, pixel-ratio change) moves the view by
// exactly the time that passed. Frames longer than 50 ms are clamped.
const STEP_DT = 1 / 120
// eye height (floor + standing or crouched eye) follows a critically damped spring with an
// 80 ms smoothing time, so riser steps and crouch ease in and out without a kink
const EYE_OMEGA = 2 / 0.08
// arrow-key and touch look ease toward their target with a 35 ms time constant; the mouse
// under pointer lock turns the camera directly (damping a locked pointer reads as lag)
const LOOK_TAU = 0.035

// what CameraFeel (head bob, sprint FOV) and App (pixel-ratio switches) read about the walk:
// horizontal meters walked since load (dist at the last substep, drawn at the drawn camera
// position) and the smoothed speed in m/s. SoundLoop reads grounded (feet on a floor, desk or
// step: no footsteps in the air), blocked (pushing into a wall: under 40% of the intended move
// went through) and feet (height of the feet above world zero).
export const motion = { dist: 0, drawn: 0, speed: 0, grounded: true, blocked: false, feet: 0 }

// PC controls work like a shooter: WASD move, mouse or arrow keys look, Shift sprint, Space hop, C crouch.
// Touch controls come in through touchRef: { active, move: [x, y], look: [dx, dy], jump }.
export default function Player({ lockRef, mapRef, touchRef, onLock, onWhere }) {
  const { camera, gl } = useThree()
  const controls = useMemo(() => new PointerLockControls(camera, gl.domElement), [camera, gl])
  const keys = useRef({})
  const where = useRef('')
  const eye = useRef(EYE)
  const devY = useRef(null) // dev teleport can pin the camera height
  // simulation state: current (x, y, z) and previous substep (px, py, pz); y is floor + eye
  // without the jump, v its spring velocity; rx, rz is where the camera was last drawn, so a
  // move by anything else (dev teleport, ?cam=) resets the simulation there
  const sim = useRef(null)
  const look = useRef({ yaw: 0, pitch: 0 }) // arrow and touch look still to apply
  const fwd = useMemo(() => new THREE.Vector3(), [])
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])

  useEffect(() => {
    camera.position.set(SPAWN.x, EYE, SPAWN.z)
    camera.rotation.set(0, 0, 0)
    if (DEBUG_CAM) {
      camera.position.set(DEBUG_CAM.x, DEBUG_CAM.y, DEBUG_CAM.z)
      camera.rotation.set(DEBUG_CAM.pitch, DEBUG_CAM.yaw, 0, 'YXZ')
      devY.current = DEBUG_CAM.y
    }
    // The browser refuses pointer lock for about a second after Esc. A request sets
    // ui.awaitLock; the lock event clears it. While it is set, App shows a small "click to look"
    // hint in place of the start card and the next click asks again. three's own
    // pointerlockerror handler only logs a console error, so it comes off.
    const doc = gl.domElement.ownerDocument
    doc.removeEventListener('pointerlockerror', controls._onPointerlockError)
    let lastTry = 0
    const tryLock = () => {
      lastTry = performance.now()
      ui.set({ awaitLock: true })
      try {
        gl.domElement.requestPointerLock()?.catch?.(() => {})
      } catch {
        // refused synchronously (older browsers); the next click retries
      }
    }
    lockRef.current = tryLock
    // the dialogue closes with a click or key press, which is a user gesture, so lock can come back
    ui.set({ relock: tryLock })
    const retry = () => {
      const s = ui.get()
      if (s.awaitLock && !controls.isLocked && !s.frozen && performance.now() - lastTry > 150) tryLock()
    }
    window.addEventListener('click', retry)
    const on = () => {
      ui.set({ awaitLock: false })
      onLock(true)
    }
    const off = () => {
      keys.current = {} // keys held during Esc never get a keyup
      onLock(false)
    }
    controls.addEventListener('lock', on)
    controls.addEventListener('unlock', off)
    const down = (e) => {
      // Esc while waiting for the lock means pause: let the start card come back
      if (e.code === 'Escape' && ui.get().awaitLock && !controls.isLocked) ui.set({ awaitLock: false })
      keys.current[e.code] = true
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    }
    const up = (e) => (keys.current[e.code] = false)
    const blur = () => (keys.current = {})
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      controls.removeEventListener('lock', on)
      controls.removeEventListener('unlock', off)
      controls.dispose()
      window.removeEventListener('click', retry)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [camera, controls, gl, lockRef, onLock])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    // dev only: teleport for screenshots by setting <body data-go="[x, z, yawDeg]">
    if (import.meta.env.DEV && document.body.dataset.go) {
      const [x, z, yaw, pitch = 0, y = null] = JSON.parse(document.body.dataset.go)
      devY.current = y
      delete document.body.dataset.go
      camera.position.set(x, EYE, z)
      camera.rotation.set(pitch, (yaw * Math.PI) / 180, 0, 'YXZ')
    }
    const st = sim.current
    if (!st || Math.abs(camera.position.x - st.rx) > 1e-6 || Math.abs(camera.position.z - st.rz) > 1e-6) {
      const { x, z } = camera.position
      // a dev teleport with a height (data-go y) can drop you onto a desk; otherwise the floor
      const feet0 = devY.current != null ? probe(x, z, devY.current - eye.current).ground : floorAt(x, z)
      const y = feet0 + eye.current
      sim.current = { x, z, y, px: x, pz: z, py: y, v: 0, feet: feet0, vy: 0, grounded: true, acc: 0, rx: x, rz: z }
    }
    const S = sim.current
    const touch = touchRef.current
    // a dialogue (ui.frozen) stops movement and look; ?nolock walks without pointer lock
    const frozen = ui.get().frozen
    const playing = controls.isLocked || touch.active || NOLOCK
    const active = playing && !frozen
    if (playing !== ui.get().playing || touch.active !== ui.get().touch) ui.set({ playing, touch: touch.active })

    // touch look: drag on the right side of the screen
    const L = look.current
    if (active && touch.active && (touch.look[0] || touch.look[1])) {
      L.yaw -= touch.look[0] * LOOK_SPEED
      L.pitch -= touch.look[1] * LOOK_SPEED
    }
    touch.look[0] = 0
    touch.look[1] = 0

    // arrow keys look: left/right yaw, up/down pitch, clamped to the mouse's pitch limits
    const k = keys.current
    const ay = active ? (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0) : 0
    const ap = active ? (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0) : 0
    L.yaw += ay * KEY_YAW * dt
    L.pitch += ap * KEY_PITCH * dt
    if (!active) L.yaw = L.pitch = 0
    if (Math.abs(L.yaw) > 1e-5 || Math.abs(L.pitch) > 1e-5) {
      const kk = 1 - Math.exp(-dt / LOOK_TAU)
      euler.setFromQuaternion(camera.quaternion)
      euler.y += L.yaw * kk
      const lo = Math.max(-1.45, Math.PI / 2 - controls.maxPolarAngle)
      const hi = Math.min(1.45, Math.PI / 2 - controls.minPolarAngle)
      euler.x = Math.max(lo, Math.min(hi, euler.x + L.pitch * kk))
      camera.quaternion.setFromEuler(euler)
      L.yaw -= L.yaw * kk
      L.pitch -= L.pitch * kk
    }

    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()

    let f = 0
    let s = 0
    let sprint = false
    if (active) {
      f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)
      s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
      sprint = k.ShiftLeft || k.ShiftRight
    }
    if (active && touch.active && (touch.move[0] || touch.move[1])) {
      f = -touch.move[1]
      s = touch.move[0]
      sprint = Math.hypot(f, s) > 0.95 // push the stick all the way to hurry
    }
    let mx = fwd.x * f - fwd.z * s
    let mz = fwd.z * f + fwd.x * s
    const l = Math.hypot(mx, mz)
    if (l > 1) {
      mx /= l
      mz /= l
    }
    const crouching = active && k.KeyC
    const speed = l > 0.05 ? (crouching ? 2.4 : sprint ? 9.5 : 5.5) : 0 // m/s; brisk walk, sprint is a jog
    const wantJump = (active && k.Space) || touch.jump
    touch.jump = false
    if (active && wantJump && S.grounded) {
      S.vy = JUMP_SPEED
      S.grounded = false
    }
    const eyeTarget = crouching ? CROUCH_EYE : EYE
    eye.current = eyeTarget

    S.acc += dt
    for (let n = 0; S.acc >= STEP_DT && n < 8; n++) {
      S.acc -= STEP_DT
      S.px = S.x
      S.pz = S.z
      S.py = S.y
      if (speed) {
        const pos = { x: S.x + mx * speed * STEP_DT, z: S.z + mz * speed * STEP_DT }
        collideAt(pos, S.feet)
        pushOut(pos) // solid interactables (signs, NPCs)
        // risers and desk tops: walk up anything within STEP_UP of the feet; taller acts like a wall
        if (!probe(pos.x, pos.z, S.feet).wall) {
          S.x = pos.x
          S.z = pos.z
        } else if (!probe(pos.x, S.z, S.feet).wall) {
          S.x = pos.x // slide along the edge
        } else if (!probe(S.x, pos.z, S.feet).wall) {
          S.z = pos.z
        }
      }
      const moved = Math.hypot(S.x - S.px, S.z - S.pz)
      S.moved = moved
      motion.dist += moved
      motion.speed += (moved / STEP_DT - motion.speed) * (1 - Math.exp(-STEP_DT / 0.08))
      motion.blocked = speed > 0 && moved < 0.4 * speed * STEP_DT
      // feet: stay on the ground through steps of up to STEP_UP either way; a bigger drop (the
      // far side of a desk) is a fall. In the air, gravity until the feet meet a surface.
      const g = probe(S.x, S.z, S.feet).ground
      // A 60 ms grace before a fall starts carries you over the 5 cm gaps between desk segments
      // (and any gap under about 0.3 m at walk speed) without a stumble.
      if (S.grounded) {
        if (g < S.feet - STEP_UP) {
          S.unsup = (S.unsup || 0) + STEP_DT
          if (S.unsup > 0.06) {
            S.grounded = false
            S.vy = 0
          }
        } else {
          S.unsup = 0
          S.feet = g
        }
      }
      if (!S.grounded) {
        S.vy -= GRAVITY * STEP_DT
        S.feet += S.vy * STEP_DT
        if (S.feet <= g) {
          S.feet = g
          S.vy = 0
          S.grounded = true
          S.unsup = 0
        }
      }
      motion.grounded = S.grounded
      motion.feet = S.feet
      // eye height: on the ground a critically damped spring eases steps and crouch (semi-implicit
      // Euler; stable while EYE_OMEGA * STEP_DT is well under 1); in the air the eye catches up with
      // the feet within about 20 ms, so a hop is a clean arc
      const target = S.feet + eyeTarget
      if (S.grounded) {
        S.v += (-2 * EYE_OMEGA * S.v - EYE_OMEGA * EYE_OMEGA * (S.y - target)) * STEP_DT
        S.y += S.v * STEP_DT
      } else {
        S.v = S.vy
        S.y += (target - S.y) * Math.min(1, STEP_DT * EYE_OMEGA * 2)
      }
    }
    // draw between the previous and the current substep
    const a = S.acc / STEP_DT
    camera.position.x = S.px + (S.x - S.px) * a
    camera.position.z = S.pz + (S.z - S.pz) * a
    camera.position.y = devY.current ?? S.py + (S.y - S.py) * a
    S.rx = camera.position.x
    S.rz = camera.position.z
    motion.drawn = motion.dist - (S.moved || 0) * (1 - a)

    if (import.meta.env.DEV) window.__motion = motion
    if (import.meta.env.DEV) document.body.dataset.pos = `${camera.position.x.toFixed(2)},${camera.position.z.toFixed(2)},${fwd.x.toFixed(2)},${fwd.z.toFixed(2)}|${touch.move.map((v) => v.toFixed(2))}`
    mapRef.current?.(camera.position.x, camera.position.z, fwd.x, fwd.z)
    const w = locate(camera.position.x, camera.position.z)
    if (w !== where.current) {
      where.current = w
      onWhere(w)
      sound.setPlace(w)
    }
  })
  return null
}
