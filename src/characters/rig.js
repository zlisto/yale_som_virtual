import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF, useAnimations } from '@react-three/drei'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Shared loader for the Blender-built character GLBs in public/models (see tools/blender/).
// Files are Draco-compressed; the decoder is served from public/draco.
const BASE = import.meta.env.BASE_URL
export const DRACO = `${BASE}draco/`
export const modelUrl = (name) => `${BASE}models/${name}.glb`
export const useModel = (name) => useGLTF(modelUrl(name), DRACO)
export const preloadModel = (name) => useGLTF.preload(modelUrl(name), DRACO)

// grayscale fur strands, used as a bump map on every material named Fur/Frog/Coat/Brindle
let furBump
export function furBumpTex() {
  if (furBump) return furBump
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#808080'
  g.fillRect(0, 0, 256, 256)
  let s = 7
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  for (let i = 0; i < 6000; i++) {
    const v = 90 + Math.floor(r() * 130)
    g.strokeStyle = `rgba(${v},${v},${v},0.6)`
    const x = r() * 256
    const y = r() * 256
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + r() * 4 - 2, y + 3 + r() * 6)
    g.stroke()
  }
  furBump = new THREE.CanvasTexture(c)
  furBump.wrapS = furBump.wrapT = THREE.RepeatWrapping
  furBump.repeat.set(4, 4)
  return furBump
}
// cloth normal map: a plain weave (over-under threads) with a few soft creases, built once on a canvas
let clothNormal
export function clothNormalTex() {
  if (clothNormal) return clothNormal
  const N = 256
  const h = new Float32Array(N * N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = (x / N) * 2 * Math.PI * 32
      const v = (y / N) * 2 * Math.PI * 32
      const warp = Math.sin(u) * Math.max(0, Math.cos(v / 2)) // threads cross over and under
      const weft = Math.sin(v) * Math.max(0, -Math.cos(u / 2))
      const crease = 0.6 * Math.sin((x + 0.5 * y) / N * 2 * Math.PI * 3) * Math.sin((y / N) * 2 * Math.PI * 2)
      h[y * N + x] = 0.5 * (warp + weft) + crease
    }
  const data = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const at = (i, j) => h[((j + N) % N) * N + ((i + N) % N)]
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5
      const l = Math.hypot(dx, dy, 1)
      const k = (y * N + x) * 4
      data[k] = Math.round((0.5 - (0.5 * dx) / l) * 255)
      data[k + 1] = Math.round((0.5 - (0.5 * dy) / l) * 255)
      data[k + 2] = Math.round((0.5 + 0.5 / l) * 255)
      data[k + 3] = 255
    }
  clothNormal = new THREE.DataTexture(data, N, N)
  clothNormal.wrapS = clothNormal.wrapT = THREE.RepeatWrapping
  clothNormal.minFilter = THREE.LinearMipmapLinearFilter
  clothNormal.magFilter = THREE.LinearFilter
  clothNormal.generateMipmaps = true
  clothNormal.needsUpdate = true
  return clothNormal
}

// Material looks, by glTF material name (the names come from tools/blender/*.py):
//   fur      fur bump, roughness 0.75, a small warm fresnel rim (light scattering through the pile)
//   skin     roughness 0.65, a warmer, stronger rim (a cheap stand-in for subsurface scattering)
//   cloth    weave normal map, roughness 0.85
//   eye      MeshPhysicalMaterial with clearcoat 1.0 at roughness 0.05 (the wet, glassy toy eye)
//   glossy   teeth and Dan's nose: clearcoat 0.5
//   glint    the eye highlights: unlit white
const LOOK = {
  Fur: 'fur', Coat: 'fur', Brindle: 'fur', DarkBrindle: 'fur',
  Skin: 'skin',
  Frog: 'cloth', Shirt: 'cloth', Robe: 'cloth', Trim: 'cloth', Hat: 'cloth', Shawl: 'cloth', Fringe: 'cloth', Cravat: 'cloth', Collar: 'cloth',
  EyeWhite: 'eye', Iris: 'eye', Pupil: 'eye', Eye: 'eye', MagicEye: 'eye',
  Teeth: 'glossy', Tooth: 'glossy', Nose: 'glossy', Tongue: 'glossy',
  EyeGlint: 'glint', Glint: 'glint',
  Hair: 'hair', BrowWhite: 'hair',
  // professors (tools/blender/professor.py): cape, sash, bow tie, lips, inner ear, boots, grey streaks, Moody's iris
  Cloak: 'cloth', Sash: 'cloth', Bowtie: 'cloth', Lip: 'skin', EarIn: 'skin', Boot: 'glossy', HairGrey: 'hair', MagicIris: 'eye',
}
const RIM = { fur: [0.1, new THREE.Color(1.0, 0.85, 0.7)], skin: [0.16, new THREE.Color(1.0, 0.5, 0.38)] }
const CLOTH_REPEAT = { Shirt: 6, Frog: 5, Robe: 1, Trim: 1, Hat: 4, Shawl: 4, Fringe: 4, Cravat: 4, Collar: 6, Cloak: 1, Sash: 4, Bowtie: 6 }

// small warm fresnel term added to the emissive radiance; `u` holds uRim (strength) and uRimColor
export const RIM_GLSL = /* glsl */ `
  float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
  totalEmissiveRadiance += uRimColor * diffuseColor.rgb * rimF * uRim;`
function rimPatch(sh, u) {
  Object.assign(sh.uniforms, u)
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${RIM_GLSL}`)
}

function toPhysical(m, extra) {
  const p = new THREE.MeshPhysicalMaterial({
    name: m.name, color: m.color, map: m.map, roughness: m.roughness, metalness: m.metalness,
    emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, emissiveMap: m.emissiveMap, side: m.side, ...extra,
  })
  p.userData.dressed = true
  return p
}

const dressed = new WeakMap() // glTF materials are shared by every copy of a model: convert each once
export function dressMaterial(m) {
  const look = LOOK[m.name]
  if (!look) return m
  if (look === 'eye' || look === 'glossy') {
    if (m.isMeshPhysicalMaterial) return m
    if (!dressed.has(m))
      dressed.set(m, toPhysical(m, look === 'eye' ? { clearcoat: 1.0, clearcoatRoughness: 0.05, roughness: m.name === 'EyeWhite' ? 0.3 : 0.15 } : { clearcoat: 0.5, clearcoatRoughness: 0.15, roughness: 0.3 }))
    return dressed.get(m)
  }
  if (look === 'glint') {
    m.emissive.set('#ffffff')
    m.emissiveIntensity = 1.2
    return m
  }
  if (look === 'hair') {
    m.roughness = 0.55
    return m
  }
  if (look === 'cloth') {
    m.normalMap = clothNormalTex()
    m.normalScale = new THREE.Vector2(0.35, 0.35)
    m.roughness = 0.85
    // one shared texture, so the tiling lives in the material: scale the UVs in the shader
    const rep = CLOTH_REPEAT[m.name] ?? 4
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uClothRep = { value: rep }
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uClothRep;')
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replaceAll('vNormalMapUv', '( vNormalMapUv * uClothRep )'))
    }
    m.customProgramCacheKey = () => 'cloth'
    return m
  }
  // fur and skin
  if (look === 'fur') {
    m.bumpMap = furBumpTex()
    m.bumpScale = 1.2
    m.roughness = 0.75
  } else m.roughness = 0.65
  const [k, c] = RIM[look]
  const u = { uRim: { value: k }, uRimColor: { value: c } }
  m.userData.rim = u
  m.onBeforeCompile = (sh) => rimPatch(sh, u)
  m.customProgramCacheKey = () => 'rim'
  return m
}

// ---------- shell fur
// Fur is drawn as stacked shells: the fur mesh is drawn again N times in one instanced draw call, each copy
// pushed out along the skinned normal by (shell / N) * length, and each shell keeps only the texels whose
// strand value exceeds its height. Strands therefore taper toward the tips. Shells are alpha-clipped
// (opaque pass, no sorting) and cast no shadows. Lengths are in model meters (the Labubu is 1.15 m tall).
// ?fur=0 turns the shells off (A/B frame-rate checks)
export const FUR_ON = typeof location === 'undefined' || new URLSearchParams(location.search).get('fur') !== '0'
export const FUR = {
  Fur: { len: 0.02, scale: 1 / 0.28, shells: 12, mask: 'labubu', ao: 0.72 },
  Coat: { len: 0.008, scale: 1 / 0.16, shells: 8, mask: 'none', ao: 0.9 }, // ao: shell brightness at the roots (Dan's white coat stays white)
  Brindle: { len: 0.008, scale: 1 / 0.16, shells: 8, mask: 'none', ao: 0.9 },
}

// strand texture: a jittered grid of round strands; each texel holds strand length x radial falloff
let strands
export function strandTex() {
  if (strands) return strands
  const N = 256
  const C = 4 // pixels per strand cell: 64 x 64 strands per tile
  const K = N / C
  let s = 11
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const cells = Array.from({ length: K * K }, () => ({ x: (0.2 + 0.6 * r()) * C, y: (0.2 + 0.6 * r()) * C, len: 0.5 + 0.5 * r(), rad: C * (0.42 + 0.3 * r()) }))
  const data = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const ci = Math.floor(x / C)
      const cj = Math.floor(y / C)
      let best = 0
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const i = (ci + di + K) % K
          const j = (cj + dj + K) % K
          const c = cells[j * K + i]
          const dx = (ci + di) * C + c.x - x
          const dy = (cj + dj) * C + c.y - y
          const v = c.len * (1 - Math.hypot(dx, dy) / c.rad)
          if (v > best) best = v
        }
      const k = (y * N + x) * 4
      data[k] = data[k + 1] = data[k + 2] = Math.round(Math.min(1, best) * 255)
      data[k + 3] = 255
    }
  strands = new THREE.DataTexture(data, N, N)
  strands.wrapS = strands.wrapT = THREE.RepeatWrapping
  strands.magFilter = THREE.LinearFilter
  strands.minFilter = THREE.LinearMipmapLinearFilter
  strands.generateMipmaps = true
  strands.needsUpdate = true
  return strands
}

// Where the Labubu fur is shortened, in bind-pose mesh coordinates (three.js Y up, feet at y = 0, front +z):
// short on the ears so the pink inner ear shows, none under the tee (uClothes 1) or the hoodie (uClothes 2).
const MASKS = {
  none: 'float furMask(vec3 p) { return 1.0; }',
  labubu: /* glsl */ `
    float furMask(vec3 p) {
      float m = 1.0 - 0.7 * smoothstep(0.88, 0.95, p.y);
      // none around the bare face (the face ellipsoid, grown 4 cm) so the head and hood rim stay off it
      vec3 f = (p - vec3(0.0, 0.712, 0.105)) / vec3(0.255, 0.23, 0.24);
      m *= smoothstep(1.0, 1.12, dot(f, f));
      float ax = abs(p.x);
      if (uClothes > 0.5 && uClothes < 1.5) {
        if (ax < 0.222 && p.y > 0.25 && p.y < 0.47) m = 0.0;
        if (ax > 0.14 && ax < 0.28 && p.y > 0.39 && p.y < 0.49) m = 0.0;
      } else if (uClothes > 1.5) {
        if (ax < 0.232 && p.y > 0.18 && p.y < 0.48) m = 0.0;
        if (ax > 0.14 && ax < 0.3 && p.y > 0.28 && p.y < 0.5) m = 0.0;
        if (ax < 0.19 && p.y > 0.4 && p.y < 0.6 && p.z < -0.04) m = 0.0;
      }
      return m;
    }`,
}

// Patches a MeshStandardMaterial into a fur shell material. `items` is the instance count of an
// InstancedMesh (shells are then drawn shell-major: instance i is item i % items in shell i / items).
export function shellMaterial(base, cfg, { items = 1, clothes = 0 } = {}) {
  const m = base.clone()
  m.color = base.color // share the tint, so a later color change reaches the shells too
  m.name = `${base.name}Shells`
  m.bumpMap = null
  const u = {
    uFurLen: { value: cfg.len },
    uFurScale: { value: cfg.scale },
    uFurAO: { value: cfg.ao ?? 0.72 },
    uShellCount: { value: cfg.shells },
    uItems: { value: items },
    uClothes: { value: clothes },
    uStrands: { value: strandTex() },
  }
  m.userData.fur = u
  const rim = base.userData.rim
  m.onBeforeCompile = (sh) => {
    if (rim) rimPatch(sh, rim)
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFurLen, uShellCount, uItems, uClothes;
        varying vec3 vFurP, vFurN;
        varying float vShellK, vFurMask;
        ${MASKS[cfg.mask]}`,
      )
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>
        float shell = float(gl_InstanceID / int(uItems + 0.5));
        vShellK = (shell + 1.0) / uShellCount;
        vFurP = position;
        vFurN = normal;
        vFurMask = furMask(position);
        float furLen = uFurLen * vFurMask * vShellK;
        transformed += normalize(objectNormal) * furLen;
        transformed.y -= 0.35 * furLen * vShellK; // a little droop toward the tips`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFurScale, uFurAO;
        uniform sampler2D uStrands;
        varying vec3 vFurP, vFurN;
        varying float vShellK, vFurMask;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 bw = pow(abs(normalize(vFurN)), vec3(4.0));
        bw /= bw.x + bw.y + bw.z;
        vec3 fp = vFurP * uFurScale;
        float strand = texture2D(uStrands, fp.zy).r * bw.x + texture2D(uStrands, fp.xz).r * bw.y + texture2D(uStrands, fp.xy).r * bw.z;
        if (vFurMask < 0.05 || strand < vShellK) discard;
        diffuseColor.rgb *= mix(uFurAO, 1.05, vShellK); // darker toward the roots`,
      )
  }
  m.customProgramCacheKey = () => `furshell-${cfg.mask}-${rim ? 'rim' : ''}`
  return m
}

const _p = new THREE.Vector3()
// Adds a shell copy next to every skinned fur mesh in `o`. `clothes(mesh)` gives the uClothes value.
// Shell count drops with camera distance; past 15 m the shells stop drawing (a strand is under a pixel there).
export function addFurShells(o, clothes = 0) {
  if (!FUR_ON) return
  const furry = []
  o.traverse((m) => m.isSkinnedMesh && FUR[m.material.name] && !m.userData.shell && furry.push(m))
  for (const m of furry) {
    const cfg = FUR[m.material.name]
    const g = new THREE.InstancedBufferGeometry()
    g.setIndex(m.geometry.index)
    for (const [k, a] of Object.entries(m.geometry.attributes)) g.setAttribute(k, a)
    g.instanceCount = cfg.shells
    const mat = shellMaterial(m.material, cfg, { clothes })
    const s = new THREE.SkinnedMesh(g, mat)
    s.name = `${m.name}_shells`
    s.userData.shell = true
    s.position.copy(m.position)
    s.quaternion.copy(m.quaternion)
    s.scale.copy(m.scale)
    s.bind(m.skeleton, m.bindMatrix)
    s.castShadow = false
    s.receiveShadow = true
    // frustum-cull the shells with a fixed sphere around the bind pose, grown 0.5 m for hops and waves
    // (the base meshes skip culling; drawing shells for every Labubu behind a wall cost 4 M triangles)
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
    s.boundingSphere = m.geometry.boundingSphere.clone()
    s.boundingSphere.radius += 0.5
    s.frustumCulled = true
    s.onBeforeRender = (r, sc, cam) => {
      const d = cam.position.distanceTo(_p.setFromMatrixPosition(s.matrixWorld))
      const n = d < 5 ? cfg.shells : d < 9 ? Math.ceil(cfg.shells * 0.6) : d < 15 ? 3 : 0
      g.instanceCount = n
      mat.userData.fur.uShellCount.value = Math.max(n, 1)
    }
    m.parent.add(s)
    m.userData.shells = s
  }
}

// A private copy of a skinned GLB scene with its own materials (so tints don't leak between characters).
// `setup(object, cloneMat)` runs once on the copy; cloneMat(name) swaps in a private clone of that material.
// `opts.clothes` is the uClothes value for the fur shells (0 none, 1 tee, 2 hoodie).
export function useRigInstance(name, setup, deps = [], opts = {}) {
  const { scene, animations } = useModel(name)
  const object = useMemo(() => {
    const o = cloneSkinned(scene)
    const mine = new Map()
    o.traverse((m) => {
      if (!m.isMesh) return
      m.castShadow = true
      m.receiveShadow = true
      // skinned bounds follow the bind pose, not the animation: cull with the bind-pose sphere grown
      // 0.5 m (hops, raised arms). Drawing every Labubu in the building each frame cost about 10 fps
      // once the bodies were subdivided.
      if (m.isSkinnedMesh) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
        m.boundingSphere = m.geometry.boundingSphere.clone()
        m.boundingSphere.radius += 0.5
      } else m.frustumCulled = false
      m.material = dressMaterial(m.material)
    })
    const cloneMat = (matName) => {
      if (!mine.has(matName)) {
        let base
        o.traverse((m) => m.isMesh && m.material.name === matName && (base = m.material))
        if (!base) return null
        const c = dressMaterial(base.clone())
        mine.set(matName, c)
        o.traverse((m) => m.isMesh && m.material === base && (m.material = c))
      }
      return mine.get(matName)
    }
    setup?.(o, cloneMat)
    addFurShells(o, opts.clothes ?? 0)
    return o
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, ...deps])
  const { actions, mixer } = useAnimations(animations, object)
  return { object, actions, mixer }
}

// Plays one clip at a time and cross-fades on change. Returns play(name, opts).
export function useClipPlayer(actions, fade = 0.3) {
  const cur = useRef(null)
  useEffect(() => () => (cur.current = null), [actions])
  return (name, { timeScale = 1, time, once = false } = {}) => {
    const next = actions[name]
    if (!next) return null
    next.timeScale = timeScale
    if (cur.current === next) return next
    next.reset()
    if (once) {
      next.setLoop(THREE.LoopOnce, 1)
      next.clampWhenFinished = true
    } else next.setLoop(THREE.LoopRepeat, Infinity)
    if (time !== undefined) next.time = time
    next.play()
    if (cur.current) next.crossFadeFrom(cur.current, cur.current ? fade : 0, false)
    cur.current = next
    return next
  }
}
