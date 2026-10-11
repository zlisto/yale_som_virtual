import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { angleTo, rand, sfx, smooth, timed, turnToward, useLabubuRig } from './common.js'
import { fx } from './fx.jsx'
import { RANGE, Y } from './courtyardLayout.js'
import { CAST_EVERY, CHIME_LEVEL, FLICK, STUDENT_SCALE, TeacherModel, WAND_TIP, glowTex, lookOf, wand } from './SpellSchool.jsx'

// Lockhart's long-range class along the whole west side of the lawn (Lan, round 4: "perhaps one of the lessons
// could be spread out across a whole side for example like casting long distance magic"). Lockhart stands on his
// floating paver at the south end of the line; five students stand 4 m apart down the west edge, each casting at
// one of the targets on the north edge 15 to 23 m away: two floating wooden rings, a suit of armour and a
// scarecrow. A cast sends a thin glowing bolt across the lawn in 0.6 s on a low arc (it clears Hagrid). A hit
// makes the target glow and spin or rock; one cast in three misses, the bolt sails past and fizzles on the grass.
// Cast timing follows SpellSchool.jsx (every 12 to 20 s). This class chimes on one cast in six at half volume,
// sparser than the one in four of the other classes because its five students cast along the whole lawn.
const RANGE_CHIME_EVERY = 6
const BOLT_T = 0.6
const MISS = 1 / 3
const COLORS = ['#ffd36b', '#ff86d2', '#7fd8ff', '#b99bff', '#9dffb8']

// dev counters for headless checks (window.__life.rangeStats)
const STATS = { casts: 0, hits: 0, misses: 0, flying: 0 }

const G_TEACH = { gi: 3, who: RANGE.who, P: RANGE.P, yaw: angleTo(RANGE.P, [RANGE.students[2][0] + 1, RANGE.students[2][1]]) }

// ---------- targets
const WOOD = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.75 })
const POST = new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.85 })
const STEEL = new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.3, metalness: 0.9 })
const BURLAP = new THREE.MeshStandardMaterial({ color: '#c8a874', roughness: 0.95 })
const STRAW = new THREE.MeshStandardMaterial({ color: '#d9b955', roughness: 0.9 })
const PLAID = new THREE.MeshStandardMaterial({ color: '#a33a2e', roughness: 0.9 })
const DENIM = new THREE.MeshStandardMaterial({ color: '#3b5577', roughness: 0.9 })

function mesh(geo, mat, [x, y, z] = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(...rot)
  m.castShadow = true
  return m
}
// every target gets private copies of its materials, so a hit glows on that target alone
function ownMaterials(g) {
  const out = []
  const seen = new Map()
  g.traverse((m) => {
    if (!m.isMesh) return
    if (!seen.has(m.material)) {
      const c = m.material.clone()
      c.emissive = new THREE.Color(0, 0, 0)
      seen.set(m.material, c)
      out.push(c)
    }
    m.material = seen.get(m.material)
  })
  return out
}
function ring() {
  // a 1.1 m wooden hoop with four bindings, floating with its hole toward the class
  const g = new THREE.Group()
  const spin = new THREE.Group()
  spin.add(mesh(new THREE.TorusGeometry(0.55, 0.055, 10, 40), WOOD))
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4
    spin.add(mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), POST, [Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0], [0, Math.PI / 2, a]))
  }
  g.add(spin)
  g.userData.spin = spin
  return g
}
function armor() {
  // a suit of armour on a low wooden stand, about 1.9 m tall
  const g = new THREE.Group()
  const body = new THREE.Group()
  body.add(mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.12, 16), POST, [0, 0.06, 0]))
  for (const s of [-1, 1]) {
    body.add(mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.78, 10), STEEL, [s * 0.11, 0.53, 0])) // legs
    body.add(mesh(new THREE.BoxGeometry(0.13, 0.07, 0.22), STEEL, [s * 0.11, 0.155, 0.04])) // sabatons
    body.add(mesh(new THREE.SphereGeometry(0.075, 10, 8), STEEL, [s * 0.11, 0.55, 0.02])) // knees
    body.add(mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.62, 10), STEEL, [s * 0.3, 1.18, 0], [0, 0, s * 0.12])) // arms
    body.add(mesh(new THREE.SphereGeometry(0.11, 12, 8), STEEL, [s * 0.25, 1.5, 0])) // pauldrons
  }
  const torso = new THREE.LatheGeometry([[0.0, 0.9], [0.2, 0.9], [0.22, 1.0], [0.19, 1.12], [0.24, 1.35], [0.25, 1.5], [0.12, 1.58], [0.0, 1.58]].map(([x, y]) => new THREE.Vector2(x, y)), 18)
  torso.scale(1, 1, 0.75)
  body.add(mesh(torso, STEEL))
  body.add(mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.22, 14), STEEL, [0, 1.7, 0])) // helm
  body.add(mesh(new THREE.SphereGeometry(0.13, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), STEEL, [0, 1.81, 0]))
  body.add(mesh(new THREE.BoxGeometry(0.18, 0.025, 0.02), new THREE.MeshStandardMaterial({ color: '#1a1a1c' }), [0, 1.73, 0.135])) // visor slit
  body.add(mesh(new THREE.ConeGeometry(0.03, 0.22, 8), PLAID, [0, 2.0, 0])) // plume
  g.add(body)
  g.userData.rock = body
  return g
}
function scarecrow() {
  // a post with a crossbar, a stuffed shirt, a sack head and a straw hat, about 2.2 m tall
  const g = new THREE.Group()
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.0, 8), POST, [0, 1.0, 0]))
  const spin = new THREE.Group()
  spin.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8), POST, [0, 1.45, 0], [0, 0, Math.PI / 2]))
  spin.add(mesh(new THREE.BoxGeometry(0.5, 0.55, 0.26), PLAID, [0, 1.3, 0]))
  spin.add(mesh(new THREE.BoxGeometry(1.25, 0.16, 0.18), PLAID, [0, 1.45, 0]))
  spin.add(mesh(new THREE.BoxGeometry(0.46, 0.4, 0.24), DENIM, [0, 0.9, 0]))
  for (const s of [-1, 1]) spin.add(mesh(new THREE.ConeGeometry(0.07, 0.2, 6), STRAW, [s * 0.68, 1.45, 0], [0, 0, s * Math.PI / 2])) // straw cuffs
  spin.add(mesh(new THREE.SphereGeometry(0.2, 14, 10), BURLAP, [0, 1.78, 0]))
  spin.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 20), STRAW, [0, 1.93, 0], [0.12, 0, 0.05]))
  spin.add(mesh(new THREE.ConeGeometry(0.16, 0.26, 16), STRAW, [0, 2.06, 0], [0.12, 0, 0.05]))
  const eye = new THREE.MeshStandardMaterial({ color: '#2a1f18' })
  for (const s of [-1, 1]) spin.add(mesh(new THREE.SphereGeometry(0.025, 6, 4), eye, [s * 0.07, 1.82, 0.18]))
  g.add(spin)
  g.userData.spin = spin
  return g
}
const MAKERS = { ring, armor, scarecrow }

// ---------- the bolts: one per student, a stretched glowing capsule with a soft glow at its head and a trail of
// eight fading glows behind it
const TRAIL = 8
const BOLT_GEO = (() => {
  const g = new THREE.CapsuleGeometry(0.045, 1.0, 3, 8)
  g.rotateX(Math.PI / 2) // long axis along z
  return g
})()
function makeBolt(color) {
  const c = new THREE.Color(color)
  const core = new THREE.Mesh(BOLT_GEO, new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color('#ffffff'), 0.35).multiplyScalar(1.6), toneMapped: false }))
  const glowMat = (o) => new THREE.SpriteMaterial({ map: glowTex(), color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  const head = new THREE.Sprite(glowMat(1))
  head.scale.set(0.9, 0.9, 1)
  const g = new THREE.Group()
  g.add(core, head)
  g.visible = false
  const trail = Array.from({ length: TRAIL }, (_, k) => {
    const sp = new THREE.Sprite(glowMat(0.75 * (1 - k / TRAIL)))
    const sz = 0.55 * (1 - k / (TRAIL + 2))
    sp.scale.set(sz, sz, 1)
    sp.visible = false
    return sp
  })
  g.userData.trail = trail
  return g
}

// where a bolt is u of the way along its flight: a straight line from `a` to `b`, lifted by an arc
const _p = new THREE.Vector3()
const _q = new THREE.Vector3()
function along(f, u, out) {
  out.lerpVectors(f.a, f.b, u)
  out.y += f.arc * 4 * u * (1 - u)
  return out
}

function Targets({ T }) {
  const objs = useMemo(
    () =>
      RANGE.targets.map((t, k) => {
        const o = MAKERS[t.kind]()
        o.position.set(t.p[0], Y + t.h, t.p[1])
        // face the middle of the student line
        o.rotation.y = angleTo(t.p, RANGE.students[2])
        o.userData.mats = ownMaterials(o)
        o.userData.base = o.rotation.y
        T[k] = { hitAt: -10, color: new THREE.Color('#ffffff') }
        return o
      }),
    [T],
  )
  useFrame(
    timed(({ clock }) => {
      const t = clock.elapsedTime
      objs.forEach((o, k) => {
        const s = T[k]
        const u = t - s.hitAt
        const kind = RANGE.targets[k].kind
        if (kind === 'ring') o.position.y = Y + RANGE.targets[k].h + 0.08 * Math.sin(t * 1.1 + k * 2)
        const glow = u < 2 ? Math.exp(-u * 3) : 0
        for (const m of o.userData.mats) m.emissive.copy(s.color).multiplyScalar(glow * 0.9)
        // a hit spins the rings and the scarecrow about the vertical (fast, then slowing) and rocks the armour
        // two full turns with an ease-out over 3.2 s, ending where it started
        const x = Math.min(1, Math.max(0, u) / 3.2)
        if (o.userData.spin) o.userData.spin.rotation.y = (s.dir || 1) * Math.PI * 4 * (1 - (1 - x) ** 3)
        if (o.userData.rock) o.userData.rock.rotation.z = u < 3 ? 0.14 * Math.exp(-u * 1.4) * Math.sin(u * 11) : 0
      })
    }),
  )
  return objs.map((o, k) => <primitive key={k} object={o} />)
}

function Student({ i, G, T, bolt }) {
  const look = useMemo(() => lookOf(3, i), [i])
  const rig = useLabubuRig(look)
  const root = useRef()
  const p = RANGE.students[i]
  const st = useMemo(() => {
    const r = rand(900 + i * 31)
    r()
    r()
    // targets this student can reach
    const ok = RANGE.targets.map((t, k) => (Math.hypot(t.p[0] - p[0], t.p[1] - p[1]) >= RANGE.reach[0] && Math.hypot(t.p[0] - p[0], t.p[1] - p[1]) <= RANGE.reach[1] ? k : -1)).filter((k) => k >= 0)
    return { r, ok, target: ok[0], next: 2 + i * 2.6 + r() * 6, castAt: -1, fly: null }
  }, [i, p])
  const w = useMemo(() => wand(), [])
  useMemo(() => rig.bones.armR?.add(w), [rig, w])
  useFrame(
    timed((state, dt) => {
      dt = Math.min(dt, 0.05)
      const t = state.clock.elapsedTime
      const r = st.r
      if (t > st.next && st.castAt < 0) {
        st.target = st.ok[Math.floor(r() * st.ok.length)]
        st.castAt = t
        st.miss = r() < MISS
        rig.play('Cast', { once: true, fade: 0.15 })
        G.pointAt = t
        G.pointTo = p
      }
      const tg = RANGE.targets[st.target]
      const aim = angleTo(p, tg.p)
      if (st.castAt >= 0 && t - st.castAt > FLICK) {
        // launch: from the wand tip to the target's middle, or past it on a miss
        const b = rig.bones.armR
        if (b && w.parent === b) b.localToWorld(_p.copy(WAND_TIP))
        else _p.set(p[0], Y + 1.0, p[1])
        const mid = tg.kind === 'ring' ? 0 : tg.kind === 'armor' ? 1.25 : 1.4
        const end = new THREE.Vector3(tg.p[0], Y + tg.h + mid, tg.p[1])
        if (st.miss) {
          // wide by 1.2 to 2 m, a little long, and down into the grass
          const side = r() < 0.5 ? -1 : 1
          const dx = end.x - _p.x
          const dz = end.z - _p.z
          const l = Math.hypot(dx, dz)
          const off = side * (1.2 + r() * 0.8)
          end.x += (-dz / l) * off + (dx / l) * 2.2
          end.z += (dx / l) * off + (dz / l) * 2.2
          end.y = Y + 0.05
        }
        st.fly = { a: _p.clone(), b: end, t0: t, arc: 1.4, k: st.target, miss: st.miss }
        bolt.visible = true
        STATS.casts++
        STATS.flying++
        G.casts++
        if (G.casts % RANGE_CHIME_EVERY === 1) sfx.cast(_p.x, _p.y, _p.z, false, CHIME_LEVEL)
        st.castAt = -1
        st.next = t + CAST_EVERY[0] + r() * (CAST_EVERY[1] - CAST_EVERY[0])
      }
      // the bolt in flight
      if (st.fly) {
        const f = st.fly
        const u = (t - f.t0) / BOLT_T
        if (u >= 1) {
          const e = [f.b.x, f.b.y, f.b.z]
          if (f.miss) fx.smoke(e, { count: 10, size: 0.35, life: 0.9, speed: 0.4, up: 0.3 })
          else {
            const s = T[f.k]
            s.hitAt = t
            s.color.set(COLORS[i])
            s.dir = r() < 0.5 ? -1 : 1
            fx.sparks(e, { count: 18, colors: [COLORS[i], '#ffffff'], size: 0.08, speed: 1.0, up: 0.3, life: 0.6 })
          }
          bolt.visible = false
          for (const sp of bolt.userData.trail) sp.visible = false
          st.fly = null
          STATS.flying--
          STATS[f.miss ? 'misses' : 'hits']++
        } else {
          const e = smooth(Math.min(1, u * 1.05)) * 0.25 + u * 0.75 // a touch of ease at launch
          along(f, e, bolt.position)
          along(f, Math.min(1, e + 0.02), _q)
          bolt.lookAt(_q)
          bolt.userData.trail.forEach((sp, k) => {
            const v = e - (k + 1) * 0.035
            sp.visible = v > 0
            if (v > 0) along(f, v, sp.position)
          })
        }
      }
      if (st.castAt < 0 && rig.clip === 'Cast' && rig.actions.Cast.time >= rig.actions.Cast.getClip().duration - 0.01) rig.play('Idle', { fade: 0.4 })
      if (rig.clip !== 'Cast' && rig.clip !== 'Idle') rig.play('Idle', { fade: 0.3 })
      turnToward(root.current, aim, dt * 6)
      rig.tick(dt, state, 45, 48)
    }),
  )
  return (
    <group ref={root} position={[p[0], Y, p[1]]} rotation={[0, angleTo(p, RANGE.targets[st.target].p), 0]} scale={STUDENT_SCALE}>
      <primitive object={rig.object} />
    </group>
  )
}

export default function CourtyardRange() {
  const G = useMemo(() => ({ casts: 0, pointAt: -10, pointTo: null }), [])
  const T = useMemo(() => [], [])
  const bolts = useMemo(() => RANGE.students.map((_, i) => makeBolt(COLORS[i])), [])
  if (import.meta.env.DEV && typeof window !== 'undefined') (window.__life ||= {}).range = { stats: STATS, P: RANGE.P, students: RANGE.students, targets: RANGE.targets.map((t) => t.p) }
  return (
    <group>
      <Suspense fallback={null}>
        <TeacherModel g={G_TEACH} G={G} />
      </Suspense>
      <Targets T={T} />
      {RANGE.students.map((_, i) => (
        <Student key={i} i={i} G={G} T={T} bolt={bolts[i]} />
      ))}
      {bolts.map((b, i) => (
        <primitive key={i} object={b} />
      ))}
      {bolts.flatMap((b, i) => b.userData.trail.map((sp, k) => <primitive key={`${i}-${k}`} object={sp} />))}
    </group>
  )
}
