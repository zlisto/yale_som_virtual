import * as THREE from 'three'
import { Pass } from 'postprocessing'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

// postprocessing attaches its scene depth texture to one of its two ping-pong buffers. Two
// things go wrong for effects that read it later in the chain: a convolution pass that samples
// it while writing into that same buffer forms a WebGL feedback loop (which buffer a pass
// writes to flips with every pass before it), and a pass that clears that buffer wipes the
// depth. DepthCopyPass sits first in the composer, right after the scene render, and copies
// depth into a float texture that SSR and the far blur read. One fullscreen draw.
// The effects still declare EffectAttribute.DEPTH, for cameraNear/Far and getViewZ, but never
// sample depthBuffer themselves.
const mat = new THREE.ShaderMaterial({
  uniforms: { src: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform highp sampler2D src; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(src, vUv).r, 0.0, 0.0, 1.0); }',
  depthTest: false,
  depthWrite: false,
})
const quad = new FullScreenQuad(mat)
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })

// the copy every effect samples; it starts at depth 1 (far) until the first frame
export const sceneDepth = target.texture

export class DepthCopyPass extends Pass {
  constructor() {
    super('DepthCopyPass')
    this.needsSwap = false
    this.needsDepthTexture = true
    this.source = null
  }
  setDepthTexture(depthTexture) {
    this.source = depthTexture
  }
  setSize(w, h) {
    target.setSize(w, h)
  }
  render(renderer) {
    if (!this.source) return
    mat.uniforms.src.value = this.source
    renderer.setRenderTarget(target)
    quad.render(renderer)
  }
}
