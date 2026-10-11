import { useMemo } from 'react'
import * as THREE from 'three'
import { Effect } from 'postprocessing'

// Colour grade after tone mapping, tuned to the interior photos (01, 03, 05, 09, 19, 24):
// clean, slightly cool daylight on white and grey surfaces, with the wood and the saddle
// leather staying warm and rich. One merged effect, so it adds no render pass.
//   balance       white balance multiplier (a touch cooler)
//   contrast      deepens the lower half of the range only (toe), so whites keep their level
//   saturation    global saturation; warm hues (wood, leather) get warmBoost on top
//   shadowTint / highlightTint   split toning added in display space
const frag = /* glsl */ `
uniform vec3 balance;
uniform float contrast;
uniform float saturation;
uniform float warmBoost;
uniform vec3 shadowTint;
uniform vec3 highlightTint;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb * balance, 0.0);
  vec3 p = pow(c, vec3(1.0 / 2.2));
  vec3 toe = p * p * (3.0 - 2.0 * p);
  p = mix(p, min(p, toe), contrast);
  float l = dot(p, vec3(0.2126, 0.7152, 0.0722));
  p += shadowTint * (1.0 - smoothstep(0.0, 0.45, l)) + highlightTint * smoothstep(0.55, 1.0, l);
  vec3 hsl = RGBToHSL(clamp(p, 0.0, 1.0));
  // orange to amber hues (about 15 to 45 degrees) with some chroma: wood and leather
  float warm = (1.0 - smoothstep(0.04, 0.09, abs(hsl.x - 0.08))) * smoothstep(0.08, 0.25, hsl.y);
  p = mix(vec3(l), p, saturation + warm * warmBoost);
  outputColor = vec4(pow(max(p, 0.0), vec3(2.2)), inputColor.a);
}
`

class GradeEffect extends Effect {
  constructor({ balance = [0.985, 1.0, 1.02], contrast = 0.25, saturation = 1.04, warmBoost = 0.03, shadowTint = [-0.004, 0.0, 0.008], highlightTint = [0.0, 0.002, 0.006] } = {}) {
    super('GradeEffect', frag, {
      uniforms: new Map([
        ['balance', new THREE.Uniform(new THREE.Vector3(...balance))],
        ['contrast', new THREE.Uniform(contrast)],
        ['saturation', new THREE.Uniform(saturation)],
        ['warmBoost', new THREE.Uniform(warmBoost)],
        ['shadowTint', new THREE.Uniform(new THREE.Vector3(...shadowTint))],
        ['highlightTint', new THREE.Uniform(new THREE.Vector3(...highlightTint))],
      ]),
    })
  }
}

export default function Grade(props) {
  const effect = useMemo(() => new GradeEffect(props), []) // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive object={effect} dispose={null} />
}
