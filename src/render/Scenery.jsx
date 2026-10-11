import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { OFF } from './debugCam.js'
import Lawn from './Lawn.jsx'
import { rng, bookTileTex } from '../textures.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { unbakedFill } from './Baked.jsx'
import * as THREE from 'three'
import {
  COUNTERS, PLANTS, PLANTS_EXTRA, BINS, LOUNGES, LIBRARY, BEIN_TABLES, DRUMS, MEETING, BENCHES, ellPt, planPt, LAWN_PAVERS,
} from '../layout.js'

// Scanned CC0 models (Poly Haven, Kenney; see CREDITS.md) placed through the floor. Every model
// repeats through instancing: one InstancedMesh per glTF primitive, so twenty chairs cost the same
// draw calls as one. Files are Draco-compressed with WebP textures, decoded from public/draco.
const BASE = import.meta.env.BASE_URL
export const DRACO = `${BASE}draco/`
export const sceneryUrl = (name) => `${BASE}scenery/${name}.glb`
const TAU = Math.PI * 2

// material overrides, made once per source material
const memo = (fn) => {
  const cache = new Map()
  return (m) => {
    if (!cache.has(m)) cache.set(m, fn(m))
    return cache.get(m)
  }
}

// Flatten a glTF scene into its primitives, re-based so the model's footprint is centred on the
// origin and its lowest point sits at y = 0. Placements then only need a floor position.
function useParts(name, keepOrigin) {
  const { scene } = useGLTF(sceneryUrl(name), DRACO)
  return useMemo(() => {
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const c = keepOrigin ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
    const shift = new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z)
    const parts = []
    scene.traverse((o) => {
      // a transmissive material (the clock's glass) makes three.js render the whole scene a
      // second time every frame; thin glass reads the same as plain alpha
      if (o.isMesh && o.material.transmission > 0) {
        o.material.transmission = 0
        o.material.transparent = true
        o.material.opacity = 0.18
      }
      if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: shift.clone().multiply(o.matrixWorld) })
    })
    return { parts, size: box.getSize(new THREE.Vector3()) }
  }, [scene, keepOrigin])
}

// items: { p: [x, y, z], r: yaw (radians, 0 keeps the model's +z front facing +z), s: number | [sx, sy, sz] }
export function Model({ name, items, material, shadows = true, keepOrigin = false }) {
  if (OFF.has(name)) items = [] // ?off=tree_maple,books,... to profile single models
  const { parts } = useParts(name, keepOrigin)
  const mats = useMemo(() => parts.map((pt) => (material ? material(pt.material) : pt.material)), [parts, material])
  const refs = useRef([])
  const { gl } = useThree()
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const s = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    parts.forEach((pt, j) => {
      const mesh = refs.current[j]
      if (!mesh) return
      items.forEach((it, i) => {
        const sc = Array.isArray(it.s) ? it.s : [it.s ?? 1, it.s ?? 1, it.s ?? 1]
        m.compose(v.set(...it.p), q.setFromAxisAngle(up, it.r || 0), s.set(...sc)).multiply(pt.matrix)
        mesh.setMatrixAt(i, m)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    })
    // the sun's shadow map renders on demand (Lighting.jsx); redraw it now that these exist
    gl.shadowMap.needsUpdate = true
  }, [parts, items, gl])
  if (!items.length) return null
  return parts.map((pt, j) => (
    <instancedMesh
      key={j}
      ref={(el) => (refs.current[j] = el)}
      args={[pt.geometry, mats[j], items.length]}
      castShadow={shadows}
      receiveShadow
    />
  ))
}

// shelving painted white like the library's columns and walls; the grain stays in the normal map
const whiteShelf = memo((m) => {
  const c = m.clone()
  c.map = null
  c.color.set('#ecebe6')
  return c
})
// office chair (meeting rooms, library): black fabric shell on a brushed-metal frame, with the
// indirect-light lift unbaked furniture needs (Baked.jsx unbakedFill)
const blackChair = memo((m) => {
  const c = m.clone()
  const fabric = m.name === 'carpet'
  c.color.set(fabric ? '#26262a' : '#9a9fa5')
  c.roughness = fabric ? 0.7 : 0.35
  c.metalness = fabric ? 0.1 : 0.85
  c.envMapIntensity = 0.6
  if (!fabric) Object.assign(c, METAL)
  return unbakedFill(c, 3)
})
// Beinecke Terrace Room (photo 16): honey-oak round tops and slim black upholstered chairs. The
// scan's walnut map is reddish, so a colour factor alone only gives brighter mahogany. The shader
// keeps the map's luminance relative to its mean (the grain, at 60% contrast) and takes the hue
// and brightness from the oak colour (picked by eye against the photo).
const oakTable = memo((m) => {
  const c = m.clone()
  c.color.set('#d2a875')
  c.roughness = 0.5
  c.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        const vec3 LUM = vec3( 0.2126, 0.7152, 0.0722 );
        float grain = dot( texture2D( map, vMapUv ).rgb, LUM );
        float mean = dot( textureLod( map, vec2( 0.5 ), 12.0 ).rgb, LUM ); // last mip: the map's mean
        diffuseColor.rgb *= clamp( mix( 1.0, grain / max( mean, 1e-3 ), 0.6 ), 0.0, 1.6 );
      #endif`,
    )
  }
  c.customProgramCacheKey = () => 'scenery-oak-table'
  return c
})
const blackDiningChair = memo((m) => {
  const c = m.clone()
  c.map = null
  c.color.set('#1a1a1c')
  c.roughness = 0.55
  c.metalness = 0.1
  c.envMapIntensity = 0.6
  return unbakedFill(c, 3)
})
const greyBin = memo((m) => {
  const c = m.clone()
  c.color.set(m.name === 'metal' ? '#b9bec3' : '#55595e')
  c.metalness = 0.7
  c.roughness = 0.35
  return c
})

// ---------- trees
// Three trees grown in Blender with the Sapling Tree Gen add-on (small maple, quaking aspen and
// white birch presets, three branch levels), bark from ambientCG, leaf-twig cards built from the
// ambientCG Leaf 001 scan. Leaves are alpha-tested, double-sided and sway in the vertex shader.
const wind = { value: 0 }
export const leafMaterial = memo((m) => {
  if (m.name !== 'leaves') return m
  const c = m.clone()
  c.transparent = false
  c.alphaTest = 0.5
  c.side = THREE.DoubleSide
  c.depthWrite = true
  c.roughness = 0.7
  c.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float hgt = max(position.y, 0.0);
      transformed.x += sin(uWind * 1.3 + ip.x * 0.37 + position.y * 0.6) * 0.010 * hgt;
      transformed.z += cos(uWind * 1.1 + ip.z * 0.41 + position.x * 0.8) * 0.008 * hgt;`,
    )
  }
  c.customProgramCacheKey = () => 'scenery-leaf-wind'
  return c
})
export function Wind() {
  useFrame((_, dt) => (wind.value += dt))
  return null
}
// tree heights as grown: maple 9.1 m, aspen 16.9 m, birch 13.6 m
export function Trees({ items }) {
  const by = (v) => items.filter((t) => t.v === v)
  return ['maple', 'aspen', 'birch'].map((v) => (
    <Model key={v} name={`tree_${v}`} items={by(v)} material={leafMaterial} keepOrigin />
  ))
}

// ---------- placements
// young courtyard trees on the lawn (exterior photos 05, 08): aspens about 7 m and birches about 6.5 m
const COURT_TREES = [[-11, -8, 'aspen'], [0, -10.5, 'birch'], [11, -8, 'aspen'], [-13, 5, 'birch'], [13, 5, 'aspen'], [-5, 9.5, 'aspen'], [6, 10, 'birch']].map(([x, z, v], i) => {
  const s = (v === 'aspen' ? 0.4 : 0.47) * (0.92 + ((i * 37) % 5) * 0.04)
  return { p: [x, -5, z], r: i * 1.7, s, v }
})

const plantA = [...PLANTS, ...PLANTS_EXTRA].filter((_, i) => i % 3 !== 2).map(([x, z], i) => ({ p: [x, 0, z], r: i * 2.1, s: 1.05 }))
const plantB = [...PLANTS, ...PLANTS_EXTRA].filter((_, i) => i % 3 === 2).map(([x, z], i) => ({ p: [x, 0, z], r: i * 1.3, s: 1.25 }))

const bins = BINS.map(([x, z], i) => ({ p: [x, 0, z], r: i, s: 1.6 }))

// laptops, half size of the scan's bounding box (0.65 m wide as shipped), on the high counters
const laptops = COUNTERS.flatMap((k, i) => {
  const face = k.z < 0 ? 0 : Math.PI // the counters' open side faces the courtyard
  return [-0.6, 0.55].map((dx, j) => ({ p: [k.x + dx, 1.065, k.z + (k.z < 0 ? 0.05 : -0.05)], r: face + (j ? -0.25 : 0.3) + i * 0.1, s: 0.5 }))
})

// library
const { x0, x1 } = LIBRARY
const DESK_X = x1 - 4 // matches the desk colliders in layout.js
const DESK_Z = [-8, -4, 4, 8]
// the study tables themselves are procedural now (render/Props.jsx, 4 cm tops)
const deskChairs = DESK_Z.flatMap((z) =>
  [-1, 1].flatMap((side) => [-0.55, 0.55].map((dz, k) => ({ p: [DESK_X + side * 0.8, 0, z + dz], r: side > 0 ? -Math.PI / 2 + k * 0.2 : Math.PI / 2 - k * 0.2, s: 1.6 }))),
)
const deskLaptops = [[-8, -1, -0.55], [-4, 1, 0.55], [4, -1, 0.55], [8, 1, -0.55], [8, -1, 0.55]].map(([z, side, dz]) => ({
  p: [DESK_X + side * 0.22, 0.762, z + dz], r: side > 0 ? -Math.PI / 2 : Math.PI / 2, s: 0.5,
}))
const loungeChairs = LOUNGES.flatMap((l) =>
  [-1, 1].flatMap((sz) => [-0.62, 0.62].map((dx) => ({ p: [l.x + dx, 0, l.z + sz * 1.12], r: sz > 0 ? Math.PI : 0, s: 0.95 }))),
)
const loungeTables = LOUNGES.map((l) => ({ p: [l.x, 0, l.z], r: 0, s: [0.75, 0.95, 0.75] }))

// shelving: the west wall run (front faces east) and two back-to-back freestanding runs
const SHELF_W = 1.0
const shelves = []
// the wall run stands 2.4 m (the scan is 2.08 m tall); the freestanding runs stay low
const WALL_SY = 2.4 / 2.08
for (let z = -11.8; z <= 11.81; z += SHELF_W) shelves.push({ p: [x0 + 0.27, 0, z], r: Math.PI / 2, s: [1, WALL_SY, 1] })
for (const [za, zb] of [[-10, -3], [3, 10]]) {
  for (let z = za + 0.5; z < zb; z += SHELF_W) {
    shelves.push({ p: [x0 + 3.5 + 0.13, 0, z], r: Math.PI / 2, s: [1, 0.86, 1] })
    shelves.push({ p: [x0 + 3.5 - 0.13, 0, z], r: -Math.PI / 2, s: [1, 0.86, 1] })
  }
}
// one row of books per shelf board (board heights measured off the Shelf_01 scan): a plane
// 5 cm behind the shelf front, textured with one of three canvas book tiles (textures.js
// bookTileTex) at a random offset, merged into one mesh per tile. The single scanned book row
// repeated every metre read as wallpaper.
const BOARDS = [0.08, 0.43, 0.78, 1.13, 1.48, 1.83]
const TILE_W = 2 // metres of shelf one tile covers
const bookRows = (() => {
  const r = rng(23)
  const lists = [[], [], []]
  shelves.forEach((sh) => {
    const sy = sh.s[1]
    const front = [Math.sin(sh.r), Math.cos(sh.r)]
    BOARDS.forEach((b, j) => {
      const next = j + 1 < BOARDS.length ? BOARDS[j + 1] : 2.06
      const h = (next - b) * sy - 0.05
      if ((b + 0.25) * sy > 2.45 || h < 0.15) return
      const g = new THREE.PlaneGeometry(0.96, h)
      const u0 = r()
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) {
        uv.setX(i, u0 + uv.getX(i) * (0.96 / TILE_W))
        uv.setY(i, uv.getY(i) * Math.min(1, h / 0.37)) // shorter rows crop the top of the tile
      }
      g.rotateY(sh.r)
      g.translate(sh.p[0] + front[0] * 0.2, b * sy + 0.025 + h / 2, sh.p[2] + front[1] * 0.2)
      lists[Math.floor(r() * 3)].push(g)
    })
  })
  return lists.map((l) => mergeGeometries(l))
})()
function BookRows() {
  const mats = useMemo(() => [0, 1, 2].map((k) => unbakedFill(new THREE.MeshStandardMaterial({ map: bookTileTex(k), roughness: 0.8 }), 2)), [])
  if (OFF.has('books')) return null
  return bookRows.map((g, k) => <mesh key={k} geometry={g} material={mats[k]} receiveShadow />)
}
const clocks = [
  { p: [(x0 + x1) / 2 + 2.5, 2.7, LIBRARY.z1 - 0.12], r: Math.PI, s: 1.3 },
  { p: [(x0 + x1) / 2 + 1.5, 4.4, LIBRARY.z0 + 0.12], r: 0, s: 2.6 }, // high on the north wall
]
const extinguishers = [{ p: [x1 - 0.5, 0, LIBRARY.z1 - 0.35], r: Math.PI, s: 1 }, { p: ((q) => [q[0], 0, q[1]])(planPt([-32.2, -20.75])), r: Math.PI, s: 1 }] // second: against the south face of stair B's core

// Beinecke Terrace Room: oak round tables, six black chairs each (photo 16)
const beinTables = BEIN_TABLES.map(([x, z], i) => ({ p: [x, 0, z], r: i, s: [1.16, 0.765, 1.16] }))
const beinChairs = BEIN_TABLES.flatMap(([x, z], t) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * TAU + t * 0.3
    const [cx, cz] = ellPt([x, z], 1.05, 1.05, a)
    return { p: [cx, 0, cz], r: a + Math.PI, s: 1 }
  }),
)

// meeting rooms: seven office chairs round each white table (seats from layout.js), turned to face
// the table with a little jitter
const meetChairs = MEETING.flatMap((m, j) =>
  m.seats.map((c, i) => {
    const head = Math.abs(c.x - m.x) > 1.5 // the seat at the table's west end
    const r = head ? Math.atan2(m.x - c.x, 0) : Math.atan2(0, m.z - c.z)
    return { p: [c.x, 0, c.z], r: r + (((i * 7 + j * 3) % 5) - 2) * 0.08, s: 1.6 }
  }),
)

// ---------- patches to World.jsx materials (that file belongs to the bake workstream)
// PBR leather (ambientCG Leather 037) for the cognac banquettes and painted metal (Metal 027)
// for their dark plinths; the World's courtyard sphere trees give way to the scanned trees above.
const texLoader = new THREE.TextureLoader()
const tex = (file, srgb, repeat) => {
  const t = texLoader.load(`${BASE}scenery/tex/${file}`)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
export const LEATHER = {
  normalMap: tex('leather_normal.jpg', false, 1.4),
  roughnessMap: tex('leather_rough.jpg', false, 1.4),
}
export const METAL = {
  normalMap: tex('metal_normal.jpg', false, 2),
  roughnessMap: tex('metal_rough.jpg', false, 2),
}
function PatchWorld() {
  const { scene, gl } = useThree()
  useLayoutEffect(() => {
    const hidden = []
    scene.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return
      const hex = o.material.color?.getHexString()
      if (hex === '9a5530' && !o.material.userData.scenery) {
        // grain from the scan; the cognac colour from the photos stays. No roughness map: three
        // multiplies it (mean about 0.4) into the constant and the seat tops washed out to pink.
        // 0.6 keeps a soft sheen on the banquette body, which read flat at 0.9
        Object.assign(o.material, { normalMap: LEATHER.normalMap, roughness: 0.6 })
        o.material.normalScale = new THREE.Vector2(0.6, 0.6)
        o.material.userData.scenery = true
        o.material.needsUpdate = true
      } else if (hex === '2b2b2b' && !o.material.userData.scenery) {
        Object.assign(o.material, METAL, { roughness: 1, metalness: 0.5 })
        o.material.userData.scenery = true
        o.material.needsUpdate = true
      } else if (o.isInstancedMesh && (hex === '5d8a3a' || hex === '2f4a25' || hex === '4a3524')) {
        // sphere crowns and box trunks of the old courtyard and outside trees
        o.visible = false
        hidden.push(o)
      }
    })
    gl.shadowMap.needsUpdate = true
    return () => hidden.forEach((o) => (o.visible = true))
  }, [scene, gl])
  return null
}

// 2K surfaces. The World's carpet (concourse and classrooms) and plaster load 1K ambientCG maps
// through pbr.js; their texture sources are swapped for the 2K scans of the same sets once the
// 1K images have arrived. Every clone shares its source, so one swap covers every tiling. The
// courtyard paving trades its canvas stones for the PavingStones 128 scan.
const UPGRADES = {
  'tex/carpet_normal.jpg': 'carpet_normal_2k.jpg',
  'tex/carpet_rough.jpg': 'carpet_rough_2k.jpg',
  'tex/plaster_normal.jpg': 'plaster_normal_2k.jpg',
  'tex/plaster_rough.jpg': 'plaster_rough_2k.jpg',
}
const imgLoader = new THREE.ImageLoader()
const PAVING = (() => {
  const set = { map: tex('paving_color_2k.jpg', true, 1 / 3), normalMap: tex('paving_normal_2k.jpg', false, 1 / 3), roughnessMap: tex('paving_rough_2k.jpg', false, 1 / 3) }
  return set
})()
// Lawn: ambientCG Grass 005 (mown grass) at 2K with its normal map, tiled every 3 m, anisotropy 8
// and mipmaps, for the World's canvas speckle that shimmered at grazing angles
const LAWN = (() => {
  const set = { map: tex('lawn_color_2k.jpg', true, 1 / 3), normalMap: tex('lawn_normal_2k.jpg', false, 1 / 3), roughnessMap: tex('lawn_rough.jpg', false, 1 / 3) }
  for (const t of Object.values(set)) t.anisotropy = 8
  return set
})()
function Surfaces() {
  const { scene } = useThree()
  useLayoutEffect(() => {
    const done = new Set()
    let lawnDone = false
    const pass = () => {
      let pending = 0
      scene.traverse((o) => {
        if (!o.isMesh) return
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
          if (mat.userData.key === 'lawn' && mat.userData.scenery) lawnDone = true
          if (mat.userData.key === 'lawn' && !mat.userData.scenery) {
            lawnDone = true
            Object.assign(mat, LAWN, { roughness: 1 })
            mat.normalScale = new THREE.Vector2(0.8, 0.8)
            mat.color.set('#d4dccb') // Grass 005 is a touch yellow against photo 02
            mat.userData.scenery = true
            mat.needsUpdate = true
          }
          if (mat.color?.getHexString() === 'e4e0d8' && !mat.userData.scenery) {
            Object.assign(mat, PAVING, { roughness: 1 })
            mat.color.set('#ffffff')
            mat.userData.scenery = true
            mat.needsUpdate = true
          }
          for (const slot of ['normalMap', 'roughnessMap']) {
            const t = mat[slot]
            if (!t) continue
            const src = t.source
            const url = src.data?.src || ''
            const key = Object.keys(UPGRADES).find((k) => url.endsWith(k))
            if (!key) {
              if (!src.data && !done.has(src)) pending++
              continue
            }
            if (done.has(src)) continue
            done.add(src)
            imgLoader.load(`${BASE}scenery/tex/${UPGRADES[key]}`, (img) => {
              src.data = img
              src.needsUpdate = true
            })
          }
        }
      })
      // the baked building (and its lawn) can arrive after the first passes
      return pending + (lawnDone ? 0 : 1)
    }
    // the 1K images load asynchronously; look again until none is left unloaded
    let tries = 0
    const id = setInterval(() => {
      if (pass() === 0 || ++tries > 120) clearInterval(id)
    }, 500)
    pass()
    return () => clearInterval(id)
  }, [scene])
  return null
}

// Lawn pavers: the World's white cafe slabs floated 0.37 m over the lawn. They become grey stone
// pavers, 3 cm thick and 1 cm proud of the grass, at the same spots (same seed and ring)
// plain honed stone
const paverMat = new THREE.MeshStandardMaterial({ color: '#b7b2a8', roughness: 0.92 })
const paverGeo = new THREE.BoxGeometry(1, 1, 1)
const PAVERS = LAWN_PAVERS
function LawnPavers() {
  const ref = useRef()
  const { scene, gl } = useThree()
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    PAVERS.forEach(([x, z], i) => ref.current.setMatrixAt(i, m.compose(new THREE.Vector3(x, -5.005, z), new THREE.Quaternion(), new THREE.Vector3(0.9, 0.03, 0.9))))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
    const hidden = []
    scene.traverse((o) => {
      if (o.isInstancedMesh && o.material?.userData?.key === 'board' && o.count === PAVERS.length) {
        o.visible = false
        hidden.push(o)
      }
    })
    gl.shadowMap.needsUpdate = true
    return () => hidden.forEach((o) => (o.visible = true))
  }, [scene, gl])
  return <instancedMesh ref={ref} args={[paverGeo, paverMat, PAVERS.length]} receiveShadow />
}

// Scuffs: soft grime on the floor where feet gather, at classroom and meeting-room doors and
// under the banquettes. A canvas alpha mask on a dark, slightly glossier film (worn carpet reads
// darker and smoother).
const scuffTex = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#000' // alphaMap reads the green channel: black is clear, grey builds up grime
  g.fillRect(0, 0, 256, 256)
  let sd = 5
  const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 260; i++) {
    const x = 128 + (r() - 0.5) * 170
    const y = 128 + (r() - 0.5) * 170
    const rad = 6 + r() * 26
    const gr = g.createRadialGradient(x, y, 0, x, y, rad)
    const a = 0.04 + r() * 0.05
    gr.addColorStop(0, `rgba(255,255,255,${a})`)
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  const t = new THREE.CanvasTexture(c)
  return t
})()
const scuffMat = new THREE.MeshStandardMaterial({
  color: '#5a554c', alphaMap: scuffTex, transparent: true, opacity: 0.7, depthWrite: false, roughness: 0.8,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
})
const scuffGeo = (() => {
  const g = new THREE.PlaneGeometry(1, 1)
  g.rotateX(-Math.PI / 2)
  return g
})()
const SCUFFS = [
  ...DRUMS.flatMap((d) => d.doors.map((a) => {
    const p = ellPt(d.c, d.rx + 0.9, d.rz + 0.9, a)
    return { p: [p[0], 0.003, p[1]], r: a, s: [2.6, 1, 2.0] }
  })),
  ...MEETING.map((m) => ({ p: [m.door.hinge[0] + 0.55, 0.003, m.door.hinge[1] + (m.z > 0 ? -0.8 : 0.8)], r: 0, s: [1.8, 1, 1.5] })),
  ...BENCHES.map((b) => ({ p: [b.c[0], 0.003, b.c[1]], r: b.rot + Math.PI / 2, s: [b.len + 0.8, 1, 2.0] })),
  { p: [LIBRARY.x1 + 0.9, 0.003, 0], r: 0, s: [2.2, 1, 3.0] },
]
function Scuffs() {
  const ref = useRef()
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    SCUFFS.forEach((sc, i) => ref.current.setMatrixAt(i, m.compose(new THREE.Vector3(...sc.p), q.setFromAxisAngle(up, sc.r), new THREE.Vector3(...sc.s))))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [])
  return <instancedMesh ref={ref} args={[scuffGeo, scuffMat, SCUFFS.length]} receiveShadow renderOrder={1} />
}

export default function Scenery() {
  return (
    <>
      <PatchWorld />
      <Surfaces />
      <Scuffs />
      <LawnPavers />
      <Wind />
      <Trees items={COURT_TREES} />
      <Lawn />
      <Model name="plant_a" items={plantA} />
      <Model name="plant_b" items={plantB} />
      <Model name="trash_bin" items={bins} material={greyBin} />
      <Model name="laptop" items={[...laptops, ...deskLaptops]} />
      <Model name="office_chair" items={[...deskChairs, ...meetChairs]} material={blackChair} />
      <Model name="lounge_chair" items={loungeChairs} />
      <Model name="side_table" items={loungeTables} />
      <Model name="shelf" items={shelves} material={whiteShelf} />
      <BookRows />
      <Model name="wall_clock" items={clocks} />
      <Model name="extinguisher" items={extinguishers} />
      <Model name="round_table" items={beinTables} material={oakTable} />
      <Model name="dining_chair" items={beinChairs} material={blackDiningChair} />
    </>
  )
}
