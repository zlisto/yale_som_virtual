// The neighbourhood seen through the perimeter glass, built cheaply:
//  1. a ring of low buildings 30 to 125 m out on every side (plus a sparse far row to 200 m),
//     plain boxes with canvas facades: brick tiles cut from the ambientCG Facade 018A and 020A
//     scans, buff stone, white clapboard and glass offices, 2 to 5 storeys, parapets, rooftop
//     plant, pitched roofs on the wooden houses, shop awnings, a share of windows lit. All walls
//     of one facade kind are one merged mesh, so the ring costs 6 draw calls.
//  2. street furniture, merged into one vertex-coloured mesh: New Haven lantern posts, benches,
//     a bus shelter, bicycles at racks, mailboxes, hydrants, litter bins, traffic signals.
//     Low-poly trees between the buildings and conifers on the east lawn join the same mesh.
//  3. parked cars along Whitney Avenue and the north street (Kenney Car Kit, CC0).
//  4. the Beinecke terrace outside the Terrace Room: cafe tables, chairs, planters, a steel rail.
//  5. a painted skyline on a 250 m cylinder: rooftops, trees, church spires, a few downtown
//     towers and the East Rock and West Rock ridges, hazed toward the sky colour. The scene fog
//     (Backdrop.jsx) starts at 120 m and blends it into the sky.
import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BEIN, BOUNDS, TERRACE_TABLES, TERRACE_PLANTERS, ellPt, planX, planZ } from '../layout.js'
import { Model, Trees } from './Scenery.jsx'
import { G, CURB, VERGE, WALK, NS, OUT, EDGE, CENTER, WALL_R, surface, corridor, rand, splitRange, quadGeo } from './streetPlan.js'

const BASE = import.meta.env.BASE_URL
const TAU = Math.PI * 2

// ---------- vertex-coloured mesh builder (non-indexed triangles, flat normals)
class Mesher {
  constructor() {
    this.pos = []
    this.nor = []
    this.col = []
  }
  // append a three.js geometry under a matrix, in one colour
  geo(g, m, color) {
    const src = g.index ? g.toNonIndexed() : g
    const p = src.attributes.position.clone().applyMatrix4(m)
    const n = src.attributes.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(m))
    const c = new THREE.Color(color)
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i))
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i))
      this.col.push(c.r, c.g, c.b)
    }
    return this
  }
  // axis-aligned box from its centre and size, turned by yaw about (ox, oz) if given
  box(cx, cy, cz, sx, sy, sz, color, yaw = 0, ox = cx, oz = cz) {
    const m = new THREE.Matrix4().makeTranslation(ox, 0, oz).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeTranslation(cx - ox, cy, cz - oz))
    return this.geo(BOX, m.multiply(new THREE.Matrix4().makeScale(sx, sy, sz)), color)
  }
  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.computeBoundingSphere()
    return g
  }
}
const BOX = new THREE.BoxGeometry(1, 1, 1)
const M4 = () => new THREE.Matrix4()
// place a geometry: translate, yaw, then the geometry's own transform
const at = (x, y, z, yaw = 0, local = M4()) => M4().makeTranslation(x, y, z).multiply(M4().makeRotationY(yaw)).multiply(local)
const cyl = (rt, rb, h, seg = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)

// ---------- facades
// one texture tile is 8 bays of 3 m by 6 storeys of 3.3 m; v = 0 is the ground, so a box of
// whole storeys ends on a storey line, and the bottom row is the ground floor (shops, doors)
const BAY = 3
const STOREY = 3.3
const FW = BAY * 8
const FH = STOREY * 6
const CW = 1024
const CH = 1024
const KX = CW / FW
const KY = CH / FH
const KINDS = ['red', 'brown', 'stone', 'clap', 'glass', 'buff']
const SIGNS = ['#27412f', '#6b1f24', '#1f2f4f', '#3a3a3a', '#7a5a1c', '#20484a']

function facadeTextures(kind, tiles, seed) {
  const r = rand(seed)
  const mk = (w, h) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  const col = mk(CW, CH)
  const emi = mk(CW / 2, CH / 2)
  const g = col.getContext('2d')
  const e = emi.getContext('2d')
  e.fillStyle = '#000'
  e.fillRect(0, 0, CW / 2, CH / 2)
  e.scale(0.5, 0.5)
  // metre-space rectangle: x from the tile's left, y = height of the bottom edge above ground
  const R = (ctx, x, y, w, h) => ctx.fillRect(x * KX, CH - (y + h) * KY, w * KX, h * KY)
  const fill = (color, x, y, w, h) => {
    g.fillStyle = color
    R(g, x, y, w, h)
  }
  const noise = (n, colors, size = 2) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[(r() * colors.length) | 0]
      g.fillRect(r() * CW, r() * CH, size, size)
    }
  }
  // the wall
  if (kind === 'red' || kind === 'brown') {
    const img = tiles[kind]
    const pat = g.createPattern(img, 'repeat')
    // red tile: 5 x 5 m; brown tile: 5.47 x 5.08 m (built from the scans at 102 px per metre)
    const [mw, mh] = kind === 'red' ? [5, 5] : [5.47, 5.08]
    pat.setTransform(new DOMMatrix().scale((mw * KX) / img.width, (mh * KY) / img.height))
    g.fillStyle = pat
    g.fillRect(0, 0, CW, CH)
  } else if (kind === 'stone' || kind === 'buff') {
    g.fillStyle = kind === 'stone' ? '#c9b893' : '#d9cdb5'
    g.fillRect(0, 0, CW, CH)
    noise(9000, ['#bfae88', '#d3c39f', '#c4b38e', '#b8a882'])
    g.fillStyle = 'rgba(90,75,50,0.35)'
    for (let y = 0; y < FH; y += 0.6) R(g, 0, y, FW, 0.03) // ashlar courses
    for (let y = 0; y < FH; y += 0.6) for (let x = (y / 0.6) % 2 ? 0 : 0.6; x < FW; x += 1.2) R(g, x, y, 0.03, 0.6)
  } else if (kind === 'clap') {
    const base = ['#e9e6dc', '#d9dcd6', '#e3d9c2', '#cfd6dc'][(r() * 4) | 0]
    g.fillStyle = base
    g.fillRect(0, 0, CW, CH)
    g.fillStyle = 'rgba(60,60,60,0.22)'
    for (let y = 0; y < FH; y += 0.16) R(g, 0, y, FW, 0.025) // lap siding shadow lines
    noise(3000, ['rgba(0,0,0,0.04)', 'rgba(255,255,255,0.06)'])
  } else {
    g.fillStyle = '#c7ccd1' // glass office: pale spandrel panels
    g.fillRect(0, 0, CW, CH)
  }
  // a window: frame, glass with a sky reflection, maybe blinds, maybe lit
  const glass = (x, y, w, h, frame = '#e9e6df', lit = r() < 0.07) => {
    fill(frame, x - 0.08, y - 0.08, w + 0.16, h + 0.16)
    const gy = CH - (y + h) * KY
    const grad = g.createLinearGradient(0, gy, 0, gy + h * KY)
    if (lit) {
      grad.addColorStop(0, '#d9c08f')
      grad.addColorStop(1, '#a8834f')
    } else {
      const k = r() * 0.25
      grad.addColorStop(0, `rgb(${150 - k * 120},${168 - k * 120},${188 - k * 110})`)
      grad.addColorStop(0.45, `rgb(${70 - k * 40},${82 - k * 40},${98 - k * 40})`)
      grad.addColorStop(1, `rgb(${46 - k * 20},${54 - k * 20},${64 - k * 20})`)
    }
    g.fillStyle = grad
    R(g, x, y, w, h)
    if (!lit && r() < 0.3) fill(['#d8d0bd', '#cfc6b0', '#e4ddcc'][(r() * 3) | 0], x, y + h * (0.45 + r() * 0.4), w, h * 0.55) // blinds
    if (lit) {
      e.fillStyle = r() < 0.5 ? '#ffd28c' : '#fff0d0'
      R(e, x, y, w, h)
    }
    fill(frame, x + w / 2 - 0.03, y, 0.06, h) // mullion
    fill(frame, x, y + h * 0.62, w, 0.05) // transom
  }
  for (let s = 0; s < 6; s++) {
    const y0 = s * STOREY
    for (let b = 0; b < 8; b++) {
      const x0 = b * BAY
      if (kind === 'glass') {
        fill('#9aa3ab', x0, y0 + 0.95, BAY, 0.05)
        if (s === 0) {
          glass(x0 + 0.1, 0.05, BAY - 0.2, 3.05, '#3b4048', r() < 0.15)
          continue
        }
        for (const dx of [0, 1.5]) glass(x0 + dx + 0.05, y0 + 1.0, 1.4, 2.15, '#3b4048', r() < 0.08)
        continue
      }
      if (s === 0) {
        // ground floor: shopfronts on brick and stone, doors and windows on the houses
        if (kind === 'clap') {
          if (b % 4 === 1) {
            fill('#3d2b22', x0 + 0.9, 0.3, 1.1, 2.2) // panelled door
            fill('#efece4', x0 + 0.75, 2.5, 1.4, 0.12)
          } else glass(x0 + 0.85, 0.9, 1.2, 1.7, '#f2f0ea')
          continue
        }
        if (kind === 'brown') {
          if (b % 3 === 1) {
            fill('#2a1d17', x0 + 0.8, 0.35, 1.4, 2.5) // entrance up a stoop
            fill('#bba98c', x0 + 0.6, 0, 1.8, 0.35)
            fill('#bba98c', x0 + 0.65, 2.85, 1.7, 0.18)
          } else glass(x0 + 0.85, 0.9, 1.3, 1.8, '#d9d2c4')
          continue
        }
        // shopfront bay: sign band, big glass, stall riser, a door in some bays
        fill(SIGNS[(b + s + ((r() * 2) | 0)) % SIGNS.length], x0, 2.55, BAY, 0.6)
        g.fillStyle = 'rgba(240,235,220,0.75)'
        for (let k = 0; k < 4; k++) if (r() < 0.6) R(g, x0 + 0.3 + k * 0.6, 2.72, 0.4, 0.22) // lettering
        fill('#2b2d2f', x0 + 0.12, 0, BAY - 0.24, 0.45)
        if (b % 3 === 2) {
          glass(x0 + 0.25, 0.05, 1.0, 2.35, '#2b2d2f', false)
          glass(x0 + 1.5, 0.5, 1.3, 1.95, '#2b2d2f')
        } else glass(x0 + 0.25, 0.5, BAY - 0.5, 1.95, '#2b2d2f')
        continue
      }
      // upper storeys
      if (kind === 'brown') {
        glass(x0 + 0.85, y0 + 0.8, 1.3, 1.95, '#d8d0bf')
        fill('#b9a684', x0 + 0.7, y0 + 2.75, 1.6, 0.22) // brownstone lintel
        fill('#b9a684', x0 + 0.75, y0 + 0.66, 1.5, 0.1)
      } else if (kind === 'red') {
        glass(x0 + 0.85, y0 + 0.85, 1.3, 1.8)
        fill('#d4ccbc', x0 + 0.75, y0 + 2.73, 1.5, 0.18)
        fill('#d4ccbc', x0 + 0.78, y0 + 0.72, 1.44, 0.1)
      } else if (kind === 'clap') {
        glass(x0 + 0.95, y0 + 0.9, 1.1, 1.7, '#f4f2ec')
        fill('#2f4a3a', x0 + 0.55, y0 + 0.82, 0.32, 1.86) // shutters
        fill('#2f4a3a', x0 + 2.13, y0 + 0.82, 0.32, 1.86)
      } else {
        glass(x0 + 0.9, y0 + 0.8, 1.2, 2.0, '#4a3f33')
        fill(kind === 'stone' ? '#b3a27e' : '#c9bda4', x0 + 0.75, y0 + 0.65, 1.5, 0.12)
      }
    }
    // string course over the ground floor
    if (s === 1 && kind !== 'glass' && kind !== 'clap') fill(kind === 'red' ? '#cfc6b4' : '#b7a782', 0, STOREY - 0.12, FW, 0.24)
  }
  const map = new THREE.CanvasTexture(col)
  const emissiveMap = new THREE.CanvasTexture(emi)
  for (const t of [map, emissiveMap]) {
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
  }
  return { map, emissiveMap }
}

// ---------- the town plan (seeded, so it is the same on every load)
// rows outward from the far sidewalk: [setback (m), min storeys, max storeys, share of lots built]
const ROWS = [[3, 2, 4, 0.92], [28, 3, 5, 0.88], [54, 3, 5, 0.85], [82, 2, 5, 0.75], [118, 3, 6, 0.6], [150, 3, 6, 0.5]]
const KIND_ODDS = [
  ['red', 'brown', 'clap', 'stone', 'red', 'buff', 'clap'],
  ['red', 'brown', 'stone', 'glass', 'buff', 'clap'],
  ['red', 'glass', 'stone', 'brown', 'buff'],
]
function townPlan() {
  const r = rand(23)
  const out = []
  for (const k of ['W', 'N', 'E', 'S']) {
    const ns = NS.includes(k)
    const o = OUT[k]
    const walkOuter = EDGE[k][1] + o * (VERGE + WALK)
    // west and east rows run the whole length, cut by the north and south street corridors;
    // north and south rows fill the blocks between the west and east corridors
    const ranges = ns
      ? splitRange(-190, 200, ['N', 'S'].map((j) => corridor(j)).map(([a, b]) => [a - 2, b + 2]))
      : [[corridor('W')[1] + 2, corridor('E')[0] - 2]]
    ROWS.forEach(([off, s0, s1, dens], row) => {
      for (const [t0, t1] of ranges) {
        let t = t0 + r() * 4
        for (;;) {
          const odds = KIND_ODDS[Math.min(2, row)]
          const kind = odds[(r() * odds.length) | 0]
          const house = kind === 'clap' // New Haven wooden houses: 9 to 12 m, gable to the street
          const wid = BAY * (house ? 3 + Math.floor(r() * 2) : 4 + Math.floor(r() * 7))
          const dep = BAY * (house ? 4 + Math.floor(r() * 2) : 4 + Math.floor(r() * 4))
          if (t + wid > t1) break
          const front = walkOuter + o * (off + r() * 3)
          const back = front + o * dep
          const [x0, x1, z0, z1] = ns
            ? [Math.min(front, back), Math.max(front, back), t, t + wid]
            : [t, t + wid, Math.min(front, back), Math.max(front, back)]
          const inside = [[x0, z0], [x0, z1], [x1, z0], [x1, z1]].every(([x, z]) => Math.hypot(x - CENTER[0], z - CENTER[1]) < WALL_R - 12)
          if (inside && r() < dens) {
            const storeys = house ? 2 + Math.floor(r() * 2) : s0 + Math.floor(r() * (s1 - s0 + 1))
            out.push({ x0, x1, z0, z1, h: storeys * STOREY, kind, row, side: k, uOff: BAY * Math.floor(r() * 8), seed: r() })
          }
          t += wid + (house ? 3 + r() * 4 : r() < 0.3 ? 0 : 2 + r() * 7)
        }
      }
    })
  }
  return out
}

function buildingGeos(plan) {
  const walls = Object.fromEntries(KINDS.map((k) => [k, []]))
  const trim = new Mesher()
  const r = rand(91)
  for (const b of plan) {
    const { x0, x1, z0, z1, h, kind } = b
    // four walls, u in metres around the building (from a random bay), v in metres up
    const c = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]
    let u = b.uOff
    for (let i = 0; i < 4; i++) {
      const [ax, az] = c[i]
      const [bx, bz] = c[(i + 1) % 4]
      const len = Math.hypot(bx - ax, bz - az)
      walls[kind].push({ p: [[ax, G, az], [bx, G, bz], [bx, G + h, bz], [ax, G + h, az]], t: [[u / FW, 0], [(u + len) / FW, 0], [(u + len) / FW, h / FH], [u / FW, h / FH]] })
      u += len
    }
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const w = x1 - x0
    const d = z1 - z0
    if (kind === 'clap') {
      // pitched slate roof along the long axis, gable ends in the siding colour
      const along = NS.includes(b.side) // ridge runs away from the street
      const ridge = 2.2 + Math.min(w, d) * 0.12
      const roof = new THREE.BufferGeometry()
      const L = along ? w : d
      const Wd = along ? d : w
      const v = [[-L / 2, 0, -Wd / 2 - 0.3], [L / 2, 0, -Wd / 2 - 0.3], [L / 2, ridge, 0], [-L / 2, ridge, 0], [-L / 2, 0, Wd / 2 + 0.3], [L / 2, 0, Wd / 2 + 0.3]]
      const tri = (a, b2, c2) => [v[a], v[b2], v[c2]]
      const faces = [...tri(0, 3, 2), ...tri(0, 2, 1), ...tri(4, 5, 2), ...tri(4, 2, 3)]
      roof.setAttribute('position', new THREE.Float32BufferAttribute(faces.flat(), 3))
      roof.computeVertexNormals()
      trim.geo(roof, at(cx, G + h, cz, along ? 0 : Math.PI / 2), r() < 0.5 ? '#4a4d52' : '#5a4a42')
      const gable = new THREE.BufferGeometry()
      const gv = [[-L / 2, 0, -Wd / 2], [-L / 2, 0, Wd / 2], v[3], [L / 2, 0, Wd / 2], [L / 2, 0, -Wd / 2], v[2]]
      gable.setAttribute('position', new THREE.Float32BufferAttribute(gv.flat(), 3))
      gable.computeVertexNormals()
      trim.geo(gable, at(cx, G + h, cz, along ? 0 : Math.PI / 2), '#e2ded4')
      continue
    }
    // flat roof, a parapet with a stone coping, rooftop plant
    trim.box(cx, G + h - 0.05, cz, w - 0.1, 0.1, d - 0.1, ['#5b5d60', '#66625c', '#555a5e'][(r() * 3) | 0])
    const ph = kind === 'glass' ? 0.5 : 0.9
    const cop = kind === 'glass' ? '#9aa3ab' : kind === 'red' || kind === 'brown' ? '#cfc7b6' : '#bfb08f'
    trim.box(cx, G + h + ph / 2, z0 + 0.15, w, ph, 0.3, cop)
    trim.box(cx, G + h + ph / 2, z1 - 0.15, w, ph, 0.3, cop)
    trim.box(x0 + 0.15, G + h + ph / 2, cz, 0.3, ph, d - 0.6, cop)
    trim.box(x1 - 0.15, G + h + ph / 2, cz, 0.3, ph, d - 0.6, cop)
    const units = 1 + Math.floor(r() * 3)
    for (let i = 0; i < units; i++) {
      const sx = 1.5 + r() * 2.5
      const sz = 1.2 + r() * 2
      const sy = 1 + r() * 1.4
      trim.box(x0 + 2 + sx / 2 + r() * Math.max(0, w - 4 - sx), G + h + sy / 2, z0 + 2 + sz / 2 + r() * Math.max(0, d - 4 - sz), sx, sy, sz, ['#8d9094', '#a3a6a8', '#7b7e82'][i % 3])
    }
    // shop awnings over some ground-floor bays of the front rows' street faces
    if (b.row === 0 && (kind === 'red' || kind === 'stone' || kind === 'buff') && r() < 0.75) {
      const color = ['#2f5d3a', '#7a2328', '#23365e', '#b25b22', '#3b3b3b'][(r() * 5) | 0]
      const o = OUT[b.side]
      const ns = NS.includes(b.side)
      // the street face is the one nearest the building: x0 or x1 (west and east), z0 or z1
      const fx = ns ? (o < 0 ? x1 : x0) : null
      const fz = ns ? null : o < 0 ? z1 : z0
      const len = ns ? d : w
      const yaw = ns ? (o < 0 ? Math.PI / 2 : -Math.PI / 2) : o < 0 ? 0 : Math.PI
      const n = Math.max(1, Math.floor(len / BAY) - 1)
      for (let i = 0; i < n; i++) {
        if (r() < 0.45) continue
        const tc = (ns ? z0 : x0) + BAY * (i + 0.5) + ((b.uOff % BAY) || 0)
        const [ax, az] = ns ? [fx, tc] : [tc, fz]
        // sloped canvas 2.6 m wide, 1.2 m deep, with a 0.3 m valance at the front
        trim.geo(BOX, at(ax, G + 2.75, az, yaw, M4().makeRotationX(-0.42).multiply(M4().makeTranslation(0, 0, 0.62)).multiply(M4().makeScale(2.6, 0.04, 1.3))), color)
        trim.geo(BOX, at(ax, G + 2.42, az, yaw, M4().makeTranslation(0, 0, 1.18).multiply(M4().makeScale(2.6, 0.3, 0.03))), color)
      }
    }
  }
  return { walls: Object.fromEntries(KINDS.map((k) => [k, walls[k].length ? quadGeo(walls[k]) : null])), trim }
}
// ---------- low-poly trees between the buildings (seen from 30 m and more) and east conifers
function lowTree(ms, x, z, s, r) {
  const y = G
  ms.geo(cyl(0.12 * s, 0.18 * s, 2.6 * s, 5), at(x, y + 1.3 * s, z), '#4b3a2c')
  const greens = ['#4f6b3a', '#5d7a40', '#466233', '#6b7f3c', '#56703c']
  const n = 3 + Math.floor(r() * 2)
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry((1.6 + r() * 1.0) * s, 1)
    const p = g.attributes.position
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.85 + r() * 0.3), p.getY(k) * (0.8 + r() * 0.3), p.getZ(k) * (0.85 + r() * 0.3))
    g.computeVertexNormals()
    const a = (i / n) * TAU + r()
    const rr = i === 0 ? 0 : 1.1 * s
    ms.geo(g, at(x + Math.sin(a) * rr, y + (3.6 + r() * 1.6) * s, z + Math.cos(a) * rr), greens[(r() * greens.length) | 0])
  }
}
function conifer(ms, x, z, s, r) {
  ms.geo(cyl(0.1 * s, 0.14 * s, 1.4 * s, 5), at(x, G + 0.7 * s, z), '#4b3a2c')
  const tiers = [[1.7, 2.6, 1.9], [1.4, 2.4, 3.2], [1.05, 2.2, 4.4], [0.7, 1.9, 5.5]]
  tiers.forEach(([rad, h, y], i) => {
    // 28 sides and a ragged hem: the 9-sided cones read as paper party hats from the terrace
    const g = new THREE.ConeGeometry(rad * s, h * s, 28, 3, true)
    const p = g.attributes.position
    const ph = r() * TAU
    for (let k = 0; k < p.count; k++) {
      // jitter by angle (whole-number frequencies), so the duplicated seam vertices move together
      const ang = Math.atan2(p.getZ(k), p.getX(k))
      const hem = p.getY(k) < -0.49 * h * s
      const f = 0.93 + 0.07 * Math.sin(3 * ang + ph) + 0.04 * Math.sin(7 * ang + 2 * ph)
      p.setXYZ(k, p.getX(k) * f, p.getY(k) - (hem ? 0.15 + 0.12 * Math.sin(5 * ang + ph) : 0), p.getZ(k) * f)
    }
    g.computeVertexNormals()
    ms.geo(g, at(x, G + y * s, z, r() * TAU), ['#1f3320', '#243b22', '#203722', '#284326'][i])
  })
}
// Ring trees within NEAR_TREE m of the building (its box plus the terrace) are Sapling trees
// (Scenery.jsx Trees), the rest stay low-poly; from the terrace and the meeting rooms the near
// ones read as faceted balls (Lan, round 3). Sapling heights as grown: maple 9.1 m, aspen 16.9 m,
// birch 13.6 m, scaled to the 7 to 12 m of the low-poly crowns.
const NEAR_TREE = 60
const buildingGap = (x, z) => {
  const dx = Math.max(BOUNDS.xMin - x, 0, x - (BOUNDS.xMax + BEIN.terrace))
  const dz = Math.max(BOUNDS.zMin - z, 0, z - BOUNDS.zMax)
  return Math.hypot(dx, dz)
}
function ringTrees(ms, plan, near) {
  const r = rand(57)
  const kinds = ['maple', 'aspen', 'maple', 'birch']
  const blocked = (x, z) =>
    plan.some((b) => x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3) ||
    ['W', 'E'].some((k) => { const [a, b] = corridor(k); return x > a - 2 && x < b + 2 }) ||
    ['N', 'S'].some((k) => { const [a, b] = corridor(k); return z > a - 2 && z < b + 2 }) ||
    Math.hypot(x - CENTER[0], z - CENTER[1]) > WALL_R - 20
  let placed = 0
  for (let tries = 0; tries < 2000 && placed < 34; tries++) {
    const a = r() * TAU
    const d = 80 + r() * 110
    const x = CENTER[0] + Math.sin(a) * d
    const z = CENTER[1] + Math.cos(a) * d
    if (Math.abs(x - CENTER[0]) < 63.7 && Math.abs(z - CENTER[1]) < 62.5) continue // the block itself (52 x 58 before round 4)
    if (blocked(x, z)) continue
    const sc = 0.8 + r() * 0.7
    if (buildingGap(x, z) < NEAR_TREE) {
      const v = kinds[near.length % kinds.length]
      near.push({ p: [x, G, z], r: r() * TAU, s: (v === 'maple' ? 1.05 : v === 'birch' ? 0.72 : 0.6) * (0.75 + sc * 0.3), v })
    } else lowTree(ms, x, z, sc, r)
    placed++
  }
  // conifers on the east lawn either side of the terrace (photo 10)
  for (const [x, z, s] of [[48.2, -22, 1.1], [48.6, -27, 0.9], [48.0, 22, 1.0], [48.4, 27.5, 1.2], [47.6, 33, 0.85]]) conifer(ms, planX(x), planZ(z), s, r)
}

// clipped hedges and shrub balls on the lawn along the building's base (photo 03)
function hedges(ms) {
  const r = rand(77)
  const { xMin, zMin, zMax } = BOUNDS
  const greens = ['#3f5f34', '#466a38', '#3a5830', '#4c6e3a']
  const run = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az)
    const yaw = Math.atan2(bx - ax, bz - az)
    for (let t = 0; t < len - 1; t += 3.6) {
      const x = ax + ((bx - ax) * (t + 1.6)) / len
      const z = az + ((bz - az) * (t + 1.6)) / len
      if (r() < 0.22) {
        for (const d of [-0.9, 0.9]) ms.geo(new THREE.IcosahedronGeometry(0.6 + r() * 0.2, 3), at(x + Math.sin(yaw) * d, G + 0.5, z + Math.cos(yaw) * d), greens[(r() * 4) | 0])
        continue
      }
      const h = 0.85 + r() * 0.25
      ms.box(x, G + h / 2, z, 1.1, h, 3.3, greens[(r() * 4) | 0], yaw)
    }
  }
  run(xMin - 2.2, zMin + 3, xMin - 2.2, -4)
  run(xMin - 2.2, 6, xMin - 2.2, zMax - 3)
  run(xMin + 3, zMin - 2.2, planX(26), zMin - 2.2)
  run(xMin + 3, zMax + 2.2, planX(26), zMax + 2.2)
}

// ---------- street furniture
const C = {
  iron: '#1d2120', glassL: '#e6e0c8', wood: '#8a6442', usps: '#24448f', hydrant: '#d4a82a', red: '#9c2a22',
  bin: '#2c3a30', pole: '#4a4e52', signal: '#d6b23a', sign: '#1f6b3a', shelter: '#3c4146', ad: '#e8e4da', white: '#e9e9e6',
}
function lampPost(ms, x, z) {
  const y = G + CURB
  ms.geo(cyl(0.17, 0.2, 0.6, 8), at(x, y + 0.3, z), C.iron)
  ms.geo(cyl(0.06, 0.075, 3.6, 8), at(x, y + 2.4, z), C.iron)
  ms.geo(cyl(0.12, 0.08, 0.12, 8), at(x, y + 4.25, z), C.iron)
  ms.geo(cyl(0.21, 0.13, 0.55, 6), at(x, y + 4.58, z), C.glassL)
  ms.geo(new THREE.ConeGeometry(0.28, 0.26, 6), at(x, y + 4.98, z), C.iron)
  ms.geo(new THREE.SphereGeometry(0.05, 6, 4), at(x, y + 5.15, z), C.iron)
}
function bench(ms, x, z, yaw) {
  const y = G + CURB
  for (const dx of [-0.7, 0.7]) {
    ms.box(x + dx, y + 0.22, z, 0.06, 0.44, 0.5, C.iron, yaw, x, z)
    ms.box(x + dx, y + 0.62, z + 0.22, 0.06, 0.4, 0.05, C.iron, yaw, x, z)
  }
  for (let i = 0; i < 3; i++) ms.box(x, y + 0.45, z - 0.16 + i * 0.15, 1.7, 0.035, 0.12, C.wood, yaw, x, z)
  for (let i = 0; i < 2; i++) ms.box(x, y + 0.62 + i * 0.16, z + 0.25, 1.7, 0.1, 0.03, C.wood, yaw, x, z)
}
function bike(ms, x, z, yaw, frame) {
  const y = G + CURB
  const wheel = new THREE.TorusGeometry(0.33, 0.022, 5, 14)
  for (const dx of [-0.52, 0.52]) ms.geo(wheel, at(x, y + 0.35, z, yaw, M4().makeTranslation(dx, 0, 0)), '#1a1a1a')
  const tube = (ax, ay, bx, by, r2 = 0.018) => {
    const len = Math.hypot(bx - ax, by - ay)
    const m = M4().makeTranslation((ax + bx) / 2, (ay + by) / 2, 0).multiply(M4().makeRotationZ(Math.atan2(by - ay, bx - ax) - Math.PI / 2))
    ms.geo(cyl(r2, r2, len, 5, true), at(x, y, z, yaw, m), frame)
  }
  tube(-0.52, 0.35, -0.08, 0.38) // chainstay
  tube(-0.08, 0.38, -0.2, 0.85) // seat tube
  tube(-0.2, 0.8, 0.38, 0.82) // top tube
  tube(-0.08, 0.38, 0.38, 0.8) // down tube
  tube(0.52, 0.35, 0.36, 0.95) // fork and stem
  tube(-0.52, 0.35, -0.2, 0.8)
  ms.box(x - 0.22, y + 0.9, z, 0.24, 0.05, 0.1, '#202020', yaw, x, z) // saddle (yawed about the bike)
  ms.geo(cyl(0.012, 0.012, 0.5, 5), at(x, y + 0.97, z, yaw, M4().makeTranslation(0.36, 0, 0).multiply(M4().makeRotationX(Math.PI / 2))), '#202020')
}
function bikeRack(ms, x, z, yaw, n) {
  const y = G + CURB
  for (let i = 0; i < n; i++) {
    const hoop = new THREE.TorusGeometry(0.38, 0.025, 5, 10, Math.PI)
    ms.geo(hoop, at(x, y + 0.45, z, yaw, M4().makeTranslation(0, 0, (i - (n - 1) / 2) * 0.9)), '#7d8287')
    for (const dx of [-0.38, 0.38]) ms.geo(cyl(0.025, 0.025, 0.45, 5, true), at(x, y + 0.225, z, yaw, M4().makeTranslation(dx, 0, (i - (n - 1) / 2) * 0.9)), '#7d8287')
  }
}
function mailbox(ms, x, z, yaw) {
  const y = G + CURB
  ms.box(x, y + 0.6, z, 0.5, 0.75, 0.5, C.usps, yaw, x, z)
  ms.geo(cyl(0.25, 0.25, 0.5, 10, false), at(x, y + 0.98, z, yaw, M4().makeRotationZ(Math.PI / 2).multiply(M4().makeScale(1, 1, 1))), C.usps)
  for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) ms.box(x + dx, y + 0.12, z + dz, 0.05, 0.24, 0.05, C.usps, yaw, x, z)
}
function hydrant(ms, x, z) {
  const y = G + CURB
  ms.geo(cyl(0.12, 0.14, 0.55, 8), at(x, y + 0.3, z), C.hydrant)
  ms.geo(new THREE.SphereGeometry(0.13, 8, 4, 0, TAU, 0, Math.PI / 2), at(x, y + 0.57, z), C.red)
  ms.geo(cyl(0.05, 0.05, 0.42, 6), at(x, y + 0.38, z, 0, M4().makeRotationZ(Math.PI / 2)), C.hydrant)
}
function litterBin(ms, x, z) {
  const y = G + CURB
  ms.geo(cyl(0.28, 0.26, 0.9, 10), at(x, y + 0.45, z), C.bin)
  ms.geo(cyl(0.3, 0.3, 0.06, 10), at(x, y + 0.92, z), '#1a1f1b')
}
// mast-arm traffic signal on the corner, the arm reaching over the road along +x of its yaw
function signal(ms, x, z, yaw, arm) {
  const y = G + CURB
  ms.geo(cyl(0.1, 0.13, 6, 8), at(x, y + 3, z), C.pole)
  ms.geo(cyl(0.06, 0.08, arm, 6), at(x, y + 5.6, z, yaw, M4().makeTranslation(arm / 2, 0, 0).multiply(M4().makeRotationZ(Math.PI / 2))), C.pole)
  for (const f of [0.55, 0.95]) {
    ms.box(x + arm * f, y + 5.05, z, 0.34, 1.0, 0.28, C.signal, yaw, x, z)
    ms.box(x + arm * f, y + 5.35, z + 0.15, 0.2, 0.2, 0.02, '#c43a2a', yaw, x, z)
  }
  ms.box(x, y + 2.6, z + 0.15, 0.3, 0.3, 0.2, '#2b2b2b', yaw, x, z) // pedestrian head
  ms.box(x + 0.6, y + 3.9, z, 1.1, 0.22, 0.02, C.sign, yaw + Math.PI / 2, x, z) // street name blade
}
function busShelter(ms, x, z, yaw) {
  const y = G + CURB
  for (const [dx, dz] of [[-1.8, -0.7], [1.8, -0.7], [-1.8, 0.7], [1.8, 0.7]]) ms.box(x + dx, y + 1.25, z + dz, 0.08, 2.5, 0.08, C.shelter, yaw, x, z)
  ms.box(x, y + 2.54, z, 3.9, 0.1, 1.7, C.shelter, yaw, x, z)
  ms.box(x, y + 0.45, z + 0.45, 2.6, 0.05, 0.35, C.wood, yaw, x, z)
  ms.box(x + 2.1, y + 1.4, z + 0.55, 0.06, 2.8, 0.06, C.pole, yaw, x, z) // stop sign pole
  ms.box(x + 2.1, y + 2.6, z + 0.55, 0.5, 0.35, 0.02, '#1f4f8f', yaw, x, z)
}

function furniture(plan, near) {
  const ms = new Mesher()
  const inner = (k) => EDGE[k][0] - (OUT[k] * VERGE) / 2
  const outer = (k) => EDGE[k][1] + (OUT[k] * VERGE) / 2
  const walkIn = (k) => EDGE[k][0] - OUT[k] * (VERGE + WALK / 2)
  // lantern posts between the street trees on the verges (photo 03)
  // positions along each street are written for the round-3 floor: X / Z (planX / planZ) spread
  // them along the longer streets of the enlarged block
  const X = planX
  const Z = planZ
  for (let z = -28; z <= 36; z += 16) lampPost(ms, inner('W'), Z(z))
  for (let x = -23; x <= 33; x += 14) lampPost(ms, X(x), inner('N'))
  for (const z of [-26, -6, 8, 28]) lampPost(ms, inner('E'), Z(z))
  for (let x = -32; x <= 40; x += 16) lampPost(ms, X(x), inner('S'))
  for (const z of [-40, -12, 12, 40]) lampPost(ms, outer('W'), Z(z))
  for (const x of [-32, 4, 40]) lampPost(ms, X(x), outer('N'))
  for (const z of [-40, 0, 40]) lampPost(ms, outer('E'), Z(z))
  for (const x of [-36, 6, 38]) lampPost(ms, X(x), outer('S'))
  // benches facing the street, litter bins beside some
  for (const z of [-14, 22]) bench(ms, walkIn('W') + 0.6, Z(z), Math.PI / 2)
  for (const x of [-22, 26]) bench(ms, X(x), walkIn('S') - 0.6, Math.PI)
  bench(ms, X(-8), walkIn('N') + 0.6, 0)
  bench(ms, walkIn('E') - 0.6, Z(-8), -Math.PI / 2)
  bench(ms, walkIn('E') - 0.6, Z(8), -Math.PI / 2)
  for (const [x, z] of [[walkIn('W') + 0.7, Z(-16.2)], [walkIn('W') + 0.7, Z(24.2)], [X(-24.2), walkIn('S') - 0.7], [walkIn('E') - 0.7, Z(-10.2)], [X(-10.2), walkIn('N') + 0.7]]) litterBin(ms, x, z)
  // Whitney Avenue bus stop, a bike rack beside it and another on the south street
  busShelter(ms, walkIn('W') + 0.2, 4, Math.PI / 2)
  bikeRack(ms, walkIn('W') + 0.3, 11.5, 0, 3)
  bike(ms, walkIn('W') + 0.3, 11.05, Math.PI / 2, '#8c2a2a')
  bike(ms, walkIn('W') + 0.3, 11.95, Math.PI / 2 + 0.05, '#20406a')
  bikeRack(ms, X(8), walkIn('S') - 0.3, Math.PI / 2, 4)
  bike(ms, X(8) - 1.8, walkIn('S') - 0.3, 0.04, '#2e2e2e')
  bike(ms, X(8) - 0.9, walkIn('S') - 0.3, -0.03, '#3c6b45')
  bike(ms, X(8) + 1.8, walkIn('S') - 0.3, 0, '#b8b8b8')
  bike(ms, X(8) + 1.0, walkIn('S') - 0.3, 3.1, '#c46a1c')
  mailbox(ms, walkIn('W') + 0.9, -4, Math.PI / 2)
  mailbox(ms, X(14), walkIn('S') - 0.9, 0)
  for (const [x, z] of [[inner('W'), Z(-44)], [X(-46), inner('S')], [outer('W'), 2], [X(44), inner('N')]]) hydrant(ms, x, z)
  // signals on the corners nearest the building, arms over Whitney Avenue
  const [nz0, nz1] = surface('N')
  const [sz0, sz1] = surface('S')
  const wx = EDGE.W[0] + 0.6
  signal(ms, wx, nz1 + 1.2, Math.PI, 6)
  signal(ms, wx, sz0 - 1.2, Math.PI, 6)
  signal(ms, EDGE.E[0] - 0.6, nz1 + 1.2, 0, 5)
  signal(ms, EDGE.E[0] - 0.6, sz0 - 1.2, 0, 5)
  ringTrees(ms, plan, near)
  return ms.build()
}

// ---------- parked cars (Kenney Car Kit, CC0): toy proportions, stretched toward a real car
const CAR_SCALE = [1.25, 1.2, 1.7]
const CARS = (() => {
  const xW = EDGE.W[1] + 1.35 // parking lane on the far side of Whitney Avenue, facing south
  const zN = EDGE.N[1] + 1.3 // far side of the north street, facing west
  const names = ['sedan', 'suv', 'van', 'sedan-sports', 'hatchback-sports', 'taxi']
  const spots = [
    ...[-40, -31.5, -23, -6, 2.5, 19, 27.5, 44].map((z) => ({ p: [xW, G, planZ(z)], r: 0 })),
    ...[-30, -21, 4, 22].map((x) => ({ p: [planX(x), G, zN], r: -Math.PI / 2 })),
  ]
  const by = Object.fromEntries(names.map((n) => [n, []]))
  spots.forEach((s, i) => by[names[(i * 5) % names.length]].push({ ...s, r: s.r + ((i * 7) % 3 - 1) * 0.015, s: CAR_SCALE }))
  return by
})()

// ---------- Beinecke terrace: concrete planters and a steel rail (merged), and scanned cafe
// furniture and potted plants (Poly Haven round table, dining chairs, potted plants 01 and 02,
// as indoors). The primitive tables, box chairs and icosahedron shrubs read low-poly from the
// Terrace Room (Lan, round 3).
const TERRACE_FURNITURE = (() => {
  const tables = []
  const chairs = []
  for (const { a, rr, p } of TERRACE_TABLES) {
    const [x, z] = p
    tables.push({ p: [x, 0, z], r: a, s: [0.62, 0.74, 0.62] }) // a 0.87 m cafe table, 0.74 m high
    // two chairs along the ring (0.76 m either side), one toward the rail; each faces the table
    for (const [da, dr] of [[0.76 / rr, 0], [-0.76 / rr, 0], [0, 0.72]]) {
      const [cx, cz] = ellPt(BEIN.c, rr + dr, rr + dr, a + da)
      chairs.push({ p: [cx, 0, cz], r: Math.atan2(x - cx, z - cz), s: 1 })
    }
  }
  // three plants per planter, their pots sunk below the soil (planter top 0.6 m; pot heights
  // about 0.45 m for potted plant 01 and 0.34 m for 02, as scanned)
  const plantA = []
  const plantB = []
  for (const { a, p } of TERRACE_PLANTERS) {
    const r = rand(Math.round(a * 100))
    for (let i = 0; i < 3; i++) {
      const along = (i - 1) * 0.5
      const x = p[0] + Math.cos(a) * along
      const z = p[1] - Math.sin(a) * along
      if (i === 1) plantA.push({ p: [x, 0.14, z], r: r() * TAU, s: 1.0 + r() * 0.1 })
      else plantB.push({ p: [x, 0.26, z], r: r() * TAU, s: 1.0 })
    }
  }
  return { tables, chairs, plantA, plantB }
})()
function terrace() {
  const ms = new Mesher()
  for (const { a, p } of TERRACE_PLANTERS) {
    const [x, z] = p
    const yaw = a // local x along the rail
    ms.box(x, 0.3, z, 1.6, 0.6, 0.55, '#9e9b94', yaw)
    ms.box(x, 0.59, z, 1.5, 0.03, 0.45, '#4a3a2a', yaw)
  }
  // steel cap rail and posts on the glass balustrade (World.jsx draws the glass at r = BEIN.terrace)
  const { c, terrace: R } = BEIN
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 33 }, (_, i) => {
    const [x, z] = ellPt(c, R, R, (i / 32) * Math.PI)
    return new THREE.Vector3(x, 1.07, z)
  }))
  ms.geo(new THREE.TubeGeometry(curve, 96, 0.03, 6), M4(), '#c9ced6')
  for (let i = 0; i <= 42; i++) {
    const [x, z] = ellPt(c, R, R, (i / 42) * Math.PI)
    ms.box(x, 0.53, z, 0.05, 1.06, 0.05, '#aeb4bb')
  }
  return ms.build()
}

// ---------- painted skyline on the distance wall
const WALL_H = 40
function skylineTex() {
  const W = 4096
  const H = 1024
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const r = rand(5)
  // the canvas wraps twice around the 250 m wall: 785 m of wall per canvas width
  const kx = W / ((TAU * WALL_R) / 2)
  const ky = H / WALL_H
  const HAZE = [196, 205, 216]
  const mix = (rgb, a) => `rgb(${rgb.map((v, i) => Math.round(v + (HAZE[i] - v) * a)).join(',')})`
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  // draw at x and its wrapped copies, so the seam does not show
  const wrap = (x, w, fn) => {
    for (const o of [-W, 0, W]) if (x + o + w > 0 && x + o < W) fn(x + o)
  }
  const Y = (m) => H - m * ky
  // 1. ridges: East Rock (a cliff face, its top 15 m on the wall) and the lower West Rock
  const ridge = (x0, len, peak, cliff, haze) => {
    wrap(x0 * kx, len * kx, (ox) => {
      g.fillStyle = mix(hex('#5f7262'), haze)
      g.beginPath()
      g.moveTo(ox, Y(5))
      for (let i = 0; i <= 60; i++) {
        const t = i / 60
        const shape = cliff ? (t < 0.25 ? t / 0.25 : 1 - ((t - 0.25) / 0.75) ** 1.6) : Math.sin(Math.PI * t) ** 0.8
        const h = 5 + (peak - 5) * shape + Math.sin(i * 1.7) * 0.4
        g.lineTo(ox + t * len * kx, Y(h))
      }
      g.lineTo(ox + len * kx, Y(5))
      g.fill()
      if (cliff) {
        // the bare trap-rock face: a reddish-brown band under the crest
        g.fillStyle = mix(hex('#8a5a48'), haze + 0.05)
        g.beginPath()
        g.moveTo(ox + len * kx * 0.03, Y(6))
        g.lineTo(ox + len * kx * 0.24, Y(peak - 0.8))
        g.lineTo(ox + len * kx * 0.3, Y(peak - 2.5))
        g.lineTo(ox + len * kx * 0.12, Y(6))
        g.fill()
      }
    })
  }
  ridge(60, 230, 15.5, true, 0.5)
  ridge(470, 300, 11.5, false, 0.6)
  ridge(330, 140, 9, false, 0.62)
  // 2. a far treeline that hides the ridges' feet
  const canopy = (yBase, yTop, color, haze, n, rmin, rmax) => {
    g.fillStyle = mix(hex(color), haze)
    g.fillRect(0, Y(yBase + 0.5), W, H - Y(yBase + 0.5))
    for (let i = 0; i < n; i++) {
      const x = r() * W
      const rad = (rmin + r() * (rmax - rmin)) * kx
      const top = yBase + r() * (yTop - yBase)
      wrap(x - rad, 2 * rad, (ox) => {
        g.beginPath()
        g.ellipse(ox + rad, Y(top - (rad / kx) * 0.5), rad, ((rad / kx) * ky) * 0.55, 0, 0, TAU)
        g.fill()
      })
    }
  }
  canopy(6, 9.5, '#516447', 0.45, 900, 2, 6)
  // 3. the city: low blocks, church spires (New Haven Green) and a cluster of downtown towers
  const building = (x, w, h, base, color, haze) => {
    wrap(x * kx, w * kx, (ox) => {
      g.fillStyle = mix(hex(color), haze)
      g.fillRect(ox, Y(h), w * kx, Y(base) - Y(h))
      g.fillStyle = mix([70, 78, 90], haze + 0.1)
      for (let yy = base + 1.2; yy < h - 0.6; yy += 1.4) for (let xx = 0.6; xx < w - 0.6; xx += 1.6) if (r() < 0.8) g.fillRect(ox + xx * kx, Y(yy + 0.5), Math.max(1, 0.6 * kx), 0.5 * ky)
    })
  }
  const blockColors = ['#9a6450', '#b98d6c', '#d8d2c6', '#8c5a48', '#c7b493', '#a7a39b', '#e1ddd2', '#7f6655']
  for (let x = 0; x < W / kx; x += 3 + r() * 9) {
    const w = 8 + r() * 22
    building(x, w, 7.5 + r() * 5.5, 5.5, blockColors[(r() * blockColors.length) | 0], 0.38)
  }
  const spire = (x, h, color) => {
    wrap(x * kx - 10, 20, (ox) => {
      const cx = ox + 10
      const tw = 2.2 * kx
      g.fillStyle = mix(hex(color), 0.32)
      g.fillRect(cx - tw / 2, Y(h * 0.62), tw, Y(5) - Y(h * 0.62))
      g.fillRect(cx - tw * 0.4, Y(h * 0.72), tw * 0.8, Y(h * 0.62) - Y(h * 0.72))
      g.beginPath()
      g.moveTo(cx - tw * 0.38, Y(h * 0.72))
      g.lineTo(cx, Y(h))
      g.lineTo(cx + tw * 0.38, Y(h * 0.72))
      g.fill()
    })
  }
  // the Green's three churches sit together; a brick and a stone spire elsewhere
  spire(352, 21, '#f2efe8')
  spire(368, 19.5, '#e9e4da')
  spire(386, 20.5, '#9a6a52')
  spire(612, 17, '#b9ad98')
  spire(148, 16, '#e9e4da')
  const towers = [[300, 7, 24], [309, 9, 27.5], [320, 6, 21], [328, 8, 25], [339, 10, 19], [297, 5, 18.5]]
  for (const [x, w, h] of towers) building(x, w, h, 5.5, ['#9ea6ae', '#c9c4ba', '#7d8590', '#b3aca0'][(x | 0) % 4], 0.42)
  // 4. near roofs and tree crowns: a continuous band from the ground to about 7 m
  canopy(0, 7.2, '#4a5d40', 0.3, 1600, 2.5, 6)
  for (let x = 0; x < W / kx; x += 6 + r() * 16) {
    const w = 6 + r() * 12
    const h = 5 + r() * 3.2
    wrap(x * kx, w * kx, (ox) => {
      g.fillStyle = mix(hex(['#6e5246', '#5f5a55', '#8a6a55', '#77706a'][(r() * 4) | 0]), 0.3)
      g.beginPath()
      g.moveTo(ox, Y(h - 1.6))
      g.lineTo(ox + (w * kx) / 2, Y(h))
      g.lineTo(ox + w * kx, Y(h - 1.6))
      g.lineTo(ox + w * kx, Y(0))
      g.lineTo(ox, Y(0))
      g.fill()
    })
  }
  canopy(0, 4.5, '#43563a', 0.26, 1000, 2, 4.5)
  // haze thickening toward the ground, where the fogged lawn meets the wall
  const grad = g.createLinearGradient(0, Y(8), 0, H)
  grad.addColorStop(0, `rgba(${HAZE.join(',')},0)`)
  grad.addColorStop(1, `rgba(${HAZE.join(',')},0.55)`)
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = grad
  g.fillRect(0, Y(8), W, H - Y(8))
  g.globalCompositeOperation = 'source-over'
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(2, 1)
  t.anisotropy = 8
  return t
}

function DistanceWall() {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.CylinderGeometry(WALL_R, WALL_R, WALL_H, 160, 1, true)
    // tone mapping darkens the painted mid-tones; 1.25 brings them back to the hazy daylight
    // level of the sky's horizon. My judgment from the screenshots.
    const m = new THREE.MeshBasicMaterial({ map: skylineTex(), transparent: true, depthWrite: false, side: THREE.BackSide, color: new THREE.Color(1.25, 1.25, 1.25) })
    return { geo: g, mat: m }
  }, [])
  return <mesh geometry={geo} material={mat} position={[CENTER[0], G + WALL_H / 2, CENTER[1]]} renderOrder={-0.5} />
}

export default function Town() {
  const tiles = useLoader(THREE.TextureLoader, [`${BASE}scenery/tex/brick_red_tile.jpg`, `${BASE}scenery/tex/brick_brown_tile.jpg`])
  const town = useMemo(() => {
    const plan = townPlan()
    const { walls, trim } = buildingGeos(plan)
    hedges(trim)
    const imgs = { red: tiles[0].image, brown: tiles[1].image }
    const facades = Object.fromEntries(
      KINDS.map((k, i) => {
        const { map, emissiveMap } = facadeTextures(k, imgs, 100 + i)
        return [k, new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: '#ffffff', emissiveIntensity: 0.45, roughness: 0.82, metalness: 0 })]
      }),
    )
    const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
    const furnMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 })
    const near = []
    return { plan, walls, trim: trim.build(), facades, trimMat, furnMat, furn: furniture(plan, near), near, ter: terrace() }
  }, [tiles])
  return (
    <group>
      {KINDS.map((k) => town.walls[k] && <mesh key={k} geometry={town.walls[k]} material={town.facades[k]} />)}
      <mesh geometry={town.trim} material={town.trimMat} />
      <mesh geometry={town.furn} material={town.furnMat} castShadow receiveShadow />
      <mesh geometry={town.ter} material={town.furnMat} castShadow receiveShadow />
      {Object.entries(CARS).map(([name, items]) => items.length > 0 && <Model key={name} name={`car_${name}`} items={items} />)}
      <Trees items={town.near} />
      <Model name="round_table" items={TERRACE_FURNITURE.tables} />
      <Model name="dining_chair" items={TERRACE_FURNITURE.chairs} />
      <Model name="plant_a" items={TERRACE_FURNITURE.plantA} />
      <Model name="plant_b" items={TERRACE_FURNITURE.plantB} />
      <DistanceWall />
    </group>
  )
}
