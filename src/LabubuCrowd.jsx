import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { YALE_BLUE } from './Labubu.jsx'
import { CHAIRS, DRUMS } from './layout.js'
import { FUR, FUR_ON, dressMaterial, preloadModel, shellMaterial, useModel } from './characters/rig.js'
import { LIFE, LIFE_ON, rand as lifeRand } from './life/common.js'
import ClassroomLife from './life/Classroom.jsx'

// ~30 seated Labubu students per classroom, instanced from public/models/labubu_seated.glb.
// Variation is cheap combinatorics, not more models:
//   3 faces (grin, surprised, sleepy) x 2 outfits (MGT 409 tee, hoodie) = 6 static meshes in the GLB,
//   fur color and shirt color per instance (instanceColor on the near-white Fur and Shirt materials),
//   and a laptop or a coffee cup on the desk in front of some students. Everything is seeded.
const STUDENTS_PER_ROOM = 30
const HEIGHT = 0.95
const CROWD_SHELLS = 6
export const FURS = ['#efe3cf', '#9a9aa2', '#6b4a3a', '#ff9ccc', '#9fe0c6', '#bba7e8', '#8cc3ff', '#3a3a3e'] // cream, grey, brown, pink, mint, lavender, sky, charcoal
const SHIRT_COLORS = [YALE_BLUE, YALE_BLUE, '#a6192e', '#2f6b4f', '#3a3a3e', '#5b3f8c', '#1f7a8c', '#c8641e']
const FACES = ['grin', 'grin', 'surprised', 'sleepy'] // the classic grin is the most common
const CLOTHES = ['tee', 'tee', 'hoodie']

preloadModel('labubu_seated')

function rand(seed) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

// pick seats + looks once (stable across reloads)
export const STUDENTS = DRUMS.flatMap((d, di) => {
  const r = rand(4242 + di * 977)
  const pick = (a) => a[Math.floor(r() * a.length)]
  const seats = CHAIRS.filter((c) => c.room === d.id)
    .map((c) => [r(), c])
    .sort((a, b) => a[0] - b[0])
    .slice(0, STUDENTS_PER_ROOM)
    .map(([, c]) => c)
  return seats.map((c) => {
    const rot = c.rot + Math.PI
    const k = r()
    return {
      room: d.id,
      x: c.x,
      y: (c.y || 0) + 0.51 - 0.11 * HEIGHT,
      z: c.z,
      seatY: c.y || 0,
      rot,
      fur: pick(FURS),
      face: pick(FACES),
      clothes: pick(CLOTHES),
      shirt: pick(SHIRT_COLORS),
      prop: k < 0.3 ? 'laptop' : k < 0.5 ? 'coffee' : null,
      side: r() < 0.5 ? -1 : 1,
    }
  })
})

// classroom life (src/life/Classroom.jsx): 6 students per room become skinned Labubus while the camera is near
// the room (rooms in LIVE); their static copies draw only while the room is not live. The extras sit in the two
// front rows, where both the back-row view and the professor's view see them: students already there are taken
// first (two laptop users first, so someone is typing), and the rest move from farther back into free front
// seats. A separate seed keeps everyone's looks as they were.
export const LIVE = new Set()
export const TYPING = new Set() // students whose skinned copy is playing Type (their laptop screen flickers)
export const EXTRAS_PER_ROOM = 6
const seatKey = (c) => `${c.x.toFixed(2)},${c.z.toFixed(2)}`
if (LIFE_ON)
  for (const d of DRUMS) {
    const r = lifeRand(7000 + Number(d.id))
    const chairs = CHAIRS.filter((c) => c.room === d.id)
    const rows = [...new Set(chairs.map((c) => c.y || 0))].sort((a, b) => a - b)
    const frontY = rows[Math.min(1, rows.length - 1)]
    const isFront = (s) => s.seatY <= frontY + 1e-6
    const mine = STUDENTS.filter((s) => s.room === d.id).sort(() => r() - 0.5)
    const front = mine.filter(isFront)
    const pick = [...front.filter((s) => s.prop === 'laptop'), ...front.filter((s) => s.prop !== 'laptop')].slice(0, EXTRAS_PER_ROOM)
    if (pick.length < EXTRAS_PER_ROOM) {
      const taken = new Set(mine.map(seatKey))
      const free = chairs.filter((c) => (c.y || 0) <= frontY + 1e-6 && !taken.has(seatKey(c))).sort(() => r() - 0.5)
      const movers = mine.filter((s) => !isFront(s)).sort((a, b) => (b.prop === 'laptop') - (a.prop === 'laptop'))
      while (pick.length < EXTRAS_PER_ROOM && free.length && movers.length) {
        const s = movers.shift()
        const c = free.shift()
        Object.assign(s, { x: c.x, z: c.z, seatY: c.y || 0, y: (c.y || 0) + 0.51 - 0.11 * HEIGHT, rot: c.rot + Math.PI })
        pick.push(s)
      }
    }
    for (const s of pick) s.extra = true
  }

const V = new THREE.Vector3()
const S = new THREE.Vector3()
const Q = new THREE.Quaternion()
const E = new THREE.Euler()
const compose = (p, ry, s = [1, 1, 1]) => new THREE.Matrix4().compose(V.set(...p), Q.setFromEuler(E.set(0, ry, 0)), S.set(...s))

// one InstancedMesh per (variant, material primitive); only Fur and Shirt take per-instance color.
// `shells` > 1 draws the fur shells: the items repeat once per shell (shell-major), see shellMaterial.
const CAM = new THREE.Vector3()
function Batch({ geometry, material, items, colorKey, shells = 1, shadow = true, room = null }) {
  const ref = useRef()
  useFrame(() => room && (ref.current.visible = !(LIFE.on && LIVE.has(room))))
  useLayoutEffect(() => {
    const im = ref.current
    const c = new THREE.Color()
    for (let k = 0; k < shells; k++)
      items.forEach((it, i) => {
        im.setMatrixAt(k * items.length + i, it.m)
        if (colorKey) im.setColorAt(k * items.length + i, c.set(it[colorKey]))
      })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.computeBoundingSphere()
    if (shells > 1) {
      // one shell batch per room: fewer shells with distance from the room, none past about 20 m
      const sph = im.boundingSphere
      im.onBeforeRender = (r, sc, cam) => {
        const d = Math.max(0, cam.getWorldPosition(CAM).distanceTo(sph.center) - sph.radius * 0.6)
        const k = d < 6 ? shells : d < 12 ? Math.ceil(shells / 2) : d < 20 ? 2 : 0
        im.count = items.length * k
        material.userData.fur.uShellCount.value = Math.max(k, 1)
      }
    }
  }, [items, colorKey, shells, material])
  return <instancedMesh ref={ref} args={[geometry, material, items.length * shells]} castShadow={shadow} receiveShadow />
}

function Crowd() {
  const { scene } = useModel('labubu_seated')
  const batches = useMemo(() => {
    scene.updateMatrixWorld(true)
    const out = []
    for (const face of ['grin', 'surprised', 'sleepy'])
      for (const clothes of ['tee', 'hoodie']) {
        const node = scene.getObjectByName(`seated_${face}_${clothes}`)
        const who = STUDENTS.filter((s) => s.face === face && s.clothes === clothes)
        if (!node || !who.length) continue
        const items = who.map((s) => ({ m: compose([s.x, s.y, s.z], s.rot, [HEIGHT, HEIGHT, HEIGHT]), fur: s.fur, shirt: s.shirt }))
        node.traverse((m) => {
          if (!m.isMesh) return
          const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld)
          const name = m.material.name
          const material = dressMaterial(m.material.clone())
          const colorKey = name === 'Fur' ? 'fur' : name === 'Shirt' ? 'shirt' : null
          if (colorKey) material.color.set('#ffffff') // instance color carries the tint
          // batched per room, so rooms outside the view are frustum-culled (the subdivided seated
          // students are about 4.6k triangles each, 240 of them)
          const cfg = FUR[name] && { ...FUR[name], shells: CROWD_SHELLS, len: FUR[name].len * 0.8 }
          for (const room of new Set(who.map((s) => s.room)))
            for (const extra of [false, true]) {
              // the extras get their own batch per room, hidden while the room is live (their skinned copies draw)
              const mine = items.filter((_, k) => who[k].room === room && !!who[k].extra === extra)
              if (!mine.length) continue
              const tag = `${room}${extra ? '-x' : ''}`
              const hide = extra ? room : null
              out.push({ key: `${face}-${clothes}-${m.name}-${tag}`, geometry, material, items: mine, colorKey, room: hide })
              if (FUR_ON && cfg) {
                // seated students are 4 m or more away: fewer, shorter shells than the walking Labubus
                const shell = shellMaterial(material, cfg, { items: mine.length, clothes: clothes === 'tee' ? 1 : 2 })
                out.push({ key: `${face}-${clothes}-${m.name}-shells-${tag}`, geometry, material: shell, items: mine, colorKey, shells: CROWD_SHELLS, shadow: false, room: hide })
              }
            }
        })
      }
    return out
  }, [scene])
  return batches.map(({ key, ...b }) => <Batch key={key} {...b} />)
}

// desk props: laptops and coffee cups on the desk 0.5 m in front of the student (desk top at seat floor + 0.95)
const BOX = new THREE.BoxGeometry(1, 1, 1)
const CUP = new THREE.CylinderGeometry(0.04, 0.032, 0.11, 14)
const SLEEVE = new THREE.CylinderGeometry(0.0415, 0.037, 0.045, 14)
const LID = new THREE.CylinderGeometry(0.043, 0.043, 0.012, 14)
const PROP_MATS = {
  base: new THREE.MeshStandardMaterial({ color: '#b9bcc2', metalness: 0.6, roughness: 0.35 }),
  screen: new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.7, roughness: 0.3 }),
  cup: new THREE.MeshStandardMaterial({ color: '#f5f2ea', roughness: 0.6 }),
  sleeve: new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.9 }),
  lid: new THREE.MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.5 }),
}
function DeskProps() {
  const sets = useMemo(() => {
    const out = { base: [], screen: [], cup: [], sleeve: [], lid: [] }
    for (const s of STUDENTS) {
      if (!s.prop) continue
      const f = [Math.sin(s.rot), Math.cos(s.rot)] // the student's forward
      const rgt = [Math.cos(s.rot), -Math.sin(s.rot)]
      const top = s.seatY + 0.95
      const at = (fwd, side, y) => [s.x + f[0] * fwd + rgt[0] * side, y, s.z + f[1] * fwd + rgt[1] * side]
      if (s.prop === 'laptop') {
        out.base.push(compose(at(0.5, 0, top + 0.01), s.rot, [0.3, 0.018, 0.21]))
        // lid hinged at the far edge, tilted back toward the front of the room, low enough not to hide the face
        const m = compose(at(0.6, 0, top + 0.02), s.rot)
          .multiply(new THREE.Matrix4().makeRotationX(0.45))
          .multiply(new THREE.Matrix4().makeTranslation(0, 0.07, 0))
          .multiply(new THREE.Matrix4().makeScale(0.3, 0.14, 0.01))
        out.screen.push(m)
      } else {
        const side = 0.14 * s.side
        out.cup.push(compose(at(0.48, side, top + 0.055), s.rot))
        out.sleeve.push(compose(at(0.48, side, top + 0.055), s.rot))
        out.lid.push(compose(at(0.48, side, top + 0.112), s.rot))
      }
    }
    return out
  }, [])
  const geo = { base: BOX, screen: BOX, cup: CUP, sleeve: SLEEVE, lid: LID }
  return Object.entries(sets).map(([k, ms]) => <Batch key={k} geometry={geo[k]} material={PROP_MATS[k]} items={ms.map((m) => ({ m }))} />)
}

// laptop screens: a lit panel on the student-facing side of every lid. Each frame the panel brightness moves a
// little (scrolling); a student whose skinned copy is typing makes theirs flicker with the keystrokes.
const GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
const GLOW_GEO = new THREE.PlaneGeometry(1, 1)
const SCREEN = new THREE.Color('#bcd6ff')
function LaptopGlow() {
  const ref = useRef()
  const items = useMemo(
    () =>
      STUDENTS.filter((s) => s.prop === 'laptop').map((s, i) => {
        const f = [Math.sin(s.rot), Math.cos(s.rot)]
        const top = s.seatY + 0.95
        // same hinge as the lid in DeskProps, then 6 mm toward the student, turned to face them
        const m = compose([s.x + f[0] * 0.6, top + 0.02, s.z + f[1] * 0.6], s.rot)
          .multiply(new THREE.Matrix4().makeRotationX(0.45))
          .multiply(new THREE.Matrix4().makeTranslation(0, 0.07, -0.0058))
          .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
          .multiply(new THREE.Matrix4().makeScale(0.27, 0.12, 1))
        return { m, s, seed: i * 1.37 }
      }),
    [],
  )
  useLayoutEffect(() => {
    items.forEach((it, i) => ref.current.setMatrixAt(i, it.m))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const im = ref.current
    items.forEach((it, i) => {
      if (!LIVE.has(it.s.room) && im.instanceColor) return
      let k = 0.55 + 0.05 * Math.sin(t * 0.7 + it.seed)
      if (TYPING.has(it.s)) {
        // keystrokes: a fast stutter, with a brighter flash now and then (a new line)
        const q = Math.floor(t * 14 + it.seed * 10)
        const h = Math.sin(q * 12.9898 + it.seed) * 43758.5453
        k = 0.62 + 0.22 * (h - Math.floor(h)) + (q % 23 === 0 ? 0.3 : 0)
      }
      im.setColorAt(i, c.copy(SCREEN).multiplyScalar(k))
    })
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[GLOW_GEO, GLOW_MAT, items.length]} />
}

function LifeGroup() {
  const ref = useRef()
  useFrame(() => (ref.current.visible = LIFE.on))
  return (
    <group ref={ref}>
      <LaptopGlow />
      <ClassroomLife />
    </group>
  )
}

export default function LabubuCrowd() {
  return (
    <Suspense fallback={null}>
      <Crowd />
      <DeskProps />
      {LIFE_ON && <LifeGroup />}
    </Suspense>
  )
}
