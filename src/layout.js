// Evans Hall, floor 2. Units are meters.
// World axes: +x = east, -z = north (three.js camera looks -z by default = north).
// Read from reference/floorplan (plan is drawn with west at the top).

export const H = 4.6 // ceiling height
export const EYE = 1.65
export const R_PLAYER = 0.35
export const SPAWN = { x: -19, z: 21 } // SW corner by Class of 1980, facing north (photo 1)

export const BOUNDS = { xMin: -33, xMax: 22, zMin: -46, zMax: 46 }

const TAU = Math.PI * 2
const norm = (v) => {
  const l = Math.hypot(v[0], v[1])
  return [v[0] / l, v[1] / l]
}
export const rDir = (d, rx, rz) => 1 / Math.sqrt((d[0] / rx) ** 2 + (d[1] / rz) ** 2)
// same angle convention as THREE.CylinderGeometry: x = sin, z = cos
export const ellPt = (c, rx, rz, th) => [c[0] + rx * Math.sin(th), c[1] + rz * Math.cos(th)]
export const arc = (c, rx, rz, a0, a1, n) =>
  Array.from({ length: n + 1 }, (_, i) => ellPt(c, rx, rz, a0 + ((a1 - a0) * i) / n))

// ---------- courtyard: rounded square, glass wiggles along the classroom (north/south) sides
function courtyardPoints(n = 192) {
  const hx = 16
  const hz = 18
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = hx * Math.sign(c) * Math.pow(Math.abs(c), 1 / 3)
    let z = hz * Math.sign(s) * Math.pow(Math.abs(s), 1 / 3)
    const w = Math.pow(Math.abs(s), 6)
    z -= Math.sign(s) * w * 0.9 * (0.5 + 0.5 * Math.cos((TAU * x) / 11))
    pts.push([x, z])
  }
  return pts
}
export const COURTYARD = courtyardPoints()

export function inPoly(x, z, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]
    const [xj, zj] = pts[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

// ---------- classroom drums
export const DRUMS = [
  { id: '2400', name: 'MBA Class of 1980 Classroom', c: [-25, 27], rx: 7.5, rz: 7.5, door: [1, -1] },
  { id: '2410', name: 'Bewkes Classroom', c: [-11, 30], rx: 4.3, rz: 6.5, door: [0, -1] },
  { id: '2420', name: 'Betts Classroom', c: [0, 30], rx: 4.3, rz: 6.5, door: [0, -1] },
  { id: '2430', name: 'Baker Classroom', c: [11, 30], rx: 4.3, rz: 6.5, door: [0, -1] },
  { id: '2200', name: 'Blumetti Classroom', c: [-25, -27], rx: 7, rz: 7, door: [1, 1] },
  { id: '2210', name: 'Allison Foundation Classroom', c: [-11, -30], rx: 4.3, rz: 6.5, door: [0, 1] },
  { id: '2220', name: 'Jones Classroom', c: [0, -30], rx: 4.3, rz: 6.5, door: [0, 1] },
  { id: '2230', name: 'Nooyi Classroom', c: [11, -30], rx: 4.3, rz: 6.5, door: [0, 1] },
].map((d) => {
  const dir = norm(d.door)
  return { ...d, dir, phi: Math.atan2(dir[0], dir[1]), gap: 1.0 / rDir(dir, d.rx, d.rz) }
})
export const DRUM_WALL = 0.3

// ---------- Beinecke Terrace Room (semi-oval bulging east) + outdoor terrace
export const BEIN = { c: [22, 0], r: 10, terrace: 14, doorGap: 0.13, muralR: 3.6, muralHalf: 0.85 }

// ---------- stairs (painting above each opening)
export const STAIRS = [
  { id: 'A', c: [-28, 15.5], w: 5, d: 3, face: [1, 0], seed: 1 },
  { id: 'B', c: [-28, -15.5], w: 5, d: 3, face: [1, 0], seed: 2 },
  { id: 'G', c: [19.5, 24], w: 3, d: 4, face: [0, -1], photo: true },
  { id: 'D', c: [19.5, -24], w: 3, d: 4, face: [0, 1], seed: 3 },
  { id: 'C', c: [19.5, -43], w: 3, d: 4, face: [0, 1], seed: 4 },
  { id: 'H', c: [19.5, 43], w: 3, d: 4, face: [0, -1], seed: 5 },
  { id: 'I', c: [-30.5, 43], w: 3, d: 4, face: [0, -1], seed: 6 },
]

// ---------- library (west side)
export const LIBRARY = { x0: -33, x1: -22, z0: -12, z1: 12, door: 1.2 }

// ---------- walls: every straight piece is a box; mat 'none' = invisible collider
export const WALLS = []
const W = (a, b, mat, o = {}) =>
  WALLS.push({ a, b, mat, h: o.h ?? H, y0: o.y0 ?? 0, t: o.t ?? 0.2, collide: o.collide ?? true })
const P = (pts, mat, o = {}) => {
  for (let i = 0; i < pts.length - 1; i++) W(pts[i], pts[i + 1], mat, o)
}
const dot = (p) => W(p, [p[0] + 0.01, p[1]], 'none', { t: 0.7 }) // small round-ish blocker

// perimeter
W([-33, -46], [-33, 46], 'exterior')
W([-33, -46], [22, -46], 'exterior')
W([-33, 46], [22, 46], 'exterior')
W([22, -46], [22, -10], 'white')
W([22, 10], [22, 46], 'white')
W([22, -10], [22, -1.3], 'beinGlass', { t: 0.1 })
W([22, 1.3], [22, 10], 'beinGlass', { t: 0.1 })

// courtyard glass (rendered as a smooth ribbon, collider here)
P([...COURTYARD, COURTYARD[0]], 'none', { t: 0.15 })

// drums: outer + inner walls with a door gap, wood-slat door alcove fins
export const CHAIRS = []
export const SCREENS = []
export const BOARDS = []
export const LECTERNS = []
for (const d of DRUMS) {
  const { c, rx, rz, phi, gap, dir } = d
  P(arc(c, rx, rz, phi + gap, phi + TAU - gap, 60), 'none', { t: 0.15 })
  P(arc(c, rx - DRUM_WALL, rz - DRUM_WALL, phi + gap, phi + TAU - gap, 60), 'none', { t: 0.15 })
  for (const e of [phi + gap, phi - gap]) {
    const p = ellPt(c, rx, rz, e)
    const pin = ellPt(c, rx - DRUM_WALL, rz - DRUM_WALL, e)
    const n = norm([p[0] - c[0], p[1] - c[1]])
    W(pin, [p[0] + n[0] * 0.7, p[1] + n[1] * 0.7], 'slats', { t: 0.14 })
  }

  // classroom interior: front partition wall, screens, horseshoe desk rows
  const t = [-dir[1], dir[0]]
  const rF = rDir([-dir[0], -dir[1]], rx, rz)
  const rT = rDir(t, rx, rz)
  const k = 0.55
  const fc = [c[0] - dir[0] * rF * k, c[1] - dir[1] * rF * k]
  const half = rT * Math.sqrt(1 - k * k) - 0.05
  W([fc[0] - t[0] * half, fc[1] - t[1] * half], [fc[0] + t[0] * half, fc[1] + t[1] * half], 'sage', { t: 0.25 })
  const rot = Math.atan2(dir[0], dir[1])
  const offs = half > 5 ? [-2.4, 0, 2.4] : [-1.2, 1.2]
  for (const o of offs) SCREENS.push({ x: fc[0] + dir[0] * 0.15 + t[0] * o, z: fc[1] + dir[1] * 0.15 + t[1] * o, rot })
  BOARDS.push({ x: fc[0] + dir[0] * 0.15, z: fc[1] + dir[1] * 0.15, rot, w: Math.min(2 * half - 1, 6.5) })
  const lp = [fc[0] + dir[0] * 1.3 + t[0] * half * 0.45, fc[1] + dir[1] * 1.3 + t[1] * half * 0.45]
  LECTERNS.push({ x: lp[0], z: lp[1], rot })
  W([lp[0] - t[0] * 0.35, lp[1] - t[1] * 0.35], [lp[0] + t[0] * 0.35, lp[1] + t[1] * 0.35], 'none', { t: 0.5 })

  const F = [fc[0] + dir[0] * 1.4, fc[1] + dir[1] * 1.4]
  const doorP = ellPt(c, rx, rz, phi)
  for (let r = 2.2; r < rF * (1 + k) - 1.3; r += 1.15) {
    const step = 1.25 / r
    for (let th = -1.3; th <= 1.3; th += step) {
      if (Math.abs(th * r) < 0.55) continue // center aisle
      const ux = [Math.cos(th) * dir[0] + Math.sin(th) * t[0], Math.cos(th) * dir[1] + Math.sin(th) * t[1]]
      const p = [F[0] + ux[0] * r, F[1] + ux[1] * r]
      if (((p[0] - c[0]) / (rx - 1.1)) ** 2 + ((p[1] - c[1]) / (rz - 1.1)) ** 2 > 1) continue
      if (Math.hypot(p[0] - doorP[0], p[1] - doorP[1]) < 2.4) continue
      const tg = [-Math.sin(th) * dir[0] + Math.cos(th) * t[0], -Math.sin(th) * dir[1] + Math.cos(th) * t[1]]
      W([p[0] - tg[0] * 0.6, p[1] - tg[1] * 0.6], [p[0] + tg[0] * 0.6, p[1] + tg[1] * 0.6], 'desk', { h: 0.95, t: 0.5 })
      for (const s of [-0.3, 0.3]) {
        CHAIRS.push({ x: p[0] + ux[0] * 0.65 + tg[0] * s, z: p[1] + ux[1] * 0.65 + tg[1] * s, rot: Math.atan2(ux[0], ux[1]) })
      }
    }
  }
}

// library
{
  const { x0, x1, z0, z1, door } = LIBRARY
  W([x1, z0], [x1, -door], 'libGlass', { t: 0.1 })
  W([x1, door], [x1, z1], 'libGlass', { t: 0.1 })
  W([x0, z0], [x1, z0], 'white')
  W([x0, z1], [x1, z1], 'white')
  W([x0 + 0.4, z0 + 1], [x0 + 0.4, z1 - 1], 'shelf', { h: 2.6, t: 0.5 })
  W([-29.5, -10], [-29.5, -3], 'shelf', { h: 1.8, t: 0.5 })
  W([-29.5, 3], [-29.5, 10], 'shelf', { h: 1.8, t: 0.5 })
  for (const z of [-8, -4, 4, 8]) W([-26, z - 1.1], [-26, z + 1.1], 'desk', { h: 0.76, t: 0.9 })
  W([-23.3, -7.5], [-23.3, -4.5], 'leather', { h: 0.45, t: 0.9 })
  W([-23.3, 4.5], [-23.3, 7.5], 'leather', { h: 0.45, t: 0.9 })
  for (const z of [-8, -4, 4, 8]) for (const s of [-1, 1]) CHAIRS.push({ x: -26 + s * 0.75, z, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2 })
}

// stairs: solid white cores
for (const s of STAIRS) {
  const [cx, cz] = s.c
  const hw = s.w / 2
  const hd = s.d / 2
  const q = [[cx - hw, cz - hd], [cx + hw, cz - hd], [cx + hw, cz + hd], [cx - hw, cz + hd], [cx - hw, cz - hd]]
  P(q, 'white')
}

// small glass meeting rooms in strips behind each drum row
export const MEETING = []
for (const side of [1, -1]) {
  const zf = 40 * side
  const zb = 46 * side
  W([-28, zf], [16, zf], 'meetGlass', { t: 0.08 })
  const n = 8
  const w = 44 / n
  for (let i = 0; i <= n; i++) W([-28 + i * w, zf], [-28 + i * w, zb], 'white', { t: 0.15 })
  for (let i = 0; i < n; i++) {
    const cx = -28 + (i + 0.5) * w
    const cz = (zf + zb) / 2
    MEETING.push({ x: cx, z: cz, num: side > 0 ? 2461 + i * 2 : 2246 + i * 3 })
    W([cx - 1.2, cz], [cx + 1.2, cz], 'desk', { h: 0.75, t: 1.1 })
    for (const dx of [-0.7, 0, 0.7]) for (const dz of [-0.85, 0.85]) CHAIRS.push({ x: cx + dx, z: cz + dz, rot: dz > 0 ? Math.PI : 0 })
  }
}

// Beinecke: curved glass, terrace railing, mural wall, tables
{
  const { c, r, terrace, doorGap, muralR, muralHalf } = BEIN
  P(arc(c, r, r, 0, Math.PI / 2 - doorGap, 30), 'none', { t: 0.12 })
  P(arc(c, r, r, Math.PI / 2 + doorGap, Math.PI, 30), 'none', { t: 0.12 })
  P(arc(c, terrace, terrace, 0, Math.PI, 60), 'none', { t: 0.1 })
  P(arc(c, muralR, muralR, Math.PI / 2 - muralHalf, Math.PI / 2 + muralHalf, 20), 'none', { t: 0.2 })
  dot(ellPt(c, 12.6, 12.6, 0.6)) // terrace column
}
export const BEIN_TABLES = [[29, -4.5], [29, 4.5], [26.2, -7], [26.2, 7]]
for (const p of BEIN_TABLES) {
  W(p, [p[0] + 0.01, p[1]], 'none', { t: 1.5 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    CHAIRS.push({ x: p[0] + Math.sin(a) * 1.05, z: p[1] + Math.cos(a) * 1.05, rot: a + Math.PI })
  }
}

// cloister furniture: cognac benches, orange sofas, plants
export const PLANTS = [[-19.2, -10.5], [8.8, -21], [-7, 21], [19, 8], [-19.2, 9.5]]
W([-19.2, -3], [-19.2, -0.6], 'leather', { h: 0.45, t: 0.7 })
W([19, 2.5], [19, 5], 'leather', { h: 0.45, t: 0.7 })
W([-2, -21], [0.6, -21], 'leather', { h: 0.45, t: 0.7 })
W([3.5, 21], [6, 21], 'leather', { h: 0.45, t: 0.7 })
W([6.2, -20.8], [8.2, -20.8], 'orange', { h: 0.55, t: 0.9 })
W([-6.2, 20.8], [-4.2, 20.8], 'orange', { h: 0.55, t: 0.9 })
W([-19.2, 6], [-19.2, 8], 'orange', { h: 0.55, t: 0.9 })
for (const p of PLANTS) dot(p)

// colliders with bounding boxes for fast rejection
export const COLLIDERS = WALLS.filter((w) => w.collide).map((w) => ({
  ...w,
  minx: Math.min(w.a[0], w.b[0]),
  maxx: Math.max(w.a[0], w.b[0]),
  minz: Math.min(w.a[1], w.b[1]),
  maxz: Math.max(w.a[1], w.b[1]),
}))

export function collide(pos) {
  for (let it = 0; it < 3; it++) {
    for (const s of COLLIDERS) {
      const rr = R_PLAYER + s.t / 2
      if (pos.x < s.minx - rr || pos.x > s.maxx + rr || pos.z < s.minz - rr || pos.z > s.maxz + rr) continue
      const dx = s.b[0] - s.a[0]
      const dz = s.b[1] - s.a[1]
      const l2 = dx * dx + dz * dz
      let u = l2 > 0 ? ((pos.x - s.a[0]) * dx + (pos.z - s.a[1]) * dz) / l2 : 0
      u = Math.max(0, Math.min(1, u))
      const qx = s.a[0] + dx * u
      const qz = s.a[1] + dz * u
      const ex = pos.x - qx
      const ez = pos.z - qz
      const d = Math.hypot(ex, ez)
      if (d < rr && d > 1e-6) {
        pos.x = qx + (ex / d) * rr
        pos.z = qz + (ez / d) * rr
      }
    }
  }
  return pos
}

export function locate(x, z) {
  for (const d of DRUMS) {
    if (((x - d.c[0]) / d.rx) ** 2 + ((z - d.c[1]) / d.rz) ** 2 < 1) return `${d.name} · ${d.id}`
  }
  if (x < LIBRARY.x1 && z > LIBRARY.z0 && z < LIBRARY.z1) return 'Ross Library · 2100'
  if (x > 22) return Math.hypot(x - 22, z) < BEIN.r ? 'Beinecke Terrace Room · 2300' : 'Beinecke Terrace (outside)'
  if (z > 36.6) return 'South back hallway · meeting rooms 2461+'
  if (z < -36.6) return 'North back hallway · meeting rooms 2246+'
  if (x < -16) return 'West cloister · Ross Library side'
  if (x > 16) return 'East cloister · Beinecke side'
  return z < 0 ? 'North cloister' : 'South cloister'
}
