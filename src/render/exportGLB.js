// ?exportGLB=1 turns the running app into the exporter for the lightmap bake.
// The static building is collected from the live scene graph (so the bake sees exactly the
// geometry World.jsx draws), flattened to world space, grouped, and written as a GLB that
// tools/bake/bake.py imports into Blender.
//
//   bake_<role>__<key>   surfaces that get a lightmap. Meshes opt in with userData.bake = '<role>'
//                        and <key> is the app material key from World.jsx useMaterials().
//   occ__<colour>        everything else that is opaque and static (chairs, props, trees,
//                        mullions). Blender uses them as shadow casters and bounce surfaces only.
//
// Glass, transparent and unlit (MeshBasicMaterial) materials are left out, and so is anything
// under a userData.dynamic group. Light data goes into a separate JSON blob.
//
// tools/bake/export-building.mjs drives this headlessly through window.__bakeExport(); opening
// the URL by hand downloads building.glb and lights.json instead.
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SUN, SUN_DIR, DOWNLIGHT, ROOM_LIGHT, downlightSpots, roomLightSpots } from './Lighting.jsx'
import { H, ROOF, BOUNDS, COURTYARD, DRUMS, DRUM_WALL, COLUMNS, STAIRS, WALLS, RISE } from '../layout.js'

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
export const EXPORT = params.get('exportGLB') === '1'

// Flipped copies of double-sided surfaces sit this far behind the front face, so Cycles does
// not find two coincident faces when it bakes either side.
const BACK_OFFSET = 0.002

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

// base colour times the mean of the colour map, linear; good enough for bounce light
function albedo(mat) {
  const c = mat.color ? mat.color.clone() : new THREE.Color(1, 1, 1)
  const img = mat.map?.image
  if (img && img.width) {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 16
    const ctx = cv.getContext('2d')
    ctx.drawImage(img, 0, 0, 16, 16)
    const d = ctx.getImageData(0, 0, 16, 16).data
    const s = [0, 0, 0]
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += toLinear(d[i + k] / 255)
    c.multiply(new THREE.Color(s[0] / 256, s[1] / 256, s[2] / 256))
  }
  return c
}

// alpha-tested cut-outs (leaf cards) would cast solid quad shadows in Cycles, so they go too
const skip = (m) => !m || m.transparent || m.transmission > 0 || m.alphaTest > 0 || m.type === 'MeshBasicMaterial' || m.visible === false

// geometry of one material group, with position, normal and uv only, always indexed
function subGeometry(geo, group) {
  const src = geo.index ? geo : geo.clone().setIndex([...Array(geo.attributes.position.count).keys()])
  const g = new THREE.BufferGeometry()
  const n = src.attributes.position.count
  for (const a of ['position', 'normal', 'uv']) {
    // plain float32 copies: models may carry interleaved or quantized attributes, and
    // mergeGeometries needs identical array types
    const size = a === 'uv' ? 2 : 3
    const out = new Float32Array(n * size)
    const attr = src.attributes[a]
    if (attr) for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = attr.getComponent(i, k)
    g.setAttribute(a, new THREE.BufferAttribute(out, size))
  }
  if (!src.attributes.normal) {
    g.setIndex(src.index.clone())
    g.computeVertexNormals()
  }
  const idx = Array.from(src.index.array)
  g.setIndex(group ? idx.slice(group.start, group.start + group.count) : idx)
  return g
}

// reverse the winding, turn the normals round and push the copy back along its new normal
function flipped(geo, offset) {
  const g = geo.clone()
  const idx = g.index.array
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
  const n = g.attributes.normal
  const p = g.attributes.position
  for (let i = 0; i < n.count; i++) {
    n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
    p.setXYZ(i, p.getX(i) + n.getX(i) * offset, p.getY(i) + n.getY(i) * offset, p.getZ(i) + n.getZ(i) * offset)
  }
  return g
}

function collect(scene) {
  scene.updateMatrixWorld(true)
  const groups = new Map() // name -> { mat, geos, extras }
  const add = (name, mat, geo, extras) => {
    if (!groups.has(name)) groups.set(name, { mat, geos: [], extras })
    groups.get(name).geos.push(geo)
  }
  const m4 = new THREE.Matrix4()
  const im = new THREE.Matrix4()
  const visit = (o) => {
    if (o.userData.dynamic || !o.visible) return
    if (o.isMesh && !o.isSkinnedMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      const parts = Array.isArray(o.material) && o.geometry.groups.length ? o.geometry.groups : [null]
      const role = o.userData.bake
      const count = o.isInstancedMesh ? o.count : 1
      for (const grp of parts) {
        const mat = mats[grp ? grp.materialIndex : 0]
        if (skip(mat)) continue
        const base = subGeometry(o.geometry, grp)
        for (let i = 0; i < count; i++) {
          m4.copy(o.matrixWorld)
          if (o.isInstancedMesh) m4.multiply((o.getMatrixAt(i, im), im))
          const g = base.clone().applyMatrix4(m4)
          if (m4.determinant() < 0) g.copy(flipped(g, 0)) // mirrored instance: restore outward winding
          if (role) {
            const key = mat.userData.key || 'misc'
            const name = `bake_${role}__${key}`
            const side = mat.userData.oneSided ? THREE.FrontSide : mat.side
            const extras = { role, key }
            if (side !== THREE.BackSide) add(name, mat, g, extras)
            if (side === THREE.BackSide) add(name, mat, flipped(g, 0), extras)
            if (side === THREE.DoubleSide) add(`bake_${role}_back__${key}`, mat, flipped(g, BACK_OFFSET), { ...extras, role: `${role}_back` })
          } else {
            const col = albedo(mat)
            add(`occ__${col.getHexString()}`, mat, g, { role: 'occluder', albedo: col.toArray() })
          }
        }
      }
    }
    o.children.forEach(visit)
  }
  visit(scene)
  return groups
}

// Plan data for the Blender detail pass (tools/bake/detail.py): it builds mullions, fascia,
// coves, door frames, baseboards and continuous desks from the same numbers the app uses.
function layoutData() {
  const inDrum = (x, z) => DRUMS.find((d) => ((x - d.c[0]) / d.rx) ** 2 + ((z - d.c[1]) / d.rz) ** 2 < 1)
  const drums = DRUMS.map((d) => {
    const { F, back } = d.tiers
    const t = [-back[1], back[0]]
    // desks of one row share y0; each becomes (radius, angle from the aisle axis)
    const rows = new Map()
    for (const w of WALLS) {
      if (w.mat !== 'desk') continue
      const mx = (w.a[0] + w.b[0]) / 2
      const mz = (w.a[1] + w.b[1]) / 2
      if (inDrum(mx, mz) !== d) continue
      const v = [mx - F[0], mz - F[1]]
      const r = Math.hypot(v[0], v[1])
      const th = Math.atan2(v[0] * t[0] + v[1] * t[1], v[0] * back[0] + v[1] * back[1])
      if (!rows.has(w.y0)) rows.set(w.y0, [])
      rows.get(w.y0).push({ r, th, len: Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), h: w.h, depth: w.t })
    }
    return {
      id: d.id, c: d.c, rx: d.rx, rz: d.rz, gap: d.gap, doors: d.doors, arcs: d.arcs, F, back,
      front: { fc: d.front.fc, t: d.front.t, half: d.front.half },
      deskRows: [...rows.entries()].map(([y0, desks]) => ({ y0, desks })),
    }
  })
  const walls = WALLS.filter((w) => !['none', 'exterior', 'libGlass', 'beinGlass', 'meetGlass'].includes(w.mat)).map((w) => ({
    a: w.a, b: w.b, h: w.h, y0: w.y0, t: w.t, mat: w.mat, inDrum: !!inDrum((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2),
  }))
  return { H, ROOF, RISE, BOUNDS, DRUM_WALL, courtyard: COURTYARD, columns: COLUMNS, stairs: STAIRS, drums, walls }
}

async function exportBuilding(scene) {
  const out = new THREE.Scene()
  const counts = {}
  for (const [name, { mat, geos, extras }] of collect(scene)) {
    const merged = mergeGeometries(geos, false)
    const gm = new THREE.MeshStandardMaterial({
      name: extras.key || name,
      color: extras.albedo ? new THREE.Color().fromArray(extras.albedo) : albedo(mat),
      roughness: mat.roughness ?? 1,
      metalness: mat.metalness ?? 0,
    })
    const mesh = new THREE.Mesh(merged, gm)
    mesh.name = name
    mesh.userData = extras
    out.add(mesh)
    counts[name] = merged.index.count / 3
  }
  const glb = await new GLTFExporter().parseAsync(out, { binary: true })
  const lights = {
    note: 'three.js world coordinates (y up, metres); intensities in three units (lux, candela)',
    sun: { dir: SUN_DIR.toArray(), color: SUN.color, intensity: SUN.intensity },
    downlights: { ...DOWNLIGHT, y: H - 0.004, spots: downlightSpots() },
    points: roomLightSpots().map((s) => ({ p: s.p, intensity: s.i, distance: s.d, decay: ROOM_LIGHT.decay, color: ROOM_LIGHT.color })),
    hdri: 'hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    layout: layoutData(),
    triangles: counts,
  }
  return { glb, lights }
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function download(name, blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
}

export function BakeExport() {
  const { scene } = useThree()
  useEffect(() => {
    window.__bakeExport = async () => {
      const { glb, lights } = await exportBuilding(scene)
      return { glb: toBase64(glb), lights }
    }
    // the same in parts: the enlarged floor's GLB (round 4) is too big to cross the DevTools protocol
    // as one base64 string, so the driver reads it back in 8 MB slices
    window.__bakeExportParts = async () => {
      const { glb, lights } = await exportBuilding(scene)
      window.__bakeGLB = new Uint8Array(glb)
      return { size: glb.byteLength, lights }
    }
    window.__bakeSlice = (i, n) => toBase64(window.__bakeGLB.subarray(i, i + n))
    if (navigator.webdriver) return // the headless driver calls window.__bakeExport itself
    const t = setTimeout(async () => {
      const { glb, lights } = await exportBuilding(scene)
      download('building.glb', new Blob([glb], { type: 'model/gltf-binary' }))
      download('lights.json', new Blob([JSON.stringify(lights, null, 1)], { type: 'application/json' }))
    }, 4000)
    return () => clearTimeout(t)
  }, [scene])
  return null
}
