import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { preloadModel, useClipPlayer, useRigInstance } from './characters/rig.js'

// A Labubu: the rigged GLB from tools/blender/labubu.py (public/models/labubu.glb).
// The GLB has one shared body plus toggled sub-meshes (Face_grin / Face_surprised / Face_sleepy, Tee, Hoodie).
// Props (unchanged from the primitive version):
//   fur         any CSS color, tints the near-white fur material
//   expression  'grin' | 'happy' | 'surprised' | 'sleepy' | 'mischief' (happy/mischief use the grin face)
//   shirt       null | 'yale' (Yale-blue MGT 409 tee) | 'stripes' (charcoal hoodie) | any CSS color (tee)
//   pants       with overalls → hoodie in the pants color; otherwise ignored
//   hat         accepted, not modeled
//   anim        'idle' | 'hop' | 'dance' | 'wave' | 'spin' | 'circle' | 'catch'
//   circle      { center: [x, z], radius, speed } when anim = 'circle'
//   sitting     true → seated clip (put the root on a chair seat, minus 0.11)
//   height      scale (1 ≈ 1.15 m to the ear tips)
//   phase       animation offset so a crowd doesn't move in sync

export const YALE_BLUE = '#00356b'
export const SKIN = '#f7c4a5'
export const EXPRESSIONS = ['grin', 'happy', 'surprised', 'sleepy', 'mischief']
export const FACE_OF = { grin: 'grin', happy: 'grin', mischief: 'grin', surprised: 'surprised', sleepy: 'sleepy' }

preloadModel('labubu')

export function outfit(shirt, pants, overalls) {
  if (overalls && pants) return { kind: 'Hoodie', color: pants }
  if (!shirt) return { kind: null, color: null }
  if (shirt === 'yale') return { kind: 'Tee', color: YALE_BLUE }
  if (shirt === 'stripes') return { kind: 'Hoodie', color: '#2b2b2e' }
  return { kind: 'Tee', color: shirt }
}

function clipFor(anim, sitting) {
  if (sitting) return anim === 'wave' ? 'SitWave' : 'Sit'
  return { idle: 'Idle', hop: 'Hop', dance: 'Dance', wave: 'Wave', spin: 'Hop', circle: 'Hop', catch: 'Catch' }[anim] || 'Idle'
}

function LabubuModel({ model = 'labubu', fur = '#5a3d2e', expression = 'grin', shirt = null, pants = null, overalls = false, sitting = false, anim = 'idle', clip, circle, height = 1, phase = 0, position = [0, 0, 0], rotation = 0 }) {
  const root = useRef()
  const spinner = useRef()
  const face = FACE_OF[expression] || 'grin'
  const wear = outfit(shirt, pants, overalls)
  const { object, actions } = useRigInstance(
    model,
    (o, cloneMat) => {
      for (const f of ['grin', 'surprised', 'sleepy']) {
        const n = o.getObjectByName(`Face_${f}`)
        if (n) n.visible = f === face
      }
      for (const k of ['Tee', 'Hoodie']) {
        const n = o.getObjectByName(k)
        if (n) n.visible = k === wear.kind
      }
      cloneMat('Fur')?.color.set(fur)
      if (wear.kind) cloneMat('Shirt')?.color.set(wear.color)
    },
    [fur, face, wear.kind, wear.color],
    { clothes: wear.kind === 'Tee' ? 1 : wear.kind === 'Hoodie' ? 2 : 0 }, // fur shells stop under the clothes
  )
  const play = useClipPlayer(actions, 0.3)
  const want = clip || clipFor(anim, sitting)
  const last = useRef(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase
    if (last.current !== want) {
      // first frame: start mid-cycle so crowds don't move in sync; catch follows the ball's 3.2 s toss
      const a = actions[want]
      const dur = a ? a.getClip().duration : 1
      const time = anim === 'catch' ? ((t + 0.8) % 3.2) * 0.5 : phase % dur
      play(want, { timeScale: anim === 'catch' ? 0.5 : anim === 'circle' ? 1.6 : 1, time: last.current ? undefined : time })
      last.current = want
    }
    if (anim === 'spin') spinner.current.rotation.y = t * 3
    if (anim === 'circle' && circle) {
      const sp = circle.speed ?? 0.8
      const a = t * sp
      root.current.position.set(circle.center[0] + Math.cos(a) * circle.radius, position[1], circle.center[1] + Math.sin(a) * circle.radius)
      root.current.rotation.y = -a + (sp > 0 ? 0 : Math.PI) // face the way it runs
    }
  })

  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]} scale={height}>
      <group ref={spinner}>
        <primitive object={object} />
      </group>
    </group>
  )
}

export default function Labubu(props) {
  return (
    <Suspense fallback={null}>
      <LabubuModel {...props} />
    </Suspense>
  )
}

// a ball tossed back and forth between two spots (for anim="catch" pairs)
const BALL = new THREE.SphereGeometry(1, 20, 14)
export function TossBall({ from, to, y = 0, height = 1, color = '#ff4fa3' }) {
  const ref = useRef()
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.4 }), [color])
  useFrame(({ clock }) => {
    const T = 1.6
    const t = clock.elapsedTime % (2 * T)
    const fwd = t < T
    const u = (fwd ? t : t - T) / T
    const [a, b] = fwd ? [from, to] : [to, from]
    ref.current.position.set(a[0] + (b[0] - a[0]) * u, y + height * (0.75 + 1.6 * u * (1 - u)), a[1] + (b[1] - a[1]) * u)
  })
  return <mesh ref={ref} geometry={BALL} material={m} scale={0.12 * height} castShadow />
}
