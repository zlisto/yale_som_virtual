// Where everything on the courtyard lawn stands (Lan, round 4: "the courtyard still seems kinda bare. the four
// teachers and students set dont need to be so crowded and uniformly spaced"). One file so the lessons
// (SpellSchool.jsx, CourtyardRange.jsx, CourtyardLumos.jsx) and the fills (render/Lawn.jsx, CourtyardFills.jsx,
// CourtyardFolk.jsx) keep out of each other's way. World x runs east, z south; the lawn is at y = -5 and reaches
// about x +-25.6, z +-16.2 (the 59.5 x 40 m courtyard glass scaled by 0.86 and 0.85, World.jsx CourtyardFrame;
// the cloister columns stand on the paving band at x +-27.3). The trees are
// render/Scenery.jsx COURT_TREES: (-11,-8) (0,-10.5) (11,-8) (-13,5) (13,5) (-5,9.5) (6,10). Hagrid stands at
// (-10.5,-2) (Faculty.jsx).
//
//   north edge   targets of the long-range class: rings, a suit of armour, a scarecrow (x -17 to -3)
//   north-west   the reading nook: two picnic blankets, four Labubus reading or asleep
//   north-east   Flitwick's Leviosa class, a tight half circle; the owl on its perch by the aspen
//   west edge    Lockhart's long-range class: five students 4 m apart casting north-east across the lawn
//   centre       the fountain inside its ring of benches and a ring flower bed
//   east         McGonagall's Transfiguration clearing, three students, east of the fountain; chairs on the
//                east hedge and a gravel loop from the north gap to Snape's blanket
//   south-west   the wizard's chess board, two Labubus on stools
//   south        the stone path with flower beds and lanterns; Handsome Dan's statue beside it
//   south-east   Snape's Lumos class: two students on a blanket near the south glass
import { COURTYARD } from '../layout.js'

export const Y = -5

// lawn half extents from the courtyard outline (the paving band takes the outer 14 to 15 percent)
export const LAWN_HX = Math.max(...COURTYARD.map(([x]) => x)) * 0.86
export const LAWN_HZ = Math.max(...COURTYARD.map(([, z]) => z)) * 0.85
// the lawn's east or west edge at depth z (x > 0), read off the scaled outline
export function lawnEdgeX(z) {
  let best = 0
  const n = COURTYARD.length
  for (let i = 0; i < n; i++) {
    const [x0, z0] = COURTYARD[i]
    const [x1, z1] = COURTYARD[(i + 1) % n]
    const a = z0 * 0.85
    const b = z1 * 0.85
    if ((a - z) * (b - z) > 0 || a === b) continue
    const x = (x0 + ((z - a) / (b - a)) * (x1 - x0)) * 0.86
    best = Math.max(best, x)
  }
  return best
}

// ---------- the fountain (tools/blender/fountain.py) and what rings it
export const FOUNTAIN = { p: [0, 0], r: 2.78 } // r: the step ring under the basin
export const BENCH_RING = { r0: 3.6, r1: 4.05, gap: 0.3 } // four curved stone benches, gaps on the four axes
export const RING_BED = { r0: 4.45, r1: 5.05, gap: 0.3 } // flower bed outside the benches, same gaps

// ---------- the stone path from the south glass to the bench ring, with a flower bed either side
export const PATH = { z0: 18.8, z1: BENCH_RING.r1 + 0.15, half: 0.7 }
export const PATH_BEDS = { x0: 0.95, x1: 1.65, z0: 5.6, z1: 17.8 }

// ---------- spell classes that SpellSchool.jsx draws (the professor on a floating paver, students in an arc
// round P facing the professor): P, a point the class lies toward, the count, the arc radius R and half-width
// spread in radians. The professor stands on the glass side, so the nearest cloister sees the students' faces.
export const SCHOOL_GROUPS = [
  // tight half circle near the north-east glass, east of the owl's aspen at (11,-8)
  { who: 'flitwick', spell: 'leviosa', P: [22.0, -13.4], toward: [20.6, -9.9], n: 5, scale: 1.3, R: 2.1, spread: 1.15 },
  // a clearing east of the fountain: three students between the ring bed and McGonagall, the aspen at (13,5) behind her
  { who: 'mcgonagall', spell: 'transfig', P: [12.6, 0.8], toward: [8.6, 0.8], n: 3, R: 2.6, spread: 0.85 },
]

// ---------- Lockhart's long-range class down the new west edge (CourtyardRange.jsx)
// Five students 4 m apart, 3.6 m inside the west hedge (far enough in that the west cloister sees them), cast
// north-east at targets on the north edge 15 to 23 m away. The targets run from x -17 to -3: further west the
// reading nook would be in the line of fire, and further east the lines would cross the aspen at (-11,-8).
export const RANGE = {
  who: 'lockhart',
  P: [-21.4, 11.9], // at the south end of the line, facing up it
  students: [8.4, 4.4, 0.4, -3.6, -7.6].map((z) => [-21.2, z]),
  // kind, position, height of the target's centre above the lawn
  targets: [
    { kind: 'ring', p: [-17.4, -14.2], h: 1.7 },
    { kind: 'armor', p: [-12.4, -15.3], h: 0 },
    { kind: 'ring', p: [-7.8, -15.0], h: 2.0 },
    { kind: 'scarecrow', p: [-3.0, -15.4], h: 0 },
  ],
  reach: [15, 23], // a student picks among the targets this far away (m); 23 keeps every line 1.9 m off the trunks
}

// ---------- Snape's Lumos class: two students on a blanket near the south glass (CourtyardLumos.jsx)
export const LUMOS = { who: 'snape', P: [14.2, 15.3], blanket: [14.2, 13.1], students: [[13.65, 13.0], [14.75, 13.2]] }

// ---------- fills (CourtyardFills.jsx static pieces, CourtyardFolk.jsx the living ones)
// wizard's chess: an 8 x 8 board of 0.75 m squares (6 m), players on stools at its west and east edges
export const CHESS = { c: [-15.6, 12.4], sq: 0.75, stools: [[-19.35, 12.4], [-11.85, 12.4]] }
// Handsome Dan in bronze on a granite plinth beside the path, facing the south cloister; a Labubu poses by him
export const STATUE = { p: [3.4, 14.2], yaw: -0.45, plinth: [1.5, 0.95, 0.9], poser: [4.75, 14.85], poserYaw: -0.2 }
// reading nook in the north-west corner: two picnic blankets (centre, yaw), a basket
export const NOOK = {
  blankets: [{ p: [-22.2, -10.9], r: 0.35 }, { p: [-20.4, -13.1], r: -0.25 }],
  basket: [-19.6, -12.6],
  // readers: position, yaw, clip; the Sit clips put the seat 0.11 m above the root
  readers: [
    { p: [-22.6, -10.6], yaw: 2.2, clip: 'SitRead' },
    { p: [-21.8, -11.3], yaw: 2.9, clip: 'Sleep' },
    { p: [-20.8, -12.8], yaw: 1.6, clip: 'SitRead' },
    { p: [-20.0, -13.45], yaw: 2.6, clip: 'SitRead' },
  ],
}
// the owl's perch beside the north-east aspen at (11,-8), on the gravel loop's side
export const OWL = { p: [12.7, -9.9], h: 2.05, yaw: -2.2 }
// eight iron lanterns on posts: four along the stone path, two on the west gravel paths, two on the east loop
export const LANTERNS = [[-1.95, 6.6], [1.95, 10.0], [-1.95, 13.4], [1.95, 16.1], [-6.2, 5.0], [-8.4, -6.2], [5.6, -8.9], [17.6, 0.6]]
// low hedges just inside the east and west lawn edges: z from, z to, inset from the edge (m)
export const HEDGES = [
  { side: -1, z0: -9.0, z1: 10.0, inset: 0.75 },
  { side: 1, z0: -8.6, z1: 9.0, inset: 0.75 },
]
// winding gravel paths (centre lines, 0.9 m wide): the bench ring's west gap to the nook and to the chess
// board, from the chess board across the stone path to the statue, and the east loop from the bench ring's
// north gap past Flitwick's class and down the east side to Snape's blanket
export const GRAVEL = [
  [[-4.2, -0.1], [-6.2, -1.6], [-7.6, -4.6], [-9.0, -8.2], [-11.4, -10.6], [-14.6, -11.9], [-18.2, -11.8]],
  [[-4.2, 0.2], [-5.8, 2.4], [-7.0, 5.6], [-9.0, 7.4], [-11.2, 9.0]],
  [[-11.6, 14.2], [-9.2, 13.4], [-6.6, 12.0], [-3.4, 12.3], [-0.6, 12.2]],
  [[0.6, 12.6], [1.8, 13.4], [2.5, 14.2]],
  [[0.2, -4.3], [1.4, -6.6], [4.2, -8.0], [7.8, -10.6], [11.6, -11.8], [15.4, -11.0], [18.2, -9.0], [19.6, -5.6], [19.2, -1.0], [18.4, 3.6], [17.2, 7.8], [15.6, 11.4]],
]
// Adirondack chairs (Lawn.jsx): two pairs either side of the stone path, six along the east hedge, two west of
// Hagrid watching the long-range class
export const CHAIRS = [
  { p: [-2.7, 8.0], r: Math.PI / 2 + 0.25, c: 'blue' },
  { p: [-2.7, 14.6], r: Math.PI / 2 - 0.2, c: 'white' },
  { p: [2.7, 8.4], r: -Math.PI / 2 - 0.25, c: 'white' },
  { p: [5.9, 15.7], r: -Math.PI / 2 - 0.6, c: 'blue' },
  { p: [22.3, -5.4], r: -Math.PI / 2 - 0.3, c: 'blue' },
  { p: [22.0, -7.8], r: -Math.PI / 2 + 0.1, c: 'white' },
  { p: [22.6, -1.6], r: -Math.PI / 2 - 0.3, c: 'white' },
  { p: [22.6, 1.4], r: -Math.PI / 2 + 0.3, c: 'blue' },
  { p: [22.4, 4.6], r: -Math.PI / 2 + 0.15, c: 'white' },
  { p: [22.0, 7.2], r: -Math.PI / 2 - 0.2, c: 'blue' },
  { p: [-16.8, 1.4], r: -Math.PI / 2 + 0.2, c: 'blue' },
  { p: [-16.6, 3.9], r: -Math.PI / 2 - 0.15, c: 'white' },
]
// picnic tables: one by the east hedge's south end, one on the north edge, one west of Hagrid
export const PICNICS = [{ p: [20.2, 10.8], r: 0.4 }, { p: [4.8, -15.2], r: -0.08 }, { p: [-15.6, -2.4], r: 0.2 }]
export const PLANTERS = [[-1.75, 17.9], [1.75, 17.9], [-8.2, -16.6], [8.2, -16.6]]
// string lights between two poles over the stone path, north of the statue
export const POLES = [[-3.2, 11.0], [3.2, 11.0]]
