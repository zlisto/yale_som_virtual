import * as THREE from 'three'

// CC0 texture sets from ambientCG (see CREDITS.md), 1K JPGs under public/tex.
// Each image loads once; materials that need another tiling get a clone, which shares
// the GPU upload through texture.source.
const loader = new THREE.TextureLoader()
const cache = new Map()
function base(file, srgb) {
  if (!cache.has(file)) {
    const t = loader.load(`${import.meta.env.BASE_URL}tex/${file}`)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    cache.set(file, t)
  }
  return cache.get(file)
}
function tiled(file, srgb, repeat) {
  const t = base(file, srgb).clone()
  t.repeat.set(repeat[0], repeat[1])
  return t
}

// returns { map, normalMap, roughnessMap } for spreading into a material; `color` may name
// another colour map to pair with this set's normal and roughness
export function pbr(name, { repeat = [1, 1], color = true } = {}) {
  const set = {
    normalMap: tiled(`${name}_normal.jpg`, false, repeat),
    roughnessMap: tiled(`${name}_rough.jpg`, false, repeat),
  }
  if (color) set.map = tiled(`${typeof color === 'string' ? color : name}_color.jpg`, true, repeat)
  return set
}

// Instanced boxes stretch their 0..1 UVs over walls of any length, so these materials
// sample by world position instead: floor-like faces use (x, z), walls use (x + z, y).
// `scale` is tiles per meter.
export function worldUV(mat, scale) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uvScale = { value: scale }
    sh.vertexShader = sh.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      {
        #ifdef USE_INSTANCING
          mat4 wm = modelMatrix * instanceMatrix;
        #else
          mat4 wm = modelMatrix;
        #endif
        vec3 wq = (wm * vec4(position, 1.0)).xyz;
        vec3 wn = normalize(mat3(wm) * normal);
        vec2 wuv = (abs(wn.y) > 0.5 ? wq.xz : vec2(wq.x + wq.z, wq.y)) * uvScale;
        #ifdef USE_MAP
          vMapUv = wuv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = wuv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = wuv;
        #endif
      }`,
    )
    sh.vertexShader = 'uniform float uvScale;\n' + sh.vertexShader
  }
  mat.customProgramCacheKey = () => `worldUV-${scale}`
  return mat
}
