import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ROOF, SKY } from '../layout.js'
import { rand, smooth, timed } from './common.js'

// Eight swallows circle above the courtyard's sky opening (the canopy leaves a 43 x 25 m hole at ROOF), and now
// and then one glides down to sit on the canopy rim for a few seconds. Each bird is one flat quad, seen from
// below, textured from a 4-frame sprite sheet drawn on a canvas (wings up, spread, down and swept back, and
// folded); the frame steps with the wingbeat. Wingspan 0.5 m. One InstancedMesh with a per-instance frame.
const N = 8
const RIM_Y = ROOF + 0.3 // top of the canopy fascia round the opening
// perches on the rim, written for the round-3 27.5 x 25.5 m rim and stretched along x to the wider one
const PERCH = [[13.75, 3.5], [13.75, -6], [-13.75, 5], [-13.75, -2.5], [4, 12.75], [-7, 12.75], [8, -12.75], [-3, -12.75]].map(([x, z]) => [(x * (SKY.hx + 0.25)) / 13.75, z])

// ---------- the sprite sheet: 4 frames of a swallow silhouette from below, head up, 256 px each
const FRAMES = 4
// per frame: wing half-span (px), how far back the tips sweep (px), how wide the wing is at the root (px)
const POSE = [
  [78, 26, 30], // wings raised: foreshortened from below
  [122, 34, 34], // spread
  [104, 62, 28], // downstroke, swept back
  [36, 104, 16], // folded along the body (glide end, perched)
]
function swallowSheet() {
  const c = document.createElement('canvas')
  c.width = 256 * FRAMES
  c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  POSE.forEach(([span, sweep, root], f) => {
    const x0 = 256 * f + 128
    const y0 = 104 // shoulders
    // each part is filled on its own (one combined path leaves winding holes where the parts overlap)
    // body: head and chest
    g.beginPath()
    g.ellipse(x0, y0, 13, 30, 0, 0, Math.PI * 2)
    g.fill()
    // the deeply forked tail
    g.beginPath()
    g.moveTo(x0 - 9, y0 + 20)
    g.lineTo(x0 - 24, y0 + 120)
    g.lineTo(x0 - 5, y0 + 64)
    g.lineTo(x0, y0 + 60)
    g.lineTo(x0 + 5, y0 + 64)
    g.lineTo(x0 + 24, y0 + 120)
    g.lineTo(x0 + 9, y0 + 20)
    g.closePath()
    g.fill()
    // wings: leading edge bowed forward to a pointed tip, trailing edge curved back to the body
    for (const s of [-1, 1]) {
      g.beginPath()
      g.moveTo(x0 + s * 6, y0 - 8)
      g.quadraticCurveTo(x0 + s * span * 0.55, y0 - 18, x0 + s * span, y0 + sweep)
      g.quadraticCurveTo(x0 + s * span * 0.45, y0 + root * 0.6, x0 + s * 6, y0 + root)
      g.closePath()
      g.fill()
    }
  })
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
const SPAN = 0.5 // m
const QUAD = (() => {
  // 256 px of the frame = 0.5 m / (2 * 122 / 256) so the spread wings span 0.5 m; lies flat, head toward +z
  const size = SPAN / ((2 * 122) / 256)
  const g = new THREE.PlaneGeometry(size, size)
  g.rotateX(Math.PI / 2)
  return g
})()

const M = new THREE.Matrix4()
const Q = new THREE.Quaternion()
const E = new THREE.Euler()
const ONE = new THREE.Vector3(1, 1, 1)
const CYCLE = [0, 1, 2, 1] // wingbeat: up, spread, down, spread

export default function Birds() {
  const mesh = useRef()
  const { mat, frame } = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: '#25262b', map: swallowSheet(), alphaTest: 0.5, side: THREE.DoubleSide })
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float aFrame;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv.x = (vMapUv.x + aFrame) / 4.0;')
    }
    m.customProgramCacheKey = () => 'life-swallow'
    const a = new THREE.InstancedBufferAttribute(new Float32Array(N), 1)
    a.setUsage(THREE.DynamicDrawUsage)
    return { mat: m, frame: a }
  }, [])
  const birds = useMemo(() => {
    const r = rand(99)
    return Array.from({ length: N }, (_, i) => ({
      R: 7 + r() * 4,
      h: ROOF + 1.6 + r() * 2.2,
      w: (0.28 + r() * 0.12) * (i % 3 === 0 ? -1 : 1),
      a0: r() * Math.PI * 2,
      flap: 10 + r() * 4,
      ph: r() * 6,
      perch: null, // { spot, t0 } while landing, sitting and taking off
      next: 6 + i * 4 + r() * 8,
      pos: new THREE.Vector3(),
      yaw: 0,
    }))
  }, [])
  useLayoutEffect(() => {
    mesh.current.frustumCulled = false
    mesh.current.geometry.setAttribute('aFrame', frame)
  }, [frame])
  const circle = (b, t, out) => {
    const a = b.a0 + t * b.w
    out.set(Math.cos(a) * b.R, b.h + 0.4 * Math.sin(t * 0.7 + b.ph), Math.sin(a) * b.R)
    return Math.atan2(-Math.sin(a) * b.w, Math.cos(a) * b.w) // heading along the circle
  }
  const C = useMemo(() => new THREE.Vector3(), [])
  useFrame(
    timed(({ clock }) => {
      const t = clock.elapsedTime
      birds.forEach((b, i) => {
        let flap = Math.sin(t * b.flap + b.ph) * 0.65
        let yaw = circle(b, t, C)
        b.pos.copy(C)
        if (!b.perch && t > b.next) b.perch = { spot: PERCH[(i * 3 + Math.floor(t)) % PERCH.length], t0: t, stay: 6 + (i % 4) * 2 }
        if (b.perch) {
          const { spot, t0, stay } = b.perch
          const u = t - t0
          const land = [spot[0], RIM_Y + 0.02, spot[1]]
          if (u < 3) {
            // glide down to the rim
            const k = smooth(u / 3)
            b.pos.set(C.x + (land[0] - C.x) * k, C.y + (land[1] - C.y) * k + Math.sin(k * Math.PI) * 0.6, C.z + (land[2] - C.z) * k)
            yaw = Math.atan2(land[0] - C.x, land[2] - C.z)
            flap *= 1 - 0.7 * k
          } else if (u < 3 + stay) {
            // sit, wings folded, a peck now and then
            b.pos.set(land[0], land[1] + (Math.sin(u * 2.3) > 0.95 ? 0.02 : 0), land[2])
            yaw = Math.atan2(-spot[0], -spot[1]) + 0.4 * Math.sin(u * 0.6) // looking into the courtyard
            flap = -1.25
          } else if (u < 6 + stay) {
            // take off back to the circle
            const k = smooth((u - 3 - stay) / 3)
            b.pos.set(land[0] + (C.x - land[0]) * k, land[1] + (C.y - land[1]) * k, land[2] + (C.z - land[2]) * k)
            yaw = Math.atan2(C.x - land[0], C.z - land[2])
            flap = Math.sin(t * b.flap * 1.4) * 0.8
          } else {
            b.perch = null
            b.next = t + 18 + ((i * 7) % 11)
          }
        }
        b.yaw = yaw
        // bank into the turn a little; the frame follows the wingbeat (folded while perched, spread in a glide)
        M.compose(b.pos, Q.setFromEuler(E.set(0, yaw, b.perch ? 0 : -Math.sign(b.w) * 0.25)), ONE)
        mesh.current.setMatrixAt(i, M)
        let f
        if (flap <= -1.2) f = 3
        else if (Math.abs(flap) < 0.2 && b.perch) f = 1
        else f = CYCLE[Math.floor((((t * b.flap + b.ph) / (Math.PI * 2)) % 1) * 4)]
        frame.setX(i, f)
      })
      mesh.current.instanceMatrix.needsUpdate = true
      frame.needsUpdate = true
      if (import.meta.env.DEV) (window.__life ||= {}).birds = birds.map((b) => [b.pos.x, b.pos.y, b.pos.z, !!b.perch])
    }),
  )
  return <instancedMesh ref={mesh} args={[QUAD, mat, N]} />
}
