import { useMemo } from 'react'
import * as THREE from 'three'
import { Effect, EffectAttribute } from 'postprocessing'
import { sceneDepth } from './depthCopy.js'

// A far-only depth of field: everything nearer than `focus` metres stays sharp, and the blur
// grows to `maxRadius` pixels over the next `range` metres. In practice only the far end of
// the 95 m cloister and the sky past the courtyard soften. Twelve Poisson taps, each weighted
// by its own blur amount, so a sharp near object does not bleed into the blurred distance.
// It reads the shared depth copy (see depthCopy.js): postprocessing's DepthOfFieldEffect reads
// the composer depth directly and hits a feedback loop when it lands on the depth buffer.
const frag = /* glsl */ `
uniform highp sampler2D sceneDepth;
uniform float focus;
uniform float range;
uniform float maxRadius;

const vec2 DISK[12] = vec2[](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
);

float blurAt(const in vec2 uv) {
  float d = texture2D(sceneDepth, uv).r;
  float dist = d >= 1.0 ? 1e4 : -getViewZ(d);
  return smoothstep(focus, focus + range, dist);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float b = blurAt(uv);
  if (b < 0.01) {
    outputColor = inputColor;
    return;
  }
  vec2 r = texelSize * maxRadius * b;
  vec3 sum = inputColor.rgb;
  float w = 1.0;
  for (int i = 0; i < 12; i++) {
    vec2 q = uv + DISK[i] * r;
    float wi = blurAt(q);
    sum += texture2D(inputBuffer, q).rgb * wi;
    w += wi;
  }
  outputColor = vec4(sum / w, inputColor.a);
}
`

class FarBlurEffect extends Effect {
  constructor({ focus = 40, range = 50, maxRadius = 2 } = {}) {
    super('FarBlurEffect', frag, {
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map([
        ['sceneDepth', new THREE.Uniform(null)],
        ['focus', new THREE.Uniform(focus)],
        ['range', new THREE.Uniform(range)],
        ['maxRadius', new THREE.Uniform(maxRadius)],
      ]),
    })
    this.uniforms.get('sceneDepth').value = sceneDepth
  }
}

export default function FarBlur(props) {
  const effect = useMemo(() => new FarBlurEffect(props), []) // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive object={effect} dispose={null} />
}
