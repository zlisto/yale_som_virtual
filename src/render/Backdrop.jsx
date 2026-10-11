import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { BOUNDS, EAST, BEIN, planX, planZ } from '../layout.js'
import { Trees } from './Scenery.jsx'
import Town from './Town.jsx'
import { G, CURB, VERGE, WALK, S, ROAD, NS, OUT, EDGE, surface, corridor, splitRange, quadGeo } from './streetPlan.js'
import { SUN_DIR, requestShadowUpdate } from './Lighting.jsx'

// What the player sees through the perimeter glass. Two layers:
//  1. far: the sky. The Poly Haven "Kloofendal 48d Partly Cloudy (Pure Sky)" HDRI (CC0), the same
//     sky the lightmaps were baked under and the drei Environment background, as a 4K 8-bit JPG
//     (0.38 MB) on a sphere that follows the camera. Pure sky has no ground or buildings in it, so
//     nothing in it can disagree with the street geometry below or show a seam. Each channel holds
//     t = L / (1 + L) and the shader decodes L = t / (1 - t), so clouds and the sun disc keep their
//     HDR range through the ACES tone mapping. The lower hemisphere of the JPG is a flat horizon
//     haze; the ground plane covers all of it but a 1 degree band at the horizon.
//  2. near: the street outside at ground level (5 m below floor 2): lawn, raised verges and
//     sidewalks with kerbs, Whitney Avenue to the west and streets to the north, east and south
//     (plan in streetPlan.js), street trees.
//  3. Town.jsx: the neighbourhood around the block (low brick and stone buildings, street
//     furniture, parked cars, the Beinecke terrace furniture) and a painted skyline wall at
//     250 m that the scene fog blends into the sky.
const BASE = import.meta.env.BASE_URL
const SKY_R = 450

// The sky's sun sits at u = 0.595 (48 degrees up, measured on the 2K HDR); the sphere turns until
// that column lies under the azimuth of Lighting.jsx's sun, so the sun disc, the shadows and the
// bright side of the sky agree.
const SUN_AZ = Math.atan2(SUN_DIR.z, SUN_DIR.x)
const PANO_SUN_U = 0.595
const SKY_YAW = Math.PI * 2 * PANO_SUN_U - SUN_AZ
// sky radiance scale: 1 is the HDR as shot. A blue sky is dimmer than sunlit white paving, and at
// 0.7 the sky through the courtyard reads blue next to the sunlit lawn and floors. My judgment
// from the screenshots.
const SKY_GAIN = 0.7

function Sky() {
  const ref = useRef()
  const map = useLoader(THREE.TextureLoader, `${BASE}hdri/kloofendal_48d_partly_cloudy_sky_4k.jpg`)
  const { geo, mat } = useMemo(() => {
    map.colorSpace = THREE.NoColorSpace // the encoding is linear Reinhard, not sRGB
    map.anisotropy = 4
    map.generateMipmaps = true
    const g = new THREE.SphereGeometry(SKY_R, 64, 32)
    g.scale(-1, 1, 1) // seen from inside, unmirrored
    const m = new THREE.MeshBasicMaterial({ map, depthWrite: false, fog: false })
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        `vec3 skyT = min( texture2D( map, vMapUv ).rgb, vec3( 254.0 / 255.0 ) );
        diffuseColor.rgb *= skyT / ( 1.0 - skyT ) * ${SKY_GAIN.toFixed(3)};`,
      )
    }
    return { geo: g, mat: m }
  }, [map])
  useFrame(({ camera }) => ref.current.position.copy(camera.position))
  // a shadow redraw also makes Probes.jsx recapture, so the drums reflect this sky and not the
  // bare Environment background, even when the JPG came from cache and no loading batch ended
  useEffect(() => requestShadowUpdate(2), [mat])
  // not flagged dynamic, so the drum reflection probes capture it (it casts and receives nothing)
  return <mesh ref={ref} geometry={geo} material={mat} rotation={[0, SKY_YAW, 0]} renderOrder={-1} frustumCulled={false} />
}

// ---------- canvas textures for the street
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.anisotropy = 8
  return t
}
let seed = 11
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
function speckle(g, w, h, n, colors, size) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rnd() * colors.length) | 0]
    g.fillRect(rnd() * w, rnd() * h, size, size)
  }
}
// asphalt: kerb-side white lines and a double yellow centre line (as on Whitney Ave, photo 03).
// v runs across the road, so the stripes are rows of the canvas
const roadTex = () =>
  canvasTex(64, 512, (g, w, h) => {
    g.fillStyle = '#4a4b4d'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 6000, ['#424345', '#545557', '#3c3d3f', '#5b5b5c'], 2)
    g.fillStyle = '#e8e6df'
    g.fillRect(0, h * 0.06, w, 4)
    g.fillRect(0, h * 0.94 - 4, w, 4)
    g.fillStyle = '#e0b52c'
    g.fillRect(0, h / 2 - 7, w, 4)
    g.fillRect(0, h / 2 + 3, w, 4)
  })

// photo textures (ambientCG, CC0): lawn and concrete sidewalk slabs
const texLoader = new THREE.TextureLoader()
function photo(file, srgb) {
  const t = texLoader.load(`${BASE}scenery/tex/${file}`)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}
const photoSet = (name, repeat) => {
  const set = { map: photo(`${name}_color.jpg`, true), normalMap: photo(`${name}_normal.jpg`), roughnessMap: photo(`${name}_rough.jpg`) }
  for (const t of Object.values(set)) t.repeat.set(repeat, repeat)
  return set
}

// ---------- street geometry: world-space quads merged per material (one draw call each)
const quad = (p, t) => ({ p, t })
// horizontal quad facing up; uv(x, z) gives the texture coordinates
const hq = (x0, x1, z0, z1, y, uv) => {
  const c = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]
  return quad(c.map(([x, z]) => [x, y, z]), c.map(([x, z]) => uv(x, z)))
}
// the four outward-facing sides of an axis-aligned box footprint (its top is a separate quad)
const sides = (x0, x1, z0, z1, y0, y1) => {
  const c = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]
  return c.map((a, i) => {
    const b = c[(i + 1) % 4]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    return quad([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], [[0, 0], [len, 0], [len, y1 - y0], [0, y1 - y0]])
  })
}
const world = (x, z) => [x, -z] // metres; each material's texture repeat sets the tile size
const KEYS = Object.keys(ROAD)

function streetGeos() {
  const roads = []
  const kerbs = []
  const verges = []
  const walks = []
  const zebras = []
  const RT = 12 // road texture tile along the road (m)
  const yRoad = G + 0.01
  const yTop = G + CURB + 0.002
  for (const k of KEYS) {
    const ns = NS.includes(k)
    const [a, b] = surface(k)
    const crossing = KEYS.filter((j) => NS.includes(j) !== ns)
    // the road surface, cut where the crossing roads pass (the crossings get plain asphalt)
    for (const [t0, t1] of splitRange(-S, S, crossing.map(surface)))
      roads.push(ns ? hq(a, b, t0, t1, yRoad, (x, z) => [z / RT, (x - a) / (b - a)]) : hq(t0, t1, a, b, yRoad, (x, z) => [x / RT, (z - a) / (b - a)]))
    // verge and sidewalk on each side. North-south strips stop at the crossing road surface,
    // east-west strips at the whole crossing corridor, so each corner square belongs to one strip
    const segs = splitRange(-S, S, crossing.map(ns ? surface : corridor))
    for (const side of [-1, 1]) {
      const e = side < 0 ? a : b
      const m = e + side * VERGE
      const f = e + side * (VERGE + WALK)
      const rect = (c0, c1, t0, t1) => (ns ? [Math.min(c0, c1), Math.max(c0, c1), t0, t1] : [t0, t1, Math.min(c0, c1), Math.max(c0, c1)])
      for (const [t0, t1] of segs) {
        verges.push(hq(...rect(e, m, t0, t1), yTop, world))
        walks.push(hq(...rect(m, f, t0, t1), yTop, world))
        kerbs.push(...sides(...rect(e, f, t0, t1), G, G + CURB))
      }
    }
    // zebra crossings on each arm of the crossings with the north-south roads
    if (!ns) continue
    for (const j of crossing) {
      const [z0, z1] = surface(j)
      for (const [za, zb] of [[z0 - 3.2, z0 - 0.4], [z1 + 0.4, z1 + 3.2]]) zebras.push(hq(a, b, za, zb, yRoad + 0.004, (x, z) => [x - a, (z - za) / 2.8]))
    }
  }
  for (const w of NS)
    for (const e of KEYS.filter((j) => !NS.includes(j))) {
      const [x0, x1] = surface(w)
      const [z0, z1] = surface(e)
      roads.push(hq(x0, x1, z0, z1, yRoad, (x) => [x / RT, 0.3]))
      // zebras across the east-west road on both sides of the crossing
      for (const [xa, xb] of [[x0 - 3.2, x0 - 0.4], [x1 + 0.4, x1 + 3.2]]) zebras.push(hq(xa, xb, z0, z1, yRoad + 0.004, (x, z) => [z - z0, (x - xa) / 2.8]))
    }
  return { roads: quadGeo(roads), kerbs: quadGeo(kerbs), verges: quadGeo(verges), walks: quadGeo(walks), zebras: quadGeo(zebras) }
}
// zebra bars: 0.5 m white bars every metre across the road, worn at the edges
const zebraTex = () => {
  const t = canvasTex(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h)
    g.fillStyle = 'rgba(236,234,226,0.92)'
    g.fillRect(w * 0.25, 0, w * 0.5, h)
    g.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(0,0,0,${0.2 + rnd() * 0.5})`
      g.fillRect(rnd() * w, rnd() * h, 2, 2)
    }
  })
  t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

// street trees on the verges: Sapling maples mostly, aspens, a birch now and then, at varied
// scale. One list per side, each its own instanced draw, so frustum culling drops the sides
// behind the camera (all 32 trees in one InstancedMesh drew about 0.9 M triangles from any view)
const STREET = (() => {
  const out = { W: [], N: [], E: [], S: [] }
  const kinds = ['maple', 'aspen', 'maple', 'maple', 'aspen', 'maple', 'birch', 'aspen']
  const y = G + CURB
  let i = 0
  const add = (side, x, z, k = 1) => {
    const v = kinds[i % kinds.length]
    const base = v === 'maple' ? 1.05 : v === 'birch' ? 0.75 : 0.62
    out[side].push({ p: [x, y, z], r: i * 2.3, s: base * k * (0.82 + ((i * 37) % 7) * 0.05), v })
    i++
  }
  const inner = (k) => EDGE[k][0] - (OUT[k] * VERGE) / 2 // verge centre on the building side
  const outer = (k) => EDGE[k][1] + (OUT[k] * VERGE) / 2
  // positions along each street written for the round-3 floor, spread by planX / planZ
  for (let z = -36; z <= 44; z += 16) add('W', inner('W'), planZ(z)) // Whitney Avenue (6)
  for (let x = -30; x <= 40; x += 14) add('N', planX(x), inner('N')) // north street (6)
  for (const z of [-36, -16, 18, 38]) add('E', inner('E'), planZ(z), 0.9) // either side of the terrace view (4)
  for (let x = -40; x <= 40; x += 16) add('S', planX(x), inner('S')) // south street (6)
  for (const z of [-24, 26]) add('W', outer('W'), planZ(z), 0.8) // far verges, smaller (8)
  for (const x of [-18, 30]) add('N', planX(x), outer('N'), 0.8)
  for (const z of [-28, 30]) add('E', outer('E'), planZ(z), 0.8)
  for (const x of [-22, 18]) add('S', planX(x), outer('S'), 0.8)
  return out
})()

function Street() {
  const m = useMemo(() => {
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 1, ...o })
    // no roughness map on the grass: Grass 004's map runs as low as 0.3 and the sun drew a wet
    // white sheen across the lawn at grazing angles
    const grass = photoSet('grass', 1 / 2.5)
    delete grass.roughnessMap
    return {
      grass: std(grass), // world-space UVs: one tile per 2.5 m
      walk: std(photoSet('sidewalk', 1 / 3)),
      kerb: std({ color: '#b9b5ac', roughness: 0.9 }),
      road: std({ map: roadTex(), roughness: 0.95 }),
      zebra: std({ map: zebraTex(), transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    }
  }, [])
  const geos = useMemo(() => {
    const { xMin, zMin, zMax } = BOUNDS
    const xMax = EAST + BEIN.terrace
    // ground: everything outside the building footprint (the courtyard keeps its own lawn)
    const shape = new THREE.Shape([new THREE.Vector2(-S, -S), new THREE.Vector2(S, -S), new THREE.Vector2(S, S), new THREE.Vector2(-S, S)])
    shape.holes.push(new THREE.Path([new THREE.Vector2(xMin, -zMin), new THREE.Vector2(xMin, -zMax), new THREE.Vector2(xMax, -zMax), new THREE.Vector2(xMax, -zMin)]))
    const ground = new THREE.ShapeGeometry(shape)
    ground.rotateX(-Math.PI / 2) // shape y becomes -z; UVs are the shape's metres
    return { ground, ...streetGeos() }
  }, [])
  return (
    <group>
      <mesh geometry={geos.ground} material={m.grass} position={[0, G, 0]} receiveShadow />
      <mesh geometry={geos.roads} material={m.road} receiveShadow />
      <mesh geometry={geos.zebras} material={m.zebra} receiveShadow renderOrder={1} />
      <mesh geometry={geos.kerbs} material={m.kerb} receiveShadow />
      <mesh geometry={geos.verges} material={m.grass} receiveShadow />
      <mesh geometry={geos.walks} material={m.walk} receiveShadow />
      {Object.entries(STREET).map(([k, items]) => <Trees key={k} items={items} />)}
    </group>
  )
}

// Light distance haze: nothing inside 120 m changes (the building and the near ring of
// neighbours), the painted skyline at about 250 m takes a fifth to a third of the haze colour
// and the lawn fades into the sky's horizon band. Colour picked against the sky's horizon in
// the screenshots.
const FOG = { color: '#c3ccd8', near: 120, far: 650 }
function Haze() {
  const { scene } = useThree()
  useLayoutEffect(() => {
    scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far)
    return () => (scene.fog = null)
  }, [scene])
  return null
}

export default function Backdrop() {
  return (
    <>
      <Haze />
      <Sky />
      <Street />
      <Town />
    </>
  )
}
