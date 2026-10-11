// The baked building: static architecture from public/baked/building.glb (Blender detail pass +
// Cycles lightmaps, tools/bake/) replaces the procedural meshes World.jsx would draw.
// Colliders still come from layout.js; doors, characters and props stay procedural.
//
// Each mesh carries glTF extras { key, atlas, role }: `key` picks the app material from
// World.jsx useMaterials() (so the albedo, normal and roughness textures and the world-space UV
// patch stay), `atlas` picks the lightmap and AO map, which sample the second UV set (uv1).
// The lightmap holds everything except the sun's direct light: sky, bounce light, classroom
// coves and library lamps. The real-time sun still lights and shadows these surfaces, and
// shaderPatch() switches off the real-time ambient, hemisphere, point lights and diffuse
// environment for them, since the map already contains that light.
// ?bake=0 falls back to the procedural building.
import { useEffect, useMemo } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import manifest from './bakedManifest.json'
import { EXPORT } from './exportGLB.js'
import Probes from './Probes.jsx'
import { CHAR_SHADOW, requestShadowUpdate } from './Lighting.jsx'

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
export const BAKED = params.get('bake') !== '0' && !EXPORT
const URL_BASE = `${import.meta.env.BASE_URL}baked/`
// N8AO already darkens corners on high quality; the baked AO adds contact shadow on top of
// the lightmap's own occlusion, so it runs at half strength. My judgment from the screenshots.
const AO_INTENSITY = Number(params.get('bakeao') ?? 0.5)
// exposure for the interior; tools/bake/bake.py divides its lamp and cove power by the same
// number so they keep their real-time brightness
const LM_GAIN = Number(params.get('lmgain') ?? 5.5)

const POINT_LOOP = '#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )'
const SUN_INFO = 'getDirectionalLightInfo( directionalLight, directLight );'
// character shadows (Lighting.jsx CharShadow): the map holds only characters, so the receivers
// here never shadow themselves and the bias only absorbs depth precision (about 2 cm)
const CHAR_FN = `
uniform sampler2D charShadowMap;
uniform mat4 charShadowMatrix;
uniform float charShadowOn;
varying vec3 vCharWorld;
float charShadow() {
  if ( charShadowOn < 0.5 ) return 1.0;
  vec4 c = charShadowMatrix * vec4( vCharWorld, 1.0 );
  if ( any( lessThan( c.xyz, vec3( 0.0 ) ) ) || any( greaterThan( c.xyz, vec3( 1.0 ) ) ) ) return 1.0;
  float d = c.z - 0.0001;
  vec2 t = vec2( 1.0 / 1024.0 );
  float s = step( d, texture2D( charShadowMap, c.xy + t * vec2( -0.7, -0.3 ) ).r );
  s += step( d, texture2D( charShadowMap, c.xy + t * vec2( 0.3, -0.7 ) ).r );
  s += step( d, texture2D( charShadowMap, c.xy + t * vec2( 0.7, 0.3 ) ).r );
  s += step( d, texture2D( charShadowMap, c.xy + t * vec2( -0.3, 0.7 ) ).r );
  return s * 0.25;
}
`

function shaderPatch(sh) {
  sh.uniforms.charShadowMap = CHAR_SHADOW.map
  sh.uniforms.charShadowMatrix = CHAR_SHADOW.matrix
  sh.uniforms.charShadowOn = CHAR_SHADOW.on
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vCharWorld;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCharWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
  // classroom and library point lights are in the map: skip them for baked surfaces
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + CHAR_FN)
    .replace(
      '#include <lights_fragment_begin>',
      THREE.ShaderChunk.lights_fragment_begin.replace(POINT_LOOP, '#if 0').replace(SUN_INFO, SUN_INFO + '\ndirectLight.color *= charShadow();') + '\nirradiance = vec3( 0.0 );',
    )
    .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( STANDARD )\niblIrradiance = vec3( 0.0 );\n#endif')
}

function bakedMaterial(src, lm, ao) {
  const m = src.clone()
  const prev = src.onBeforeCompile
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    shaderPatch(sh)
  }
  const key = src.customProgramCacheKey()
  m.customProgramCacheKey = () => `${key}|baked`
  m.side = THREE.FrontSide // the bake exported both faces of double-sided surfaces as their own meshes
  m.lightMap = lm
  // the map stores light/scale in sRGB 8-bit; Cycles' value times albedo is radiance, three
  // divides lightmap irradiance by pi, hence the pi
  m.lightMapIntensity = Math.PI * manifest.scale * LM_GAIN
  m.aoMap = ao
  m.aoMapIntensity = AO_INTENSITY
  return m
}

// Unbaked furniture (chairs) sees only the 0.22 hemisphere, the 0.05 ambient and the 0.35 room
// environment, while the baked floors and walls around it carry the lightmap at LM_GAIN, so a
// black chair read as a hole (sRGB about 7, 8, 11). This lifts its indirect diffuse by k, as
// if it caught the same bounce light; shaderPatch() above only ever runs on the baked clones.
// k is my judgment against the baked carpet in the screenshots.
export function unbakedFill(m, k) {
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (sh, r) => {
    prev?.(sh, r)
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= ${k.toFixed(2)};`)
  }
  const key = m.customProgramCacheKey()
  m.customProgramCacheKey = () => `${key}|fill${k}`
  return m
}

const coveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.86, 0.68).multiplyScalar(3), toneMapped: false })

export default function BakedBuilding({ M }) {
  const { scene } = useGLTF(`${URL_BASE}building.glb`, `${import.meta.env.BASE_URL}draco/`)
  const lms = useTexture(manifest.lightmaps.map((f) => URL_BASE + f))
  const aos = useTexture(manifest.ao.map((f) => URL_BASE + f))
  const root = useMemo(() => {
    for (const t of lms) {
      t.channel = 1
      t.flipY = false
      t.colorSpace = THREE.SRGBColorSpace
    }
    for (const t of aos) {
      t.channel = 1
      t.flipY = false
    }
    const byKey = (k) => {
      const m = k.match(/^drumIn(\d)$/)
      return m ? M.drumIn[+m[1]] : M[k] || M.white
    }
    const cache = new Map()
    scene.traverse((o) => {
      if (!o.isMesh) return
      const { key, atlas } = o.userData
      o.userData.baked = true
      if (key === 'cove' || atlas < 0) {
        o.material = coveMat
        return
      }
      // each drum shell gets its own material so Probes.jsx can give it its own reflection
      // the canopy's inner edge faces sit 0.3 mm behind the fascia's: pull the fascia forward
      const fascia = o.userData.role === 'fascia'
      const ck = /^drum_/.test(o.userData.role) ? o.userData.role : `${key}|${atlas}${fascia ? '|fascia' : ''}`
      if (!cache.has(ck)) {
        const m = bakedMaterial(byKey(key), lms[atlas], aos[atlas])
        if (fascia) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })
        cache.set(ck, m)
      }
      o.material = cache.get(ck)
      o.matrixAutoUpdate = false
      o.updateMatrix()
    })
    return scene
  }, [scene, lms, aos, M])
  // the building arrives after the first static shadow draws; draw them again with it in place
  useEffect(() => requestShadowUpdate(2), [root])
  return (
    <>
      <primitive object={root} />
      <Probes root={root} />
    </>
  )
}
