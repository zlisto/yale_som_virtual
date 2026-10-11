// The street plan around Evans Hall, shared by Backdrop.jsx (ground, roads, sidewalks, street
// trees) and Town.jsx (neighbours, street furniture, cars, the painted distance wall).
// Four roads frame the block: Whitney Avenue to the west (12 m, with a parking lane on its far
// side) and 10 m streets to the north, east and south. Every road has a raised kerb on both
// sides with a grass verge next to the road (street trees and lamp posts stand on it) and a
// sidewalk behind the verge.
import * as THREE from 'three'
import { BOUNDS, EAST, BEIN, planX, planZ } from '../layout.js'

export const G = -5 // ground level relative to the floor 2 slab
export const CURB = 0.14 // sidewalk and verge height above the road and lawn
export const VERGE = 1.6
export const WALK = 2.6
export const S = 350 // half size of the ground plane; roads run to its edge
// road centres written for the round-3 floor; planX / planZ keep each road as far from the enlarged building
// (the east street moves 4 m further, with the terrace rail, BEIN.terrace 17 -> 21)
export const ROAD = { W: { c: planX(-58.75), w: 12 }, N: { c: planZ(-58), w: 10 }, E: { c: planX(59) + 4, w: 10 }, S: { c: planZ(67), w: 10 } }
export const NS = ['W', 'E'] // roads that run north-south (along z)
export const OUT = { W: -1, N: -1, E: 1, S: 1 } // outward sign along the road's cross axis
// kerb lines [inner (building side), outer]
export const EDGE = Object.fromEntries(Object.entries(ROAD).map(([k, r]) => [k, [r.c - (OUT[k] * r.w) / 2, r.c + (OUT[k] * r.w) / 2]]))
// [min, max] of the road surface and of the whole corridor (road, verges and sidewalks)
export const surface = (k) => [ROAD[k].c - ROAD[k].w / 2, ROAD[k].c + ROAD[k].w / 2]
export const corridor = (k) => [ROAD[k].c - ROAD[k].w / 2 - VERGE - WALK, ROAD[k].c + ROAD[k].w / 2 + VERGE + WALK]
// building edges each side faces: the west, north and south glass and the Beinecke terrace rail
export const FACE = { W: BOUNDS.xMin, N: BOUNDS.zMin, E: EAST + BEIN.terrace, S: BOUNDS.zMax }
// centre of the painted distance wall (the middle of the block) and its radius
export const CENTER = [(BOUNDS.xMin + EAST + BEIN.terrace) / 2, (BOUNDS.zMin + BOUNDS.zMax) / 2]
export const WALL_R = 250

// small seeded generator, so the town is the same on every load
export function rand(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

// [lo, hi] minus the holes ([a, b] intervals)
export function splitRange(lo, hi, holes) {
  const out = []
  let a = lo
  for (const [h0, h1] of [...holes].sort((p, q) => p[0] - q[0])) {
    if (h0 > a) out.push([a, Math.min(h0, hi)])
    a = Math.max(a, h1)
  }
  if (a < hi) out.push([a, hi])
  return out
}

// quads { p: four [x, y, z] corners counter-clockwise seen from the front, t: four uvs }
// merged into one indexed geometry
export function quadGeo(quads) {
  const pos = []
  const uv = []
  const idx = []
  quads.forEach(({ p, t }, i) => {
    pos.push(...p.flat())
    uv.push(...t.flat())
    const b = i * 4
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
