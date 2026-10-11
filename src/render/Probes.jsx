// Reflection probes for the glossy blue drums. Once the baked building is in the scene, a
// CubeCamera renders the room from five spots (the four cloisters and the courtyard) at
// 256 px, and each drum shell takes the nearest probe as its envMap, so the blue glass
// mirrors the columns, the soffit and the courtyard instead of the generic RoomEnvironment.
// Characters and other dynamic groups are hidden during the capture. The probes render a few
// frames after load, at frame 100, and again three frames after every redraw of the static sun
// shadow map (shadowState.version, see ShadowSetup in Lighting.jsx), so the reflections always
// show the current sun and shadows. ?probes=0 switches them off.
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { QUALITY } from './debugCam.js'
import { shadowState } from './Lighting.jsx'
import { planX } from '../layout.js'

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const ON = params.get('probes') !== '0'
const SIZE = 256
// eye-height spots in the middle of each cloister walk, and one over the lawn
const SPOTS = {
  north: [0, 2.2, -22.4],
  south: [0, 2.2, 22.4],
  west: [planX(-24.4), 2.2, 0],
  east: [planX(24.4), 2.2, 0],
  courtyard: [0, -2.5, 0],
}
// a mirror-like surface reflects its real surroundings at intensity 1; the old 2.4 was
// compensating for the 0.35 RoomEnvironment
const DRUM_ENV_INTENSITY = 1.0
const CAPTURE_FRAMES = [4, 100]

function capture(gl, scene, cams, pmrem) {
  const hidden = []
  scene.traverse((o) => {
    if (o.userData.dynamic && o.visible) {
      o.visible = false
      hidden.push(o)
    }
  })
  const out = {}
  for (const [k, { cam, rt }] of Object.entries(cams)) {
    cam.update(gl, scene)
    out[k] = pmrem.fromCubemap(rt.texture).texture
  }
  hidden.forEach((o) => (o.visible = true))
  return out
}

export default function Probes({ root }) {
  const { gl, scene } = useThree()
  const state = useRef({ frame: 0, cams: null, pmrem: null, tex: {}, version: -1, next: 0 })
  useEffect(() => {
    if (!ON) return
    const s = state.current
    s.frame = 0
    s.pmrem = new THREE.PMREMGenerator(gl)
    s.cams = Object.fromEntries(
      Object.entries(SPOTS).map(([k, p]) => {
        const rt = new THREE.WebGLCubeRenderTarget(SIZE, { type: THREE.HalfFloatType })
        const cam = new THREE.CubeCamera(0.1, 400, rt)
        cam.position.set(...p)
        cam.updateMatrixWorld()
        return [k, { cam, rt }]
      }),
    )
    return () => {
      Object.values(s.cams).forEach(({ rt }) => rt.dispose())
      Object.values(s.tex).forEach((t) => t.dispose())
      s.pmrem.dispose()
      s.tex = {}
    }
  }, [gl, QUALITY])
  useFrame(() => {
    const s = state.current
    if (!ON || !s.cams) return
    s.frame++
    if (shadowState.version !== s.version) {
      s.version = shadowState.version
      s.next = s.frame + 3
    }
    if (!CAPTURE_FRAMES.includes(s.frame) && s.frame !== s.next) return
    const t0 = performance.now()
    const tex = capture(gl, scene, s.cams, s.pmrem)
    root.traverse((o) => {
      const role = o.userData.role || ''
      if (!o.isMesh || !role.startsWith('drum_')) return
      o.geometry.computeBoundingSphere()
      const c = o.geometry.boundingSphere.center
      let best = null
      let bd = Infinity
      for (const [k, p] of Object.entries(SPOTS)) {
        if (k === 'courtyard') continue
        const d = Math.hypot(c.x - p[0], c.z - p[2])
        if (d < bd) [bd, best] = [d, k]
      }
      o.material.envMap = tex[best]
      o.material.envMapIntensity = DRUM_ENV_INTENSITY
      o.material.needsUpdate = true
    })
    Object.values(s.tex).forEach((t) => t.dispose())
    s.tex = tex
    window.__probeMs = performance.now() - t0
    if (s.frame === CAPTURE_FRAMES.at(-1)) window.__bakedReady = true // screenshot tools wait for this
  })
  return null
}
