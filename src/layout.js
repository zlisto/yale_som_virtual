// Evans Hall, floor 2. Units are meters.
// World axes: +x = east, -z = north (three.js camera looks -z by default = north).
// Read from reference/floorplan (plan is drawn with west at the top).

// Proportions follow the Foster level 2 plan (yale_som_virtual-refs/plans, 10 m = 95 px):
// the concourse is double height (level 2 to level 4 is about 7.2 m)
export const H = 7.2 // ceiling height
export const ROOF = 14.8 // roof canopy above the level 2 floor (ground to roof about 19.5 m)
export const EYE = 1.65
export const R_PLAYER = 0.35
// ---------- the enlarged floor (round 4)
// Round 3 opened a 4.1 m front walkway, 1 m aisles and 2.2 m gaps between drums, and dropped the
// rows that no longer fit. Lan wants the old rows back and a bigger building instead, so every drum
// grows (keeping its rx : rz ratio) until the 267b2fa rows fit with those walkways, and the plan
// grows round them. The cloister bands keep their width:
//   x: the courtyard and both drum runs stretch by X_K; the east and west strips shift out by DX;
//      the west corner block (library, stairs A and B, the corner drums) also widens by DXW
//   z: the courtyard and cloisters stay; each drum row's band stretches to the new drum depth, and
//      everything behind it (back hallway, meeting rooms) shifts out by the growth
// Coordinates written in the round-3 plan go through planX / planZ / planPt to land on this floor.
const lerpKnots = (v, a, b) => {
  if (v <= a[0]) return b[0] + (v - a[0])
  for (let i = 1; i < a.length; i++) if (v <= a[i]) return b[i - 1] + ((v - a[i - 1]) * (b[i] - b[i - 1])) / (a[i] - a[i - 1])
  return b[b.length - 1] + (v - a[a.length - 1])
}
const DX = 8 // the courtyard's half width grows 21.75 -> 29.75 m, so both three-drum runs fit
const DXW = 3.4 // the west corner block widens so the bigger corner drums keep 0.45 m off the west wall
// south row band: drum fronts stay at z 25.4, backs move 44.0 -> 48.8 (rz 9.3 -> 11.7)
// north row band: drum fronts stay at z -24.9, backs move -37.3 -> -41.5 (rz 6.2 -> 8.3)
const X_OLD = [-40.75, -27, -21.75, 21.75, 28.75]
const X_NEW = [-40.75 - DX - DXW, -27 - DX, -21.75 - DX, 21.75 + DX, 28.75 + DX]
const Z_OLD = [-43, -37.3, -24.9, 25.4, 44.0, 51.5]
const Z_NEW = [-47.2, -41.5, -24.9, 25.4, 48.8, 56.3]
export const planX = (x) => lerpKnots(x, X_OLD, X_NEW)
export const planZ = (z) => lerpKnots(z, Z_OLD, Z_NEW)
export const planPt = (p) => [planX(p[0]), planZ(p[1])]

export const SPAWN = { x: planX(-24.4), z: 22 } // SW corner by Class of 1980, facing north (photo 1)

// corridors are 25% wider than the first pass (gaps 2.5 m, cloister ~7 m, back halls ~4.4 m)
export const BOUNDS = { xMin: planX(-40.75), xMax: planX(28.75), zMin: planZ(-43), zMax: planZ(51.5) }
export const EAST = BOUNDS.xMax
export const COURT_HX = planX(21.75) // the courtyard glass's half width (x)
// the roof canopy's sky opening (a rounded rectangle, World.jsx CourtyardFrame): it keeps its 8 m
// overhang past the east and west glass, so it widens with the courtyard (27 x 25 m -> 43 x 25 m)
export const SKY = { hx: 13.5 + DX, hz: 12.5, r: 2.5 }

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
  const hx = COURT_HX // 59.5 m x 40 m between the glass walls (was 43.5 x 40)
  const hz = 20
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = hx * Math.sign(c) * Math.pow(Math.abs(c), 1 / 3)
    let z = hz * Math.sign(s) * Math.pow(Math.abs(s), 1 / 3)
    const w = Math.pow(Math.abs(s), 6)
    // one glass bulge per drum: the wiggle's period grows with the drum spacing
    z -= Math.sign(s) * w * 0.9 * (0.5 + 0.5 * Math.cos((TAU * x) / (14.5 * (COURT_HX / 21.75))))

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
// The seating focus sits FOCUS m behind the front wall. At 1.5 the horseshoe's first row came
// within 1.64 m of the front wall and blocked the walk between the two doors; Lan asked for 2-3
// times the room (round 3), so the whole bowl moves back 2.46 m to a 4.1 m clear front (2.5x),
// row spacing unchanged, and the rows that no longer fit drop out.
const FOCUS = 3.96
// clear walkway kept between the furniture (desk ends, chair backs) and the drum's inner wall,
// along both side aisles and behind the back row
const WALKWAY = 1.0
const ROW_STEP = 1.15
const AISLE_HALF = 0.8
const TIER_SPAN = 1.42 // radians each side of the center aisle covered by risers
const bandStart = (i) => ROW0 - 0.35 + i * ROW_STEP
const SLIDE_ORDER = ['title', 'chart', 'content']
// Walk-through gaps between neighbouring drums (Lan, round 3): at least 2.2 m clear between the
// colliders of two drums, door fins included, so a player walks from the cloister to the back
// corridor between any two classrooms. The wood door fins stand out 0.3 m (was 0.7), since at 0.7
// they alone closed half of each gap.
// Round 4: each drum is the plan's oval (267b2fa sizes) scaled up, rx : rz kept, by the least factor
// (rounded up to 5 cm) at which the 267b2fa rows fit behind the 4.1 m front walkway with the 1 m
// aisles: the corner ovals by 1.21 and 1.24, the south trio by 1.26, the north trio by 1.34. Each
// drum's front edge stays where it was (south fronts z 25.4, north fronts z -24.9, corner fronts on
// the west cloister), and it grows away from the courtyard. The trios' centres follow planX, which
// leaves about 2.5 m (north) and 4 m (south) between neighbours.
const FIN = 0.3
const RX_S = 8.2 // 6.5 x 9.3 at 267b2fa
const RZ_S = 11.7
const RX_N = 9.15 // 6.85 x 6.2 at 267b2fa
const RZ_N = 8.3
const ZS = 25.4 + RZ_S // south trio centres
const ZN = -24.9 - RZ_N // north trio centres
export const DRUMS = [
  // south row: a 19.4 x 24.2 m oval in the southwest corner (was 16 x 20), then three 16.4 x 23.4 m
  // ovals (was 13 x 18.6, long axis N-S)
  { id: '2400', course: 'mgt409', name: 'MBA Class of 1980 Classroom', c: [planX(-24.3) - 9.7, 24.7 + 12.1], rx: 9.7, rz: 12.1, front: [1, 0] },
  { id: '2410', course: 'mgt404', name: 'Bewkes Classroom', c: [planX(-15), ZS], rx: RX_S, rz: RZ_S, front: [0, -1] },
  { id: '2420', course: 'mgt403', name: 'Betts Classroom', c: [0, ZS], rx: RX_S, rz: RZ_S, front: [0, -1] },
  { id: '2430', course: 'mgt887', name: 'Baker Classroom', c: [planX(15), ZS], rx: RX_S, rz: RZ_S, front: [0, -1] },
  // north row: an 18.1 x 19.5 m oval in the northwest corner (was 14.6 x 15.8), then three round
  // 18.3 x 16.6 m drums (was 13.7 x 12.4)
  { id: '2200', course: 'mgt402', name: 'Blumetti Classroom', c: [planX(-25.6) - 9.05, -24.7 - 9.75], rx: 9.05, rz: 9.75, front: [1, 0] },
  { id: '2210', course: 'mgt538', name: 'Allison Foundation Classroom', c: [planX(-15.3), ZN], rx: RX_N, rz: RZ_N, front: [0, 1] },
  { id: '2220', course: 'mgt800', name: 'Jones Classroom', c: [0, ZN], rx: RX_N, rz: RZ_N, front: [0, 1] },
  { id: '2230', course: 'mgt541', name: 'Nooyi Classroom', c: [planX(15.3), ZN], rx: RX_N, rz: RZ_N, front: [0, 1] },
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
// The terrace rail stands at 21 m (was 17) so the outdoor terrace is 8.5 m deep: room for the orientation
// party (PARTY below) between the cafe tables at its two ends (round 4)
export const BEIN = { c: [EAST, 0], r: 12.5, terrace: 21, doorGap: 0.11, muralR: 3.6, muralHalf: 0.85 }
BEIN.col = ellPt(BEIN.c, BEIN.r + 2.6, BEIN.r + 2.6, 0.6) // terrace column

// ---------- stairs (painting above each opening)
// (centres written in the round-3 plan, mapped onto the enlarged floor)
export const STAIRS = [
  { id: 'A', c: [-32.5, 19], w: 5, d: 3, face: [1, 0], seed: 1 },
  { id: 'B', c: [-32.5, -19], w: 5, d: 3, face: [1, 0], seed: 2 },
  { id: 'G', c: [24.6, 25], w: 3, d: 4, face: [0, -1], photo: true },
  { id: 'D', c: [24.6, -25], w: 3, d: 4, face: [0, 1], seed: 3 },
  { id: 'C', c: [24.6, -41], w: 3, d: 4, face: [0, 1], seed: 4 },
  { id: 'H', c: [24.6, 45], w: 3, d: 4, face: [0, -1], seed: 5 },
  { id: 'I', c: [-38, 48.5], w: 3, d: 4, face: [0, -1], seed: 6 },
].map((s) => ({ ...s, c: planPt(s.c) }))

// ---------- library (west side): its glass stays on the west cloister, its back wall moves west
// with the wider corner block (12 m deep -> 14.8 m)
export const LIBRARY = { x0: planX(-38.4), x1: planX(-26.4), z0: -13.3, z1: 13.3, door: 1.2 }

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
W([EAST, zMin], [EAST, -BEIN.r], 'white')
W([EAST, BEIN.r], [EAST, zMax], 'white')
W([EAST, -BEIN.r], [EAST, -1.3], 'beinGlass', { t: 0.1 })
W([EAST, 1.3], [EAST, BEIN.r], 'beinGlass', { t: 0.1 })

// courtyard glass (rendered as a smooth ribbon, collider here)
P([...COURTYARD, COURTYARD[0]], 'none', { t: 0.15 })

// drums: outer + inner walls with two door gaps, wood-slat door alcove fins
export const CHAIRS = []
export const SCREENS = []
export const BOARDS = []
export const LECTERNS = []
// Desk tops as walkable surfaces (Player's floorAt reads this; render: World.jsx DeskTops draws the
// same runs). One entry per classroom:
//   { room, F: [x, z], back: [x, z], rings: [{ r0, r1, top, arcs: [[a0, a1], ...] }] }
// Each ring is one desk row: a horseshoe band round the seating focus F, r0 to r1 metres from F,
// whose top is `top` metres above floor zero. A point q is on the desk when r0 <= |q - F| <= r1
// and its angle a = atan2(v . t, v . back), v = q - F, t = [-back[1], back[0]], falls inside one
// of the arcs (radians, a0 < a1; negative angles are the other side of the centre aisle).
// deskTopAt(x, z) below does that test.
export const DESK_SURFACES = []
const DESK_DEPTH = 0.254 // half the desk's depth, front lip to back panel (DeskTops' profile)
const DESK_TOP = 0.962 // the leather writing strip's top above the riser
// Chairs per row, front to back, as at 267b2fa (Lan, round 4: "kept as before really like more rows
// and width"). Each row keeps the desks nearest the centre aisle, the same desks 267b2fa placed; the
// drums are sized so every one of them fits (see DRUMS).
const SEAT_ROWS = {
  2400: [8, 12, 16, 24, 28, 32, 36],
  2410: [8, 12, 16, 16, 16, 16, 12, 12, 8],
  2420: [8, 12, 16, 16, 16, 16, 12, 12, 8],
  2430: [8, 12, 16, 16, 16, 16, 12, 12, 8],
  2200: [8, 12, 16, 20, 24, 20],
  2210: [8, 12, 16, 20, 16],
  2220: [8, 12, 16, 20, 16],
  2230: [8, 12, 16, 20, 16],
}
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
      W(pin, [p[0] + n[0] * FIN, p[1] + n[1] * FIN], 'slats', { t: 0.14 })
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
  d.front = { fc, back, t, half, rot }
  const offs = half > 6 ? [-2.6, 0, 2.6] : half > 4.2 ? [-2.3, 0, 2.3] : [-1.2, 1.2]
  offs.forEach((o, k) =>
    SCREENS.push({ x: fc[0] + back[0] * 0.15 + t[0] * o, z: fc[1] + back[1] * 0.15 + t[1] * o, rot, course: d.course, kind: SLIDE_ORDER[k] }),
  )
  BOARDS.push({ x: fc[0] + back[0] * 0.15, z: fc[1] + back[1] * 0.15, rot, w: Math.min(2 * half - 1.2, 7) })
  const lp = [fc[0] + back[0] * 0.8 + t[0] * half * 0.35, fc[1] + back[1] * 0.8 + t[1] * half * 0.35]
  LECTERNS.push({ x: lp[0], z: lp[1], rot })
  W([lp[0] - t[0] * 0.35, lp[1] - t[1] * 0.35], [lp[0] + t[0] * 0.35, lp[1] + t[1] * 0.35], 'none', { t: 0.5 })

  // stadium seating: row i sits on a riser i * RISE above the front floor
  const F = [fc[0] + back[0] * FOCUS, fc[1] + back[1] * FOCUS]
  const doorPts = doors.map((a) => ellPt(c, rx, rz, a))
  // furniture must stay inside this ellipse: the inner wall pulled in by the walkway
  const fx = rx - DRUM_WALL - WALKWAY
  const fz = rz - DRUM_WALL - WALKWAY
  const inside = (q) => ((q[0] - c[0]) / fx) ** 2 + ((q[1] - c[1]) / fz) ** 2 <= 1
  let i = 0
  const rings = []
  const plan = SEAT_ROWS[d.id]
  for (let r = ROW0; i < plan.length && r < rIn * FRONT_DEPTH + rOut - FOCUS; r += ROW_STEP) {
    const y = i * RISE
    let placed = 0
    const rowTh = []
    // desks march out from both sides of a clear center aisle (the steps)
    const angles = []
    for (let sArc = AISLE_HALF + 0.6; sArc / r <= 1.35; sArc += 1.25) angles.push(sArc / r, -sArc / r)
    const perSide = plan[i] / 4 // two chairs a desk, two sides
    const taken = { 1: 0, '-1': 0 }
    for (const th of angles) {
      if (taken[Math.sign(th)] >= perSide) continue
      const ux = [Math.cos(th) * back[0] + Math.sin(th) * t[0], Math.cos(th) * back[1] + Math.sin(th) * t[1]]
      const p = [F[0] + ux[0] * r, F[1] + ux[1] * r]
      const tg = [-Math.sin(th) * back[0] + Math.cos(th) * t[0], -Math.sin(th) * back[1] + Math.cos(th) * t[1]]
      // the desk's four corners and the two chair backs behind it
      const foot = [[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.25], [0.6, 0.25], [-0.55, 0.95], [0.55, 0.95]]
      if (!foot.every(([a, b]) => inside([p[0] + tg[0] * a + ux[0] * b, p[1] + tg[1] * a + ux[1] * b]))) continue
      if (doorPts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2.2)) continue
      taken[Math.sign(th)]++
      W([p[0] - tg[0] * 0.6, p[1] - tg[1] * 0.6], [p[0] + tg[0] * 0.6, p[1] + tg[1] * 0.6], 'desk', { h: 0.95, t: 0.5, y0: y })

      for (const s of [-0.3, 0.3]) {
        CHAIRS.push({ x: p[0] + ux[0] * 0.65 + tg[0] * s, z: p[1] + ux[1] * 0.65 + tg[1] * s, y, rot: Math.atan2(ux[0], ux[1]), room: d.id })
      }
      placed++
      rowTh.push(th)
    }
    if (!placed) break // the bowl has reached the back walkway
    // contiguous desks on each side of the aisle make one run; a skipped desk breaks it
    const arcs = []
    for (const side of [1, -1]) {
      const ths = rowTh.filter((th) => th * side > 0).map(Math.abs).sort((a, b) => a - b)
      let run = null
      for (const th of ths) {
        if (run && (th - run[1]) * r > 1.7) {
          arcs.push(run)
          run = null
        }
        run = run ? [run[0], th] : [th, th]
      }
      if (run) arcs.push(run)
      for (let k = arcs.length - 1; k >= 0 && !arcs[k].side; k--) arcs[k].side = side
    }
    const half = 0.6 / r // half a desk's length, as an angle
    rings.push({
      r0: r - DESK_DEPTH,
      r1: r + DESK_DEPTH,
      top: y + DESK_TOP,
      arcs: arcs.map((a) => (a.side > 0 ? [a[0] - half, a[1] + half] : [-a[1] - half, -a[0] + half])),
    })
    i++
  }
  DESK_SURFACES.push({ room: d.id, F, back, rings })
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

// recycling pair against the west face of stair G's core (render/Fixtures.jsx)
export const RECYCLE = [{ p: [STAIRS[2].c[0] - 1.87, 26.1], r: -Math.PI / 2 }]
for (const { p } of RECYCLE) W([p[0], p[1] - 0.55], [p[0], p[1] + 0.55], 'none', { t: 0.55 })

// small glass meeting rooms in strips behind each drum row
export const MEETING = []
const M_X1 = planX(22.6)
export const MEET_DOOR = 1.1 // glass door width
// north bar (plan: z -43 to -39.3, east of the corner oval); south strip in front of the faculty wing.
// The enlarged floor makes both strips longer, so each holds 12 rooms (was 9) of about the old width.
for (const [side, zf, zb, M_X0] of [[1, planZ(46), zMax, planX(-35)], [-1, planZ(-39.3), zMin, planX(-22.7)]]) {
  const n = 12
  const w = (M_X1 - M_X0) / n
  for (let i = 0; i <= n; i++) W([M_X0 + i * w, zf], [M_X0 + i * w, zb], 'white', { t: 0.15 })
  for (let i = 0; i < n; i++) {
    const cx = M_X0 + (i + 0.5) * w
    const cz = (zf + zb) / 2
    // glass table runs along x toward a big monitor on the east divider wall
    const seats = []
    for (const dx of [-0.8, 0, 0.8]) for (const dz of [-0.95, 0.95]) seats.push({ x: cx + dx, z: cz + dz, rot: dz > 0 ? 0 : Math.PI })
    seats.push({ x: cx - 1.75, z: cz, rot: -Math.PI / 2 })
    for (const c of seats) CHAIRS.push(c)
    W([cx - 1.3, cz], [cx + 1.3, cz], 'none', { t: 1.2 }) // glass table
    // glass front with a glass door near the west end (door swings into the room)
    const d0 = cx - w / 2 + 0.3
    const d1 = d0 + MEET_DOOR
    W([cx - w / 2, zf], [d0, zf], 'meetGlass', { t: 0.08 })
    W([d1, zf], [cx + w / 2, zf], 'meetGlass', { t: 0.08 })
    W([d0, zf], [d1, zf], 'meetGlass', { t: 0.08, y0: 2.35, h: H - 2.35, collide: false }) // glass above the door
    MEETING.push({
      x: cx,
      z: cz,
      w,
      d: Math.abs(zb - zf),
      seats,
      num: side > 0 ? 2461 + i * 2 : 2246 + i * 3,
      monitor: { x: cx + w / 2 - 0.1, z: cz, rot: -Math.PI / 2 },
      door: { hinge: [d0, zf], swing: side > 0 ? -1 : 1 },
    })
  }
}

// Beinecke: curved glass, terrace railing, mural wall, tables
{
  const { c, r, terrace, doorGap, muralR, muralHalf } = BEIN
  P(arc(c, r, r, 0, Math.PI / 2 - doorGap, 30), 'none', { t: 0.12 })
  P(arc(c, r, r, Math.PI / 2 + doorGap, Math.PI, 30), 'none', { t: 0.12 })
  P(arc(c, terrace, terrace, 0, Math.PI, 60), 'none', { t: 0.1 })
  P(arc(c, muralR, muralR, Math.PI / 2 - muralHalf, Math.PI / 2 + muralHalf, 20), 'none', { t: 0.2 })
  dot(BEIN.col) // terrace column
}
// outdoor Beinecke terrace (render/Town.jsx): cafe tables at the two ends of the terrace, two on the
// 14.6 m ring and two on the 18.4 m ring at each end. Each table with its three chairs reaches about
// 0.5 m from its centre, so the inner ring keeps 1.6 m off the glass (r 12.5), and the column (angle
// 0.6, r 15.1) stays 2.3 m from the nearest table. Concrete planters stand against the rail.
// Each entry: a = the angle on BEIN.c (ellPt convention), rr = the ring radius.
export const TERRACE_TABLES = [[0.2, 14.6], [0.45, 14.6], [0.2, 18.4], [0.42, 18.4], [Math.PI - 0.2, 14.6], [Math.PI - 0.45, 14.6], [Math.PI - 0.2, 18.4], [Math.PI - 0.42, 18.4]].map(
  ([a, rr]) => ({ a, rr, p: ellPt(BEIN.c, rr, rr, a) }),
)
export const TERRACE_PLANTERS = [0.05, 0.8, Math.PI - 0.8, Math.PI - 0.05].map((a) => ({ a, p: ellPt(BEIN.c, BEIN.terrace - 0.55, BEIN.terrace - 0.55, a) }))
for (const { p } of TERRACE_TABLES) W(p, [p[0] + 0.01, p[1]], 'none', { t: 1.9 })
for (const { a, p } of TERRACE_PLANTERS) {
  const t = [Math.cos(a) * 0.8, -Math.sin(a) * 0.8]
  W([p[0] - t[0], p[1] - t[1]], [p[0] + t[0], p[1] + t[1]], 'none', { t: 0.6 })
}
// The orientation party on the terrace (render: life/TerraceParty.jsx). Positions are offsets from
// BEIN.c: dx east (out from the building), z as the world. The dance floor sits in front of the
// Terrace Room door (dx 12.5) with a 2.1 m walk between, the DJ and the banner behind it against the
// rail, the bar to the north-east, high tables round the south and north sides.
const PC = (dx, z) => [EAST + dx, z]
const polar = (a, rr) => ellPt(BEIN.c, rr, rr, a)
export const PARTY = {
  dance: { c: PC(16.9, 0), half: 2.3 }, // 4.6 m square of lighter pavers
  dj: { c: PC(19.75, 0), w: 1.6, d: 0.7 }, // the table faces west, the DJ stands behind it at dx 20.4
  speakers: [PC(19.85, -1.45), PC(19.85, 1.45)],
  banner: { poles: [PC(20.45, -2.6), PC(20.45, 2.6)], y: 2.75, h: 0.9 },
  // the bar along the 18.2 m ring at angle 2.15; the bar-back shelf 1.8 m behind it, stools in front
  bar: { a: 2.15, rr: 18.2, len: 3.0, d: 0.6, backRr: 20.0 },
  tables: [[0.85, 14.8], [1.0, 18.6], [1.22, 15.6], [0.62, 18.9], [2.0, 15.0], [1.85, 18.8], [2.45, 15.0]].map(([a, rr]) => polar(a, rr)),
  lightPoles: [PC(14.2, -2.7), PC(14.2, 2.7)],
  balloons: [PC(20.45, -2.6), PC(20.45, 2.6), polar(2.07, 18.2), polar(2.23, 18.2), polar(1.0, 20.4)],
  plants: [polar(1.95, 20.3), polar(2.35, 20.3), PC(19.9, -3.4), PC(19.9, 3.4)],
}
{
  const { dj, speakers, banner, bar, tables, lightPoles, plants } = PARTY
  W([dj.c[0], dj.c[1] - dj.w / 2], [dj.c[0], dj.c[1] + dj.w / 2], 'none', { t: dj.d })
  for (const p of [...speakers, ...banner.poles, ...lightPoles, ...plants]) dot(p)
  for (const p of tables) W(p, [p[0] + 0.01, p[1]], 'none', { t: 0.75 })
  const tan = (a, rr, half) => [polar(a - half / rr, rr), polar(a + half / rr, rr)]
  W(...tan(bar.a, bar.rr, bar.len / 2), 'none', { t: bar.d })
  W(...tan(bar.a, bar.backRr, 1.3), 'none', { t: 0.45 })
}
// Terrace Room tables (round 4): every table with its six chairs (about 1.35 m round its centre)
// stays at least 1.1 m inside the glass (r 12.5); the two that stood at r 12.4 sat half outside.
// Four on the 9.6 m ring, two on the 6.4 m ring beside the mural, one 8.8 m in front of the door.
export const BEIN_TABLES = [[1.07, 9.6], [Math.PI - 1.07, 9.6], [0.42, 9.6], [Math.PI - 0.42, 9.6], [0.72, 6.4], [Math.PI - 0.72, 6.4], [Math.PI / 2, 8.8]].map(([a, rr]) => ellPt(BEIN.c, rr, rr, a))
for (const p of BEIN_TABLES) {
  W(p, [p[0] + 0.01, p[1]], 'none', { t: 1.5 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    CHAIRS.push({ x: p[0] + Math.sin(a) * 1.05, z: p[1] + Math.cos(a) * 1.05, rot: a + Math.PI })
  }
}

// cloister furniture: cognac benches, orange sofas, plants (round-3 plan positions, mapped)
// scanned potted plants (render/Scenery.jsx), kept 1.2 m off each walkway centerline and 0.5 m off
// Handsome Dan's loop: the west pair stands against the library glass, the east one by a column
export const PLANTS = [[-25.95, -10.5], [8.8, -20.55], [-7, 20.55], [27.2, 7.75], [-25.95, 9.5]].map(planPt)
// curved cognac "banana" banquettes (photos 03-05): drawn in World.jsx, colliders here
export const BENCHES = [
  { c: [-24.7, -2], len: 4.2, rot: 0 },
  { c: [-24.7, 6.5], len: 3.6, rot: Math.PI },
  { c: [24.8, 3.5], len: 4.2, rot: Math.PI },
  { c: [-1.5, -21.8], len: 4.2, rot: Math.PI / 2 },
  { c: [7.5, -21.8], len: 3.6, rot: -Math.PI / 2 },
  { c: [4.5, 22.2], len: 4.2, rot: -Math.PI / 2 },
  { c: [-5.5, 22.2], len: 3.6, rot: Math.PI / 2 },
].map((b) => ({ ...b, c: planPt(b.c) }))
for (const b of BENCHES) {
  const d = [Math.cos(b.rot), -Math.sin(b.rot)]
  W([b.c[0] - (d[1] * b.len) / 2, b.c[1] + (d[0] * b.len) / 2], [b.c[0] + (d[1] * b.len) / 2, b.c[1] - (d[0] * b.len) / 2], 'none', { h: 0.45, t: 0.9 })
}
for (const p of PLANTS) dot(p)

// slim white round columns on the 7.6 m grid: a ring just inside the courtyard glass (rising
// from the lawn to the roof) and a row along the east and west concourse. The wider courtyard
// takes eight columns along each long side (was six), still about 7.8 m apart.
let COLS = []
const COL_X = COURT_HX - 2.45
for (const v of [-19.3, -11.5, -3.8, 3.9, 11.6, 19.3]) {
  COLS.push({ x: -COL_X, z: v, y0: -5, court: true }, { x: COL_X, z: v, y0: -5, court: true })
  if (Math.abs(v) < 15) COLS.push({ x: planX(26.6), z: v, y0: 0 })
}
for (let k = 1; k < 7; k++) {
  const x = -COL_X + (2 * COL_X * k) / 7
  COLS.push({ x, z: -18.4, y0: -5, court: true }, { x, z: 18.4, y0: -5, court: true })
}
export const COLUMNS = COLS.filter((c) => !c.court || inPoly(c.x, c.z, COURTYARD))
for (const c of COLUMNS) if (!c.court) dot([c.x, c.z])

// lived-in props (drawn in render/Props.jsx): white-topped high counters against the drum
// fronts, a reception desk inside the library door, signage screens on the west stair cores
export const COUNTERS = [[-15.3, -24.1], [15.3, -24.1], [-15, 24.6], [15, 24.6]].map(([x, z]) => ({ x: planX(x), z, w: 2.4, d: 0.6 }))
for (const k of COUNTERS) W([k.x - k.w / 2, k.z], [k.x + k.w / 2, k.z], 'none', { t: k.d })
export const RECEPTION = { x: LIBRARY.x1 - 1.6, z: -2.4, w: 2.8, d: 0.8 }
W([RECEPTION.x, RECEPTION.z - RECEPTION.w / 2], [RECEPTION.x, RECEPTION.z + RECEPTION.w / 2], 'none', { t: RECEPTION.d })
export const SIGNAGE = STAIRS.filter((s) => s.id === 'A' || s.id === 'B').map((s) => ({ x: s.c[0], z: s.c[1] - Math.sign(s.c[1]) * (s.d / 2 + 0.03), rot: s.c[1] > 0 ? Math.PI : 0 }))

// Beinecke: a full-height dark curtain on a curve just behind the mural (render/Props.jsx)
export const BEIN_CURTAIN = { r: BEIN.muralR + 0.3, half: BEIN.muralHalf + 0.12 }
P(arc(BEIN.c, BEIN_CURTAIN.r, BEIN_CURTAIN.r, Math.PI / 2 - BEIN_CURTAIN.half, Math.PI / 2 + BEIN_CURTAIN.half, 20), 'none', { t: 0.15 })

// ---------- scenery (render/Scenery.jsx draws scanned CC0 models; colliders here)
// more plants in front of the drums, between the counters and the doors; the stair B one stands
// against the south face of that core (z -20.5), west of the bin
export const PLANTS_EXTRA = [[-18.6, -25.3], [3.4, -25.3], [11.9, -25.3], [-18.5, 26.2], [3.5, 26.2], [11.5, 26.2], [-33.4, -21.0], [27.9, 22.4]].map(planPt)
for (const p of PLANTS_EXTRA) dot(p)
// waste bins at the four cloister corners, out of both walkways. The east pair stands against the
// east wall; the west pair stood in open floor 3 m off the cloister (one beside the spawn point)
// and now stands against the outer face of the stair A and B cores, facing the drums.
export const BINS = [[-31.0, 20.85], [27.9, -21.5], [-31.0, -20.85], [27.9, 21.4]].map(planPt)
for (const p of BINS) W(p, [p[0] + 0.01, p[1]], 'none', { t: 0.5 })
// library lounge: four leather lounge chairs round a low table, one group each side of the door
// (two chairs north of the table, two south), clear of the desk chairs and the reception desk
export const LOUNGES = [{ x: planX(-28.0), z: -6.4 }, { x: planX(-28.0), z: 6.4 }]
for (const l of LOUNGES) W([l.x, l.z - 0.9], [l.x, l.z + 0.9], 'none', { t: 1.9 })
// The library shelves, study desks and leather sofas, and the box chairs in the library, the
// Beinecke room and the meeting rooms, are drawn as scanned models now. Their wall entries keep their colliders but stop
// drawing (mat 'none'), and their box chairs leave CHAIRS (no other module reads those seats).
{
  const { x0, x1, z0, z1 } = LIBRARY
  const inLib = (x, z) => x > x0 - 0.5 && x < x1 && z > z0 && z < z1
  for (const w of WALLS) if (['shelf', 'desk', 'leather'].includes(w.mat) && inLib(w.a[0], w.a[1])) w.mat = 'none'
  for (let i = CHAIRS.length - 1; i >= 0; i--) {
    const c = CHAIRS[i]
    if (!c.room && (inLib(c.x, c.z) || c.x > EAST)) CHAIRS.splice(i, 1)
  }
  // meeting-room box chairs give way to scanned office chairs too (render/Scenery.jsx reads m.seats)
  const inMeet = (x, z) => MEETING.some((m) => Math.abs(x - m.x) < m.w / 2 && Math.abs(z - m.z) < m.d / 2)
  for (let i = CHAIRS.length - 1; i >= 0; i--) if (!CHAIRS[i].room && inMeet(CHAIRS[i].x, CHAIRS[i].z)) CHAIRS.splice(i, 1)
}

// stepping-stone pavers on the lawn (render/Scenery.jsx LawnPavers; World.jsx draws the same ring for
// the bake): 14 on a 12 x 14 m ellipse at seeded angles (the rng of textures.js, seed 4). Round 4
// moves eight of them along the ring so none lies within 1 m of a spell-school student or professor
// (life/SpellSchool.jsx GROUPS): three inside Snape's class round (-10, 10) and the one beside it,
// two among Flitwick's students and two among McGonagall's. The nudges are radians, about 13 m of
// ring per radian here (2.6 to 3 m; paver 9 goes 3.6 m so it clears the pair at angle 2.03).
const PAVER_NUDGE = { 1: 0.2, 2: 0.2, 4: -0.22, 7: 0.2, 9: -0.3, 10: 0.22, 11: -0.2, 13: -0.22 }
export const LAWN_PAVERS = (() => {
  let s = (4 * 2654435761) >>> 0 || 1
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  return Array.from({ length: 14 }, (_, i) => {
    const a = r() * TAU + (PAVER_NUDGE[i] || 0)
    return [Math.sin(a) * 12, Math.cos(a) * 14]
  })
})()

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
  for (const m of MEETING) if (Math.abs(x - m.x) < m.w / 2 && Math.abs(z - m.z) < m.d / 2) return `Meeting room · ${m.num}`
  if (z > planZ(44.3)) return 'South back hallway · meeting rooms 2461+'
  if (z < planZ(-37.4)) return 'North back hallway · meeting rooms 2246+'
  if (x < planX(-20)) return 'West cloister · Ross Library side'
  if (x > planX(20)) return 'East cloister · Beinecke side'

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

// height of the desk top under a point, or null when no desk is there (DESK_SURFACES)
export function deskTopAt(x, z) {
  for (const s of DESK_SURFACES) {
    const vx = x - s.F[0]
    const vz = z - s.F[1]
    const r = Math.hypot(vx, vz)
    for (const g of s.rings) {
      if (r < g.r0 || r > g.r1) continue
      const a = Math.atan2(vx * -s.back[1] + vz * s.back[0], vx * s.back[0] + vz * s.back[1])
      if (g.arcs.some(([a0, a1]) => a >= a0 && a <= a1)) return g.top
    }
  }
  return null
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
    const e = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa)
    // keep only directions where the riser actually exists inside the room; slivers past the
    // drum wall would extrude into zero-width side walls out in the hallway
    if (e - a < 0.05) continue
    inner.push([F[0] + u[0] * a, F[1] + u[1] * a])
    outer.push([F[0] + u[0] * e, F[1] + u[1] * e])
  }
  return inner.length < 2 ? null : [...inner, ...outer.reverse()]
}
