import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BEIN, COURTYARD, DRUMS, EAST, MEETING, MEET_DOOR, inPoly } from '../layout.js'
import { motion } from '../Player.jsx'
import { sound } from './sound.js'
import { ui } from './store.js'

// what the floor is made of under (x, z): stone on the outdoor terrace, grass in the courtyard, carpet elsewhere
export function surfaceAt(x, z) {
  if (x > EAST && Math.hypot(x - EAST, z) >= BEIN.r) return 'stone'
  if (inPoly(x, z, COURTYARD)) return 'grass'
  return 'carpet'
}

const DOOR_NEAR = 2.4 // m; matches the open radius of GlassDoor in World.jsx
const doorMids = MEETING.map((m) => [m.door.hinge[0] + MEET_DOOR / 2, m.door.hinge[1]])

// one footstep per 0.75 m at the 5.5 m/s walk; strides stretch to 1 m at a sprint and shrink to
// 0.55 m crouching (my judgment: a real walking stride is 0.7 to 0.8 m)
const STRIDE = 0.75
const strideFor = (speed) => (speed > 7.5 ? 1.0 : speed < 3 ? 0.55 : STRIDE)
const inDrum = (x, z) => DRUMS.findIndex((d) => ((x - d.c[0]) / d.rx) ** 2 + ((z - d.c[1]) / d.rz) ** 2 < 1)

// Mount once inside <Canvas>. Moves the audio listener with the camera, plays footsteps from
// Player.jsx's `motion` (distance walked on the ground), tells sound.js which classroom you are
// in (the students' page turns and whispers), and plays door swings.
export function SoundLoop() {
  const { camera } = useThree()
  const lastDist = useRef(null)
  const stride = useRef(0)
  const room = useRef(-1)
  const doorOpen = useRef(doorMids.map(() => false))
  useFrame(() => {
    const p = camera.position
    const e = camera.matrixWorld.elements // forward is -Z column
    const fx = -e[8]
    const fz = -e[10]
    const fl = Math.hypot(fx, fz) || 1
    sound.listen(p.x, p.y, p.z, fx / fl, fz / fl)

    // footsteps: distance walked on the ground since the last frame. In the air the stride restarts,
    // so the first step after a landing comes a full stride later; pushing into a wall adds nothing.
    const d = lastDist.current == null ? 0 : motion.dist - lastDist.current
    lastDist.current = motion.dist
    const st = sound.stats // dev counters: distance on the ground and in the air
    st.airborne = !motion.grounded
    if (d > 0 && d < 2) st[motion.grounded ? 'groundDist' : 'airDist'] = (st[motion.grounded ? 'groundDist' : 'airDist'] || 0) + d
    if (!motion.grounded) {
      stride.current = 0
    } else if (motion.blocked) {
      stride.current = Math.min(stride.current, strideFor(motion.speed) * 0.5)
    } else if (d > 0 && d < 2 && !ui.get().frozen) {
      stride.current += d
      const len = strideFor(motion.speed)
      if (stride.current >= len) {
        stride.current -= len
        sound.step(surfaceAt(p.x, p.z), motion.speed)
      }
    }

    // classroom sounds: which drum the listener is in
    const r = inDrum(p.x, p.z)
    if (r !== room.current) {
      room.current = r
      sound.setRoom(r, r >= 0 ? { x: DRUMS[r].c[0], z: DRUMS[r].c[1] } : null)
    }

    for (let i = 0; i < doorMids.length; i++) {
      const near = Math.hypot(p.x - doorMids[i][0], p.z - doorMids[i][1]) < DOOR_NEAR
      if (near !== doorOpen.current[i]) {
        doorOpen.current[i] = near
        sound.door(doorMids[i][0], doorMids[i][1], near)
      }
    }
  })
  return null
}
