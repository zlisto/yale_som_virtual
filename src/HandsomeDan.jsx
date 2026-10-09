import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DRUMS, ellPt } from './layout.js'

// Handsome Dan, Yale's bulldog. He tours a loop of 1000 randomly chosen classrooms:
// walk the cloister to the next room, go in through a door, pause at the front, head back out.

export const DAN = { x: 0, z: 0 } // live position for the minimap

const SPEED = 1.8 // m/s
const PAUSE = 2.5 // seconds hanging out at the front of each room
const TOUR_LENGTH = 1000

// cloister centerline loop
const RING = Array.from({ length: 120 }, (_, i) => {
  const t = (i / 120) * Math.PI * 2
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [24.4 * Math.sign(c) * Math.pow(Math.abs(c), 1 / 3), 21.4 * Math.sign(s) * Math.pow(Math.abs(s), 1 / 3)]
})
const nearestRing = (p) => {
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
function ringPath(a, b) {
  const n = RING.length
  const fwd = (b - a + n) % n
  const step = fwd <= n / 2 ? 1 : -1
  const out = []
  for (let i = a; i !== b; i = (i + step + n) % n) out.push(RING[i])
  out.push(RING[b])
  return out
}

// for each classroom: the spot at the front of the room, and the door route out to the cloister
const ROOMS = DRUMS.map((d) => {
  const { fc, back } = d.front
  const inside = [fc[0] + back[0] * 1.6, fc[1] + back[1] * 1.6]
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
  return { inside, ...exit }
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
  return [A.inside, A.inner, A.outer, ...ringPath(A.ring, Bb.ring), Bb.outer, Bb.inner, Bb.inside]
}

function bandanaTex() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#00356b'
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = '#ffffff'
  g.font = 'bold 120px Georgia, serif'
  g.textAlign = 'center'
  g.fillText('Y', 128, 175)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const SPH = new THREE.SphereGeometry(1, 24, 16)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14)
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o })

export default function HandsomeDan() {
  const root = useRef()
  const legs = useRef([])
  const tail = useRef()
  const head = useRef()
  const M = useMemo(
    () => ({
      white: mat('#f4f1ea'),
      brown: mat('#b07a4a'),
      dark: mat('#2a1d16'),
      pink: mat('#d98c8c'),
      tooth: mat('#ffffff', { roughness: 0.3 }),
      eye: mat('#120c08', { roughness: 0.2 }),
      bandana: new THREE.MeshStandardMaterial({ map: bandanaTex(), roughness: 0.9, side: THREE.DoubleSide }),
      tag: mat('#c9a44a', { metalness: 0.8, roughness: 0.3 }),
    }),
    [],
  )
  const bandanaGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    // triangle hanging from the neck, point down
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.17, 0.08, 0, 0.17, 0.08, 0, 0, -0.17, 0.02], 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2))
    g.computeVertexNormals()
    return g
  }, [])

  const state = useMemo(() => {
    const order = tour(1701) // Yale founded 1701
    return { order, leg: 0, path: legPath(order[0], order[1]), seg: 0, u: 0, pause: 0 }
  }, [])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const st = state
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
    const t = clock.elapsedTime
    legs.current.forEach((l, i) => {
      if (l) l.rotation.x = moving ? Math.sin(t * 12 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.5 : 0
    })
    tail.current.rotation.z = Math.sin(t * (moving ? 10 : 18)) * 0.6
    head.current.rotation.y = moving ? Math.sin(t * 2) * 0.1 : Math.sin(t * 1.3) * 0.5
    root.current.children[0].position.y = moving ? Math.abs(Math.sin(t * 12)) * 0.02 : 0
  })

  const B = ({ p, s, m, r = [0, 0, 0], g = SPH }) => <mesh geometry={g} material={m} position={p} scale={s} rotation={r} />
  return (
    <group ref={root}>
      <group>
        {/* stocky body with brown patches */}
        <B p={[0, 0.36, 0]} s={[0.21, 0.19, 0.33]} m={M.white} />
        <B p={[0.1, 0.42, -0.12]} s={[0.12, 0.1, 0.15]} m={M.brown} />
        <B p={[-0.12, 0.33, -0.2]} s={[0.1, 0.1, 0.1]} m={M.brown} />
        <B p={[0, 0.4, 0.2]} s={[0.24, 0.2, 0.18]} m={M.white} />
        {/* legs: front pair wide-set like a bulldog */}
        {[
          [-0.15, 0.22],
          [0.15, 0.22],
          [-0.13, -0.22],
          [0.13, -0.22],
        ].map(([lx, lz], i) => (
          <group key={i} ref={(el) => (legs.current[i] = el)} position={[lx, 0.3, lz]}>
            <B g={CYL} p={[0, -0.13, 0]} s={[0.055, 0.26, 0.055]} m={M.white} />
            <B p={[0, -0.27, 0.03]} s={[0.06, 0.03, 0.08]} m={M.white} />
          </group>
        ))}
        <group ref={tail} position={[0, 0.45, -0.33]}>
          <B p={[0, 0.03, -0.02]} s={[0.035, 0.05, 0.035]} m={M.white} />
        </group>
        {/* bandana + tag */}
        <mesh geometry={bandanaGeo} material={M.bandana} position={[0, 0.47, 0.35]} rotation={[-0.25, 0, 0]} />
        <B g={CYL} p={[0, 0.55, 0.3]} s={[0.2, 0.05, 0.12]} m={M.bandana} />
        {/* big bulldog head */}
        <group ref={head} position={[0, 0.6, 0.36]}>
          <B p={[0, 0, 0]} s={[0.2, 0.17, 0.16]} m={M.white} />
          <B p={[0.08, 0.05, 0.06]} s={[0.09, 0.09, 0.1]} m={M.brown} />
          {[-1, 1].map((sx) => (
            <group key={sx}>
              <B p={[0.16 * sx, 0.11, -0.02]} r={[0, 0, 0.6 * sx]} s={[0.07, 0.04, 0.05]} m={M.dark} />
              <B p={[0.07 * sx, 0.05, 0.13]} s={[0.032, 0.03, 0.02]} m={M.eye} />
              <B p={[0.075 * sx, -0.05, 0.12]} s={[0.075, 0.07, 0.07]} m={M.white} />
            </group>
          ))}
          <B p={[0, 0.0, 0.17]} s={[0.05, 0.035, 0.03]} m={M.eye} />
          {/* underbite: wide jaw, little teeth poking up */}
          <B p={[0, -0.1, 0.11]} s={[0.13, 0.05, 0.08]} m={M.pink} />
          {[-1, 1].map((sx) => (
            <B key={sx} p={[0.06 * sx, -0.06, 0.17]} s={[0.012, 0.022, 0.01]} m={M.tooth} />
          ))}
          <B p={[0, -0.03, 0.16]} s={[0.12, 0.02, 0.03]} m={M.dark} />
        </group>
      </group>
    </group>
  )
}
