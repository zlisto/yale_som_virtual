import { CHAIRS, DRUMS, RISE, collide, planPt } from '../layout.js'
import { RING, ROOMS, nearestRing, ringPath } from '../HandsomeDan.jsx'

// Paths for Labubus that move around the floor: Dan's cloister loop (RING), spurs from it to points of
// interest, and the routes in and out of a classroom seat (hop onto the desk, along the desks to the
// aisle, down the aisle steps, out the door). A path is a list of nodes { x, z, y, hop, free }:
//   hop   the segment that ends at this node is a hop (parabolic arc) instead of a walk
//   free  the segment is in the open cloister, so the walker is pushed out of walls and props

// ---------- points of interest (all on level 2, y = 0), each with a spur from the nearest ring point
//   look: the yaw the Labubu faces while it stops there
// Spurs are written in round-3 plan coordinates (the positions in the comments) and mapped onto the
// enlarged floor by planPt (layout.js).
const poi = (name, spur0, look) => {
  const spur = spur0.map(planPt)
  const at = spur[spur.length - 1]

  return { name, spur, at, look, ring: nearestRing(spur[0]) }
}
export const POIS = [
  // inside the library door, between the reception desk and the lounge, then at the open shelves
  poi('library', [[-24.2, 0.8], [-25.6, 0.8], [-27.4, 0.5], [-30.2, 0.3], [-32.8, 0.4]], -Math.PI / 2),
  // the Campus Customs merch stand against the east wall (eggs/b/Merch.jsx, at x 27.85, z 19.7)
  poi('merch', [[22.6, 18.4], [25.0, 19.6], [26.35, 19.7]], Math.PI / 2),
  // Lisa's kiosk in the west cloister by 2400 (eggs/a/LisaKiosk.jsx, at x -27.4, z 19.4)
  poi('lisa', [[-22.6, 18.6], [-24.9, 19.6], [-26.15, 19.9]], -Math.PI / 2),
  // the stair core in the southeast corner (stair G): the way down to the cafe
  poi('cafe', [[20.8, 19.0], [22.4, 20.2], [23.3, 21.5]], 0.3),
  // the Beinecke Terrace Room doors on the east wall
  poi('beinecke', [[23.4, 0.2], [25.4, 0.1], [27.55, 0.0]], Math.PI / 2),
  // Froggy's poster in the east cloister (eggs/a/FroggyEgg.jsx)
  poi('froggy', [[23.2, -12.5], [25.4, -13.6], [26.9, -15.4]], Math.PI / 2 + 0.3),
  // the courtyard glass in the north and south cloisters, looking down at the lawn
  poi('glassN', [[-6, -22.6], [-6.5, -21.0]], Math.PI),
  poi('glassS', [[9.5, 22.7], [9.5, 21.3]], 0),
  // more glass stops, so every cloister has a few (Roamers.jsx gives each roamer a beat of stops in one cloister)
  poi('glassN2', [[8, -22.6], [8, -21.0]], Math.PI),
  poi('glassS2', [[-9.5, 22.7], [-9.5, 21.3]], 0),
  poi('glassW', [[-23.4, -6], [-22.4, -6]], -Math.PI / 2),
  poi('glassE', [[23.4, 6], [22.4, 6]], Math.PI / 2),
  poi('glassN3', [[-15, -22.6], [-15, -21.0]], Math.PI),
  poi('glassW2', [[-23.4, 9], [-22.4, 9]], -Math.PI / 2),
]
export const poiByName = (name) => POIS.find((q) => q.name === name)

const node = (p, o = {}) => ({ x: p[0], z: p[1], y: 0, hop: false, free: true, ...o })

// from ring index `from` to a point of interest (and the reverse, back to its ring point)
export function toPoi(from, P) {
  return [...ringPath(from, P.ring).map((p) => node(p)), ...P.spur.map((p) => node(p))]
}
export function fromPoi(P) {
  return [...P.spur].reverse().map((p) => node(p)).concat([node(RING[P.ring])])
}
export const ringNodes = (a, b) => ringPath(a, b).map((p) => node(p))

// ---------- classroom seats
const HEIGHT = 0.95 // the seated students' scale (LabubuCrowd)
const ROW_STEP = 1.15
export const seatY = (c) => (c.y || 0) + 0.51 - 0.11 * HEIGHT

// desk centers of one room, by row height
const deskCache = new Map()
function desksOf(d) {
  if (deskCache.has(d.id)) return deskCache.get(d.id)
  const { F, back } = d.tiers
  const t = [back[1], -back[0]]
  const rows = new Map()
  for (const c of CHAIRS) {
    if (c.room !== d.id) continue
    const info = chairInfo(c, d)
    const key = Math.round((c.y || 0) * 100)
    const list = rows.get(key) || []
    if (!list.some((q) => Math.hypot(q.x - info.desk[0], q.z - info.desk[1]) < 0.2)) {
      const v = [info.desk[0] - F[0], info.desk[1] - F[1]]
      list.push({ x: info.desk[0], z: info.desk[1], th: Math.atan2(v[0] * t[0] + v[1] * t[1], v[0] * back[0] + v[1] * back[1]) })
    }
    rows.set(key, list)
  }
  deskCache.set(d.id, rows)
  return rows
}
// a chair's desk: the chair sits 0.65 m behind its desk center (radially from the seating focus F) and 0.3 m to one side
export function chairInfo(c, d) {
  const ux = [Math.sin(c.rot), Math.cos(c.rot)]
  const tg = [ux[1], -ux[0]]
  const v = [c.x - d.tiers.F[0], c.z - d.tiers.F[1]]
  const along = v[0] * ux[0] + v[1] * ux[1]
  const side = v[0] * tg[0] + v[1] * tg[1]
  const r = along - 0.65
  return { ux, tg, r, side, desk: [d.tiers.F[0] + ux[0] * r, d.tiers.F[1] + ux[1] * r] }
}

// from a classroom chair out to the cloister ring: hop onto the desk, hop along the desks to the center aisle,
// hop down the aisle steps, walk to the door the way Dan does, step out onto the ring
export function seatToRing(c) {
  const k = DRUMS.findIndex((d) => d.id === c.room)
  const d = DRUMS[k]
  const R = ROOMS[k]
  const { F, back } = d.tiers
  const y = c.y || 0
  const { tg, r, side, desk } = chairInfo(c, d)
  const out = [node([c.x, c.z], { y: seatY(c), free: false })]
  const top = y + 0.95
  out.push(node([desk[0] + tg[0] * side * 0.6, desk[1] + tg[1] * side * 0.6], { y: top, hop: true, free: false }))
  const row = desksOf(d).get(Math.round(y * 100)) || []
  const t = [back[1], -back[0]]
  const v = [desk[0] - F[0], desk[1] - F[1]]
  const th0 = Math.atan2(v[0] * t[0] + v[1] * t[1], v[0] * back[0] + v[1] * back[1])
  row
    .filter((q) => Math.sign(q.th) === Math.sign(th0) && Math.abs(q.th) < Math.abs(th0) - 0.01)
    .sort((a, b) => Math.abs(b.th) - Math.abs(a.th))
    .forEach((q) => out.push(node([q.x, q.z], { y: top, hop: true, free: false })))
  // into the aisle on the chair line of this row, then one hop per step down
  const n = Math.round(y / RISE)
  const ar = r + 0.6
  out.push(node([F[0] + back[0] * ar, F[1] + back[1] * ar], { y, hop: true, free: false }))
  for (let j = 1; j <= n; j++) {
    const rr = ar - j * ROW_STEP
    out.push(node([F[0] + back[0] * rr, F[1] + back[1] * rr], { y: (n - j) * RISE, hop: true, free: false }))
  }
  for (const p of [R.inside, ...R.via, R.inner]) out.push(node(p, { free: false }))
  out.push(node(R.outer), node(RING[R.ring]))
  return { path: out, ring: R.ring }
}
// the reverse: from the ring into the room and onto the chair (hops stay hops, in reverse)
export function ringToSeat(c) {
  const { path, ring } = seatToRing(c)
  const rev = [...path].reverse()
  // a node's hop flag describes the segment arriving at it: shift the flags by one when reversing
  const out = rev.map((p, i) => ({ ...p, hop: i > 0 ? path[path.length - i].hop : false, free: i > 0 ? path[path.length - i].free : true }))
  return { path: out, ring }
}

// ---------- the walker: moves along a path at `speed` (walk) or `hopTime` per hop
export class Walker {
  constructor(speed = 0.9, hopTime = 0.62) {
    this.speed = speed
    this.hopTime = hopTime
    this.path = null
    this.i = 0
    this.u = 0
    this.pos = { x: 0, y: 0, z: 0 }
    this.yaw = 0
    this.mode = 'idle'
    this.done = true
  }
  start(path) {
    this.path = path
    this.i = 0
    this.u = 0
    this.done = path.length < 2
    const p = path[0]
    this.pos.x = p.x
    this.pos.y = p.y
    this.pos.z = p.z
  }
  // returns the mode of the current segment: 'walk' | 'hop' | 'idle'
  update(dt) {
    if (this.done) return (this.mode = 'idle')
    let left = dt
    while (left > 0 && !this.done) {
      const a = this.path[this.i]
      const b = this.path[this.i + 1]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const dur = b.hop ? this.hopTime * Math.max(0.8, Math.min(1.6, len / 1.1)) : Math.max(1e-3, len / this.speed)
      const du = left / dur
      if (this.u + du < 1) {
        this.u += du
        left = 0
      } else {
        left -= (1 - this.u) * dur
        this.i += 1
        this.u = 0
        if (this.i >= this.path.length - 1) this.done = true
      }
    }
    const a = this.path[Math.min(this.i, this.path.length - 1)]
    const b = this.path[Math.min(this.i + 1, this.path.length - 1)]
    const u = this.done ? 1 : this.u
    this.pos.x = a.x + (b.x - a.x) * u
    this.pos.z = a.z + (b.z - a.z) * u
    if (b.hop) {
      const hgt = Math.max(0.28, Math.abs(b.y - a.y) * 0.6 + 0.3)
      this.pos.y = a.y + (b.y - a.y) * u + 4 * hgt * u * (1 - u)
    } else this.pos.y = a.y + (b.y - a.y) * u
    if (Math.hypot(b.x - a.x, b.z - a.z) > 1e-3) this.yaw = Math.atan2(b.x - a.x, b.z - a.z)
    if (b.free && !this.done) {
      // keep out of walls and props (layout colliders, player radius 0.35 m)
      const q = collide({ x: this.pos.x, z: this.pos.z })
      this.pos.x = q.x
      this.pos.z = q.z
    }
    this.mode = this.done ? 'idle' : b.hop ? 'hop' : 'walk'
    return this.mode
  }
}
