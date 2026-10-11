// Small building fixtures that make the floor read as a working building. Every kind is one
// instanced or merged mesh under 2,000 triangles per copy:
//  - ceiling: sprinkler heads, smoke detectors and speaker grilles between the downlights
//  - floor dome door stops at the meeting-room doors
//  - a fire-alarm pull beside every stair door, an extinguisher cabinet on each stair core
//  - duplex outlets along the baseboards of the plaster walls
//  - a recycling pair at stair G and framed event posters on the stair-core walls
// Positions come from layout.js (walls are boxes centred on their line, 0.2 m thick unless
// given), so the fixtures sit on the same faces the bake was made from.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { unbakedFill } from './Baked.jsx'
import { BOUNDS, COURTYARD, EAST, BEIN, H, MEETING, STAIRS, WALLS, RECYCLE, inPoly } from '../layout.js'

const TAU = Math.PI * 2
const FONT = 'Inter, Helvetica, Arial, sans-serif'

// a geometry part in one vertex colour
function part(g, color, m) {
  const out = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m || new THREE.Matrix4())
  const c = new THREE.Color(color)
  out.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: out.attributes.position.count }, () => [c.r, c.g, c.b]).flat(), 3))
  out.deleteAttribute('uv')
  return out
}
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z)
const cyl = (r, h, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg)
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)

// ceiling fixtures, built hanging from y = 0 downward
const SPRINKLER = mergeGeometries([
  part(cyl(0.035, 0.008, 12), '#d9dcdf', T(0, -0.004, 0)),
  part(cyl(0.011, 0.045, 6), '#c2a24a', T(0, -0.03, 0)), // brass body
  part(cyl(0.022, 0.004, 10), '#c9ccd0', T(0, -0.054, 0)), // deflector
])
const DETECTOR = mergeGeometries([
  part(cyl(0.075, 0.03, 20), '#f1f0ec', T(0, -0.015, 0)),
  part(cyl(0.05, 0.012, 20), '#e4e3de', T(0, -0.036, 0)),
  part(cyl(0.006, 0.004, 6), '#d23a2a', T(0.03, -0.043, 0)), // status LED
])
const SPEAKER = mergeGeometries([
  part(cyl(0.14, 0.01, 24), '#f2f1ed', T(0, -0.005, 0)),
  part(new THREE.RingGeometry(0.08, 0.1, 24).rotateX(Math.PI / 2), '#8d9094', T(0, -0.0105, 0)),
  part(new THREE.RingGeometry(0.03, 0.05, 24).rotateX(Math.PI / 2), '#8d9094', T(0, -0.0105, 0)),
])
// floor dome stop with a black rubber ring
const DOORSTOP = mergeGeometries([
  part(cyl(0.035, 0.01, 14), '#b9bdc2', T(0, 0.005, 0)),
  part(new THREE.SphereGeometry(0.028, 14, 6, 0, TAU, 0, Math.PI / 2), '#c9cdd1', T(0, 0.01, 0)),
  part(cyl(0.03, 0.012, 14), '#1b1b1b', T(0, 0.02, 0)),
])
// wall fixtures, built facing +z with their back at z = 0
const PULL = mergeGeometries([
  part(box(0.11, 0.14, 0.045), '#c8231c', T(0, 0, 0.0225)),
  part(box(0.07, 0.02, 0.012), '#f2f2f2', T(0, -0.01, 0.05)), // handle
  part(box(0.08, 0.018, 0.002), '#f6f6f6', T(0, 0.045, 0.046)), // FIRE lettering band
])
const CABINET = mergeGeometries([
  part(box(0.52, 0.78, 0.07), '#eeeeeb', T(0, 0, 0.035)),
  part(box(0.44, 0.62, 0.01), '#4c5258', T(0, -0.03, 0.072)), // tinted glass door
  part(cyl(0.075, 0.42, 14), '#c4231d', T(-0.02, -0.07, 0.085)),
  part(cyl(0.03, 0.06, 8), '#2a2a2a', T(-0.02, 0.17, 0.085)),
  part(box(0.44, 0.07, 0.004), '#c4231d', T(0, 0.33, 0.071)), // red label band
])
// recycling pair: blue for paper and cans, green for compost, slots and lid bands
const RECYCLING = (() => {
  const parts = []
  ;[[-0.27, '#1f5fa8'], [0.27, '#3d7a3a']].forEach(([x, c]) => {
    parts.push(part(box(0.48, 0.95, 0.5), c, T(x, 0.475, 0)))
    parts.push(part(box(0.5, 0.05, 0.52), '#2b2e31', T(x, 0.975, 0)))
    parts.push(part(box(0.26, 0.06, 0.004), '#111', T(x, 0.86, 0.252)))
    parts.push(part(box(0.3, 0.14, 0.004), '#f2f2ef', T(x, 0.66, 0.252)))
  })
  return mergeGeometries(parts)
})()

// unbaked, so lifted like the chairs (Baked.jsx unbakedFill) to sit in the baked room's light
const fixtureMat = unbakedFill(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 }), 3)

// ---------- placements
const cellKey = (i, j) => `${i},${j}`
function inside(x, z) {
  const { xMin, xMax, zMin, zMax } = BOUNDS
  const main = x > xMin + 0.4 && x < xMax - 0.4 && z > zMin + 0.4 && z < zMax - 0.4 && !inPoly(x, z, COURTYARD)
  const bein = x > EAST && Math.hypot(x - EAST, z) < BEIN.r - 0.8
  return main || bein
}
// lattice points between the 2.4 m downlights (render/Lighting.jsx): x = xMin + 2.4 i, z = zMin + 2.4 j
function ceilingSpots() {
  const { xMin, zMin } = BOUNDS
  const used = new Set()
  const out = { sprinkler: [], detector: [], speaker: [] }
  const take = (kind, i, j) => {
    const x = xMin + 2.4 * i
    const z = zMin + 2.4 * j
    if (used.has(cellKey(i, j)) || !inside(x, z)) return
    used.add(cellKey(i, j))
    out[kind].push({ p: [x, H - 0.002, z], r: (i * 7 + j * 3) * 0.3 })
  }
  const nx = Math.ceil((EAST + BEIN.r - xMin) / 2.4)
  const nz = Math.ceil((BOUNDS.zMax - zMin) / 2.4)
  for (let i = 1; i < nx; i++)
    for (let j = 1; j < nz; j++) {
      if (i % 4 === 2 && j % 4 === 3) take('detector', i, j) // about every 9.6 m
      else if (i % 3 === 0 && j % 3 === 1) take('speaker', i, j) // every 7.2 m
      else if (i % 2 === 1 && j % 2 === 1) take('sprinkler', i, j) // every 4.8 m
    }
  return out
}
// meeting-room doors swing into the room; the stop sits where the open leaf's edge lands
const DOORSTOPS = MEETING.map((m) => {
  const into = Math.sign(m.z - m.door.hinge[1])
  return { p: [m.door.hinge[0] + 0.12, 0, m.door.hinge[1] + into * 1.0], r: 0 }
})
// a wall-mounted item on a stair core: world position and yaw from the core's centre, the face
// normal [fx, fz], the offset along the face and the height
function onCore(s, [fx, fz], along, y, proud = 0.003) {
  const ext = fx !== 0 ? s.w / 2 : s.d / 2
  const off = ext + 0.1 + proud
  const yaw = Math.atan2(fx, fz)
  // local +x of a yawed item is (cos yaw, -sin yaw)
  return { p: [s.c[0] + fx * off + Math.cos(yaw) * along, y, s.c[1] + fz * off - Math.sin(yaw) * along], r: yaw }
}
// fire pull left of each stair door (seen from the corridor), beside the frame
const PULLS = STAIRS.map((s) => onCore(s, s.face, -1.1, 1.2))
// cabinets and posters go on a side face that opens onto a corridor: the west face of the
// east-side cores, the west face of A and B, the east face of I
const SIDE = { A: [-1, 0], B: [-1, 0], C: [-1, 0], D: [-1, 0], G: [-1, 0], H: [-1, 0], I: [1, 0] }
const byId = Object.fromEntries(STAIRS.map((s) => [s.id, s]))
const CABINETS = Object.entries(SIDE).map(([id, f]) => onCore(byId[id], f, id === 'I' ? 0.9 : -1.0, 0.95))
// posters: two on the long north face of A and south face of B, one beside each cabinet
const POSTER_SPOTS = [
  onCore(byId.A, [0, -1], -1.8, 1.62, 0.02),
  onCore(byId.A, [0, -1], 1.8, 1.62, 0.02),
  onCore(byId.B, [0, 1], -1.8, 1.62, 0.02),
  onCore(byId.B, [0, 1], 1.8, 1.62, 0.02),
  ...['C', 'D', 'G', 'H'].map((id) => onCore(byId[id], SIDE[id], 0.9, 1.62, 0.02)),
  onCore(byId.I, SIDE.I, -0.9, 1.62, 0.02),
]
// outlets every 3.6 m along both faces of the full-height plaster walls, 0.3 m up
const OUTLETS = (() => {
  const out = []
  for (const w of WALLS) {
    if (w.mat !== 'white' || w.h < H - 0.01 || w.y0 > 0) continue
    const dx = w.b[0] - w.a[0]
    const dz = w.b[1] - w.a[1]
    const len = Math.hypot(dx, dz)
    if (len < 2.4) continue
    const ux = dx / len
    const uz = dz / len
    for (const side of [-1, 1]) {
      const nx = -uz * side
      const nz = ux * side
      const yaw = Math.atan2(nx, nz)
      for (let t = 1.2; t < len - 0.9; t += 3.6) {
        const x = w.a[0] + ux * t + nx * (w.t / 2 + 0.004)
        const z = w.a[1] + uz * t + nz * (w.t / 2 + 0.004)
        if (!inside(x, z)) continue
        out.push({ p: [x, 0.3, z], r: yaw })
      }
    }
  }
  return out
})()

// ---------- textures
function outletTex() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 104
  const g = c.getContext('2d')
  g.fillStyle = '#efeee9'
  g.fillRect(0, 0, 64, 104)
  g.strokeStyle = '#c9c8c2'
  g.lineWidth = 3
  g.strokeRect(1.5, 1.5, 61, 101)
  for (const cy of [30, 74]) {
    g.fillStyle = '#e2e1db'
    g.beginPath()
    g.ellipse(32, cy, 17, 19, 0, 0, TAU)
    g.fill()
    g.fillStyle = '#3a3a3a'
    g.fillRect(23, cy - 9, 4, 11)
    g.fillRect(37, cy - 9, 4, 13)
    g.beginPath()
    g.arc(32, cy + 9, 3.2, Math.PI, 0)
    g.fill()
  }
  g.fillStyle = '#b9b8b2'
  g.beginPath()
  g.arc(32, 52, 2.5, 0, TAU)
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// nine posters in a 3 x 3 atlas, each 512 x 724 (an A-series sheet, 0.6 x 0.85 m on the wall)
const PW = 512
const PH = 724
const YALE = '#00356b'
const POSTERS = [
  { kind: 'course', title: ['MGT 409', 'AI Foundations', 'for Managers'], lines: ['Prof. Albus Dumbledore', 'Tue & Thu 10:10 to 11:30', 'MBA Class of 1980 Classroom'], tag: 'Spring 2027 elective' },
  { kind: 'event', title: ['Leadership', 'Forum'], lines: ['Thursday, October 22', '4:00 pm, Zhang Auditorium', 'Reception to follow'], tag: 'Yale SOM' },
  { kind: 'band', title: ['Case', 'Competition'], lines: ['Teams of four', 'Register by November 6', 'Prizes for the top three'], tag: 'Yale SOM 2026' },
  { kind: 'event', title: ['Speaker', 'Series'], lines: ['Women in Leadership', 'Wednesday, November 4', 'Nooyi Classroom'], tag: 'Open to all students' },
  { kind: 'band', title: ['Career', 'Fair'], lines: ['Friday, November 13', '10 am to 3 pm', 'Evans Hall, Level 1'], tag: 'Career Development Office' },
  { kind: 'course', title: ['MGT 409', 'Office', 'Hours'], lines: ['Ask the Labubu TA', 'Mondays 2 to 4 pm', 'Ross Library 2100'], tag: 'AI Foundations for Managers' },
  { kind: 'event', title: ['Data & AI', 'Hackathon'], lines: ['24 hours, free food', 'November 20 and 21', 'Beinecke Terrace Room'], tag: 'Student club' },
  { kind: 'band', title: ['Climate', 'Week'], lines: ['Panels, films, a market', 'November 9 to 13', 'Net Impact at Yale SOM'], tag: 'Sustainability' },
  { kind: 'event', title: ['MBA Talent', 'Show'], lines: ['Saturday, December 5', 'Doors at 7 pm', 'Tickets at the Info Desk'], tag: 'Class of 2027' },
]
function drawPoster(g, x0, y0, p, i) {
  g.save()
  g.translate(x0, y0)
  const accent = ['#4a90d9', '#f2b632', '#ef4f8a', '#63c3a6'][i % 4]
  g.fillStyle = p.kind === 'band' ? '#f4f2ec' : YALE
  g.fillRect(0, 0, PW, PH)
  const light = p.kind === 'band'
  if (p.kind === 'band') {
    g.fillStyle = YALE
    g.fillRect(0, 0, PW, 300)
  } else {
    // a few large circles as the graphic
    g.globalAlpha = 0.22
    g.fillStyle = accent
    for (let k = 0; k < 3; k++) {
      g.beginPath()
      g.arc(380 - k * 70, 150 + k * 40, 150 - k * 30, 0, TAU)
      g.fill()
    }
    g.globalAlpha = 1
  }
  g.fillStyle = accent
  g.fillRect(40, 44, 70, 8)
  g.fillStyle = '#ffffff'
  g.font = `600 22px ${FONT}`
  g.textBaseline = 'alphabetic'
  g.fillText(p.tag.toUpperCase(), 40, 90)
  g.font = `800 ${p.title.length > 2 ? 62 : 72}px ${FONT}`
  p.title.forEach((t, k) => g.fillText(t, 38, (p.kind === 'band' ? 160 : 190) + k * (p.title.length > 2 ? 64 : 76)))
  g.fillStyle = light ? '#1d2733' : '#e9eef5'
  g.font = `500 28px ${FONT}`
  p.lines.forEach((t, k) => g.fillText(t, 40, 470 + k * 44))
  g.fillStyle = light ? YALE : '#ffffff'
  g.font = `700 24px ${FONT}`
  g.fillText('Yale SCHOOL OF MANAGEMENT', 40, PH - 48)
  g.restore()
}
function posterAtlas() {
  const c = document.createElement('canvas')
  c.width = PW * 3
  c.height = PH * 3
  const g = c.getContext('2d')
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  const paint = () => {
    POSTERS.forEach((p, i) => drawPoster(g, (i % 3) * PW, Math.floor(i / 3) * PH, p, i))
    t.needsUpdate = true
  }
  paint()
  document.fonts?.load(`800 40px Inter`).then(() => paint())
  return t
}
// one merged mesh: each poster a quad into its atlas cell, plus a thin black frame behind it
function posterGeos() {
  const faces = []
  const frames = []
  POSTER_SPOTS.forEach((s, i) => {
    const q = new THREE.PlaneGeometry(0.6, 0.85)
    const uv = q.attributes.uv
    const cu = i % 3
    const cv = 2 - Math.floor(i / 3) // atlas rows count from the top; v from the bottom
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (cu + uv.getX(k)) / 3, (cv + uv.getY(k)) / 3)
    const m = new THREE.Matrix4().makeTranslation(...s.p).multiply(new THREE.Matrix4().makeRotationY(s.r))
    faces.push(q.applyMatrix4(new THREE.Matrix4().copy(m).multiply(T(0, 0, 0.012))))
    frames.push(part(box(0.66, 0.91, 0.02), '#16181b', new THREE.Matrix4().copy(m).multiply(T(0, 0, 0))))
  })
  return { faces: mergeGeometries(faces), frames: mergeGeometries(frames) }
}

function Inst({ geometry, material, items }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const one = new THREE.Vector3(1, 1, 1)
    items.forEach((it, i) => ref.current.setMatrixAt(i, m.compose(new THREE.Vector3(...it.p), q.setFromAxisAngle(up, it.r || 0), one)))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} userData={{ noCast: true }} />
}

export default function Fixtures() {
  const d = useMemo(() => {
    const ceil = ceilingSpots()
    const outletMat = unbakedFill(new THREE.MeshStandardMaterial({ map: outletTex(), roughness: 0.5 }), 3)
    const posterMat = unbakedFill(new THREE.MeshStandardMaterial({ map: posterAtlas(), roughness: 0.6 }), 3)
    return { ceil, outletMat, posterMat, outletGeo: new THREE.PlaneGeometry(0.07, 0.115), posters: posterGeos() }
  }, [])
  return (
    <group>
      <Inst geometry={SPRINKLER} material={fixtureMat} items={d.ceil.sprinkler} />
      <Inst geometry={DETECTOR} material={fixtureMat} items={d.ceil.detector} />
      <Inst geometry={SPEAKER} material={fixtureMat} items={d.ceil.speaker} />
      <Inst geometry={DOORSTOP} material={fixtureMat} items={DOORSTOPS} />
      <Inst geometry={PULL} material={fixtureMat} items={PULLS} />
      <Inst geometry={CABINET} material={fixtureMat} items={CABINETS} />
      <Inst geometry={RECYCLING} material={fixtureMat} items={RECYCLE.map((r) => ({ p: [r.p[0], 0, r.p[1]], r: r.r }))} />
      <Inst geometry={d.outletGeo} material={d.outletMat} items={OUTLETS} />
      <mesh geometry={d.posters.frames} material={fixtureMat} />
      <mesh geometry={d.posters.faces} material={d.posterMat} />
    </group>
  )
}
