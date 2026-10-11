import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RIM_GLSL, useRigInstance } from '../characters/rig.js'
import { angleTo, rand, sfx, smooth, timed, turnToward, useLabubuRig } from './common.js'
import { fx } from './fx.jsx'
import { SCHOOL_GROUPS } from './courtyardLayout.js'

// Spell school on the courtyard lawn: each class a professor on a low floating paver facing Labubu students in a
// half circle. The professor stands on the glass side of the class, so from the nearest cloister you see the
// students' faces. Round 4 spread the classes out (positions in courtyardLayout.js): Flitwick near the north-east
// glass, McGonagall by the fountain's east side; Snape's Lumos class sits on a blanket near the south glass
// (CourtyardLumos.jsx) and Lockhart's class casts across the lawn from the west edge (CourtyardRange.jsx), both
// built from the pieces exported at the end of this file. The Snape and Lockhart branches below stay for any
// group configured with those spells.
//   Flitwick, Wingardium Leviosa: each student's feather or small book rises 1.5 m, wobbles and settles
//   McGonagall, Transfiguration: one teacup on a stand turns into a small bird and back, one student at a time
//   Snape, Lumos: wand tips light with a soft pulsing white glow that lights the students' faces from below
//   Lockhart, Expelliarmus: a student disarms a classmate, the wand arcs to the grass and its owner fetches it
// Every student casts on its own seeded rhythm, every 12 to 20 s (the Cast clip; 5 to 9 s until round four,
// when Lan found the casts too frequent). One cast in five fizzles: a small grey puff and a surprised face,
// with no sound. Only one cast in four per class chimes, at half volume, and the Lumos class is silent. The
// professor plays Point when a student starts a cast, and between casts loops Lecture, WandRaise and Point,
// with a Nod every other loop. The effects stay small on purpose: Lan asked that the lawn not be full of flashes.
const CAST_EVERY = [12, 20] // seconds between one student's casts
const CHIME_EVERY = 4 // one cast in four per class plays the chime
const CHIME_LEVEL = 0.5
const Y = -5
const S = 1.1 // student scale (1 is about 1.15 m to the ear tips)
const PAVER_LIFT = 0.45
const FLICK = 10 / 30 // seconds into Cast when the wand snaps forward

// professor spot, a point the class lies toward, the student count, the arc radius and half-width: life/courtyardLayout.js
// SCHOOL_GROUPS (round 4: Flitwick moves to the north-east as a tight group, McGonagall to a clearing east of the
// fountain with three students; Snape's Lumos class and Lockhart's long-range class are CourtyardLumos.jsx and
// CourtyardRange.jsx). Every student stands at least 1.8 m from the courtyard trees (render/Scenery.jsx COURT_TREES).
const GROUPS = SCHOOL_GROUPS.map((g, gi) => {
  const yaw = angleTo(g.P, g.toward)
  const spread = g.spread ?? (g.n === 5 ? 1.25 : 1.0) // half-width of the arc in radians
  const R = g.R ?? 2.7
  const students = Array.from({ length: g.n }, (_, i) => {
    const a = yaw + spread * ((2 * i) / (g.n - 1) - 1)
    return { gi, i, p: [g.P[0] + R * Math.sin(a), g.P[1] + R * Math.cos(a)] }
  })
  return { ...g, gi, yaw, students }
})

const FURS = ['#bba7e8', '#3a3a3e', '#9fe0c6', '#f2b36b', '#ff9ccc', '#7fb2ff', '#c98f6b', '#f2efe9', '#8d8d93', '#d9c2a0', '#5a3d2e', '#ff8fc7']
const SHIRTS = ['yale', '#ff4fa3', '#5b3f8c', '#2f7fd8', 'stripes', '#7a9e7e', '#ffffff', '#a6192e', null]
const EXPR = ['grin', 'happy', 'mischief', 'grin', 'happy']
// picked by index (nearby LCG seeds give nearly the same first draw, which made every student white)
function lookOf(gi, i) {
  const k = gi * 5 + i
  return { fur: FURS[(k * 5) % FURS.length], shirt: SHIRTS[(k * 4 + gi) % SHIRTS.length], expression: EXPR[k % EXPR.length] }
}

// ---------- props
const WAND_MAT = new THREE.MeshStandardMaterial({ color: '#3b2516', roughness: 0.6 })
const TIP_MAT = new THREE.MeshBasicMaterial({ color: '#fff4d6', toneMapped: false })
const WAND_GEO = new THREE.CylinderGeometry(0.008, 0.013, 0.34, 8)
const TIP_GEO = new THREE.SphereGeometry(0.014, 8, 6)
const WAND_TIP = new THREE.Vector3(0, 0.53, 0.03) // in the right arm bone's frame (Y runs down the arm)
function wand() {
  const g = new THREE.Group()
  const stick = new THREE.Mesh(WAND_GEO, WAND_MAT)
  stick.position.y = 0.36
  stick.castShadow = true
  const tip = new THREE.Mesh(TIP_GEO, TIP_MAT)
  tip.position.y = 0.53
  g.add(stick, tip)
  g.position.z = 0.03
  return g
}

const STONE = new THREE.MeshStandardMaterial({ color: '#b7b2a8', roughness: 0.92 })
const COVER = [new THREE.MeshStandardMaterial({ color: '#7a1f2b', roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: '#1f4a7a', roughness: 0.7 })]
const PAGES = new THREE.MeshStandardMaterial({ color: '#f1ead8', roughness: 0.9 })
const FEATHER = new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.85, side: THREE.DoubleSide })
const FEATHER_GEO = (() => {
  // a 0.34 m feather lying flat: a narrow vane either side of the quill, the tip toward +z
  const s = new THREE.Shape()
  s.moveTo(0, -0.17)
  s.quadraticCurveTo(0.06, -0.05, 0.035, 0.1)
  s.quadraticCurveTo(0.015, 0.16, 0, 0.17)
  s.quadraticCurveTo(-0.03, 0.12, -0.045, 0.02)
  s.quadraticCurveTo(-0.04, -0.09, 0, -0.17)
  const g = new THREE.ShapeGeometry(s, 6)
  g.rotateX(-Math.PI / 2)
  return g
})()
function levitee(kind, k) {
  const g = new THREE.Group()
  if (kind === 'feather') {
    const m = new THREE.Mesh(FEATHER_GEO, FEATHER)
    m.position.y = 0.01
    g.add(m)
  } else {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.27), COVER[k % 2])
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.188, 0.038, 0.262), PAGES)
    c.position.y = 0.025
    p.position.set(0.01, 0.025, 0)
    g.add(c, p)
  }
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  return g
}

const CHINA = new THREE.MeshStandardMaterial({ color: '#f7f5ef', roughness: 0.25 })
const CHINA_RIM = new THREE.MeshStandardMaterial({ color: '#2a5aa8', roughness: 0.3 })
function cupStand() {
  // a slim stone stand 0.8 m tall with a teacup and saucer on top
  const g = new THREE.Group()
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.8, 12), STONE)
  post.position.y = 0.4
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 20), STONE)
  top.position.y = 0.82
  const cup = new THREE.Group()
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.015, 20), CHINA)
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.1, 20), CHINA)
  bowl.position.y = 0.06
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, 6, 24), CHINA_RIM)
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.11
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12, Math.PI), CHINA)
  handle.position.set(0.08, 0.06, 0)
  handle.rotation.z = -Math.PI / 2
  cup.add(saucer, bowl, rim, handle)
  cup.position.y = 0.85
  g.add(post, top, cup)
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  g.userData.cup = cup
  return g
}

// a small bird drawn on a canvas, wings up and wings down, flapped by swapping the texture
function birdTex(up) {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')
  g.fillStyle = '#5b7fb5'
  g.beginPath()
  g.ellipse(48, 56, 20, 13, -0.15, 0, Math.PI * 2) // body
  g.fill()
  g.beginPath()
  g.arc(68, 46, 10, 0, Math.PI * 2) // head
  g.fill()
  g.fillStyle = '#f0b43c'
  g.beginPath()
  g.moveTo(77, 44)
  g.lineTo(88, 47)
  g.lineTo(77, 50)
  g.fill() // beak
  g.fillStyle = '#fff'
  g.beginPath()
  g.arc(71, 44, 2.6, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#1a1a1a'
  g.beginPath()
  g.arc(71.5, 44, 1.3, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#3f5f93'
  g.beginPath()
  g.moveTo(30, 60)
  g.lineTo(14, 66)
  g.lineTo(32, 52)
  g.fill() // tail
  g.beginPath()
  if (up) {
    g.moveTo(40, 50)
    g.quadraticCurveTo(34, 18, 58, 12)
    g.quadraticCurveTo(54, 34, 56, 50)
  } else {
    g.moveTo(40, 58)
    g.quadraticCurveTo(36, 86, 60, 90)
    g.quadraticCurveTo(54, 72, 56, 58)
  }
  g.fill() // wing
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
const glowTex = (() => {
  let t = null
  return () => {
    if (t) return t
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.3, 'rgba(240,246,255,0.55)')
    gr.addColorStop(1, 'rgba(220,235,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
    t = new THREE.CanvasTexture(c)
    return t
  }
})()

// Lumos: the student's fur and face pick up a cool white light from below (normals facing down get the most),
// scaled by uLumos. Added to the same emissive slot as the rim term from rig.js.
function lumosMaterials(rig) {
  const u = { value: 0 }
  const swapped = new Map()
  rig.object.traverse((m) => {
    if (!m.isMesh || !m.material || !['Fur', 'Skin'].includes(m.material.name)) return
    if (!swapped.has(m.material)) {
      const base = m.material
      const c = base.name === 'Skin' ? base.clone() : base // Fur is already this rig's own copy, Skin is shared
      const rim = base.userData.rim || { uRim: { value: 0.16 }, uRimColor: { value: new THREE.Color(1.0, 0.5, 0.38) } }
      c.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, rim, { uLumos: u })
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;\nuniform float uLumos;')
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>${RIM_GLSL}
  totalEmissiveRadiance += vec3(0.92, 0.96, 1.0) * diffuseColor.rgb * uLumos * clamp(0.25 - normal.y, 0.0, 1.0);`,
          )
      }
      c.customProgramCacheKey = () => 'rim-lumos'
      c.needsUpdate = true
      swapped.set(base, c)
    }
    m.material = swapped.get(m.material)
  })
  return u
}

// ---------- a student
const _v = new THREE.Vector3()
const _q = new THREE.Quaternion()
function Student({ g, s, G }) {
  const look = useMemo(() => lookOf(s.gi, s.i), [s])
  const rig = useLabubuRig(look)
  const root = useRef()
  const st = useMemo(() => {
    const r = rand(300 + s.gi * 97 + s.i * 13)
    r()
    r() // nearby seeds: the first draws are nearly equal, so discard two
    const yaw = angleTo(s.p, g.P)
    const f = [Math.sin(yaw), Math.cos(yaw)]
    return { r, yaw, f, next: 1.5 + s.i * 2.5 + r() * 6, castAt: -1, fail: false, surprisedUntil: 0, effect: null, pos: [...s.p], task: null }
  }, [s, g])
  const w = useMemo(() => wand(), [])
  const extra = useMemo(() => {
    rig.bones.armR?.add(w)
    const out = {}
    if (g.spell === 'leviosa') {
      out.obj = levitee(s.i % 2 ? 'book' : 'feather', s.i)
      out.home = [s.p[0] + st.f[0] * 0.95, s.p[1] + st.f[1] * 0.95]
    }
    if (g.spell === 'lumos') {
      out.lumos = lumosMaterials(rig)
      out.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#f4f8ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
      out.glow.renderOrder = 6
    }
    return out
  }, [rig, w, g.spell, s, st])
  G.students[s.i] = st

  const wandTip = (out) => {
    const b = rig.bones.armR
    if (b && w.parent === b) b.localToWorld(out.copy(WAND_TIP))
    else out.set(st.pos[0], Y + 0.9, st.pos[1])
    return out
  }

  useFrame(
    timed((state, dt) => {
      dt = Math.min(dt, 0.05)
      const t = state.clock.elapsedTime
      const o = root.current
      const r = st.r

      // ---- Expelliarmus: disarmed students fetch their wand and walk back
      if (st.task) {
        const k = st.task
        const go = (to, speed) => {
          const dx = to[0] - st.pos[0]
          const dz = to[1] - st.pos[1]
          const d = Math.hypot(dx, dz)
          if (d < 0.05) return true
          const step = Math.min(d, speed * dt)
          st.pos[0] += (dx / d) * step
          st.pos[1] += (dz / d) * step
          turnToward(o, Math.atan2(dx, dz), dt * 8)
          rig.play('Walk', { timeScale: 1.2 })
          return false
        }
        if (k.phase === 'fly') {
          const u = (t - k.t0) / 0.9
          if (u >= 1) {
            w.position.set(k.to[0], Y + 0.02, k.to[1])
            w.rotation.set(Math.PI / 2, k.spin, 0)
            k.phase = 'stare'
            k.t0 = t
          } else {
            w.position.set(k.from[0] + (k.to[0] - k.from[0]) * u, k.from[1] + (Y + 0.02 - k.from[1]) * u + 1.3 * 4 * u * (1 - u), k.from[2] + (k.to[1] - k.from[2]) * u)
            w.rotation.set(u * 14, k.spin, u * 5)
          }
          rig.play('Idle', { fade: 0.2 })
        } else if (k.phase === 'stare') {
          if (t - k.t0 > 0.6) k.phase = 'fetch'
        } else if (k.phase === 'fetch') {
          // stop 0.35 m short of the wand, facing it
          const d = Math.hypot(k.to[0] - st.pos[0], k.to[1] - st.pos[1])
          const stop = [k.to[0] - ((k.to[0] - st.pos[0]) / d) * 0.35, k.to[1] - ((k.to[1] - st.pos[1]) / d) * 0.35]
          if (go(stop, 1.5)) {
            k.phase = 'pick'
            k.t0 = t
            rig.play('Catch', { once: true, fade: 0.15 })
          }
        } else if (k.phase === 'pick') {
          if (t - k.t0 > 0.45 && w.parent !== rig.bones.armR) {
            w.position.set(0, 0, 0.03)
            w.rotation.set(0, 0, 0)
            w.scale.setScalar(1)
            rig.bones.armR?.add(w)
          }
          if (t - k.t0 > 0.9) k.phase = 'home'
        } else if (k.phase === 'home') {
          if (go(s.p, 1.3)) {
            st.task = null
            st.next = Math.max(st.next, t + 2 + r() * 3)
            rig.play('Idle', { fade: 0.3 })
          }
        }
        o.position.set(st.pos[0], Y, st.pos[1])
        rig.setFace(k.phase === 'fly' || k.phase === 'stare' ? 'surprised' : look.expression)
        rig.tick(dt, state, 45, 48)
        return
      }

      // ---- casting
      let aim = st.yaw
      if (t > st.next && st.castAt < 0) {
        let ok = true
        if (g.spell === 'transfig' && (G.cup.busyUntil > t || G.cup.caster >= 0)) ok = false
        if (g.spell === 'expelliarmus') {
          // pick a classmate who is holding a wand and standing at home
          const free = G.students.map((q, j) => (j !== s.i && q && !q.task && q.castAt < 0 ? j : -1)).filter((j) => j >= 0)
          if (free.length) st.target = free[Math.floor(r() * free.length)]
          else ok = false
        }
        if (ok) {
          st.castAt = t
          st.fail = r() < 0.2
          if (g.spell === 'transfig') G.cup.caster = s.i
          rig.play('Cast', { once: true, fade: 0.15 })
          G.pointAt = t
          G.pointTo = st.pos
        } else st.next = t + 1 + r() * 1.5
      }
      if (st.castAt >= 0 && g.spell === 'expelliarmus') {
        const q = G.students[st.target]
        if (q) aim = angleTo(st.pos, q.pos)
      }
      if (st.castAt >= 0 && t - st.castAt > FLICK) {
        const tip = wandTip(_v)
        const p = [tip.x, tip.y, tip.z]
        if (st.fail) {
          fx.smoke(p, { count: 12, size: 0.35, life: 1.1, speed: 0.4, up: 0.3 })
          st.surprisedUntil = t + 2
          if (g.spell === 'transfig') G.cup.caster = -1
        } else if (g.spell === 'leviosa') {
          st.effect = { t0: t + 0.2 }
          fx.sparks([extra.home[0], Y + 0.25, extra.home[1]], { count: 5, colors: ['#fff2c8', '#ffffff'], size: 0.06, speed: 0.3, up: 0.45, life: 1.6 })
        } else if (g.spell === 'transfig') {
          G.cup.turnAt = t + 0.25
          G.cup.busyUntil = t + 0.25 + 3.4 + 0.5
        } else if (g.spell === 'lumos') {
          st.effect = { t0: t, dur: 3.5 + r() * 2 }
        } else if (g.spell === 'expelliarmus') {
          const q = G.students[st.target]
          if (q && !q.task) q.disarm = { t: t + 0.18, from: st.pos }
        }
        // fizzles stay silent; a clean cast chimes once in four per class, never in the Lumos class
        G.casts++
        if (!st.fail && g.spell !== 'lumos' && G.casts % CHIME_EVERY === 1) sfx.cast(p[0], p[1], p[2], false, CHIME_LEVEL)
        st.castAt = -1
        st.next = t + CAST_EVERY[0] + r() * (CAST_EVERY[1] - CAST_EVERY[0])
      }
      // a classmate's Expelliarmus lands: a small flash at the paw, and the wand leaves it in an arc
      if (st.disarm && t > st.disarm.t) {
        const tip = wandTip(_v)
        fx.sparks([tip.x, tip.y, tip.z], { count: 12, colors: ['#ff5a4a', '#ffd0c0', '#ffffff'], size: 0.07, speed: 0.9, up: 0.3, life: 0.35 })
        const b = rig.bones.armR
        w.getWorldPosition(_v)
        w.getWorldQuaternion(_q)
        b?.remove(w)
        w.position.copy(_v)
        w.quaternion.copy(_q)
        w.scale.setScalar(S)
        root.current.parent.add(w)
        // away from the caster, 2 to 3 m, kept on this side of the class
        const away = Math.atan2(st.pos[0] - st.disarm.from[0], st.pos[1] - st.disarm.from[1]) + (r() - 0.5) * 0.8
        const d = 2 + r()
        st.task = { phase: 'fly', t0: t, from: [_v.x, _v.y, _v.z], to: [st.pos[0] + Math.sin(away) * d, st.pos[1] + Math.cos(away) * d], spin: r() * 6 }
        st.disarm = null
        st.castAt = -1
        rig.play('Idle', { fade: 0.1 })
      }
      // Lumos holds the end of the Cast pose (wand up and forward) while the tip is lit
      const holding = g.spell === 'lumos' && st.effect
      if (st.castAt < 0 && !holding && rig.clip === 'Cast' && rig.actions.Cast.time >= rig.actions.Cast.getClip().duration - 0.01) rig.play('Idle', { fade: 0.4 })
      if (rig.clip !== 'Cast' && rig.clip !== 'Idle') rig.play('Idle', { fade: 0.3 })
      rig.setFace(t < st.surprisedUntil ? 'surprised' : look.expression)
      turnToward(o, aim, dt * 6)
      o.position.set(st.pos[0], Y, st.pos[1])

      // ---- the spell's object
      if (extra.obj) {
        const m = extra.obj
        const feather = s.i % 2 === 0
        m.position.set(extra.home[0], Y, extra.home[1])
        m.rotation.set(0, st.yaw + s.i, 0)
        const e = st.effect
        if (e) {
          // up over 1.2 s, wobble at 1.5 m for 2.5 s, down over 1.4 s (a feather rocks on the way down)
          const u = t - e.t0
          let h = 0
          if (u < 0) h = 0
          else if (u < 1.2) h = smooth(u / 1.2)
          else if (u < 3.7) h = 1 + 0.05 * Math.sin((u - 1.2) * 4)
          else if (u < 5.1) h = 1 - smooth((u - 3.7) / 1.4)
          else st.effect = null
          const wob = u > 0 && u < 5.1 ? Math.min(1, u / 1.0) * Math.min(1, (5.1 - u) / 0.5) : 0
          m.position.y += h * 1.5
          m.rotation.x = (feather ? 0.35 : 0.15) * wob * Math.sin(u * (feather ? 2.2 : 3.1))
          m.rotation.z = (feather ? 0.3 : 0.12) * wob * Math.sin(u * 1.7 + 1)
          if (feather && u > 3.7) m.position.x += 0.12 * Math.sin(u * 3) * wob
        }
      }
      if (extra.glow) {
        const e = st.effect
        let k = 0
        if (e) {
          const u = t - e.t0
          if (u > e.dur + 0.6) st.effect = null
          else k = Math.min(1, u / 0.35) * (1 - smooth(Math.max(0, (u - e.dur) / 0.6))) * (0.8 + 0.2 * Math.sin(u * 4.5))
        }
        const tip = wandTip(_v)
        extra.glow.position.copy(tip)
        extra.glow.material.opacity = k * 0.9
        const sz = 0.12 + 0.16 * k
        extra.glow.scale.set(sz, sz, 1)
        extra.glow.visible = k > 0.01
        extra.lumos.value = k * 0.9
      }
      rig.tick(dt, state, 45, 48)
    }),
  )
  return (
    <>
      <group ref={root} position={[s.p[0], Y, s.p[1]]} scale={S}>
        <primitive object={rig.object} />
      </group>
      {extra.obj && <primitive object={extra.obj} />}
      {extra.glow && <primitive object={extra.glow} />}
    </>
  )
}

// ---------- McGonagall's teacup: on the stand in the middle of the class; turns into a bird for 3.4 s
function Teacup({ g, G }) {
  const stand = useMemo(cupStand, [])
  const bird = useMemo(() => {
    const tex = [birdTex(true), birdTex(false)]
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[0], transparent: true, alphaTest: 0.1 }))
    sp.scale.set(0.5, 0.5, 1)
    sp.visible = false
    sp.userData.tex = tex
    return sp
  }, [])
  const at = useMemo(() => {
    // 1.5 m in front of the professor, toward the class
    return [g.P[0] + Math.sin(g.yaw) * 1.5, g.P[1] + Math.cos(g.yaw) * 1.5]
  }, [g])
  useFrame(
    timed(({ clock }) => {
      const t = clock.elapsedTime
      const c = G.cup
      const cup = stand.userData.cup
      const top = [at[0], Y + 0.95, at[1]]
      if (c.turnAt > 0 && t >= c.turnAt) {
        fx.smoke(top, { count: 16, colors: ['#f4f2ee', '#dcd8d0'], size: 0.4, life: 0.8, speed: 0.6, up: 0.2 })
        c.turnAt = -1
        c.backAt = t + 3.4
        cup.visible = false
        bird.visible = true
      }
      if (c.backAt > 0) {
        const u = 3.4 - (c.backAt - t)
        // the bird hops up off the stand, hovers and flaps, then settles back
        bird.position.set(top[0] + 0.15 * Math.sin(u * 1.3), top[1] + 0.2 + 0.35 * Math.min(1, u / 0.6) * (0.85 + 0.15 * Math.sin(u * 5)), top[2])
        bird.material.map = bird.userData.tex[Math.floor(t * 9) % 2]
        if (t >= c.backAt) {
          fx.smoke([bird.position.x, bird.position.y, bird.position.z], { count: 16, colors: ['#f4f2ee', '#dcd8d0'], size: 0.4, life: 0.8, speed: 0.6, up: 0.2 })
          c.backAt = -1
          c.caster = -1
          cup.visible = true
          bird.visible = false
        }
      }
    }),
  )
  return (
    <>
      <group position={[at[0], Y, at[1]]}>
        <primitive object={stand} />
      </group>
      <primitive object={bird} />
    </>
  )
}

// ---------- the professor on a low floating paver
// Rigged like Professor.jsx (professor_<who>.glb, clips Idle, Lecture, WandRaise, Point, Nod) but driven here,
// so Point can start the moment a student casts.
const LOOP = [
  ['Lecture', 4.2, false],
  ['WandRaise', 2.4, true],
  ['Lecture', 3.6, false],
  ['Point', 1.2, true],
  ['Lecture', 3.0, false],
  ['Nod', 1.0, true],
]
const LOOP_LEN = LOOP.reduce((t, [, d]) => t + d, 0)
function TeacherModel({ g, G }) {
  const root = useRef()
  const paver = useRef()
  const { object, actions } = useRigInstance(`professor_${g.who}`)
  const st = useMemo(() => ({ cur: null, override: -1, cycle: -1 }), [])
  const play = (name, once, restart = false) => {
    const next = actions[name]
    if (!next) return
    if (st.cur === next && !restart) return
    next.reset()
    if (once) {
      next.setLoop(THREE.LoopOnce, 1)
      next.clampWhenFinished = true
    } else next.setLoop(THREE.LoopRepeat, Infinity)
    next.play()
    if (st.cur && st.cur !== next) next.crossFadeFrom(st.cur, 0.3, false)
    st.cur = next
  }
  useFrame(
    timed(({ clock }) => {
      const t = clock.elapsedTime + g.gi * 3.1
      const tc = clock.elapsedTime
      paver.current.position.y = Y + PAVER_LIFT + 0.03 * Math.sin(tc * 1.2 + g.gi)
      // a student started a cast: point at them now
      if (G.pointAt > st.override && tc - G.pointAt < 0.1) {
        st.override = G.pointAt
        play('Point', true, true)
      }
      let want = g.yaw + Math.sin(tc * 0.35 + g.gi) * 0.3
      if (tc - st.override < 1.2) {
        if (G.pointTo) want = angleTo(g.P, G.pointTo)
      } else {
        const u0 = t % LOOP_LEN
        const cycle = Math.floor(t / LOOP_LEN)
        let u = u0
        for (const [clip, d, once] of LOOP) {
          if (u < d) {
            // the Nod comes every other loop; the other loops hold the Lecture instead
            const c = clip === 'Nod' && cycle % 2 ? 'Lecture' : clip
            play(c, once && c !== 'Lecture')
            break
          }
          u -= d
        }
      }
      turnToward(root.current, want, 0.08)
    }),
  )
  return (
    <group ref={paver} position={[g.P[0], Y + PAVER_LIFT, g.P[1]]}>
      <mesh position={[0, -0.05, 0]} material={STONE} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.1, 1.0]} />
      </mesh>
      <group ref={root} rotation={[0, g.yaw, 0]} scale={g.scale || 1}>
        <primitive object={object} />
      </group>
    </group>
  )
}

function Group({ g }) {
  const G = useMemo(() => ({ casts: 0, students: [], pointAt: -10, pointTo: null, cup: { caster: -1, busyUntil: 0, turnAt: -1, backAt: -1 } }), [])
  return (
    <group>
      <Suspense fallback={null}>
        <TeacherModel g={g} G={G} />
      </Suspense>
      {g.spell === 'transfig' && <Teacup g={g} G={G} />}
      {g.students.map((s) => (
        <Student key={s.i} g={g} s={s} G={G} />
      ))}
    </group>
  )
}

export default function SpellSchool() {
  if (import.meta.env.DEV && typeof window !== 'undefined') (window.__life ||= {}).school = GROUPS.map((g) => ({ who: g.who, P: g.P, students: g.students.map((s) => s.p) }))
  return GROUPS.map((g) => <Group key={g.gi} g={g} />)
}

// shared with the round 4 courtyard classes (CourtyardRange.jsx, CourtyardLumos.jsx)
export { TeacherModel, lumosMaterials, wand, WAND_TIP, glowTex, lookOf, CAST_EVERY, CHIME_EVERY, CHIME_LEVEL, S as STUDENT_SCALE, FLICK, Y as LAWN_Y }
