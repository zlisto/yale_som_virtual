import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BEIN, PARTY, ellPt } from '../layout.js'
import { useRigInstance } from '../characters/rig.js'
import { Interactable, openDialogue } from '../interact/index.jsx'
import { withAvatars } from '../ui/portraits.js'
import { Model } from '../render/Scenery.jsx'
import { angleTo, rand, timed, turnToward, useLabubuRig } from './common.js'
import { clampSprite, sprite } from './sprites.js'

// The MGT 409 orientation party on the Beinecke terrace (Lan, round 4: "set up for like an orientation
// party with high tables, a drinks bar, and some festivities"). Positions come from layout.js PARTY,
// which also holds the colliders. The props are drawn here and marked dynamic, so the lightmap bake
// leaves them out (the real-time sun shadows them).
//   props: a canvas banner on two poles, seven high tables in white cloths, a bar with a bar-back shelf
//   of bottles and two stools, balloon clusters that sway, string lights over the dance floor, a DJ
//   stand with two speakers and a softly lit EQ panel, potted plants, a dance floor of lighter pavers
//   people: nine Labubus in four groups at the high tables (cups in paw, Talk and Look, speech bubbles),
//   three dancing, a DJ in headphones bobbing to the beat, a bartender, and Professor Slughorn holding
//   court by the bar for the group at the nearest table
// Press E at the bar: the bartender offers three drinks and a toast.

const C = BEIN.c
const polar = (a, rr) => ellPt(C, rr, rr, a)
const YALE = '#00356b'
const PINK = '#ff6fae'

// ---------- shared materials and geometries
const std = (o) => new THREE.MeshStandardMaterial(o)
const MAT = {
  cloth: std({ color: '#f6f5f1', roughness: 0.92 }),
  steel: std({ color: '#b9bec4', roughness: 0.35, metalness: 0.7 }),
  black: std({ color: '#1b1c1f', roughness: 0.55 }),
  wood: std({ color: '#7a5233', roughness: 0.6 }),
  blue: std({ color: YALE, roughness: 0.6 }),
  white: std({ color: '#f2f2ee', roughness: 0.5 }),
  paver: std({ color: '#ffffff', roughness: 0.85 }),
  glass: std({ color: '#dfe9ee', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.4, depthWrite: false }),
  cone: std({ color: '#2a2b2f', roughness: 0.8 }),
  balloonBlue: std({ color: '#1f5fbf', roughness: 0.25, metalness: 0.05 }),
  balloonWhite: std({ color: '#f7f7f4', roughness: 0.25, metalness: 0.05 }),
  bottle: std({ color: '#ffffff', roughness: 0.15, metalness: 0.1 }),
  bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.5).multiplyScalar(2.4), toneMapped: false }),
  cup: std({ color: '#c8102e', roughness: 0.5 }),
}
const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 20)

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function Inst({ geometry, material, items, cast = true }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const m = ref.current
    const o = new THREE.Object3D()
    const col = new THREE.Color()
    items.forEach((it, i) => {
      o.position.set(...it.p)
      o.rotation.set(0, it.r || 0, 0)
      const sc = Array.isArray(it.s) ? it.s : [it.s ?? 1, it.s ?? 1, it.s ?? 1]
      o.scale.set(...sc)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      if (it.c) m.setColorAt(i, col.set(it.c))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={cast} receiveShadow />
}

// local frame on the terrace ring: +z points out from the building at angle a, +x along the ring
const frame = (a, rr, lx, lz) => {
  const p = polar(a, rr)
  return [p[0] + Math.cos(a) * lx + Math.sin(a) * lz, p[1] - Math.sin(a) * lx + Math.cos(a) * lz]
}

// ---------- props
function DanceFloor() {
  const items = useMemo(() => {
    const r = rand(409)
    const { c, half } = PARTY.dance
    const n = 5
    const step = (2 * half) / n
    const out = []
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const v = 0.93 + r() * 0.07
        out.push({ p: [c[0] - half + (i + 0.5) * step, 0.012, c[1] - half + (j + 0.5) * step], s: [step - 0.025, 0.02, step - 0.025], c: new THREE.Color(v, v * 0.985, v * 0.955) })
      }
    return out
  }, [])
  return <Inst geometry={BOX} material={MAT.paver} items={items} cast={false} />
}

function Banner() {
  const tex = useMemo(
    () =>
      canvasTex(1024, 200, (g, w, h) => {
        g.fillStyle = YALE
        g.fillRect(0, 0, w, h)
        g.strokeStyle = PINK
        g.lineWidth = 12
        g.strokeRect(14, 14, w - 28, h - 28)
        g.fillStyle = PINK
        // the largest Georgia size that leaves 110 px each side for the stars
        let size = 92
        do g.font = `bold ${size--}px Georgia, serif`
        while (g.measureText('MGT 409 \u00b7 Orientation').width > w - 220)
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText('MGT 409 · Orientation', w / 2, h / 2 + 4)
        g.fillStyle = '#ffffff'
        for (const x of [60, w - 60]) {
          g.beginPath()
          for (let k = 0; k < 10; k++) {
            const a = (k * Math.PI) / 5 - Math.PI / 2
            const rr = k % 2 ? 10 : 24
            g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr)
          }
          g.fill()
        }
      }),
    [],
  )
  const { poles, y, h } = PARTY.banner
  const mid = [(poles[0][0] + poles[1][0]) / 2, (poles[0][1] + poles[1][1]) / 2]
  const w = Math.hypot(poles[1][0] - poles[0][0], poles[1][1] - poles[0][1]) - 0.1
  return (
    <>
      {poles.map((p, i) => (
        <mesh key={i} geometry={CYL} material={MAT.steel} position={[p[0], 1.7, p[1]]} scale={[0.04, 3.4, 0.04]} castShadow />
      ))}
      <mesh position={[mid[0], y, mid[1]]} rotation={[0, -Math.PI / 2, 0]} castShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}

function HighTables() {
  const parts = useMemo(() => {
    const cloth = []
    const top = []
    const glasses = []
    const r = rand(77)
    PARTY.tables.forEach(([x, z]) => {
      cloth.push({ p: [x, 0.43, z], s: 1 })
      top.push({ p: [x, 0.86, z], s: [0.36, 0.02, 0.36] })
      for (let k = 0; k < 2; k++) {
        const a = r() * Math.PI * 2
        glasses.push({ p: [x + Math.sin(a) * 0.2, 0.92, z + Math.cos(a) * 0.2], s: [0.035, 0.1, 0.035] })
      }
    })
    return { cloth, top, glasses }
  }, [])
  // a white cloth falling from the 0.72 m top to a 0.9 m hem, 0.86 m high: high tables sized to the
  // Labubus (about 1.15 m to the ear tips), so a cup on the table sits at their chest
  const clothGeo = useMemo(() => new THREE.CylinderGeometry(0.36, 0.45, 0.86, 28, 1, true), [])
  return (
    <>
      <Inst geometry={clothGeo} material={MAT.cloth} items={parts.cloth} />
      <Inst geometry={CYL} material={MAT.cloth} items={parts.top} />
      <Inst geometry={CYL} material={MAT.glass} items={parts.glasses} cast={false} />
    </>
  )
}

function Bar() {
  const { a, rr, len, d, backRr } = PARTY.bar
  const back = backRr - rr
  const shelf = useMemo(() => {
    const r = rand(5)
    const colors = ['#2f7d32', '#7b3f00', '#c9a227', '#8e1b2b', '#d8e3e8', '#3b5bab', '#e07b39']
    const bodies = []
    const necks = []
    for (const y of [0.95, 1.45, 1.95])
      for (let i = 0; i < 9; i++) {
        const x = -1.15 + i * 0.29 + (r() - 0.5) * 0.05
        const h = 0.2 + r() * 0.1
        const c = colors[Math.floor(r() * colors.length)]
        bodies.push({ p: [x, y + h / 2, back], s: [0.04, h, 0.04], c })
        necks.push({ p: [x, y + h + 0.04, back], s: [0.014, 0.08, 0.014], c })
      }
    for (let i = 0; i < 5; i++) {
      const x = -1.2 + i * 0.13
      bodies.push({ p: [x, 1.05, 0.05], s: [0.04, 0.26, 0.04], c: colors[i] })
      necks.push({ p: [x, 1.22, 0.05], s: [0.014, 0.08, 0.014], c: colors[i] })
    }
    const glasses = Array.from({ length: 8 }, (_, i) => ({ p: [0.1 + i * 0.16, 0.97, -0.12], s: [0.035, 0.1, 0.035] }))
    return { bodies, necks, glasses }
  }, [back])
  return (
    <group position={[...((p) => [p[0], 0, p[1]])(polar(a, rr))]} rotation={[0, a, 0]}>
      {/* counter: a Yale blue front, a white top, 0.9 m high (the Labubus stand about 1.15 m) */}
      <mesh geometry={BOX} material={MAT.blue} position={[0, 0.44, 0]} scale={[len, 0.88, d]} castShadow receiveShadow />
      <mesh geometry={BOX} material={MAT.white} position={[0, 0.9, -0.03]} scale={[len + 0.1, 0.04, d + 0.14]} castShadow receiveShadow />
      <mesh geometry={BOX} material={MAT.white} position={[0, 0.5, -d / 2 - 0.005]} scale={[len - 0.4, 0.06, 0.01]} />
      {/* bar-back shelf: two uprights and three boards */}
      {[-1.3, 1.3].map((x) => (
        <mesh key={x} geometry={BOX} material={MAT.wood} position={[x, 1.1, back]} scale={[0.05, 2.2, 0.4]} castShadow />
      ))}
      {[0.9, 1.4, 1.9].map((y) => (
        <mesh key={y} geometry={BOX} material={MAT.wood} position={[0, y, back]} scale={[2.6, 0.04, 0.4]} castShadow receiveShadow />
      ))}
      <mesh geometry={BOX} material={MAT.wood} position={[0, 0.45, back]} scale={[2.6, 0.9, 0.4]} castShadow />
      <Inst geometry={CYL} material={MAT.bottle} items={shelf.bodies} />
      <Inst geometry={CYL} material={MAT.bottle} items={shelf.necks} cast={false} />
      <Inst geometry={CYL} material={MAT.glass} items={shelf.glasses} cast={false} />
      {/* two bar stools on the customer side */}
      {[-0.7, 0.7].map((x) => (
        <group key={x} position={[x, 0, -0.78]}>
          <mesh geometry={CYL} material={MAT.black} position={[0, 0.6, 0]} scale={[0.2, 0.06, 0.2]} castShadow />
          <mesh geometry={CYL} material={MAT.steel} position={[0, 0.3, 0]} scale={[0.03, 0.6, 0.03]} castShadow />
          <mesh geometry={CYL} material={MAT.steel} position={[0, 0.01, 0]} scale={[0.2, 0.02, 0.2]} />
        </group>
      ))}
    </group>
  )
}

function DJ() {
  const { c, w, d } = PARTY.dj
  const eq = useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = 128
    cv.height = 48
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    return { cv, g: cv.getContext('2d'), t, next: 0 }
  }, [])
  const eqMat = useMemo(() => new THREE.MeshBasicMaterial({ map: eq.t, color: new THREE.Color(0.9, 0.9, 0.9), toneMapped: false }), [eq])
  useFrame(
    timed(({ clock, camera }) => {
      const t = clock.elapsedTime
      if (t < eq.next || Math.hypot(camera.position.x - c[0], camera.position.z - c[1]) > 45) return
      eq.next = t + 0.12
      const { g } = eq
      g.fillStyle = '#05070c'
      g.fillRect(0, 0, 128, 48)
      for (let i = 0; i < 16; i++) {
        const v = 0.25 + 0.75 * Math.abs(Math.sin(t * (2.1 + i * 0.37) + i * 1.7)) * (0.6 + 0.4 * Math.abs(Math.sin(t * 2.6)))
        const hgt = Math.round(v * 40)
        for (let y = 0; y < hgt; y += 5) {
          g.fillStyle = y > 30 ? PINK : y > 18 ? '#7fb2ff' : '#3d7dd8'
          g.fillRect(4 + i * 7.5, 44 - y, 6, 3)
        }
      }
      eq.t.needsUpdate = true
    }),
  )
  return (
    <>
      <group position={[c[0], 0, c[1]]} rotation={[0, Math.PI / 2, 0]}>
        {/* a black stand with a Yale blue skirt; the front (local -z) faces the dance floor */}
        <mesh geometry={BOX} material={MAT.black} position={[0, 0.37, 0]} scale={[w, 0.74, d]} castShadow receiveShadow />
        <mesh geometry={BOX} material={MAT.blue} position={[0, 0.34, -d / 2 - 0.006]} scale={[w - 0.1, 0.6, 0.01]} />
        <mesh material={eqMat} position={[0, 0.44, -d / 2 - 0.013]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.9, 0.3]} />
        </mesh>
        {[-0.45, 0.45].map((x) => (
          <mesh key={x} geometry={CYL} material={MAT.steel} position={[x, 0.76, 0.02]} scale={[0.17, 0.03, 0.17]} castShadow />
        ))}
        <mesh geometry={BOX} material={MAT.cone} position={[0, 0.765, 0.02]} scale={[0.36, 0.04, 0.26]} />
      </group>
      {PARTY.speakers.map((p, i) => (
        <group key={i} position={[p[0], 0, p[1]]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh geometry={CYL} material={MAT.black} position={[0, 0.35, 0]} scale={[0.03, 0.7, 0.03]} />
          <mesh geometry={BOX} material={MAT.black} position={[0, 1.15, 0]} scale={[0.46, 0.9, 0.4]} castShadow />
          {[1.32, 0.98].map((y, k) => (
            <mesh key={y} geometry={CYL} material={MAT.cone} position={[0, y, 0.205]} rotation={[Math.PI / 2, 0, 0]} scale={[k ? 0.16 : 0.07, 0.01, k ? 0.16 : 0.07]} />
          ))}
        </group>
      ))}
    </>
  )
}

function Balloons() {
  const clusters = useRef([])
  const data = useMemo(() => {
    const r = rand(23)
    return PARTY.balloons.map((p) => ({
      p,
      ph: r() * 10,
      balls: Array.from({ length: 5 }, (_, k) => ({ x: (r() - 0.5) * 0.5, y: 2.15 + r() * 0.55, z: (r() - 0.5) * 0.5, blue: k % 2 === 0 })),
    }))
  }, [])
  const ballGeo = useMemo(() => new THREE.SphereGeometry(0.16, 18, 12), [])
  const lineGeo = useMemo(
    () =>
      data.map((cl) => {
        const pts = []
        for (const b of cl.balls) pts.push(0, 0.12, 0, b.x, b.y - 0.2, b.z)
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
        return g
      }),
    [data],
  )
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#d9d9d9' }), [])
  useFrame(
    timed(({ clock }) => {
      const t = clock.elapsedTime
      data.forEach((cl, i) => {
        const g = clusters.current[i]
        if (!g) return
        g.rotation.x = Math.sin(t * 0.9 + cl.ph) * 0.07
        g.rotation.z = Math.sin(t * 0.7 + cl.ph * 1.3) * 0.08
      })
    }),
  )
  return data.map((cl, i) => (
    <group key={i} position={[cl.p[0], 0, cl.p[1]]}>
      <mesh geometry={BOX} material={MAT.black} position={[0, 0.06, 0]} scale={[0.14, 0.12, 0.14]} castShadow />
      <group ref={(g) => (clusters.current[i] = g)}>
        <lineSegments geometry={lineGeo[i]} material={lineMat} />
        {cl.balls.map((b, k) => (
          <mesh key={k} geometry={ballGeo} material={b.blue ? MAT.balloonBlue : MAT.balloonWhite} position={[b.x, b.y, b.z]} scale={[1, 1.2, 1]} castShadow />
        ))}
      </group>
    </group>
  ))
}

function StringLights() {
  const parts = useMemo(() => {
    const H0 = 3.3
    const ends = PARTY.banner.poles
    const spans = []
    for (const a of PARTY.lightPoles) for (const b of ends) spans.push([a, b])
    spans.push([PARTY.lightPoles[0], PARTY.lightPoles[1]])
    const bulbs = []
    const cables = spans.map(([a, b]) => {
      const pts = []
      const n = 18
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const x = a[0] + (b[0] - a[0]) * t
        const z = a[1] + (b[1] - a[1]) * t
        const y = H0 - 0.5 * 4 * t * (1 - t) // 0.5 m sag at mid-span
        pts.push(new THREE.Vector3(x, y, z))
        if (i > 0 && i < n) bulbs.push({ p: [x, y - 0.06, z], s: 0.045 })
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 0.007, 5)
    })
    const poles = PARTY.lightPoles.map(([x, z]) => ({ p: [x, H0 / 2, z], s: [0.045, H0, 0.045] }))
    return { cables, bulbs, poles }
  }, [])
  const ball = useMemo(() => new THREE.SphereGeometry(1, 10, 8), [])
  return (
    <>
      <Inst geometry={CYL} material={MAT.black} items={parts.poles} />
      {parts.cables.map((g, i) => (
        <mesh key={i} geometry={g} material={MAT.black} />
      ))}
      <Inst geometry={ball} material={MAT.bulb} items={parts.bulbs} cast={false} />
    </>
  )
}

const plantItems = PARTY.plants.map(([x, z], i) => ({ p: [x, 0, z], r: i * 1.7, s: 1.25 }))

// ---------- people
const LINES = ['first week!', 'did you get the Portkey key?', 'which section?', 'section B, you?', 'is this butterbeer?', 'my agent RSVPed for me', 'tokens are not free', 'Lisa says hi']
const FURS = ['#bba7e8', '#3a3a3e', '#9fe0c6', '#f2b36b', '#ff9ccc', '#7fb2ff', '#c98f6b', '#f2efe9', '#8d8d93', '#d9c2a0', '#5a3d2e', '#ff8fc7', '#efe3cf', '#6b4a3a']
const SHIRTS = ['yale', '#ff4fa3', '#5b3f8c', '#2f7fd8', 'stripes', '#7a9e7e', '#ffffff', '#a6192e', 'yale']
const EXPR = ['grin', 'happy', 'mischief', 'surprised', 'grin', 'happy']
const look = (k) => ({ fur: FURS[k % FURS.length], shirt: SHIRTS[(k * 5) % SHIRTS.length], expression: EXPR[(k * 7) % EXPR.length] })

// Slughorn stands between the bar and the north-east table and lectures the pair at that table
const PROF = polar(2.3, 16.6)
const GROUPS = [
  { table: 0, n: 3, lines: [0, 1, 2], seed: 1 },
  { table: 2, n: 2, lines: [2, 3], seed: 2 },
  { table: 5, n: 2, lines: [4, 5], seed: 3 },
  { table: 6, n: 2, lines: [6, 7], seed: 4, listen: true },
].map((g, gi) => {
  const T = PARTY.tables[g.table]
  const a0 = g.listen ? angleTo(T, PROF) + Math.PI / 2 : gi * 1.3
  const members = Array.from({ length: g.n }, (_, k) => {
    const a = g.listen ? a0 + Math.PI * (k === 0 ? 0 : 1) : a0 + (k * Math.PI * 2) / g.n
    const p = [T[0] + Math.sin(a) * 0.62, T[1] + Math.cos(a) * 0.62]
    return { p, yaw: g.listen ? angleTo(p, PROF) : angleTo(p, T), k: gi * 3 + k }
  })
  return { ...g, gi, T, members }
})
const DANCE = [[-0.8, -1.0], [0.9, 0.7], [-0.4, 1.2]].map(([dx, dz], i) => ({ p: [PARTY.dance.c[0] + dx, PARTY.dance.c[1] + dz], k: 10 + i, ts: 0.9 + i * 0.1 }))

function cup() {
  // in the right arm bone's frame (Y down the arm toward the paw): a red party cup, upright
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.1, 14), MAT.cup)
  m.position.set(0, 0.27, 0.05)
  m.rotation.x = Math.PI
  m.castShadow = true
  return m
}
function headphones() {
  // in the head bone's frame: a band over the crown and two cups at the sides of the head
  const g = new THREE.Group()
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.022, 8, 28, Math.PI), MAT.black)
  band.position.set(0, 0.24, -0.02)
  g.add(band)
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 20), MAT.white)
    c.rotation.z = Math.PI / 2
    c.position.set(0.33 * s, 0.24, -0.02)
    g.add(c)
  }
  return g
}

function Partier({ p, yaw, k, update, prop }) {
  const rig = useLabubuRig(look(k))
  const root = useRef()
  useMemo(() => {
    if (prop === 'cup') rig.bones.armR?.add(cup())
    if (prop === 'phones') rig.bones.head?.add(headphones())
  }, [rig, prop])
  useFrame(
    timed((state, dt) => {
      update(rig, state.clock.elapsedTime + k * 1.3, root.current)
      rig.tick(dt, state, 30)
    }),
  )
  return (
    <group ref={root} position={[p[0], 0, p[1]]} rotation={[0, yaw, 0]}>
      <primitive object={rig.object} />
    </group>
  )
}

function TableGroup({ g }) {
  // one member talks at a time for 3.4 s with its bubble up, the others look at it or idle
  const bubbles = useMemo(() => g.lines.map((i) => sprite(LINES[i], 0.26)), [g])
  const who = (t) => Math.floor((t + g.seed * 2.1) / 3.4) % g.n
  const line = (t) => Math.floor((t + g.seed * 2.1) / 3.4) % g.lines.length
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime
    const near = Math.hypot(camera.position.x - g.T[0], camera.position.z - g.T[1]) < 22
    const w = who(t)
    const l = line(t)
    bubbles.forEach((b, i) => {
      b.visible = near && i === l && !g.listen
      if (b.visible) {
        const m = g.members[w]
        b.position.set(m.p[0], 1.6, m.p[1])
        clampSprite(b, camera, 0.05)
      }
    })
  })
  return (
    <>
      {g.members.map((m, j) => (
        <Partier
          key={j}
          {...m}
          prop="cup"
          update={(rig, t) => {
            if (g.listen) rig.play(Math.sin(t * 0.4 + j) > 0.6 ? 'Look' : 'Idle', { fade: 0.5 })
            else rig.play(who(t - m.k * 1.3) === j ? 'Talk' : Math.sin(t * 0.3 + j) > 0.3 ? 'Look' : 'Idle', { fade: 0.4 })
          }}
        />
      ))}
      {bubbles.map((b, i) => (
        <primitive key={i} object={b} />
      ))}
    </>
  )
}

const DJ_AT = [PARTY.dj.c[0] + 0.62, PARTY.dj.c[1]]
const BAR_TENDER = frame(PARTY.bar.a, PARTY.bar.rr, 0, 0.8)

const PROF_LOOP = [['Lecture', 4.2], ['Nod', 1.0], ['Lecture', 3.2], ['Point', 1.2]]
const PROF_LEN = PROF_LOOP.reduce((s, [, d]) => s + d, 0)
function Slughorn() {
  const root = useRef()
  const { object, actions } = useRigInstance('professor_slughorn')
  const st = useMemo(() => ({ cur: null }), [])
  const T = PARTY.tables[6]
  const yaw0 = angleTo(PROF, T)
  useFrame(
    timed(({ clock }) => {
      const t = clock.elapsedTime
      let u = t % PROF_LEN
      for (const [clip, d] of PROF_LOOP) {
        if (u < d) {
          const next = actions[clip]
          if (next && st.cur !== next) {
            next.reset()
            next.setLoop(clip === 'Lecture' ? THREE.LoopRepeat : THREE.LoopOnce, clip === 'Lecture' ? Infinity : 1)
            next.clampWhenFinished = true
            next.play()
            if (st.cur) next.crossFadeFrom(st.cur, 0.3, false)
            st.cur = next
          }
          break
        }
        u -= d
      }
      turnToward(root.current, yaw0 + Math.sin(t * 0.3) * 0.35, 0.06)
    }),
  )
  return (
    <group ref={root} position={[PROF[0], 0, PROF[1]]} rotation={[0, yaw0, 0]}>
      <primitive object={object} />
    </group>
  )
}

const DRINKS = [
  ['Butterbeer, foam on top, no alcohol', 'One butterbeer. Mind the foam moustache, the class photo is at five.'],
  ['A Portkey Spritz', 'A Portkey Spritz: elderflower, soda, a twist of lemon. Hold on tight.'],
  ['Sparkling water, I have a 9 am', 'Sparkling water for the responsible one. Section A meets early.'],
]
function barScript() {
  const who = 'Bartender'
  return withAvatars([
    { speaker: who, text: 'Welcome to MGT 409 orientation! What can I pour you?', choices: DRINKS.map(([d], i) => ({ text: d, next: `d${i}` })) },
    ...DRINKS.map(([, reply], i) => ({ id: `d${i}`, speaker: who, text: reply, next: 'toast' })),
    { id: 'toast', speaker: who, text: 'A toast: to the class of 2028, to agents that ask before they act, and to office hours with snacks!' },
  ])
}

export default function TerraceParty() {
  const barP = polar(PARTY.bar.a, PARTY.bar.rr - 0.9)
  return (
    <group userData={{ dynamic: true }}>
      <DanceFloor />
      <Banner />
      <HighTables />
      <Bar />
      <DJ />
      <Balloons />
      <StringLights />
      <Model name="plant_a" items={plantItems} />
      <Suspense fallback={null}>
        {GROUPS.map((g) => (
          <TableGroup key={g.gi} g={g} />
        ))}
        {DANCE.map((d, i) => (
          <Partier
            key={`d${i}`}
            p={d.p}
            yaw={i * 2.1}
            k={d.k}
            update={(rig, t, o) => {
              rig.play('Dance', { timeScale: d.ts })
              o.rotation.y = i * 2.1 + Math.sin(t * 0.25) * 1.2
            }}
          />
        ))}
        <Partier
          p={DJ_AT}
          yaw={-Math.PI / 2}
          k={13}
          prop="phones"
          update={(rig, t, o) => {
            rig.play('Idle')
            // bob to a 120 bpm beat: a small dip and a nod of the whole body
            const b = Math.abs(Math.sin(t * Math.PI * 2))
            o.position.y = -0.03 * b
            o.rotation.x = 0.06 * b
          }}
        />
        <Partier p={BAR_TENDER} yaw={PARTY.bar.a + Math.PI} k={12} update={(rig, t) => rig.play(Math.sin(t * 0.5) > 0.4 ? 'Talk' : 'Idle', { fade: 0.4 })} />
        <Slughorn />
      </Suspense>
      <Interactable position={[barP[0], 0, barP[1]]} radius={2.4} label="the bar" verb="Order at" marker="npc" onInteract={() => openDialogue(barScript())} />
    </group>
  )
}
