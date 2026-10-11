// Courtyard lawn furniture (Lan, round 3: "the courtyard also looks pretty empty"): eight
// Adirondack chairs in Yale blue and white, two picnic tables, four planters with the scanned
// potted plants, a stone path from the south glass to the centre, the three-tier fountain
// (life/CourtyardFountain.jsx, round 4) inside a ring of low stone benches, and a string of lights
// between two poles over the path. Positions live in life/courtyardLayout.js, which also keeps
// the spell classes and the round 4 fills clear of each other; the moving parts of the lawn
// mount from here through life/CourtyardLife.jsx. No colliders: the player cannot reach the
// lawn. Lawn level is y = -5. Each kind is one merged or instanced mesh.
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Model } from './Scenery.jsx'
import { rng } from '../textures.js'
import { BENCH_RING as BENCH, CHAIRS, PATH as PATH_Z, PICNICS, PLANTERS, POLES } from '../life/courtyardLayout.js'
import { FountainStone } from '../life/CourtyardFountain.jsx'
import CourtyardLife from '../life/CourtyardLife.jsx'
import CourtyardFills from '../life/CourtyardFills.jsx'

const Y = -5 // lawn level
const TAU = Math.PI * 2

// a box from its centre and size, tilted about x by rx (radians), then turned about y by ry
function box(parts, [w, h, d], [x, y, z], rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.rotateZ(rz)
  g.rotateX(rx)
  g.rotateY(ry)
  g.translate(x, y, z)
  parts.push(g)
}

// Adirondack chair, sitter facing +z: a slatted seat sloping back, a tall fanned slat back
// leaning 28 degrees, wide flat arms on front legs, slanted back legs. About 0.75 m wide.
const ADIRONDACK = (() => {
  const p = []
  for (let i = 0; i < 6; i++) {
    const z = 0.27 - i * 0.095
    box(p, [0.56, 0.022, 0.075], [0, 0.38 - i * 0.017, z], 0.18)
  }
  // back: seven slats fanning out from the seat's rear, tops on an arc
  for (let i = -3; i <= 3; i++) {
    const fan = i * 0.035
    const len = 0.92 - Math.abs(i) * 0.05
    const g = new THREE.BoxGeometry(0.085, len, 0.02)
    g.translate(0, len / 2, 0)
    g.rotateZ(-fan)
    g.rotateX(-0.49)
    g.translate(i * 0.085, 0.31, -0.3)
    p.push(g)
  }
  box(p, [0.66, 0.06, 0.022], [0, 0.66, -0.5], -0.49) // back cross rail
  for (const s of [-1, 1]) {
    box(p, [0.15, 0.022, 0.78], [s * 0.37, 0.62, 0.0]) // arm
    box(p, [0.06, 0.6, 0.06], [s * 0.33, 0.3, 0.3]) // front leg
    box(p, [0.06, 0.06, 0.8], [s * 0.31, 0.27, -0.1], 0.32) // side runner / back leg
    box(p, [0.05, 0.34, 0.05], [s * 0.37, 0.45, -0.3]) // arm post
  }
  return mergeGeometries(p.map((g) => g.toNonIndexed()))
})()

// picnic table: five top boards 1.8 m long, a bench board each side, A-frame legs
const PICNIC = (() => {
  const p = []
  for (let i = -2; i <= 2; i++) box(p, [1.8, 0.04, 0.15], [0, 0.75, i * 0.16])
  for (const s of [-1, 1]) {
    box(p, [1.8, 0.04, 0.24], [0, 0.45, s * 0.66])
    for (const x of [-0.62, 0.62]) {
      box(p, [0.06, 0.95, 0.07], [x, 0.37, s * 0.36], s * 0.62) // A-frame leg
      box(p, [0.07, 0.05, 1.6], [x, 0.41, 0]) // bench cross bar
    }
  }
  box(p, [1.3, 0.05, 0.06], [0, 0.3, 0]) // stretcher
  return mergeGeometries(p.map((g) => g.toNonIndexed()))
})()

// low stone bench ring round the fountain: four curved stone segments with gaps on the four axes (the stone
// path comes in from the south, the gravel path leaves from the west, McGonagall's clearing is east)
const BENCH_RING = (() => {
  const out = []
  const { r0, r1, gap } = BENCH
  for (let k = 0; k < 4; k++) {
    const a0 = k * (TAU / 4) + gap
    const a1 = (k + 1) * (TAU / 4) - gap
    const sh = new THREE.Shape()
    const n = 20
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      i ? sh.lineTo(Math.sin(a) * r1, Math.cos(a) * r1) : sh.moveTo(Math.sin(a) * r1, Math.cos(a) * r1)
    }
    for (let i = n; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / n
      sh.lineTo(Math.sin(a) * r0, Math.cos(a) * r0)
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.44, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 4 })
    g.rotateX(Math.PI / 2) // shape (x, y) -> world (x, z); extrusion runs down
    g.translate(0, 0.46, 0)
    out.push(g.toNonIndexed())
  }
  return mergeGeometries(out)
})()

// stone path from the south glass (z 19) to the bench ring: a 1.4 m running bond of
// 0.7 x 0.45 m slabs, laid with 2 cm joints and a little jitter
const PATH = (() => {
  const r = rng(31)
  const out = []
  let row = 0
  // odd rows: two 0.68 m slabs; even rows: a whole slab between two halves
  const ROWS = [[[-0.35, 0.68], [0.35, 0.68]], [[-0.53, 0.335], [0, 0.68], [0.53, 0.335]]]
  for (let z = PATH_Z.z0; z > PATH_Z.z1; z -= 0.47, row++) {
    for (const [x, w] of ROWS[row % 2]) {
      out.push({ p: [x + (r() - 0.5) * 0.02, Y + 0.012, z + (r() - 0.5) * 0.02], s: [w, 0.03, 0.45], r: (r() - 0.5) * 0.02, shade: 0.9 + r() * 0.18 })
    }
  }
  return out
})()

// chairs, picnic tables, planters and the string-light poles: life/courtyardLayout.js (moved in round 4 off the
// long-range class's line and the statue's spot)
const POLE_H = 3.4

function Inst({ geometry, material, items, cast = true }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const c = new THREE.Color()
    items.forEach((it, i) => {
      const s = Array.isArray(it.s) ? it.s : [it.s ?? 1, it.s ?? 1, it.s ?? 1]
      m.compose(new THREE.Vector3(...it.p), q.setFromAxisAngle(up, it.r || 0), new THREE.Vector3(...s))
      ref.current.setMatrixAt(i, m)
      if (it.shade) ref.current.setColorAt(i, c.setScalar(it.shade))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={cast} receiveShadow />
}

export default function Lawn() {
  const mats = useMemo(() => {
    const std = (o) => new THREE.MeshStandardMaterial(o)
    return {
      blue: std({ color: '#0f4d92', roughness: 0.55 }), // Yale blue paint, a shade lighter so it reads in shade
      white: std({ color: '#f1f1ee', roughness: 0.55 }),
      wood: std({ color: '#9b7048', roughness: 0.8 }),
      stone: std({ color: '#c9c3b6', roughness: 0.9 }),
      paver: std({ color: '#bdb6a8', roughness: 0.92 }),
      concrete: std({ color: '#a29e96', roughness: 0.9 }),
      soil: std({ color: '#3d2f22', roughness: 1 }),
      pole: std({ color: '#1f2226', roughness: 0.5, metalness: 0.5 }),
      bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.78, 0.48).multiplyScalar(2.6), toneMapped: false }),
    }
  }, [])
  const at = (p, r = 0, s = 1) => ({ p: [p[0], Y, p[1]], r, s })
  const chairs = useMemo(() => ({
    blue: CHAIRS.filter((c) => c.c === 'blue').map((c) => at(c.p, c.r)),
    white: CHAIRS.filter((c) => c.c === 'white').map((c) => at(c.p, c.r)),
  }), [])
  const picnics = useMemo(() => PICNICS.map((t) => at(t.p, t.r)), [])
  const planters = useMemo(() => ({
    boxes: PLANTERS.map(([x, z]) => ({ p: [x, Y + 0.3, z], s: [0.9, 0.6, 0.9] })),
    soil: PLANTERS.map(([x, z]) => ({ p: [x, Y + 0.59, z], s: [0.8, 0.02, 0.8] })),
    plants: PLANTERS.map(([x, z], i) => ({ p: [x, Y + 0.16, z], r: i * 1.9, s: 1.15 })),
  }), [])
  const lights = useMemo(() => {
    const [a, b] = POLES
    const poles = POLES.map(([x, z]) => ({ p: [x, Y + POLE_H / 2, z], s: [1, 1, 1] }))
    const pts = []
    const bulbs = []
    const n = 24
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const x = a[0] + (b[0] - a[0]) * t
      const z = a[1] + (b[1] - a[1]) * t
      const y = Y + POLE_H - 0.1 - 0.7 * 4 * t * (1 - t) // 0.7 m sag at mid-span
      pts.push(new THREE.Vector3(x, y, z))
      if (i > 0 && i < n) bulbs.push({ p: [x, y - 0.06, z], s: 1 })
    }
    const cable = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.008, 5)
    return { poles, cable, bulbs }
  }, [])
  const poleGeo = useMemo(() => new THREE.CylinderGeometry(0.045, 0.06, POLE_H, 12), [])
  const bulbGeo = useMemo(() => new THREE.SphereGeometry(0.045, 10, 8), [])
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  return (
    <group>
      <Inst geometry={ADIRONDACK} material={mats.blue} items={chairs.blue} />
      <Inst geometry={ADIRONDACK} material={mats.white} items={chairs.white} />
      <Inst geometry={PICNIC} material={mats.wood} items={picnics} />
      <Inst geometry={boxGeo} material={mats.paver} items={PATH} cast={false} />
      <Inst geometry={boxGeo} material={mats.concrete} items={planters.boxes} />
      <Inst geometry={boxGeo} material={mats.soil} items={planters.soil} cast={false} />
      <Model name="plant_a" items={planters.plants} />
      <mesh geometry={BENCH_RING} material={mats.stone} position={[0, Y, 0]} castShadow receiveShadow />
      <Suspense fallback={null}>
        <FountainStone />
        <CourtyardFills />
      </Suspense>
      <CourtyardLife />
      <Inst geometry={poleGeo} material={mats.pole} items={lights.poles} />
      <mesh geometry={lights.cable} material={mats.pole} />
      <Inst geometry={bulbGeo} material={mats.bulb} items={lights.bulbs} cast={false} />
    </group>
  )
}
