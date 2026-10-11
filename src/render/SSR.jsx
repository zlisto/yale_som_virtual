import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Effect, EffectAttribute } from 'postprocessing'
import { sceneDepth } from './depthCopy.js'

// Screen-space reflections on the glossy surfaces, which today means the clear-coated blue
// drums (photos 01-05 show them mirroring the soffit, the columns and the courtyard glass).
// The concourse carpet is matte in the photos and gets none.
//
// The effect needs no extra full-scene render. Each frame it renders only the glossy meshes
// into a small G-buffer (view-space normal plus depth), keeps pixels
// where that depth matches the scene depth, and marches the reflected ray through the scene
// depth in screen space. No temporal accumulation, so moving characters do not ghost.
// Ceiling: one hit per pixel and no roughness blur, so it suits mirror-like surfaces only; a
// rough reflector would need a G-buffer pass with roughness (realism-effects style SSR).

// glossy and opaque: the drums (roughness 0.12, clearcoat 1); glass is transparent and skipped
const isGlossy = (m) => m && !m.transparent && (m.clearcoat >= 0.5 || (m.roughness <= 0.15 && m.metalness < 0.9))

const frag = /* glsl */ `
uniform sampler2D maskDepth;
uniform sampler2D maskNormal;
uniform highp sampler2D sceneDepth;
uniform mat4 proj;
uniform mat4 invProj;
uniform float strength;
uniform float maxDist;
uniform vec3 tint;

vec3 viewPosAt(const in vec2 uv, const in float d) {
  vec4 v = invProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}
float sDepth(const in vec2 uv) {
  return texture2D(sceneDepth, uv).r;
}
vec2 toScreen(const in vec3 p) {
  vec4 c = proj * vec4(p, 1.0);
  return c.xy / c.w * 0.5 + 0.5;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = inputColor;
  float depth = sDepth(uv);
  if (depth >= 1.0) return;
  float md = texture2D(maskDepth, uv).r;
  if (md >= 1.0) return;
  float vz = getViewZ(depth);
  if (abs(vz - getViewZ(md)) > 0.01 * -vz + 0.02) return; // something sits in front of the drum

  vec3 P = viewPosAt(uv, depth);
  vec3 N = normalize(texture2D(maskNormal, uv).xyz * 2.0 - 1.0); // smooth view-space normal
  vec3 V = normalize(P);
  if (dot(N, V) > 0.0) N = -N;
  vec3 R = reflect(V, N);

  // march in screen space: project the ray's ends, clip them to the near plane and the
  // screen, and step linearly in screen space with perspective-correct depth
  vec3 E = P + R * maxDist;
  if (E.z > -cameraNear * 1.5) E = P + R * ((-cameraNear * 1.5 - P.z) / R.z);
  vec4 h0 = proj * vec4(P, 1.0);
  vec4 h1 = proj * vec4(E, 1.0);
  float k0 = 1.0 / h0.w;
  float k1 = 1.0 / h1.w;
  vec2 s0 = h0.xy * k0 * 0.5 + 0.5;
  vec2 s1 = h1.xy * k1 * 0.5 + 0.5;
  vec2 ds = s1 - s0;
  float fMax = 1.0;
  if (ds.x > 0.0) fMax = min(fMax, (1.0 - s0.x) / ds.x); else if (ds.x < 0.0) fMax = min(fMax, -s0.x / ds.x);
  if (ds.y > 0.0) fMax = min(fMax, (1.0 - s0.y) / ds.y); else if (ds.y < 0.0) fMax = min(fMax, -s0.y / ds.y);
  float z0 = P.z * k0;
  float z1 = E.z * k1;

  float prevF = 0.0;
  float prevZ = P.z;
  float prevDiff = -1.0;
  float f = 0.0;
  vec2 hit = vec2(-1.0);
  for (int i = 1; i <= STEPS; i++) {
    f = fMax * float(i) / float(STEPS);
    vec2 s = s0 + ds * f;
    float rayZ = mix(z0, z1, f) / mix(k0, k1, f);
    float diff = getViewZ(sDepth(s)) - rayZ; // > 0: the ray is behind the surface
    // a hit is a crossing from in front to behind; a large jump means it passed behind an object
    if (diff > 0.0 && prevDiff <= 0.0 && diff < max(0.4, abs(rayZ - prevZ) * 3.0)) {
      float a = prevF;
      float b = f;
      for (int j = 0; j < 6; j++) {
        float m = 0.5 * (a + b);
        vec2 sm = s0 + ds * m;
        float mz = mix(z0, z1, m) / mix(k0, k1, m);
        if (getViewZ(sDepth(sm)) - mz > 0.0) b = m; else a = m;
      }
      hit = s0 + ds * b;
      f = b;
      break;
    }
    prevF = f;
    prevZ = rayZ;
    prevDiff = diff;
  }
  if (hit.x < 0.0) return;
  float t = f * k1 / mix(k0, k1, f) * length(E - P); // world distance to the hit, for the fade

  // five taps two pixels apart soften the stair steps a single hit leaves on curved glass
  vec2 o = texelSize * 2.0;
  vec3 refl = (texture2D(inputBuffer, hit).rgb * 2.0 + texture2D(inputBuffer, hit + vec2(o.x, 0.0)).rgb + texture2D(inputBuffer, hit - vec2(o.x, 0.0)).rgb
    + texture2D(inputBuffer, hit + vec2(0.0, o.y)).rgb + texture2D(inputBuffer, hit - vec2(0.0, o.y)).rgb) / 6.0;
  vec2 edge = smoothstep(0.0, 0.12, hit) * smoothstep(0.0, 0.12, 1.0 - hit);
  float fade = edge.x * edge.y * (1.0 - smoothstep(maxDist * 0.55, maxDist, t)) * (1.0 - smoothstep(0.2, 0.8, R.z));
  float cosT = clamp(dot(-V, N), 0.0, 1.0);
  float fr = mix(0.45, 1.0, pow(1.0 - cosT, 2.0));
  float a = strength * fr * fade;
  // the drum already reflects the environment map; the traced hit replaces part of that
  outputColor.rgb = mix(inputColor.rgb, inputColor.rgb * 0.55 + refl * tint, a);
}
`

class GlossySSREffect extends Effect {
  constructor(scene, camera, { strength = 0.5, maxDist = 24, steps = 40, tint = '#9fb3e6' } = {}) {
    super('GlossySSREffect', frag, {
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      defines: new Map([['STEPS', String(steps)]]),
      uniforms: new Map([
        ['maskDepth', new THREE.Uniform(null)],
        ['maskNormal', new THREE.Uniform(null)],
        ['sceneDepth', new THREE.Uniform(null)],
        ['proj', new THREE.Uniform(new THREE.Matrix4())],
        ['invProj', new THREE.Uniform(new THREE.Matrix4())],
        ['strength', new THREE.Uniform(strength)],
        ['maxDist', new THREE.Uniform(maxDist)],
        ['tint', new THREE.Uniform(new THREE.Color(tint))],
      ]),
    })
    this.scene = scene
    this.camera = camera
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, depthTexture: new THREE.DepthTexture(1, 1) })
    this.target.depthTexture.type = THREE.UnsignedIntType
    this.uniforms.get('maskDepth').value = this.target.depthTexture
    this.uniforms.get('maskNormal').value = this.target.texture
    this.maskMat = new THREE.MeshNormalMaterial()
    this.uniforms.get('sceneDepth').value = sceneDepth
    this.frame = 0
    this.meshes = []
    this.clearColor = new THREE.Color()
  }

  // collect the glossy meshes; content mounts in waves, so re-check every two seconds
  tag() {
    const list = []
    this.scene.traverse((o) => {
      if (!o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      if (mats.some(isGlossy)) list.push(o)
    })
    this.meshes = list
  }

  // render only the glossy meshes, one draw each, with the normal material swapped in; this
  // skips the full-scene traversal a layer-filtered scene render would cost every frame
  update(renderer) {
    if (this.frame++ % 120 === 0) this.tag()
    const { camera, target } = this
    this.uniforms.get('proj').value.copy(camera.projectionMatrix)
    this.uniforms.get('invProj').value.copy(camera.projectionMatrixInverse)
    const autoClear = renderer.autoClear
    const clearAlpha = renderer.getClearAlpha()
    renderer.getClearColor(this.clearColor)
    renderer.setRenderTarget(target)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, true, false)
    renderer.autoClear = false
    for (const m of this.meshes) {
      if (!m.visible || !m.parent) continue
      const mat = m.material
      m.material = this.maskMat
      renderer.render(m, camera)
      m.material = mat
    }
    renderer.autoClear = autoClear
    renderer.setRenderTarget(null)
    renderer.setClearColor(this.clearColor, clearAlpha)
  }

  setSize(width, height) {
    this.target.setSize(width, height)
  }

  dispose() {
    this.target.dispose()
    this.maskMat.dispose()
    super.dispose()
  }
}

export default function SSR(props) {
  const { scene, camera } = useThree()
  const effect = useMemo(() => new GlossySSREffect(scene, camera, props), [scene, camera]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => effect.dispose(), [effect])
  return <primitive object={effect} />
}
