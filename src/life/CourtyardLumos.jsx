import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { angleTo, rand, smooth, timed, useLabubuRig } from './common.js'
import { LUMOS, Y } from './courtyardLayout.js'
import { blanket } from './CourtyardProps.js'
import { CAST_EVERY, STUDENT_SCALE, TeacherModel, WAND_TIP, glowTex, lookOf, lumosMaterials, wand } from './SpellSchool.jsx'

// Snape's Lumos class, round 4: two students sitting on a blanket near the south glass, Snape on his floating
// paver between them and the glass, so the south cloister sees their faces. Every 12 to 20 s a student raises
// the wand (the SitWave pose, held) and the tip lights with a soft pulsing white glow that lights the face from
// below for 3.5 to 5.5 s. Silent, like the Lumos class in SpellSchool.jsx.
const G_TEACH = { gi: 2, who: LUMOS.who, P: LUMOS.P, yaw: angleTo(LUMOS.P, LUMOS.blanket) }
const SEAT = 0.11 // the Sit clips put the seat this far above the root
const _v = new THREE.Vector3()

function Sitter({ i, G }) {
  const look = useMemo(() => lookOf(2, i + 1), [i])
  const rig = useLabubuRig(look)
  const p = LUMOS.students[i]
  const yaw = angleTo(p, LUMOS.P) + (i ? -0.25 : 0.25)
  const st = useMemo(() => {
    const r = rand(700 + i * 53)
    r()
    r()
    return { r, next: 2 + i * 5 + r() * 4, lit: null }
  }, [i])
  const w = useMemo(() => wand(), [])
  const extra = useMemo(() => {
    rig.bones.armR?.add(w)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#f4f8ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
    glow.renderOrder = 6
    return { lumos: lumosMaterials(rig), glow }
  }, [rig, w])
  useFrame(
    timed((state, dt) => {
      dt = Math.min(dt, 0.05)
      const t = state.clock.elapsedTime
      if (!st.lit && t > st.next) {
        st.lit = { t0: t, dur: 3.5 + st.r() * 2 }
        G.pointAt = t
        G.pointTo = p
        rig.actions.SitWave && (rig.actions.SitWave.paused = false)
        rig.play('SitWave', { fade: 0.45, time: 0 })
        if (rig.actions.SitWave) rig.actions.SitWave.paused = true // hold the first frame: wand arm up and out
      }
      let k = 0
      if (st.lit) {
        const u = t - st.lit.t0
        if (u > st.lit.dur + 0.6) {
          st.lit = null
          st.next = t + CAST_EVERY[0] + st.r() * (CAST_EVERY[1] - CAST_EVERY[0])
          rig.play('Sit', { fade: 0.6 })
        } else k = smooth(Math.min(1, Math.max(0, u - 0.3) / 0.35)) * (1 - smooth(Math.max(0, (u - st.lit.dur) / 0.6))) * (0.8 + 0.2 * Math.sin(u * 4.5))
      } else if (rig.clip !== 'Sit') rig.play('Sit', { fade: 0.4 })
      const b = rig.bones.armR
      if (b && w.parent === b) b.localToWorld(_v.copy(WAND_TIP))
      extra.glow.position.copy(_v)
      extra.glow.material.opacity = k * 0.9
      const sz = 0.12 + 0.16 * k
      extra.glow.scale.set(sz, sz, 1)
      extra.glow.visible = k > 0.01
      extra.lumos.value = k * 0.9
      rig.setFace(look.expression)
      rig.tick(dt, state, 45, 48)
    }),
  )
  return (
    <>
      <group position={[p[0], Y - SEAT + 0.012, p[1]]} rotation={[0, yaw, 0]} scale={STUDENT_SCALE}>
        <primitive object={rig.object} />
      </group>
      <primitive object={extra.glow} />
    </>
  )
}

export default function CourtyardLumos() {
  const G = useMemo(() => ({ pointAt: -10, pointTo: null }), [])
  const rug = useMemo(() => blanket(['#1f4a33', '#c0c4c8', '#0e2418']), [])
  const root = useRef()
  return (
    <group ref={root}>
      <Suspense fallback={null}>
        <TeacherModel g={G_TEACH} G={G} />
      </Suspense>
      <primitive object={rug} position={[LUMOS.blanket[0], Y, LUMOS.blanket[1]]} rotation={[0, 0.08, 0]} />
      {LUMOS.students.map((_, i) => (
        <Sitter key={i} i={i} G={G} />
      ))}
    </group>
  )
}
