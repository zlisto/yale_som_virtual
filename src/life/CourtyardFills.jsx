import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useModel } from '../characters/rig.js'
import { rand } from './common.js'
import { CHESS, FOUNTAIN, GRAVEL, HEDGES, LANTERNS, NOOK, OWL, PATH_BEDS, RING_BED, STATUE, Y, lawnEdgeX } from './courtyardLayout.js'
import { basket, blanket, closedBook } from './CourtyardProps.js'

// The still parts of the round 4 courtyard fills (Lan: "maybe other ideas or suggestions you have to fill the space
// up without making it overboard"), drawn from render/Lawn.jsx whether or not the courtyard life is on:
//   flower beds in Yale blue and white along both sides of the stone path and round the fountain's bench ring
//   low hedges just inside the east and west lawn edges
//   six iron lanterns with warm glass on posts along the paths
//   winding gravel paths from the fountain to the reading nook and the chess board, and on to the statue
//   the wizard's chess board (6 x 6 m) and its two stools; the pieces move in CourtyardFolk.jsx
//   Handsome Dan in bronze, seated on a granite plinth with a plaque, beside the stone path
//   the reading nook's two picnic blankets, a basket and a few books; the owl's perch
// Repeated things are instanced (flowers, leaves, hedge segments, lanterns); the rest are a handful of meshes.

const TAU = Math.PI * 2
const at = (x, z, y = 0) => new THREE.Vector3(x, Y + y, z)

function Inst({ geometry, material, items, cast = true, colors }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const c = new THREE.Color()
    items.forEach((it, i) => {
      e.set(it.rx || 0, it.r || 0, it.rz || 0, 'YXZ')
      const s = Array.isArray(it.s) ? it.s : [it.s ?? 1, it.s ?? 1, it.s ?? 1]
      m.compose(it.p, q.setFromEuler(e), new THREE.Vector3(...s))
      ref.current.setMatrixAt(i, m)
      if (colors) ref.current.setColorAt(i, c.set(it.c))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items, colors])
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={cast} receiveShadow />
}

function canvasTex(w, h, draw, { srgb = true, repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.anisotropy = 4
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------- flower beds
const MULCH = new THREE.MeshStandardMaterial({ color: '#3b2b1e', roughness: 1 })
const CURB = new THREE.MeshStandardMaterial({ color: '#bdb6a8', roughness: 0.9 })
// an annular bed in four sectors with gaps on the axes (same gaps as the bench ring)
function ringSectors(r0, r1, gap, depth, y) {
  const out = []
  for (let k = 0; k < 4; k++) {
    const a0 = k * (TAU / 4) + gap
    const a1 = (k + 1) * (TAU / 4) - gap
    const sh = new THREE.Shape()
    const n = 24
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      i ? sh.lineTo(Math.sin(a) * r1, Math.cos(a) * r1) : sh.moveTo(Math.sin(a) * r1, Math.cos(a) * r1)
    }
    for (let i = n; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / n
      sh.lineTo(Math.sin(a) * r0, Math.cos(a) * r0)
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 })
    g.rotateX(Math.PI / 2)
    g.translate(0, y, 0)
    out.push(g.toNonIndexed())
  }
  return mergeGeometries(out)
}
// a flower: five rounded petals round a small cup, facing up; the stem and centre are separate meshes
const PETALS = (() => {
  const s = new THREE.Shape()
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU
    const r = 0.03 + 0.03 * Math.abs(Math.cos(a * 2.5))
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const g = new THREE.ShapeGeometry(s, 2)
  g.rotateX(-Math.PI / 2)
  // cup the petals a little
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, Math.hypot(p.getX(i), p.getZ(i)) * 0.35)
  g.computeVertexNormals()
  return g
})()
const CENTRE = new THREE.SphereGeometry(0.014, 6, 4)
const STEM = new THREE.CylinderGeometry(0.004, 0.005, 1, 4).translate(0, 0.5, 0)
// a leaf card: two crossed quads with a canvas leaf cluster (alpha tested)
const LEAF_CARD = (() => {
  const a = new THREE.PlaneGeometry(0.34, 0.26).translate(0, 0.13, 0)
  const b = a.clone().rotateY(Math.PI / 2)
  return mergeGeometries([a, b])
})()
const PETAL_MAT = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide })
const CENTRE_MAT = new THREE.MeshStandardMaterial({ color: '#f2c94c', roughness: 0.7 })
const STEM_MAT = new THREE.MeshStandardMaterial({ color: '#3f6b2a', roughness: 0.8 })
let leafMat = null
function leafMaterial() {
  if (leafMat) return leafMat
  const t = canvasTex(128, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h)
    let s = 9
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 14; i++) {
      const x = w * (0.15 + 0.7 * r())
      const y = h * (0.25 + 0.7 * r())
      const ang = -Math.PI / 2 + (r() - 0.5) * 1.6
      g.save()
      g.translate(x, h)
      g.rotate(ang + Math.PI / 2)
      g.fillStyle = ['#2f5a24', '#3d7030', '#4f8a3a'][i % 3]
      g.beginPath()
      g.ellipse(0, -(h - y) / 2, 7 + r() * 5, (h - y) / 2, 0, 0, TAU)
      g.fill()
      g.restore()
    }
  })
  leafMat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 })
  return leafMat
}
const BLUES = ['#1f4fa8', '#2a5db0', '#3b6fc4', '#173f8a']
const WHITES = ['#f6f6f2', '#eef0f4', '#fbfaf3']
function scatterBeds() {
  const r = rand(4242)
  r()
  r()
  const spots = []
  // path beds: rows along z, jittered
  for (const side of [-1, 1]) {
    for (let z = PATH_BEDS.z0; z < PATH_BEDS.z1; z += 0.2) {
      for (let k = 0; k < 3; k++) spots.push([side * (PATH_BEDS.x0 + 0.1 + (k + r() * 0.8) * ((PATH_BEDS.x1 - PATH_BEDS.x0 - 0.2) / 3)), z + (r() - 0.5) * 0.18])
    }
  }
  // ring bed: polar scatter inside the four sectors
  const { r0, r1, gap } = RING_BED
  const area = (Math.PI * (r1 * r1 - r0 * r0) * (TAU - 8 * gap)) / TAU
  for (let i = 0; i < area * 24; i++) {
    const k = Math.floor(r() * 4)
    const a = k * (TAU / 4) + gap + 0.04 + r() * (TAU / 4 - 2 * gap - 0.08)
    const rr = r0 + 0.08 + r() * (r1 - r0 - 0.16)
    spots.push([FOUNTAIN.p[0] + Math.sin(a) * rr, FOUNTAIN.p[1] + Math.cos(a) * rr])
  }
  const heads = []
  const stems = []
  const leaves = []
  spots.forEach(([x, z], i) => {
    const h = 0.24 + r() * 0.22
    const blue = r() < 0.55
    const tilt = (r() - 0.5) * 0.5
    const yaw = r() * TAU
    const s = 0.85 + r() * 0.5
    heads.push({ p: at(x, z, h + 0.05), r: yaw, rx: tilt, s, c: blue ? BLUES[i % BLUES.length] : WHITES[i % WHITES.length] })
    stems.push({ p: at(x, z, 0.05), s: [1, h, 1], r: yaw, rx: tilt * 0.3 })
    if (i % 2 === 0) leaves.push({ p: at(x + (r() - 0.5) * 0.1, z + (r() - 0.5) * 0.1, 0.04), r: r() * TAU, s: 0.8 + r() * 0.6 })
  })
  return { heads, centres: heads.map((h) => ({ ...h, p: h.p.clone().setY(h.p.y + 0.01) })), stems, leaves }
}
function FlowerBeds() {
  const g = useMemo(() => {
    const ring = ringSectors(RING_BED.r0, RING_BED.r1, RING_BED.gap, 0.06, 0.05)
    ring.translate(FOUNTAIN.p[0], Y, FOUNTAIN.p[1])
    const curb = ringSectors(RING_BED.r1, RING_BED.r1 + 0.08, RING_BED.gap, 0.1, 0.08)
    curb.translate(FOUNTAIN.p[0], Y, FOUNTAIN.p[1])
    const len = PATH_BEDS.z1 - PATH_BEDS.z0
    const zc = (PATH_BEDS.z0 + PATH_BEDS.z1) / 2
    const w = PATH_BEDS.x1 - PATH_BEDS.x0
    const xc = (PATH_BEDS.x0 + PATH_BEDS.x1) / 2
    const beds = []
    const curbs = []
    for (const s of [-1, 1]) {
      beds.push(new THREE.BoxGeometry(w, 0.06, len).translate(s * xc, Y + 0.02, zc))
      curbs.push(new THREE.BoxGeometry(0.08, 0.1, len + 0.08).translate(s * (PATH_BEDS.x1 + 0.04), Y + 0.03, zc))
      curbs.push(new THREE.BoxGeometry(w + 0.16, 0.1, 0.08).translate(s * xc, Y + 0.03, PATH_BEDS.z0 - 0.04))
      curbs.push(new THREE.BoxGeometry(w + 0.16, 0.1, 0.08).translate(s * xc, Y + 0.03, PATH_BEDS.z1 + 0.04))
    }
    return { mulch: mergeGeometries([ring.toNonIndexed(), ...beds.map((b) => b.toNonIndexed())]), curb: mergeGeometries([curb.toNonIndexed(), ...curbs.map((b) => b.toNonIndexed())]) }
  }, [])
  const f = useMemo(scatterBeds, [])
  return (
    <group>
      <mesh geometry={g.mulch} material={MULCH} receiveShadow />
      <mesh geometry={g.curb} material={CURB} receiveShadow castShadow />
      <Inst geometry={PETALS} material={PETAL_MAT} items={f.heads} colors cast={false} />
      <Inst geometry={CENTRE} material={CENTRE_MAT} items={f.centres} cast={false} />
      <Inst geometry={STEM} material={STEM_MAT} items={f.stems} cast={false} />
      <Inst geometry={LEAF_CARD} material={leafMaterial()} items={f.leaves} cast={false} />
    </group>
  )
}

// ---------- hedges: lumpy rounded segments 1.6 m long, 0.6 m tall, following the lawn edge
const HEDGE_GEO = (() => {
  const g = new THREE.BoxGeometry(0.7, 0.6, 1.7, 4, 4, 10)
  const p = g.attributes.position
  const r = rand(77)
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i)
    let y = p.getY(i)
    const z = p.getZ(i)
    // round the top and the sides, then add leafy lumps
    const top = (y + 0.3) / 0.6
    x *= 1 - 0.28 * top * top
    y -= 0.09 * (Math.abs(x) / 0.35) ** 2 * top
    const n = 0.035 * Math.sin(z * 9 + x * 13) + 0.03 * Math.sin(z * 17 - y * 11) + (r() - 0.5) * 0.02
    p.setXYZ(i, x + Math.sign(x) * n, y + 0.3 + (top > 0.9 ? n : 0), z)
  }
  g.computeVertexNormals()
  return g
})()
let hedgeMat = null
function hedgeMaterial() {
  if (hedgeMat) return hedgeMat
  const map = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2f5626'
    g.fillRect(0, 0, w, h)
    let s = 21
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = ['#244a1e', '#3a6a2c', '#4a7d36', '#1c3b17', '#5a8f40'][Math.floor(r() * 5)]
      g.beginPath()
      g.ellipse(r() * w, r() * h, 2 + r() * 4, 1.5 + r() * 2.5, r() * TAU, 0, TAU)
      g.fill()
    }
  }, { repeat: [1, 1] })
  hedgeMat = new THREE.MeshStandardMaterial({ map, roughness: 0.92, bumpMap: map, bumpScale: 1.5 })
  return hedgeMat
}
function hedgeItems() {
  const out = []
  const r = rand(91)
  for (const h of HEDGES) {
    for (let z = h.z0 + 0.8; z <= h.z1 - 0.8; z += 1.62) {
      const x = h.side * (lawnEdgeX(z) - h.inset)
      const x2 = h.side * (lawnEdgeX(z + 0.5) - h.inset)
      const yaw = Math.atan2(x2 - x, 0.5)
      out.push({ p: at(x, z), r: yaw, s: [0.95 + r() * 0.1, 0.92 + r() * 0.16, 1] })
    }
  }
  return out
}

// ---------- lanterns: an iron post, a lantern with warm glass, a pyramid cap
const IRON = new THREE.MeshStandardMaterial({ color: '#1f2124', roughness: 0.45, metalness: 0.6 })
const GLASS = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.74, 0.42).multiplyScalar(1.8), toneMapped: false })
const LANTERN_IRON = (() => {
  const parts = [
    new THREE.CylinderGeometry(0.11, 0.14, 0.12, 8).translate(0, 0.06, 0), // foot
    new THREE.CylinderGeometry(0.035, 0.045, 1.55, 8).translate(0, 0.85, 0), // post
    new THREE.CylinderGeometry(0.06, 0.04, 0.06, 8).translate(0, 1.64, 0), // collar
    new THREE.BoxGeometry(0.22, 0.025, 0.22).translate(0, 1.68, 0), // lantern floor
    new THREE.ConeGeometry(0.19, 0.16, 4).rotateY(Math.PI / 4).translate(0, 2.05, 0), // cap
    new THREE.SphereGeometry(0.025, 6, 4).translate(0, 2.15, 0), // finial
  ]
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.BoxGeometry(0.02, 0.29, 0.02).translate(sx * 0.1, 1.83, sz * 0.1)) // corner bars
  return mergeGeometries(parts.map((g) => g.toNonIndexed()))
})()
const LANTERN_GLASS = new THREE.BoxGeometry(0.17, 0.27, 0.17).translate(0, 1.83, 0)

// ---------- gravel paths: a ribbon along a Catmull-Rom curve, 0.9 m wide, with ragged alpha-tested edges
let gravelMat = null
function gravelMaterial() {
  if (gravelMat) return gravelMat
  const map = canvasTex(128, 128, (g, w, h) => {
    const img = g.createImageData(w, h)
    let s = 13
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4
        const v = 165 + r() * 50 - (r() < 0.08 ? 50 : 0)
        img.data[k] = v
        img.data[k + 1] = v * 0.93
        img.data[k + 2] = v * 0.82
        // alpha: solid in the middle, ragged toward the two long edges (u = 0 and 1)
        const edge = Math.min(x, w - 1 - x) / (w * 0.5)
        img.data[k + 3] = edge > 0.22 || r() < edge * 3.5 ? 255 : 0
      }
    g.putImageData(img, 0, 0)
  }, { repeat: [1, 1] })
  gravelMat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  return gravelMat
}
function gravelGeo(points, width = 0.9) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal')
  const n = Math.ceil(curve.getLength() * 3)
  const pos = []
  const uv = []
  const idx = []
  let dist = 0
  let prev = null
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const p = curve.getPointAt(u)
    const t = curve.getTangentAt(u)
    const nx = -t.z
    const nz = t.x
    if (prev) dist += p.distanceTo(prev)
    prev = p
    // ends taper so the path fades into the grass
    const w = (width / 2) * Math.min(1, 0.55 + Math.min(u, 1 - u) * 6)
    pos.push(p.x + nx * w, Y + 0.008, p.z + nz * w, p.x - nx * w, Y + 0.008, p.z - nz * w)
    uv.push(0, dist / 1.2, 1, dist / 1.2)
    if (i < n) {
      const a = i * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// ---------- chess board: 8 x 8 squares in cream and slate stone inside a raised stone frame
const SQ = CHESS.sq
let boardMat = null
function boardMaterial() {
  if (boardMat) return boardMat
  const map = canvasTex(512, 512, (g) => {
    let s = 17
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        const light = (i + j) % 2 === 0
        g.fillStyle = light ? '#e4dccb' : '#4a4c52'
        g.fillRect(i * 64, j * 64, 64, 64)
        for (let k = 0; k < 90; k++) {
          g.fillStyle = light ? `rgba(120,110,95,${r() * 0.15})` : `rgba(200,200,210,${r() * 0.1})`
          g.fillRect(i * 64 + r() * 64, j * 64 + r() * 64, 1 + r() * 2, 1 + r() * 2)
        }
        g.strokeStyle = 'rgba(30,30,30,0.35)'
        g.strokeRect(i * 64 + 0.5, j * 64 + 0.5, 63, 63)
      }
  })
  boardMat = new THREE.MeshStandardMaterial({ map, roughness: 0.75 })
  return boardMat
}
const FRAME_MAT = new THREE.MeshStandardMaterial({ color: '#a9a296', roughness: 0.9 })
const STOOL_MAT = new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 0.8 })
function ChessBoard() {
  const g = useMemo(() => {
    const L = SQ * 8
    const [cx, cz] = CHESS.c
    const top = new THREE.BoxGeometry(L, 0.06, L)
    top.translate(cx, Y + 0.03, cz)
    const fr = []
    for (const s of [-1, 1]) {
      fr.push(new THREE.BoxGeometry(L + 0.5, 0.1, 0.25).translate(cx, Y + 0.05, cz + s * (L / 2 + 0.125)))
      fr.push(new THREE.BoxGeometry(0.25, 0.1, L).translate(cx + s * (L / 2 + 0.125), Y + 0.05, cz))
    }
    // stools: a round seat on a short stone drum
    const stools = []
    for (const [x, z] of CHESS.stools) {
      stools.push(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 16).translate(x, Y + 0.45, z))
      stools.push(new THREE.CylinderGeometry(0.14, 0.18, 0.42, 12).translate(x, Y + 0.21, z))
    }
    return { top, frame: mergeGeometries(fr.map((b) => b.toNonIndexed())), stools: mergeGeometries(stools.map((b) => b.toNonIndexed())) }
  }, [])
  return (
    <group>
      <mesh geometry={g.top} material={[CURB, CURB, boardMaterial(), CURB, CURB, CURB]} receiveShadow />
      <mesh geometry={g.frame} material={FRAME_MAT} receiveShadow castShadow />
      <mesh geometry={g.stools} material={STOOL_MAT} receiveShadow castShadow />
    </group>
  )
}

// ---------- Handsome Dan in bronze on a granite plinth with a plaque
const GRANITE = new THREE.MeshStandardMaterial({ color: '#5f6166', roughness: 0.55 })
const GRANITE_CAP = new THREE.MeshStandardMaterial({ color: '#787a80', roughness: 0.5 })
const BRONZE = new THREE.MeshStandardMaterial({ color: '#8a6438', roughness: 0.38, metalness: 0.9, envMapIntensity: 1.2 })
function plaqueMat() {
  const map = canvasTex(512, 160, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h)
    gr.addColorStop(0, '#b48a4c')
    gr.addColorStop(1, '#7d5a2c')
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#5a3f1c'
    g.lineWidth = 6
    g.strokeRect(10, 10, w - 20, h - 20)
    g.fillStyle = '#3b2810'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = '600 62px Georgia, "Times New Roman", serif'
    g.fillText('Handsome Dan · Yale', w / 2, h / 2 + 4)
  })
  return new THREE.MeshStandardMaterial({ map, roughness: 0.4, metalness: 0.7 })
}
function Statue() {
  const { scene, animations } = useModel('handsome_dan')
  const [w, h, d] = STATUE.plinth
  const dan = useMemo(() => {
    const o = cloneSkinned(scene)
    o.traverse((m) => {
      if (!m.isMesh) return
      m.material = BRONZE
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
    })
    // freeze the Sit pose: one mixer update, never ticked again
    const mixer = new THREE.AnimationMixer(o)
    const sit = animations.find((a) => a.name === 'Sit')
    if (sit) {
      mixer.clipAction(sit).play()
      mixer.update(0.5)
    }
    return o
  }, [scene, animations])
  const plaque = useMemo(plaqueMat, [])
  return (
    <group position={[STATUE.p[0], Y, STATUE.p[1]]} rotation={[0, STATUE.yaw, 0]}>
      <mesh position={[0, 0.06, 0]} material={GRANITE_CAP} castShadow receiveShadow>
        <boxGeometry args={[w + 0.2, 0.12, d + 0.2]} />
      </mesh>
      <mesh position={[0, h / 2, 0]} material={GRANITE} castShadow receiveShadow>
        <boxGeometry args={[w, h - 0.1, d]} />
      </mesh>
      <mesh position={[0, h - 0.02, 0]} material={GRANITE_CAP} castShadow receiveShadow>
        <boxGeometry args={[w + 0.12, 0.08, d + 0.12]} />
      </mesh>
      <mesh position={[0, h * 0.5, d / 2 + 0.006]} material={plaque}>
        <planeGeometry args={[1.05, 0.33]} />
      </mesh>
      <group position={[0, h + 0.02, 0.02]} scale={2.3}>
        <primitive object={dan} />
      </group>
    </group>
  )
}

// ---------- the reading nook's blankets, basket and books; the owl's perch
function Nook() {
  const items = useMemo(() => {
    const rugs = [blanket(['#c8102e', '#f4efe2', '#00356b']), blanket(['#00356b', '#9fc3e8', '#ffffff'])]
    NOOK.blankets.forEach((b, i) => {
      rugs[i].position.copy(at(b.p[0], b.p[1]))
      rugs[i].rotation.y = b.r
    })
    const bk = basket()
    bk.position.copy(at(NOOK.basket[0], NOOK.basket[1], 0.02))
    bk.rotation.y = 0.5
    const books = [
      [-14.6, -10.7, 0.3],
      [-13.1, -12.6, 1.2],
    ].map(([x, z, r], i) => {
      const b = closedBook(i + 1)
      b.position.copy(at(x, z, 0.02))
      b.rotation.y = r
      return b
    })
    return [...rugs, bk, ...books]
  }, [])
  return items.map((o, i) => <primitive key={i} object={o} />)
}
const PERCH = (() => {
  const parts = [
    new THREE.CylinderGeometry(0.05, 0.07, OWL.h, 8).translate(0, OWL.h / 2, 0),
    new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8).rotateZ(Math.PI / 2).translate(0, OWL.h, 0),
    new THREE.CylinderGeometry(0.18, 0.22, 0.08, 10).translate(0, 0.04, 0),
  ]
  return mergeGeometries(parts.map((g) => g.toNonIndexed()))
})()
const PERCH_MAT = new THREE.MeshStandardMaterial({ color: '#5d4330', roughness: 0.85 })

export default function CourtyardFills() {
  const hedges = useMemo(hedgeItems, [])
  const lanterns = useMemo(() => LANTERNS.map(([x, z], i) => ({ p: at(x, z), r: i * 0.7 })), [])
  const gravel = useMemo(() => mergeGeometries(GRAVEL.map((pts) => gravelGeo(pts))), [])
  return (
    <group>
      <FlowerBeds />
      <Inst geometry={HEDGE_GEO} material={hedgeMaterial()} items={hedges} />
      <Inst geometry={LANTERN_IRON} material={IRON} items={lanterns} />
      <Inst geometry={LANTERN_GLASS} material={GLASS} items={lanterns} cast={false} />
      <mesh geometry={gravel} material={gravelMaterial()} receiveShadow />
      <ChessBoard />
      <Statue />
      <Nook />
      <mesh geometry={PERCH} material={PERCH_MAT} position={[OWL.p[0], Y, OWL.p[1]]} rotation={[0, OWL.yaw, 0]} castShadow receiveShadow />
    </group>
  )
}
