import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ui } from '../interact/store.js'
import { motion } from '../Player.jsx'
import { OFF } from './debugCam.js'

// Camera feel on top of Player.jsx. Runs after the player each frame.
//   Speed and distance: Player.jsx's `motion` (walk 5.5 m/s, sprint 9.5 m/s, crouch 2.4 m/s),
//   taken from its fixed 120 Hz steps, so frame-time spikes do not reach the bob or the FOV.
//   Head bob: a vertical bob of up to 2.5 cm, two bobs per 5 m stride, keyed to the distance
//   walked; it fades out over about 150 ms at a standstill. At the 5.5 m/s walk that is 2.2
//   bobs a second, near a real walking cadence. The earlier 1.5 m stride bobbed 7.3 times a
//   second at walk speed and read as shake (my judgment from the numbers, not a user test). Player.jsx writes
//   camera.position.y from scratch every frame, so the offset never accumulates.
//   Sprint FOV: widens by 8 degrees at sprint speed, reaching 95% in 300 ms.
//   Look damping for arrow keys and touch lives in Player.jsx; the mouse is not damped.
const STRIDE = 5
const BOB = 0.025
const FOV_KICK = 8
const SPRINT = 7.5 // m/s; between walk and sprint speed

export default function CameraFeel() {
  const { camera } = useThree()
  const s = useRef(null)

  useFrame((_, rawDt) => {
    if (OFF.has('feel')) return
    const dt = Math.min(rawDt, 0.05)
    if (!s.current) {
      if (import.meta.env.DEV) window.__feel = { camera, state: () => s.current }
      s.current = { amp: 0, baseFov: camera.fov }
      return
    }
    const st = s.current
    const playing = ui.get().playing && !ui.get().frozen

    // head bob keyed to distance walked, faded in and out with speed
    const target = playing ? Math.min(1, motion.speed / 5.5) : 0
    st.amp += (target - st.amp) * (1 - Math.exp(-dt / 0.15))
    const phase = (motion.drawn * 2 * Math.PI) / STRIDE
    if (st.amp > 0.001) camera.position.y += Math.sin(phase * 2) * BOB * st.amp

    // sprint FOV
    const fov = st.baseFov + (playing && motion.speed > SPRINT ? FOV_KICK : 0)
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt / 0.1))
      camera.updateProjectionMatrix()
    }
  })
  return null
}
