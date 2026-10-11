import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { preloadModel, useModel } from '../characters/rig.js'
import { timed } from './common.js'
import { FOUNTAIN, Y } from './courtyardLayout.js'
import { waterLoop } from './CourtyardSound.js'

// The courtyard fountain (Lan, round 4: "the fountain also looks pretty low poly ... its the centerpiece"):
// the three-tier limestone fountain from tools/blender/fountain.py (public/models/fountain.glb, a wizard-hat
// finial), with water drawn here.
//   FountainStone (always drawn, from render/Lawn.jsx): the stone, a warm uplight glow on its lower half, a
//     warm disc of light on the grass round the step, and still water surfaces in the three basins.
//   FountainLife (courtyard life, off with ?off=life): ripples scrolling across the surfaces, falling water
//     sheets from the two bowl lips, foam rings where they land, a spray of 300 GPU points from the hat's tip,
//     a faint mist over the basin, and a quiet positional water sound.
// The water heights and radii match WATER and HAT_TIP in fountain.py (Blender z up; here y up).
preloadModel('fountain')

const WATER = [
  { y: 0.58, r: 2.13, lobes: 8, depth: 0.05 }, // ground basin
  { y: 1.8, r: 1.31, lobes: 12, depth: 0.07 }, // middle bowl
  { y: 2.88, r: 0.72, lobes: 8, depth: 0.06 }, // upper bowl
]
// falling sheets: from a bowl lip (radius, height, lobes, depth) down to the water below (radius, height)
const SHEETS = [
  { r0: 1.5, y0: 1.86, lobes: 12, depth: 0.07, r1: 1.68, y1: 0.58 },
  { r0: 0.83, y0: 2.92, lobes: 8, depth: 0.06, r1: 0.95, y1: 1.8 },
]
const TIP = new THREE.Vector3(0.3, 3.93, 0)
const UP_COLOR = new THREE.Color(1.0, 0.72, 0.42)
const [FX, FZ] = FOUNTAIN.p

// ---------- textures (canvas, made once)
function canvasTex(w, h, draw, { srgb = false, repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}
// a tileable ripple normal map: the height is a sum of sines with whole-number wave counts across the tile
function rippleNormals() {
  const N = 256
  const waves = Array.from({ length: 9 }, (_, i) => ({ kx: ((i * 5) % 7) - 3, ky: ((i * 3) % 5) + 1, a: 1 / (1 + i * 0.45), ph: i * 1.7 }))
  const h = new Float32Array(N * N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let s = 0
      for (const w of waves) s += w.a * Math.sin(((w.kx * x + w.ky * y) / N) * Math.PI * 2 + w.ph)
      h[y * N + x] = s
    }
  return canvasTex(N, N, (g) => {
    const img = g.createImageData(N, N)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)]
        const dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x]
        const nx = -dx * 0.9
        const ny = -dy * 0.9
        const l = Math.hypot(nx, ny, 1)
        const k = (y * N + x) * 4
        img.data[k] = (nx / l) * 127 + 128
        img.data[k + 1] = (ny / l) * 127 + 128
        img.data[k + 2] = (1 / l) * 127 + 128
        img.data[k + 3] = 255
      }
    g.putImageData(img, 0, 0)
  })
}
// falling water: thin bright streaks with gaps, tiled around the sheet (alpha in the green channel)
function streaks() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#000'
    g.fillRect(0, 0, w, h)
    let s = 7
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 70; i++) {
      const x = r() * w
      const y = r() * h
      const len = 40 + r() * 140
      const a = 0.35 + r() * 0.6
      const gr = g.createLinearGradient(0, y, 0, y + len)
      gr.addColorStop(0, `rgba(255,255,255,0)`)
      gr.addColorStop(0.3, `rgba(255,255,255,${a})`)
      gr.addColorStop(1, `rgba(255,255,255,0)`)
      g.fillStyle = gr
      const wd = 1.5 + r() * 4
      g.fillRect(x, y, wd, len)
      if (y + len > h) g.fillRect(x, y - h, wd, len) // wrap vertically
    }
    // a faint continuous film behind the streaks
    g.fillStyle = 'rgba(255,255,255,0.07)'
    g.fillRect(0, 0, w, h)
  }, { repeat: [10, 1] })
}
// soft radial blob (mist, uplight disc, spray dots), white with alpha falling to zero at the edge
function blob(inner = 0, colorStop = 'rgba(255,255,255,1)') {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, inner * 64, 64, 64, 64)
    gr.addColorStop(0, colorStop)
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
  })
}
// a ring of foam: a noisy white band in a radial alpha map (u around, v across the band)
function foam() {
  return canvasTex(256, 32, (g, w, h) => {
    let s = 3
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    g.fillStyle = '#000'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 500; i++) {
      const y = h * (0.25 + 0.5 * r())
      g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.4})`
      g.beginPath()
      g.arc(r() * w, y, 1 + r() * 2.5, 0, Math.PI * 2)
      g.fill()
    }
  }, { repeat: [6, 1] })
}
// limestone grain for the stone's bump
function grain() {
  return canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h)
    let s = 11
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < w * h; i++) {
      const v = 118 + r() * 20 + (r() < 0.02 ? -40 : 0)
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
      img.data[i * 4 + 3] = 255
    }
    g.putImageData(img, 0, 0)
  }, { repeat: [3, 3] })
}

let TEX = null
const tex = () =>
  (TEX ||= { ripple: rippleNormals(), streaks: streaks(), mist: blob(0), up: blob(0.55, 'rgba(255,255,255,1)'), dot: blob(0.2), foam: foam(), grain: grain() })

// ---------- geometry
const lobed = (r, lobes, depth, a) => r * (1 + depth * Math.cos(lobes * a))
function waterDisc({ r, lobes, depth }) {
  const sh = new THREE.Shape()
  const n = 96
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = lobed(r, lobes, depth, a)
    i ? sh.lineTo(rr * Math.cos(a), rr * Math.sin(a)) : sh.moveTo(rr * Math.cos(a), rr * Math.sin(a))
  }
  const g = new THREE.ShapeGeometry(sh, 1)
  g.rotateX(-Math.PI / 2)
  // uv in metres, so the ripple scale is the same in every basin
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.6, p.getZ(i) * 0.6)
  return g
}
// a sheet of water leaving a lobed lip and falling in a parabola to the water below (u around, v 1 at the lip)
function sheet({ r0, y0, lobes, depth, r1, y1 }) {
  const seg = 120
  const rows = 10
  const pos = []
  const uv = []
  const idx = []
  for (let j = 0; j <= rows; j++) {
    const t = j / rows
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2
      const r = lobed(r0, lobes, depth, a) * (1 - t) + r1 * t
      const y = y0 - (y0 - y1) * t * t
      pos.push(r * Math.cos(a), y, -r * Math.sin(a))
      uv.push(i / seg, 1 - t)
    }
  }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i
      idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// ---------- materials
let MATS = null
function mats() {
  if (MATS) return MATS
  const t = tex()
  const water = new THREE.MeshPhysicalMaterial({
    color: '#3f8d8f',
    roughness: 0.05,
    metalness: 0,
    transmission: 0, // a transmissive material renders the scene a second time; opacity does the job
    transparent: true,
    opacity: 0.86,
    normalMap: t.ripple,
    normalScale: new THREE.Vector2(0.28, 0.28),
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    clearcoatNormalMap: t.ripple.clone(),
    clearcoatNormalScale: new THREE.Vector2(0.22, 0.22),
    envMapIntensity: 1.3,
    depthWrite: false,
  })
  water.clearcoatNormalMap.repeat.set(1.7, 1.7)
  water.clearcoatNormalMap.needsUpdate = true
  const fall = new THREE.MeshStandardMaterial({
    color: '#e6f5f3',
    emissive: '#6fa3a6',
    emissiveIntensity: 0.35,
    roughness: 0.12,
    alphaMap: t.streaks,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const foamMat = new THREE.MeshBasicMaterial({ color: '#f4fbfa', alphaMap: t.foam, transparent: true, opacity: 0.75, depthWrite: false })
  const mist = new THREE.SpriteMaterial({ map: t.mist, color: '#eef6f6', transparent: true, opacity: 0.1, depthWrite: false })
  const up = new THREE.MeshBasicMaterial({ map: t.up, color: UP_COLOR.clone().multiplyScalar(0.55), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  return (MATS = { water, fall, foam: foamMat, mist, up })
}
// the glTF stone, with a limestone grain bump and a warm glow on the lower half from the uplights in the step
const stoneMats = new Map()
function stone(src) {
  if (stoneMats.has(src)) return stoneMats.get(src)
  const m = new THREE.MeshStandardMaterial({ color: src.color, roughness: src.roughness, metalness: 0, bumpMap: tex().grain, bumpScale: 0.6 })
  m.name = src.name
  const uUp = { value: src.name === 'BasinInside' ? 0 : 0.22 }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uUp = uUp
    sh.uniforms.uUpColor = { value: UP_COLOR }
    sh.uniforms.uBaseY = { value: Y }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vUpY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvUpY = (modelMatrix * vec4(transformed, 1.0)).y;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUpY;\nuniform float uUp;\nuniform vec3 uUpColor;\nuniform float uBaseY;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uUpColor * diffuseColor.rgb * uUp * pow(clamp(1.0 - (vUpY - uBaseY) / 1.6, 0.0, 1.0), 1.5);',
      )
  }
  m.customProgramCacheKey = () => 'fountain-uplight'
  stoneMats.set(src, m)
  return m
}

// ---------- always drawn
export function FountainStone() {
  const { scene } = useModel('fountain')
  const obj = useMemo(() => {
    const o = scene.clone()
    o.traverse((m) => {
      if (!m.isMesh) return
      m.castShadow = true
      m.receiveShadow = true
      m.material = stone(m.material)
    })
    return o
  }, [scene])
  const M = mats()
  const discs = useMemo(() => WATER.map(waterDisc), [])
  const upRing = useMemo(() => {
    const g = new THREE.RingGeometry(FOUNTAIN.r - 0.1, FOUNTAIN.r + 0.75, 96, 1)
    g.rotateX(-Math.PI / 2)
    // map the blob texture so its bright inner band sits at the step's edge
    const p = g.attributes.position
    const uv = g.attributes.uv
    const R = FOUNTAIN.r + 0.75
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + (p.getX(i) / R) * 0.5, 0.5 + (p.getZ(i) / R) * 0.5)
    return g
  }, [])
  return (
    <group position={[FX, Y, FZ]}>
      <primitive object={obj} />
      {discs.map((g, i) => (
        <mesh key={i} geometry={g} material={M.water} position={[0, WATER[i].y, 0]} renderOrder={2} />
      ))}
      <mesh geometry={upRing} material={M.up} position={[0, 0.012, 0]} renderOrder={1} />
    </group>
  )
}

// ---------- spray: 300 points thrown up from the hat's tip, falling under gravity into the upper bowl.
// Every point carries (phase, heading, outward speed, upward speed); the vertex shader works out where it is,
// so the CPU only sets the time.
const N_SPRAY = 300
const LIFE = 0.95
function spray() {
  const seeds = new Float32Array(N_SPRAY * 4)
  let s = 5
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < N_SPRAY; i++) {
    seeds[i * 4] = r()
    // headings lean back toward the bowl's centre (the tip leans out to +x)
    seeds[i * 4 + 1] = Math.PI + (r() - 0.5) * Math.PI * 1.7
    seeds[i * 4 + 2] = 0.12 + r() * 0.42
    seeds[i * 4 + 3] = 1.9 + r() * 1.1
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_SPRAY * 3), 3))
  g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3.6, 0), 1.6)
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uTip: { value: TIP }, uFloor: { value: WATER[2].y }, uSize: { value: 0.05 }, uViewH: { value: 900 }, uMap: { value: tex().dot } },
    vertexShader: /* glsl */ `
      attribute vec4 seed;
      uniform float uTime, uFloor, uSize, uViewH;
      uniform vec3 uTip;
      varying float vA;
      void main() {
        float t = mod(uTime + seed.x * ${LIFE.toFixed(2)}, ${LIFE.toFixed(2)});
        vec3 v = vec3(cos(seed.y) * seed.z, seed.w, -sin(seed.y) * seed.z);
        vec3 p = uTip + v * t + vec3(0.0, -4.9 * t * t, 0.0);
        vA = p.y < uFloor ? 0.0 : smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.75, 0.95, t / ${LIFE.toFixed(2)}));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.5, uSize * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying float vA;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vA;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vec3(0.93, 0.98, 1.0), a * 0.85);
        #include <colorspace_fragment>
      }`,
  })
  const pts = new THREE.Points(g, m)
  pts.renderOrder = 3
  return pts
}

// ---------- courtyard life
export function FountainLife() {
  const M = mats()
  const sheets = useMemo(() => SHEETS.map(sheet), [])
  const rings = useMemo(
    () =>
      SHEETS.map((s) => {
        const g = new THREE.RingGeometry(s.r1 - 0.1, s.r1 + 0.16, 96, 1)
        g.rotateX(-Math.PI / 2)
        // u around, v across the band
        const p = g.attributes.position
        const uv = g.attributes.uv
        for (let i = 0; i < p.count; i++) {
          const a = Math.atan2(-p.getZ(i), p.getX(i))
          const r = Math.hypot(p.getX(i), p.getZ(i))
          uv.setXY(i, a / (Math.PI * 2) + 0.5, (r - (s.r1 - 0.1)) / 0.26)
        }
        return g
      }),
    [],
  )
  const pts = useMemo(spray, [])
  const mist = useMemo(() => {
    const sp = new THREE.Sprite(M.mist)
    sp.scale.set(5.6, 1.5, 1)
    sp.position.set(0, 0.95, 0)
    sp.renderOrder = 4
    return sp
  }, [M])
  const snd = useMemo(() => waterLoop([FX, Y + 1.2, FZ]), [])
  const st = useRef({ poll: 0 })
  useFrame(
    timed((state, dt) => {
      const t = state.clock.elapsedTime
      const T = tex()
      M.water.normalMap.offset.set(t * 0.035, t * 0.05)
      M.water.clearcoatNormalMap.offset.set(-t * 0.045, t * 0.02)
      T.streaks.offset.y = t * 1.25
      T.foam.offset.x = t * 0.02
      pts.material.uniforms.uTime.value = t
      pts.material.uniforms.uViewH.value = state.size.height * state.gl.getPixelRatio()
      M.mist.opacity = 0.085 + 0.025 * Math.sin(t * 0.7)
      if (t > st.current.poll) {
        st.current.poll = t + 1
        snd.poll()
      }
    }),
  )
  return (
    <group position={[FX, Y, FZ]}>
      {sheets.map((g, i) => (
        <mesh key={i} geometry={g} material={M.fall} renderOrder={3} />
      ))}
      {rings.map((g, i) => (
        <mesh key={i} geometry={g} material={M.foam} position={[0, SHEETS[i].y1 + 0.006, 0]} renderOrder={3} />
      ))}
      <primitive object={pts} />
      <primitive object={mist} />
    </group>
  )
}
