import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { angleTo, rand, smooth, timed, useLabubuRig } from './common.js'
import { CHESS, NOOK, OWL, STATUE, Y } from './courtyardLayout.js'
import { openBook } from './CourtyardProps.js'
import { grind } from './CourtyardSound.js'

// The living parts of the round 4 courtyard fills (the still parts are CourtyardFills.jsx):
//   wizard's chess: twelve waist-high stone pieces on the 6 x 6 m board; every 20 to 40 s one slides a square
//     with a soft grinding sound, the two sides taking turns. Two Labubus on stools think it over (Sit, a Nod
//     after their own move, a surprised face when the other side moves).
//   a Labubu posing beside Handsome Dan's statue, waving now and then as if for a photo
//   the reading nook: four Labubus on two blankets, three reading (SitRead, a page turning) and one asleep
//   an owl on its perch by the north-east aspen that turns its head toward you within 12 m, and blinks
const SEAT = 0.11 // the Sit clips put the seat this far above the root
const S = 1.1 // Labubu scale, as the spell students

// ---------- chess pieces (lathe silhouettes; the knight is an extruded horse head on a lathe base)
const V = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y))
const BASE = [[0, 0], [0.27, 0], [0.27, 0.06], [0.23, 0.09], [0.2, 0.13], [0.15, 0.16]]
function lathe(pts, seg = 20) {
  return new THREE.LatheGeometry(V([...BASE, ...pts]), seg)
}
const PIECES = (() => {
  const pawn = lathe([[0.1, 0.42], [0.15, 0.46], [0.08, 0.5], [0.13, 0.56], [0.15, 0.64], [0.12, 0.71], [0.05, 0.75], [0, 0.76]])
  const rook = mergeGeometries(
    [lathe([[0.13, 0.6], [0.19, 0.66], [0.19, 0.82], [0.12, 0.82], [0.12, 0.76], [0, 0.76]]), ...[0, 1, 2, 3].map((k) => new THREE.BoxGeometry(0.1, 0.1, 0.07).translate(0.15, 0.87, 0).rotateY((k * Math.PI) / 2 + Math.PI / 4))].map(
      (g) => g.toNonIndexed(),
    ),
  )
  const bishop = mergeGeometries(
    [lathe([[0.1, 0.5], [0.15, 0.54], [0.09, 0.58], [0.14, 0.7], [0.13, 0.82], [0.07, 0.9], [0, 0.93]]), new THREE.SphereGeometry(0.04, 8, 6).translate(0, 0.96, 0)].map((g) => g.toNonIndexed()),
  )
  const queen = mergeGeometries(
    [
      lathe([[0.1, 0.62], [0.16, 0.66], [0.1, 0.7], [0.13, 0.86], [0.17, 0.98], [0.1, 1.0], [0, 1.0]]),
      ...Array.from({ length: 8 }, (_, k) => new THREE.SphereGeometry(0.03, 6, 4).translate(Math.cos((k / 8) * Math.PI * 2) * 0.15, 1.01, Math.sin((k / 8) * Math.PI * 2) * 0.15)),
      new THREE.SphereGeometry(0.045, 8, 6).translate(0, 1.06, 0),
    ].map((g) => g.toNonIndexed()),
  )
  const king = mergeGeometries(
    [
      lathe([[0.1, 0.66], [0.17, 0.7], [0.1, 0.74], [0.14, 0.92], [0.17, 1.02], [0.1, 1.05], [0, 1.05]]),
      new THREE.BoxGeometry(0.06, 0.22, 0.06).translate(0, 1.16, 0),
      new THREE.BoxGeometry(0.17, 0.06, 0.06).translate(0, 1.18, 0),
    ].map((g) => g.toNonIndexed()),
  )
  // knight: a horse head in profile (facing +x), 0.16 m thick, on a short lathe base
  const sh = new THREE.Shape(V([[-0.14, 0], [0.16, 0], [0.12, 0.12], [0.06, 0.2], [0.2, 0.28], [0.24, 0.36], [0.2, 0.42], [0.06, 0.5], [0.02, 0.56], [-0.04, 0.52], [-0.1, 0.44], [-0.16, 0.3], [-0.18, 0.14]]))
  const head = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 })
  head.translate(0, 0.3, -0.08)
  const knight = mergeGeometries([lathe([[0.15, 0.3], [0, 0.3]]), head].map((g) => g.toNonIndexed()))
  for (const g of [pawn, rook, bishop, queen, king, knight]) g.computeVertexNormals()
  return { pawn, rook, bishop, queen, king, knight }
})()
const KINDS = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']
// starting squares (column across x from the west edge, row across z from the north edge): a game in progress
const START = {
  white: { king: [0, 4], queen: [2, 3], rook: [1, 6], bishop: [2, 5], knight: [3, 2], pawn: [3, 4] },
  black: { king: [7, 3], queen: [5, 4], rook: [6, 1], bishop: [5, 2], knight: [4, 5], pawn: [4, 3] },
}
const STONE_W = new THREE.Color('#ece5d6')
const STONE_B = new THREE.Color('#3e4046')
const PIECE_MAT = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62 })
const sqPos = ([c, r]) => [CHESS.c[0] + (c - 3.5) * CHESS.sq, CHESS.c[1] + (r - 3.5) * CHESS.sq]

function Chess() {
  const refs = useRef({})
  // pieces: side, kind, square; plus the slide in progress
  const st = useMemo(() => {
    const pieces = []
    for (const side of ['white', 'black']) for (const kind of KINDS) pieces.push({ side, kind, sq: [...START[side][kind]], from: null, t0: 0 })
    const r = rand(2468)
    r()
    r()
    return { pieces, r, turn: 'white', next: 8 + r() * 10, moved: { white: -10, black: -10 } }
  }, [])
  const players = useMemo(() => CHESS.stools.map((p, i) => ({ p, yaw: angleTo(p, CHESS.c), look: i ? { fur: '#5a3d2e', shirt: '#a6192e', expression: 'mischief' } : { fur: '#f2efe9', shirt: 'yale', expression: 'happy' }, side: i ? 'black' : 'white' })), [])
  const place = () => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const sc = new THREE.Vector3(1, 1, 1)
    for (const kind of KINDS) {
      const mesh = refs.current[kind]
      if (!mesh) continue
      st.pieces
        .filter((p) => p.kind === kind)
        .forEach((p, i) => {
          let [x, z] = sqPos(p.sq)
          if (p.from) {
            const u = smooth(Math.min(1, p.u))
            const [fx, fz] = sqPos(p.from)
            x = fx + (x - fx) * u
            z = fz + (z - fz) * u
          }
          // knights face the other side; the rest turn a little so the board does not look laid out by a machine
          const yaw = kind === 'knight' ? (p.side === 'white' ? 0 : Math.PI) : (p.sq[0] * 0.7 + p.sq[1]) % 1
          mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, Y + 0.06, z), q.setFromAxisAngle(up, yaw), sc))
          if (mesh.instanceColor === null || !p.colored) {
            mesh.setColorAt(i, p.side === 'white' ? STONE_W : STONE_B)
            p.colored = true
            mesh.instanceColor.needsUpdate = true
          }
        })
      mesh.instanceMatrix.needsUpdate = true
    }
  }
  useLayoutEffect(() => {
    place()
    for (const k of KINDS) refs.current[k]?.computeBoundingSphere()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useFrame(
    timed(({ clock }) => {
      const t = clock.elapsedTime
      let moving = false
      for (const p of st.pieces)
        if (p.from) {
          p.u = (t - p.t0) / 1.6
          moving = true
          if (p.u >= 1) p.from = null
        }
      if (t > st.next) {
        // one piece of the side to move slides to a free neighbouring square
        const r = st.r
        const mine = st.pieces.filter((p) => p.side === st.turn)
        const taken = new Set(st.pieces.map((p) => p.sq.join()))
        for (let tries = 0; tries < 12; tries++) {
          const p = mine[Math.floor(r() * mine.length)]
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
          const fwd = st.turn === 'white' ? 1 : -1
          const d = dirs[Math.floor(r() * dirs.length)]
          if (p.kind === 'pawn') (d[0] = fwd), (d[1] = 0)
          const to = [p.sq[0] + d[0], p.sq[1] + d[1]]
          if (to[0] < 0 || to[0] > 7 || to[1] < 0 || to[1] > 7 || taken.has(to.join())) continue
          p.from = p.sq
          p.sq = to
          p.t0 = t
          p.u = 0
          const [x, z] = sqPos(to)
          grind([x, Y + 0.3, z], 1.6)
          st.moved[st.turn] = t
          break
        }
        st.turn = st.turn === 'white' ? 'black' : 'white'
        st.next = t + 20 + r() * 20
      }
      if (moving) place()
    }),
  )
  return (
    <group>
      {KINDS.map((k) => (
        <instancedMesh key={k} ref={(el) => (refs.current[k] = el)} args={[PIECES[k], PIECE_MAT, 2]} castShadow receiveShadow />
      ))}
      {players.map((pl, i) => (
        <Player key={i} pl={pl} st={st} />
      ))}
    </group>
  )
}
function Player({ pl, st }) {
  const rig = useLabubuRig(pl.look)
  useFrame(
    timed((state, dt) => {
      const t = state.clock.elapsedTime
      const other = pl.side === 'white' ? 'black' : 'white'
      // a nod just after its own move, otherwise sit and think; a surprised face when the other side moves
      rig.play(t - st.moved[pl.side] < 2.2 ? 'Nod' : 'Sit', { fade: 0.4 })
      rig.setFace(t - st.moved[other] < 1.8 ? 'surprised' : pl.look.expression)
      rig.tick(Math.min(dt, 0.05), state, 40, 48)
    }),
  )
  return (
    <group position={[pl.p[0], Y + 0.48 - SEAT, pl.p[1]]} rotation={[0, pl.yaw, 0]} scale={S}>
      <primitive object={rig.object} />
    </group>
  )
}

// ---------- the poser by the statue: stands beside Handsome Dan facing the south cloister and waves now and then
function Poser() {
  const rig = useLabubuRig({ fur: '#ff9ccc', shirt: 'yale', expression: 'grin' })
  const st = useMemo(() => ({ until: 0, wave: false }), [])
  useFrame(
    timed((state, dt) => {
      const t = state.clock.elapsedTime
      if (t > st.until) {
        st.wave = !st.wave
        st.until = t + (st.wave ? 3.2 : 4 + Math.random() * 4)
      }
      rig.play(st.wave ? 'Wave' : 'Idle', { fade: 0.4, timeScale: st.wave ? 0.7 : 1 })
      rig.setFace(st.wave ? 'grin' : 'happy')
      rig.tick(Math.min(dt, 0.05), state, 40, 48)
    }),
  )
  return (
    <group position={[STATUE.poser[0], Y, STATUE.poser[1]]} rotation={[0, STATUE.poserYaw, 0]} scale={S}>
      <primitive object={rig.object} />
    </group>
  )
}

// ---------- the reading nook
const NOOK_LOOKS = [
  { fur: '#9fe0c6', shirt: '#2f7fd8', expression: 'happy' },
  { fur: '#c98f6b', shirt: '#7a9e7e', expression: 'sleepy' },
  { fur: '#bba7e8', shirt: 'stripes', expression: 'happy' },
  { fur: '#f2b36b', shirt: '#ffffff', expression: 'grin' },
]
function Reader({ i }) {
  const d = NOOK.readers[i]
  const rig = useLabubuRig(NOOK_LOOKS[i])
  const book = useMemo(() => (d.clip === 'SitRead' ? openBook(i) : null), [d.clip, i])
  useMemo(() => book && rig.bones.spine?.add(book), [rig, book])
  const off = i * 1.3 // so the pages do not turn together
  useFrame(
    timed((state, dt) => {
      rig.play(d.clip)
      rig.setFace(d.clip === 'Sleep' ? 'sleepy' : NOOK_LOOKS[i].expression)
      if (book) {
        const a = rig.actions.SitRead
        const f = a ? ((a.time + off) * 30) % 90 : 0
        const u = Math.min(1, Math.max(0, (f - 62) / 16))
        book.userData.leaf.rotation.y = -0.25 - u * (Math.PI - 0.5)
      }
      rig.tick(Math.min(dt, 0.05), state, 40, 48)
    }),
  )
  return (
    <group position={[d.p[0], Y - SEAT + 0.02, d.p[1]]} rotation={[0, d.yaw, 0]} scale={S}>
      <primitive object={rig.object} />
    </group>
  )
}

// ---------- the owl: tawny body, pale facial disc, big amber eyes with lids, ear tufts; about 0.5 m tall
const OWL_MATS = {
  body: new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 0.9 }),
  belly: new THREE.MeshStandardMaterial({ color: '#d8c3a0', roughness: 0.9 }),
  disc: new THREE.MeshStandardMaterial({ color: '#efe2c8', roughness: 0.85 }),
  eye: new THREE.MeshStandardMaterial({ color: '#f2a516', roughness: 0.25, emissive: '#5a3a00', emissiveIntensity: 0.4 }),
  pupil: new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.2 }),
  beak: new THREE.MeshStandardMaterial({ color: '#3a3330', roughness: 0.5 }),
}
function owl() {
  const m = (geo, mat, p, s = [1, 1, 1], r = [0, 0, 0]) => {
    const o = new THREE.Mesh(geo, mat)
    o.position.set(...p)
    o.scale.set(...s)
    o.rotation.set(...r)
    o.castShadow = true
    return o
  }
  const sph = new THREE.SphereGeometry(1, 16, 12)
  const g = new THREE.Group()
  g.add(m(sph, OWL_MATS.body, [0, 0.2, 0], [0.15, 0.21, 0.14]))
  g.add(m(sph, OWL_MATS.belly, [0, 0.18, 0.055], [0.11, 0.16, 0.1]))
  for (const s of [-1, 1]) {
    g.add(m(sph, OWL_MATS.body, [s * 0.12, 0.2, -0.01], [0.05, 0.16, 0.11], [0, 0, s * 0.15])) // wings
    g.add(m(new THREE.ConeGeometry(0.02, 0.05, 5), OWL_MATS.beak, [s * 0.04, 0.0, 0.05], [1, 1, 1], [Math.PI, 0, 0])) // talons
  }
  const head = new THREE.Group()
  head.rotation.order = 'YXZ' // turn, then tilt about the turned head's own x
  head.position.set(0, 0.42, 0)
  head.add(m(sph, OWL_MATS.body, [0, 0, 0], [0.13, 0.11, 0.12]))
  head.add(m(sph, OWL_MATS.disc, [0, -0.005, 0.06], [0.11, 0.09, 0.07]))
  const lids = []
  for (const s of [-1, 1]) {
    head.add(m(sph, OWL_MATS.eye, [s * 0.045, 0.01, 0.115], [0.03, 0.03, 0.02]))
    head.add(m(sph, OWL_MATS.pupil, [s * 0.045, 0.01, 0.132], [0.014, 0.014, 0.008]))
    const lid = m(sph, OWL_MATS.body, [s * 0.045, 0.01, 0.118], [0.033, 0.033, 0.024])
    lid.scale.y = 0.001
    lids.push(lid)
    head.add(lid)
    head.add(m(new THREE.ConeGeometry(0.025, 0.08, 5), OWL_MATS.body, [s * 0.08, 0.1, 0.0], [1, 1, 1], [0, 0, -s * 0.35])) // ear tufts
  }
  head.add(m(new THREE.ConeGeometry(0.014, 0.04, 5), OWL_MATS.beak, [0, -0.025, 0.13], [1, 1, 1], [Math.PI / 2 + 0.4, 0, 0]))
  g.add(head)
  g.userData = { head, lids }
  return g
}
const _cam = new THREE.Vector3()
function Owl() {
  const o = useMemo(owl, [])
  const st = useMemo(() => ({ blinkAt: 3, yaw: 0 }), [])
  useFrame(
    timed(({ camera, clock }, dt) => {
      const t = clock.elapsedTime
      const { head, lids } = o.userData
      // turn the head toward the camera when it is within 12 m (an owl turns up to about 135 degrees each way)
      camera.getWorldPosition(_cam)
      const wx = OWL.p[0]
      const wz = OWL.p[1]
      const d = Math.hypot(_cam.x - wx, _cam.z - wz)
      let want = Math.sin(t * 0.23) * 0.6 // idle: a slow look round
      if (d < 12) {
        let a = Math.atan2(_cam.x - wx, _cam.z - wz) - OWL.yaw
        a = Math.atan2(Math.sin(a), Math.cos(a))
        want = Math.max(-2.35, Math.min(2.35, a))
      }
      st.yaw += (want - st.yaw) * Math.min(1, dt * 4)
      head.rotation.y = st.yaw
      // tilt toward a camera that is above it (the cloister is 5 m up)
      head.rotation.x = d < 12 ? -Math.atan2(_cam.y - (Y + OWL.h + 0.45), Math.max(d, 1)) * 0.6 : 0
      // blink every 2.5 to 6 s: lids close and open over 0.2 s
      const u = (t - st.blinkAt) / 0.2
      const k = u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0
      for (const l of lids) l.scale.y = Math.max(0.001, 0.033 * k)
      if (u > 1) st.blinkAt = t + 2.5 + Math.random() * 3.5
    }),
  )
  return <primitive object={o} position={[OWL.p[0], Y + OWL.h + 0.03, OWL.p[1]]} rotation={[0, OWL.yaw, 0]} scale={1.35} />
}

export default function CourtyardFolk() {
  return (
    <group>
      <Chess />
      <Poser />
      {NOOK.readers.map((_, i) => (
        <Reader key={i} i={i} />
      ))}
      <Owl />
    </group>
  )
}
