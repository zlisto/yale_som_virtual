import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { preloadModel, useClipPlayer, useRigInstance } from './characters/rig.js'
import { turnToward } from './life/common.js'
import { BENCHES, COURT_HX, DRUMS, PLANTS, PLANTS_EXTRA, ellPt } from './layout.js'

// Handsome Dan, Yale's bulldog. He tours a loop of 1000 randomly chosen classrooms:
// walk the cloister to the next room, go in through a door, pause at the front, head back out.
// On the cloister loop he stops now and then: he trots over to a potted plant and sniffs it for 3 s, and when
// you are within 5 m as he passes a banquette he sits by it for 6 s and his head follows you (up to 60 degrees
// either way of his body).

export const DAN = { x: 0, z: 0 } // live position for the minimap

const SPEED = 1.8 // m/s
const PAUSE = 2.5 // seconds hanging out at the front of each room
const TOUR_LENGTH = 1000

// cloister loop, sized to clear the plants, banquettes and columns by about 0.25 m: 1.65 m outside
// the courtyard glass east and west (x 23.4 on the round-3 floor, 31.4 now), 2.9 m north and south
export const RING_HX = COURT_HX + 1.65
export const RING_HZ = 22.9
export const RING = Array.from({ length: 120 }, (_, i) => {
  const t = (i / 120) * Math.PI * 2
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [RING_HX * Math.sign(c) * Math.pow(Math.abs(c), 1 / 3), RING_HZ * Math.sign(s) * Math.pow(Math.abs(s), 1 / 3)]
})
export const nearestRing = (p) => {
  let best = 0
  let bd = Infinity
  RING.forEach((q, i) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return best
}
export function ringPath(a, b) {
  const n = RING.length
  const fwd = (b - a + n) % n
  const step = fwd <= n / 2 ? 1 : -1
  const out = []
  for (let i = a; i !== b; i = (i + step + n) % n) out.push(RING[i])
  out.push(RING[b])
  return out
}

// for each classroom: the spot at the front of the room, and the door route out to the cloister
export const ROOMS = DRUMS.map((d) => {
  const { fc, back, t, half } = d.front
  const at = (depth, lat) => [fc[0] + back[0] * depth + t[0] * lat, fc[1] + back[1] * depth + t[1] * lat]
  const inside = at(1.6, 0)
  const routes = d.doors.map((a) => {
    const p = ellPt(d.c, d.rx, d.rz, a)
    const n = [p[0] - d.c[0], p[1] - d.c[1]]
    const l = Math.hypot(...n)
    const inner = [p[0] - (n[0] / l) * 0.7, p[1] - (n[1] / l) * 0.7]
    const outer = [p[0] + (n[0] / l) * 1.0, p[1] + (n[1] / l) * 1.0]
    const ring = nearestRing(outer)
    return { inner, outer, ring, cost: Math.hypot(RING[ring][0] - outer[0], RING[ring][1] - outer[1]) }
  })
  const exit = routes.reduce((a, b) => (b.cost < a.cost ? b : a))
  // walk along the front of the room to the door: the front row of desks wraps round to the
  // door side, so go behind the lectern (+t side) or in front of the professor (-t side)
  const sgn = Math.sign((exit.inner[0] - fc[0]) * t[0] + (exit.inner[1] - fc[1]) * t[1])
  const via = sgn > 0 ? [at(1.0, half - 1)] : [at(0.5, -1), at(1.0, -(half - 1))]
  return { inside, via, ...exit }
})

function tour(seed) {
  let s = seed
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const out = []
  while (out.length < TOUR_LENGTH) {
    const k = Math.floor(r() * ROOMS.length)
    if (k !== out[out.length - 1]) out.push(k)
  }
  if (out[0] === out[out.length - 1]) out[out.length - 1] = (out[0] + 1) % ROOMS.length
  return out
}

function legPath(from, to) {
  const A = ROOMS[from]
  const Bb = ROOMS[to]
  return [A.inside, ...A.via, A.inner, A.outer, ...ringPath(A.ring, Bb.ring), Bb.outer, Bb.inner, ...[...Bb.via].reverse(), Bb.inside]
}

// stops on the loop: plants within 3.2 m of it (sniffed at most every 90 s each), banquettes (a sit at most
// every 40 s each, and only while you are near), and at least 20 s of walking between two stops
// A plant's stop is the nearest loop point within 3.2 m whose straight walk to the pot clears every banquette
// by 0.5 m (the plant at (12.0, -20.55) stands behind one).

const BENCH_SEGS = BENCHES.map((b) => {
  const d = [Math.cos(b.rot), -Math.sin(b.rot)]
  return [[b.c[0] - (d[1] * b.len) / 2, b.c[1] + (d[0] * b.len) / 2], [b.c[0] + (d[1] * b.len) / 2, b.c[1] - (d[0] * b.len) / 2]]
})
function segDist(p, q, a, b) {
  // distance between segments pq and ab (sampled along pq: plenty for 3 m walks)
  let best = Infinity
  for (let i = 0; i <= 20; i++) {
    const x = p[0] + ((q[0] - p[0]) * i) / 20
    const z = p[1] + ((q[1] - p[1]) * i) / 20
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
    best = Math.min(best, Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u))
  }
  return best
}
const SNIFFS = [...PLANTS, ...PLANTS_EXTRA].flatMap((p) => {
  const ring = RING.map((r, i) => ({ i, d: Math.hypot(r[0] - p[0], r[1] - p[1]) }))
    .filter((r) => r.d < 3.2)
    .sort((a, b) => a.d - b.d)
    .find((r) => BENCH_SEGS.every(([a, b]) => segDist(RING[r.i], p, a, b) > 0.95)) // half the 0.9 m depth + 0.5
  return ring ? [{ kind: 'sniff', p, ring: ring.i, next: 8 }] : []
})
const SITS = BENCHES.map((b) => ({ kind: 'sit', p: b.c, ring: nearestRing(b.c), next: 0 }))
const STOPS = [...SNIFFS, ...SITS]
const SNIFF_S = 3
const SIT_S = 6
const SIT_NEAR = 5 // m from the camera
const HEAD_MAX = Math.PI / 3
const _ax = new THREE.Vector3()
const _fw = new THREE.Vector3()
const _pq = new THREE.Quaternion()
const _hq = new THREE.Quaternion()

preloadModel('handsome_dan')

const STRIDE = 0.55 // meters covered per Walk cycle at timeScale 1 (the clip is 0.8 s)

function DanModel() {
  const root = useRef()
  const { object, actions } = useRigInstance('handsome_dan')
  const play = useClipPlayer(actions, 0.25)
  const walkScale = SPEED / STRIDE / (1 / 0.8)

  const state = useMemo(() => {
    const order = tour(1701) // Yale founded 1701
    return { order, leg: 0, path: legPath(order[0], order[1]), seg: 0, u: 0, pause: 0, stop: null, headYaw: 0 }
  }, [])
  const headBone = useMemo(() => {
    let j = null
    object.traverse((b) => b.isBone && b.name === 'head' && (j = b))
    return j
  }, [object])
  // the head's forward axis in its own frame, read from the rest pose (the rest pose is the Idle pose, head
  // straight ahead along the body's +z). The Sit clip pitches the spine up, which swings the head sideways,
  // so the sit aims the head from its measured direction instead of adding a fixed offset.
  const headFwd = useMemo(() => {
    if (!headBone) return null
    object.updateMatrixWorld(true)
    const rel = object.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(headBone.getWorldQuaternion(new THREE.Quaternion()))
    return new THREE.Vector3(0, 0, 1).applyQuaternion(rel.invert())
  }, [object, headBone])
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    // dev readout, and danStop(i) to put him at stop i now (screenshots; the sit skips the 5 m check)
    window.__life ||= {}
    window.__life.dan = () => [root.current.position.x, root.current.position.z, root.current.rotation.y, state.stop?.kind, state.stop?.phase, state.headYaw, Object.keys(actions).filter((k) => actions[k].isRunning()).join("+")]
    window.__life.danStops = STOPS.map((q) => [q.kind, ...q.p])
    window.__life.danStop = (i) => (state.force = i)
  }

  // a stop on the loop; returns true while it holds Dan in place of the tour
  const stopStep = (st, t, dt, camera) => {
    const o = root.current
    const S = st.stop
    const walkTo = (to, gap) => {
      const dx = to[0] - o.position.x
      const dz = to[1] - o.position.z
      const d = Math.hypot(dx, dz)
      if (d <= gap + 0.02) return true
      const k = Math.min(SPEED * dt, d - gap) / d
      o.position.x += dx * k
      o.position.z += dz * k
      turnToward(o, Math.atan2(dx, dz), dt * 8)
      play('Walk', { timeScale: walkScale })
      return false
    }
    if (S.kind === 'sniff') {
      if (S.phase === 'go' && walkTo(S.q.p, 0.75)) {
        S.phase = 'sniff'
        S.t0 = t
      } else if (S.phase === 'sniff') {
        play('Idle')
        turnToward(o, Math.atan2(S.q.p[0] - o.position.x, S.q.p[1] - o.position.z), dt * 6)
        // nose down to the pot on top of the Idle clip
        if (headBone) headBone.rotateX(-0.5 - 0.08 * Math.sin(t * 14))
        if (t - S.t0 > SNIFF_S) S.phase = 'back'
      } else if (S.phase === 'back' && walkTo(S.from, 0)) {
        st.stop = null
        st.quiet = t + 20
        return false
      }
    } else {
      // sit by the banquette turned toward you as you were when he sat; the head then follows you
      play('Sit')
      S.yaw ??= Math.atan2(camera.position.x - o.position.x, camera.position.z - o.position.z)
      turnToward(o, S.yaw, dt * 5)
      let a = Math.atan2(camera.position.x - o.position.x, camera.position.z - o.position.z) - o.rotation.y
      a = Math.atan2(Math.sin(a), Math.cos(a))
      a = Math.max(-HEAD_MAX, Math.min(HEAD_MAX, a))
      st.headYaw += (a - st.headYaw) * Math.min(1, dt * 5)
      if (headBone && headFwd) {
        // where the head points now (after the clip), then turn it about the world vertical through its pivot
        // to body yaw + headYaw; the turn is expressed in the head's parent space
        _fw.copy(headFwd).applyQuaternion(headBone.getWorldQuaternion(_hq))
        let d = o.rotation.y + st.headYaw - Math.atan2(_fw.x, _fw.z)
        d = Math.atan2(Math.sin(d), Math.cos(d))
        headBone.parent.getWorldQuaternion(_pq).invert()
        _ax.set(0, 1, 0).applyQuaternion(_pq)
        headBone.quaternion.premultiply(_hq.setFromAxisAngle(_ax, d))
      }
      if (t - S.t0 > SIT_S) {
        st.stop = null
        st.quiet = t + 20
        st.headYaw = 0
        return false
      }
    }
    DAN.x = o.position.x
    DAN.z = o.position.z
    return true
  }

  useFrame(({ clock, camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const st = state
    const t = clock.elapsedTime
    if (import.meta.env.DEV && st.force !== undefined) {
      const q = STOPS[st.force]
      root.current.position.set(RING[q.ring][0], 0, RING[q.ring][1])
      st.stop = { kind: q.kind, q, phase: 'go', t0: t, from: RING[q.ring] }
      st.force = undefined
    }
    if (st.stop && stopStep(st, t, dt, camera)) return
    // start a stop when he walks past its ring point on the loop
    if (!st.stop && st.pause <= 0 && !(t < st.quiet)) {
      const p = root.current.position
      for (const q of STOPS) {
        if (t < q.next || Math.hypot(RING[q.ring][0] - p.x, RING[q.ring][1] - p.z) > 0.3) continue
        if (q.kind === 'sit' && Math.hypot(camera.position.x - p.x, camera.position.z - p.z) > SIT_NEAR) continue
        q.next = t + (q.kind === 'sit' ? 40 : 90)
        st.stop = { kind: q.kind, q, phase: 'go', t0: t, from: [p.x, p.z] }
        if (stopStep(st, t, dt, camera)) return
        break
      }
    }
    let moving = true
    if (st.pause > 0) {
      st.pause -= dt
      moving = false
    } else {
      let step = SPEED * dt
      while (step > 0) {
        const a = st.path[st.seg]
        const b = st.path[st.seg + 1]
        if (!b) {
          // arrived: pause, then start the next leg of the 1000-room loop
          st.leg = (st.leg + 1) % st.order.length
          st.path = legPath(st.order[st.leg], st.order[(st.leg + 1) % st.order.length])
          st.seg = 0
          st.u = 0
          st.pause = PAUSE
          break
        }
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6
        const left = (1 - st.u) * len
        if (step < left) {
          st.u += step / len
          step = 0
        } else {
          step -= left
          st.seg += 1
          st.u = 0
        }
      }
    }
    const a = st.path[st.seg]
    const b = st.path[st.seg + 1] || a
    const x = a[0] + (b[0] - a[0]) * st.u
    const z = a[1] + (b[1] - a[1]) * st.u
    root.current.position.set(x, 0, z)
    if (b !== a) {
      const want = Math.atan2(b[0] - a[0], b[1] - a[1])
      let d = want - root.current.rotation.y
      d = Math.atan2(Math.sin(d), Math.cos(d))
      root.current.rotation.y += d * Math.min(1, dt * 8)
    }
    DAN.x = x
    DAN.z = z
    if (import.meta.env.DEV) document.body.dataset.dan = `${x.toFixed(2)},${z.toFixed(2)},${st.order[st.leg]},${st.order[(st.leg + 1) % st.order.length]}`
    // Walk while touring, Idle (pant, look around) while he pauses at the front of a room
    play(moving ? 'Walk' : 'Idle', { timeScale: moving ? walkScale : 1 })
  })

  return (
    <group ref={root}>
      <primitive object={object} />
    </group>
  )
}

export default function HandsomeDan() {
  return (
    <Suspense fallback={null}>
      <DanModel />
    </Suspense>
  )
}
