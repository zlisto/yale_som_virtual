// Evans Hall, floor 2. Units are meters.
// World axes: +x = east, -z = north (three.js camera looks -z by default = north).
// Read from reference/floorplan (plan is drawn with west at the top).

export const H = 4.6 // ceiling height
export const EYE = 1.65
export const R_PLAYER = 0.35
export const SPAWN = { x: -24.4, z: 22 } // SW corner by Class of 1980, facing north (photo 1)

// corridors are 25% wider than the first pass (gaps 2.5 m, cloister ~7 m, back halls ~4.4 m)
export const BOUNDS = { xMin: -40.75, xMax: 28.75, zMin: -48.3, zMax: 48.3 }
export const EAST = BOUNDS.xMax
const CLOISTER_W = 24.4 // x of the west/east cloister centerlines (mirrored)

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
  const hx = 20
  const hz = 18
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = hx * Math.sign(c) * Math.pow(Math.abs(c), 1 / 3)
    let z = hz * Math.sign(s) * Math.pow(Math.abs(s), 1 / 3)
    const w = Math.pow(Math.abs(s), 6)
    z -= Math.sign(s) * w * 0.9 * (0.5 + 0.5 * Math.cos((TAU * x) / 14.5))
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
// `front` points at the courtyard: whiteboard + podium on that (inner) side, desk rows step back
// toward the outer perimeter. Two doors at the front corners open into the gaps between drums.
export const DRUM_WALL = 0.3
const FRONT_DEPTH = 0.6 // front wall sits 60% of the way from center to the inner edge
const DOOR_DEPTH = 0.35 // doors sit just behind the front wall
export const RISE = 0.32 // stadium seating: each row this much higher than the one in front
export const MAX_STEP = 0.4 // tallest step you can walk up
const ROW0 = 2.3 // first desk row's distance from the seating focus
const ROW_STEP = 1.15
const AISLE_HALF = 0.8
const TIER_SPAN = 1.42 // radians each side of the center aisle covered by risers
const bandStart = (i) => ROW0 - 0.35 + i * ROW_STEP
export const DRUMS = [
  { id: '2400', name: 'MBA Class of 1980 Classroom', c: [-31, 28.4], rx: 8, rz: 8, front: [1, -1] },
  { id: '2410', name: 'Bewkes Classroom', c: [-14.5, 31.4], rx: 6, rz: 6.5, front: [0, -1] },
  { id: '2420', name: 'Betts Classroom', c: [0, 31.4], rx: 6, rz: 6.5, front: [0, -1] },
  { id: '2430', name: 'Baker Classroom', c: [14.5, 31.4], rx: 6, rz: 6.5, front: [0, -1] },
  { id: '2200', name: 'Blumetti Classroom', c: [-31, -28.4], rx: 7.5, rz: 7.5, front: [1, 1] },
  { id: '2210', name: 'Allison Foundation Classroom', c: [-14.5, -31.4], rx: 6, rz: 6.5, front: [0, 1] },
  { id: '2220', name: 'Jones Classroom', c: [0, -31.4], rx: 6, rz: 6.5, front: [0, 1] },
  { id: '2230', name: 'Nooyi Classroom', c: [14.5, -31.4], rx: 6, rz: 6.5, front: [0, 1] },
].map((d) => {
  const dir = norm(d.front)
  const phi = Math.atan2(dir[0], dir[1])
  const a = Math.acos(DOOR_DEPTH)
  const gap = 1.0 / Math.min(d.rx, d.rz) // ~2 m door opening
  const doors = [phi + a, phi - a]
  const arcs = [
    [phi + a + gap, phi + TAU - a - gap], // back + sides
    [phi - a + gap, phi + a - gap], // front, behind the whiteboard
  ]
  return { ...d, dir, phi, gap, doors, arcs }
})

// ---------- Beinecke Terrace Room (semi-oval bulging east) + outdoor terrace
export const BEIN = { c: [EAST, 0], r: 10, terrace: 14, doorGap: 0.13, muralR: 3.6, muralHalf: 0.85 }

// ---------- stairs (painting above each opening)
export const STAIRS = [
  { id: 'A', c: [-34.75, 15.5], w: 5, d: 3, face: [1, 0], seed: 1 },
  { id: 'B', c: [-34.75, -15.5], w: 5, d: 3, face: [1, 0], seed: 2 },
  { id: 'G', c: [24.6, 25], w: 3, d: 4, face: [0, -1], photo: true },
  { id: 'D', c: [24.6, -25], w: 3, d: 4, face: [0, 1], seed: 3 },
  { id: 'C', c: [24.6, -45], w: 3, d: 4, face: [0, 1], seed: 4 },
  { id: 'H', c: [24.6, 45], w: 3, d: 4, face: [0, -1], seed: 5 },
  { id: 'I', c: [-37.75, 45], w: 3, d: 4, face: [0, -1], seed: 6 },
]

// ---------- library (west side)
export const LIBRARY = { x0: -40.75, x1: -28.75, z0: -12, z1: 12, door: 1.2 }

// ---------- walls: every straight piece is a box; mat 'none' = invisible collider
export const WALLS = []
const W = (a, b, mat, o = {}) =>
  WALLS.push({ a, b, mat, h: o.h ?? H, y0: o.y0 ?? 0, t: o.t ?? 0.2, collide: o.collide ?? true })
const P = (pts, mat, o = {}) => {
  for (let i = 0; i < pts.length - 1; i++) W(pts[i], pts[i + 1], mat, o)
}
const dot = (p) => W(p, [p[0] + 0.01, p[1]], 'none', { t: 0.7 }) // small round-ish blocker

// perimeter
const { xMin, zMin, zMax } = BOUNDS
W([xMin, zMin], [xMin, zMax], 'exterior')
W([xMin, zMin], [EAST, zMin], 'exterior')
W([xMin, zMax], [EAST, zMax], 'exterior')
W([EAST, zMin], [EAST, -10], 'white')
W([EAST, 10], [EAST, zMax], 'white')
W([EAST, -10], [EAST, -1.3], 'beinGlass', { t: 0.1 })
W([EAST, 1.3], [EAST, 10], 'beinGlass', { t: 0.1 })

// courtyard glass (rendered as a smooth ribbon, collider here)
P([...COURTYARD, COURTYARD[0]], 'none', { t: 0.15 })

// drums: outer + inner walls with two door gaps, wood-slat door alcove fins
export const CHAIRS = []
export const SCREENS = []
export const BOARDS = []
export const LECTERNS = []
for (const d of DRUMS) {
  const { c, rx, rz, gap, dir, doors, arcs } = d
  for (const [a0, a1] of arcs) {
    const n = Math.max(6, Math.round(((a1 - a0) / TAU) * 64))
    P(arc(c, rx, rz, a0, a1, n), 'none', { t: 0.15 })
    P(arc(c, rx - DRUM_WALL, rz - DRUM_WALL, a0, a1, n), 'none', { t: 0.15 })
  }
  for (const door of doors) {
    for (const e of [door + gap, door - gap]) {
      const p = ellPt(c, rx, rz, e)
      const pin = ellPt(c, rx - DRUM_WALL, rz - DRUM_WALL, e)
      const n = norm([p[0] - c[0], p[1] - c[1]])
      W(pin, [p[0] + n[0] * 0.7, p[1] + n[1] * 0.7], 'slats', { t: 0.14 })
    }
  }

  // classroom interior: front wall (courtyard side) with screens + whiteboard, rows step back outward
  const back = [-dir[0], -dir[1]]
  const t = [-dir[1], dir[0]]
  const rIn = rDir(dir, rx, rz)
  const rOut = rDir(back, rx, rz)
  const rT = rDir(t, rx, rz)
  const fc = [c[0] + dir[0] * rIn * FRONT_DEPTH, c[1] + dir[1] * rIn * FRONT_DEPTH]
  const half = rT * Math.sqrt(1 - FRONT_DEPTH ** 2) - 0.05
  W([fc[0] - t[0] * half, fc[1] - t[1] * half], [fc[0] + t[0] * half, fc[1] + t[1] * half], 'sage', { t: 0.25 })
  const rot = Math.atan2(back[0], back[1]) // screens face the seats
  const offs = half > 6 ? [-2.6, 0, 2.6] : half > 4.2 ? [-2.3, 0, 2.3] : [-1.2, 1.2]
  for (const o of offs) SCREENS.push({ x: fc[0] + back[0] * 0.15 + t[0] * o, z: fc[1] + back[1] * 0.15 + t[1] * o, rot })
  BOARDS.push({ x: fc[0] + back[0] * 0.15, z: fc[1] + back[1] * 0.15, rot, w: Math.min(2 * half - 1.2, 7) })
  const lp = [fc[0] + back[0] * 0.8 + t[0] * half * 0.35, fc[1] + back[1] * 0.8 + t[1] * half * 0.35]
  LECTERNS.push({ x: lp[0], z: lp[1], rot })
  W([lp[0] - t[0] * 0.35, lp[1] - t[1] * 0.35], [lp[0] + t[0] * 0.35, lp[1] + t[1] * 0.35], 'none', { t: 0.5 })

  // stadium seating: row i sits on a riser i * RISE above the front floor
  const F = [fc[0] + back[0] * 1.5, fc[1] + back[1] * 1.5]
  const doorPts = doors.map((a) => ellPt(c, rx, rz, a))
  let i = 0
  for (let r = ROW0; r < rIn * FRONT_DEPTH + rOut - 1.4; r += ROW_STEP, i++) {
    const y = i * RISE
    // desks march out from both sides of a clear center aisle (the steps)
    const angles = []
    for (let sArc = AISLE_HALF + 0.6; sArc / r <= 1.35; sArc += 1.25) angles.push(sArc / r, -sArc / r)
    for (const th of angles) {
      const ux = [Math.cos(th) * back[0] + Math.sin(th) * t[0], Math.cos(th) * back[1] + Math.sin(th) * t[1]]
      const p = [F[0] + ux[0] * r, F[1] + ux[1] * r]
      if (((p[0] - c[0]) / (rx - 1.1)) ** 2 + ((p[1] - c[1]) / (rz - 1.1)) ** 2 > 1) continue
      if (doorPts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2.2)) continue
      const tg = [-Math.sin(th) * back[0] + Math.cos(th) * t[0], -Math.sin(th) * back[1] + Math.cos(th) * t[1]]
      W([p[0] - tg[0] * 0.6, p[1] - tg[1] * 0.6], [p[0] + tg[0] * 0.6, p[1] + tg[1] * 0.6], 'desk', { h: 0.95, t: 0.5, y0: y })
      for (const s of [-0.3, 0.3]) {
        CHAIRS.push({ x: p[0] + ux[0] * 0.65 + tg[0] * s, z: p[1] + ux[1] * 0.65 + tg[1] * s, y, rot: Math.atan2(ux[0], ux[1]) })
      }
    }
  }
  d.tiers = { F, back, rxi: rx - DRUM_WALL, rzi: rz - DRUM_WALL, n: i }
}

// library
{
  const { x0, x1, z0, z1, door } = LIBRARY
  W([x1, z0], [x1, -door], 'libGlass', { t: 0.1 })
  W([x1, door], [x1, z1], 'libGlass', { t: 0.1 })
  W([x0, z0], [x1, z0], 'white')
  W([x0, z1], [x1, z1], 'white')
  W([x0 + 0.4, z0 + 1], [x0 + 0.4, z1 - 1], 'shelf', { h: 2.6, t: 0.5 })
  W([x0 + 3.5, -10], [x0 + 3.5, -3], 'shelf', { h: 1.8, t: 0.5 })
  W([x0 + 3.5, 3], [x0 + 3.5, 10], 'shelf', { h: 1.8, t: 0.5 })
  const tx = x1 - 4
  for (const z of [-8, -4, 4, 8]) W([tx, z - 1.1], [tx, z + 1.1], 'desk', { h: 0.76, t: 0.9 })
  W([x1 - 1.3, -7.5], [x1 - 1.3, -4.5], 'leather', { h: 0.45, t: 0.9 })
  W([x1 - 1.3, 4.5], [x1 - 1.3, 7.5], 'leather', { h: 0.45, t: 0.9 })
  for (const z of [-8, -4, 4, 8]) for (const s of [-1, 1]) CHAIRS.push({ x: tx + s * 0.75, z, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2 })
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
const M_X0 = -35
const M_X1 = 22.6
for (const side of [1, -1]) {
  const zf = 42.3 * side
  const zb = zMax * side
  W([M_X0, zf], [M_X1, zf], 'meetGlass', { t: 0.08 })
  const n = 9
  const w = (M_X1 - M_X0) / n
  for (let i = 0; i <= n; i++) W([M_X0 + i * w, zf], [M_X0 + i * w, zb], 'white', { t: 0.15 })
  for (let i = 0; i < n; i++) {
    const cx = M_X0 + (i + 0.5) * w
    const cz = (zf + zb) / 2
    MEETING.push({ x: cx, z: cz, w, num: side > 0 ? 2461 + i * 2 : 2246 + i * 3 })
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
export const BEIN_TABLES = [[7, -4.5], [7, 4.5], [4.2, -7], [4.2, 7]].map(([dx, z]) => [EAST + dx, z])
for (const p of BEIN_TABLES) {
  W(p, [p[0] + 0.01, p[1]], 'none', { t: 1.5 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    CHAIRS.push({ x: p[0] + Math.sin(a) * 1.05, z: p[1] + Math.cos(a) * 1.05, rot: a + Math.PI })
  }
}

// cloister furniture: cognac benches, orange sofas, plants
const CW = CLOISTER_W
export const PLANTS = [[-CW, -10.5], [8.8, -21], [-7, 21], [CW, 8], [-CW, 9.5]]
W([-CW, -3], [-CW, -0.6], 'leather', { h: 0.45, t: 0.7 })
W([CW, 2.5], [CW, 5], 'leather', { h: 0.45, t: 0.7 })
W([-2, -21], [0.6, -21], 'leather', { h: 0.45, t: 0.7 })
W([3.5, 21], [6, 21], 'leather', { h: 0.45, t: 0.7 })
W([6.2, -20.8], [8.2, -20.8], 'orange', { h: 0.55, t: 0.9 })
W([-6.2, 20.8], [-4.2, 20.8], 'orange', { h: 0.55, t: 0.9 })
W([-CW, 6], [-CW, 8], 'orange', { h: 0.55, t: 0.9 })
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
  if (x > EAST) return Math.hypot(x - EAST, z) < BEIN.r ? 'Beinecke Terrace Room · 2300' : 'Beinecke Terrace (outside)'
  if (z > 38) return 'South back hallway · meeting rooms 2461+'
  if (z < -38) return 'North back hallway · meeting rooms 2246+'
  if (x < -20) return 'West cloister · Ross Library side'
  if (x > 20) return 'East cloister · Beinecke side'
  return z < 0 ? 'North cloister' : 'South cloister'
}

// floor height under a point (risers inside classrooms, 0 elsewhere)
export function floorAt(x, z) {
  for (const d of DRUMS) {
    const T = d.tiers
    if (((x - d.c[0]) / T.rxi) ** 2 + ((z - d.c[1]) / T.rzi) ** 2 > 1) continue
    const vx = x - T.F[0]
    const vz = z - T.F[1]
    const dist = Math.hypot(vx, vz)
    if (dist < 1e-6 || (vx * T.back[0] + vz * T.back[1]) / dist < Math.cos(TIER_SPAN)) return 0
    const band = Math.floor((dist - bandStart(0)) / ROW_STEP)
    return band < 1 ? 0 : Math.min(band, T.n - 1) * RISE
  }
  return 0
}

// outline of riser i (i >= 1): everything at least bandStart(i) from the focus, inside the room
export function tierOutline(d, i, n = 28) {
  const { F, back, rxi, rzi } = d.tiers
  const t = [-back[1], back[0]]
  const a = bandStart(i)
  const ox = (F[0] - d.c[0]) / rxi
  const oz = (F[1] - d.c[1]) / rzi
  const inner = []
  const outer = []
  for (let k = 0; k <= n; k++) {
    const th = -TIER_SPAN + (2 * TIER_SPAN * k) / n
    const u = [Math.cos(th) * back[0] + Math.sin(th) * t[0], Math.cos(th) * back[1] + Math.sin(th) * t[1]]
    const dx = u[0] / rxi
    const dz = u[1] / rzi
    const qa = dx * dx + dz * dz
    const qb = 2 * (ox * dx + oz * dz)
    const qc = ox * ox + oz * oz - 1
    const e = Math.max(a, (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa))
    inner.push([F[0] + u[0] * a, F[1] + u[1] * a])
    outer.push([F[0] + u[0] * e, F[1] + u[1] * e])
  }
  return [...inner, ...outer.reverse()]
}
