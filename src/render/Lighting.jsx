import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useProgress } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { H, ROOF, EAST, BEIN, BOUNDS, COURTYARD, DRUMS, LIBRARY, inPoly } from '../layout.js'
import { OFF, QUALITY } from './debugCam.js'

// Sun 48 degrees up from the west-south-west (53 degrees west of south): afternoon light that
// reaches about 6.5 m under the 7.2 m soffit, so mullion and column shadows run deep across the
// north cloister floor. 48 degrees is the sun's own elevation in the sky HDRI, and the direction
// is 13 degrees from the one tools/bake used (60 degrees up, 43 west of south); the bake keeps
// only the sun's bounce light, which a 13 degree turn barely moves.
const SUN_EL = (48 * Math.PI) / 180
const SUN_AZ_W = (53 * Math.PI) / 180 // west of south
export const SUN_DIR = new THREE.Vector3(-Math.cos(SUN_EL) * Math.sin(SUN_AZ_W), Math.sin(SUN_EL), Math.cos(SUN_EL) * Math.cos(SUN_AZ_W))
const sunParam = Number(new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('sun'))
// 5 (was 3.2): the lightmap holds no direct sun, so this alone sets how far sunlit floor stands
// above shade. At 5 the sunlit carpet strip reads near white (sRGB about 230 against 113 in
// shade) and stays under the 1.6 bloom threshold. ?sun= overrides it for tuning.
export const SUN = { color: '#fff4e2', intensity: sunParam || 5 }
const CENTER = new THREE.Vector3((BOUNDS.xMin + EAST + BEIN.terrace) / 2, 0, (BOUNDS.zMin + BOUNDS.zMax) / 2)

// Fit the orthographic shadow camera to the building box in light space, so the 1536 map
// covers only the floor plate (about 7 cm per texel) and not empty sky.
function fitShadow(light) {
  const cam = light.shadow.camera
  const view = new THREE.Matrix4().lookAt(light.position, light.target.position, new THREE.Vector3(0, 1, 0))
  const inv = view.clone().invert()
  const xs = [BOUNDS.xMin, EAST + BEIN.terrace]
  const zs = [BOUNDS.zMin, BOUNDS.zMax]
  const ys = [-5, ROOF + 0.5]
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  for (const x of xs) for (const y of ys) for (const z of zs) box.expandByPoint(v.set(x, y, z).sub(light.position).applyMatrix4(inv))
  cam.left = box.min.x
  cam.right = box.max.x
  cam.bottom = box.min.y
  cam.top = box.max.y
  cam.near = Math.max(0.5, -box.max.z)
  cam.far = -box.min.z
  cam.updateProjectionMatrix()
}

// Static geometry casts and receives sun shadows. The static map is not redrawn every frame
// (gl.shadowMap.autoUpdate = false): redrawing it costs about 4 ms at dpr 1 (courtyard view,
// 86 to 63 fps uncapped). It is redrawn on demand instead: at frames 1, 30, 60 and 100 after
// mount, a few frames after every asset batch finishes loading (drei useProgress), and whenever
// a component calls requestShadowUpdate() (the baked building does once it mounts). Each redraw
// bumps shadowState.version, which tells Probes.jsx to recapture the drum reflections.
//
// Moving things (meshes under a group flagged userData.dynamic: walking characters, doors) stay
// out of the static map, where they would leave a shadow frozen at their first position. Their
// casters move to CHAR_LAYER and cast through the character shadow map below. Instanced meshes
// under a dynamic flag do not move and stay in the static map.
export const CHAR_LAYER = 5
export const shadowState = { version: 0 }
const due = new Set([1, 30, 60, 100])
let frameNow = 0
export function requestShadowUpdate(delay = 2) {
  due.add(frameNow + delay)
}

function ShadowSetup() {
  const { gl, scene } = useThree()
  useLayoutEffect(() => {
    if (import.meta.env.DEV) window.__three = { gl, scene }
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
  }, [gl])
  // The loader reports a file done before the GLTF is parsed and mounted, so redraw twice after.
  // A store subscription and not the hook: the hook would re-render this component while a
  // loading component renders, which React warns about.
  useEffect(
    () =>
      useProgress.subscribe((st, prev) => {
        if (st.active || !prev.active) return
        requestShadowUpdate(5)
        requestShadowUpdate(45)
      }),
    [],
  )
  useFrame(() => {
    frameNow++
    if (!due.has(frameNow)) return
    due.delete(frameNow)
    const walk = (o, dyn) => {
      dyn = dyn || !!o.userData.dynamic
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        const solid = mats.every((m) => !m.transparent && !m.transmission && m.type !== 'MeshBasicMaterial')
        if (dyn && !o.isInstancedMesh) {
          if (o.castShadow && solid) o.layers.enable(CHAR_LAYER)
          o.castShadow = false
        } else if (dyn) {
          // instanced groups under a dynamic flag (the seated students, about 1.1 M triangles)
          // never move: they keep their own castShadow and stay in the static map
          o.castShadow = o.castShadow && solid
        } else {
          o.castShadow = solid && !o.userData.noCast
          o.receiveShadow = mats.every((m) => m.type !== 'MeshBasicMaterial')
        }
      }
      o.children.forEach((c) => walk(c, dyn))
    }
    walk(scene, false)
    gl.shadowMap.needsUpdate = true
    shadowState.version++
  })
  return null
}

// Character shadows. A second, small depth map renders only CHAR_LAYER from the sun every frame:
// 1024 px over a 40 m square that follows the camera (4 cm texels). Baked.jsx reads it in the
// baked floors, lawn and walls and darkens the direct sun there, so characters in sunlight throw
// real moving shadows without redrawing the 1536 static map. Characters standing in shade get
// nothing from it, which is right, since the sun does not reach them.
const CHAR_SPAN = 40
const CHAR_RES = 1024
export const CHAR_SHADOW = {
  map: { value: null },
  matrix: { value: new THREE.Matrix4() },
  on: { value: 0 },
}
function CharShadow() {
  const { gl, scene, camera } = useThree()
  const s = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(CHAR_RES, CHAR_RES, { depthBuffer: true })
    rt.depthTexture = new THREE.DepthTexture(CHAR_RES, CHAR_RES, THREE.UnsignedIntType)
    const h = CHAR_SPAN / 2
    const cam = new THREE.OrthographicCamera(-h, h, h, -h, 1, 240)
    cam.layers.set(CHAR_LAYER)
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false })
    // light-space basis, fixed because the sun does not move
    const view = new THREE.Matrix4().lookAt(SUN_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0))
    const inv = view.clone().invert()
    return { frame: 0, rt, cam, mat, view, inv, p: new THREE.Vector3(), fwd: new THREE.Vector3(), bias: new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1) }
  }, [])
  useEffect(() => {
    CHAR_SHADOW.map.value = s.rt.depthTexture
    CHAR_SHADOW.on.value = 1
    return () => {
      CHAR_SHADOW.on.value = 0
      s.rt.dispose()
    }
  }, [s])
  useFrame(() => {
    if (import.meta.env.DEV) window.__charShadow = s
    // centre 12 m ahead of the camera, snapped to whole texels in light space so the edges
    // do not crawl
    const texel = CHAR_SPAN / CHAR_RES
    camera.getWorldDirection(s.fwd)
    s.fwd.y = 0
    const p = s.p.copy(camera.position).addScaledVector(s.fwd.normalize(), 12).applyMatrix4(s.inv)
    p.x = Math.round(p.x / texel) * texel
    p.y = Math.round(p.y / texel) * texel
    p.applyMatrix4(s.view)
    s.cam.position.copy(p).addScaledVector(SUN_DIR, 120)
    s.cam.lookAt(p)
    s.cam.updateMatrixWorld()
    CHAR_SHADOW.matrix.value.multiplyMatrices(s.cam.projectionMatrix, s.cam.matrixWorldInverse).premultiply(s.bias)
    // every other frame: a Labubu walks about 2 cm in that time. The pass reuses last frame's
    // world matrices (matrixWorldAutoUpdate off), which saves a walk over the whole scene.
    if (++s.frame % 2) return
    const bg = scene.background
    const om = scene.overrideMaterial
    const prev = gl.getRenderTarget()
    scene.background = null
    scene.overrideMaterial = s.mat
    scene.matrixWorldAutoUpdate = false
    gl.setRenderTarget(s.rt)
    gl.clear()
    gl.render(scene, s.cam)
    gl.setRenderTarget(prev)
    scene.matrixWorldAutoUpdate = true
    scene.background = bg
    scene.overrideMaterial = om
  })
  return null
}

function Sun() {
  const ref = useRef()
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.copy(CENTER)
    return o
  }, [])
  useLayoutEffect(() => {
    const l = ref.current
    l.target = target
    l.position.copy(CENTER).addScaledVector(SUN_DIR, 80)
    l.updateMatrixWorld()
    target.updateMatrixWorld()
    fitShadow(l)
  }, [target])
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={ref}
        color={SUN.color}
        intensity={SUN.intensity}
        castShadow={QUALITY !== 'low'}
        shadow-mapSize={[1536, 1536]} // 2048 cost 1 to 2 fps in the library at dpr 1.5 with no visible gain
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={3}
      />
    </>
  )
}

// Small round recessed downlights in a loose 2.4 m grid; the photos show no linear fixtures
// in the concourse. Values above 1 feed the bloom pass.
export const DOWNLIGHT = { radius: 0.08, color: [1, 0.96, 0.9], strength: 4 }
const PANEL = new THREE.CircleGeometry(DOWNLIGHT.radius, 16).rotateX(Math.PI / 2)
const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...DOWNLIGHT.color).multiplyScalar(DOWNLIGHT.strength), toneMapped: false })
const trimMat = new THREE.MeshStandardMaterial({ color: '#cfd0d0', roughness: 0.4, metalness: 0.5 })
const TRIM = new THREE.CircleGeometry(0.12, 16).rotateX(Math.PI / 2)
// downlight centres [x, z]; the bake exporter (render/exportGLB.js) reads the same list
export function downlightSpots() {
  const out = []
  const { xMin, xMax, zMin, zMax } = BOUNDS
  for (let x = xMin + 1.2; x < xMax; x += 2.4)
    for (let z = zMin + 1.2; z < zMax; z += 2.4) if (!inPoly(x, z, COURTYARD)) out.push([x + ((Math.round(z / 2.4) % 2) * 0.6), z])
  for (let x = EAST + 1.2; x < EAST + BEIN.r; x += 2.4)
    for (let z = -BEIN.r; z < BEIN.r; z += 2.4) if (Math.hypot(x - EAST, z) < BEIN.r - 0.8) out.push([x, z])
  return out
}
function CeilingPanels() {
  const spots = useMemo(downlightSpots, [])
  const refs = [useRef(), useRef()]
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, H - 0.004, z)
      refs[0].current.setMatrixAt(i, m)
      m.makeTranslation(x, H - 0.002, z)
      refs[1].current.setMatrixAt(i, m)
    })
    refs.forEach((r) => (r.current.instanceMatrix.needsUpdate = true))
  }, [spots])
  return (
    <group userData={{ dynamic: true }}>
      <instancedMesh ref={refs[0]} args={[PANEL, panelMat, spots.length]} frustumCulled={false} />
      <instancedMesh ref={refs[1]} args={[TRIM, trimMat, spots.length]} frustumCulled={false} />
    </group>
  )
}

// Ten real point lights: one per classroom drum, two over the library reading tables.
// Shadowless, so each costs one light loop iteration per fragment.
export const ROOM_LIGHT = { color: '#ffe9cf', decay: 1.6 }
export function roomLightSpots() {
  const out = DRUMS.map((d) => ({ p: [d.c[0] - d.dir[0] * 1.5, H - 0.7, d.c[1] - d.dir[1] * 1.5], i: 16, d: Math.max(d.rx, d.rz) * 2.2 }))
  const lx = (LIBRARY.x0 + LIBRARY.x1) / 2
  out.push({ p: [lx, H - 0.7, -6], i: 18, d: 16 }, { p: [lx, H - 0.7, 6], i: 18, d: 16 })
  return out
}
function RoomLights() {
  const spots = useMemo(roomLightSpots, [])
  return spots.map((s, i) => <pointLight key={i} position={s.p} intensity={s.i} distance={s.d} decay={ROOM_LIGHT.decay} color={ROOM_LIGHT.color} />)
}

export default function Lighting() {
  return (
    <>
      <hemisphereLight args={['#eef2ff', '#9a8a74', 0.22]} />
      <ambientLight intensity={0.05} />
      <Sun />
      {!OFF.has('lights') && <RoomLights />}
      <CeilingPanels />
      {QUALITY !== 'low' && <ShadowSetup />}
      {QUALITY !== 'low' && !OFF.has('shadow') && !OFF.has('charshadow') && <CharShadow />}
    </>
  )
}
