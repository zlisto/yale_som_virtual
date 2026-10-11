import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Particle bursts for the spell school: two pooled THREE.Points (additive sparks, alpha-blended smoke).
// Each particle keeps its birth time, start position and velocity in attributes and the vertex shader moves it,
// so a burst costs one partial attribute upload and nothing per frame after that.
//   fx.sparks([x, y, z], { count = 200, colors, speed = 2.2, life = 0.8, up = 0.6, size = 0.09, dir })
//   fx.smoke([x, y, z], { count = 60, life = 1.4 })
// the two ring buffers hold 400 particles in all, so no more than 400 are ever alive at once
const CAP = { sparks: 260, smoke: 140 }
const pools = {}

const VERT = /* glsl */ `
  attribute vec3 aVel;
  attribute vec3 aColor;
  attribute vec2 aLife; // birth time, lifetime
  attribute float aSize;
  uniform float uTime, uGravity, uDrag, uScale;
  varying vec3 vColor;
  varying float vAge;
  void main() {
    float age = (uTime - aLife.x) / aLife.y;
    vAge = age;
    vColor = aColor;
    float t = uTime - aLife.x;
    float k = (1.0 - exp(-uDrag * t)) / uDrag; // velocity decays with drag
    vec3 p = position + aVel * k + vec3(0.0, -0.5 * uGravity * t * t, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float alive = step(0.0, age) * step(age, 1.0);
    gl_PointSize = alive * aSize * uScale / -mv.z * (1.0 + uGravity * 0.0);
  }`
const FRAG_SPARK = /* glsl */ `
  varying vec3 vColor;
  varying float vAge;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = exp(-d * d * 28.0);
    float fade = 1.0 - smoothstep(0.55, 1.0, vAge);
    gl_FragColor = vec4(vColor * (0.6 + 1.6 * core) * fade, 1.0);
  }`
const FRAG_SMOKE = /* glsl */ `
  varying vec3 vColor;
  varying float vAge;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = (1.0 - d * 2.0) * (1.0 - vAge) * 0.55;
    gl_FragColor = vec4(vColor, a);
  }`

function makePool(kind) {
  const n = CAP[kind]
  const g = new THREE.BufferGeometry()
  const attr = (k, size) => {
    const a = new THREE.BufferAttribute(new Float32Array(n * size), size)
    a.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute(k, a)
    return a
  }
  const pos = attr('position', 3)
  const vel = attr('aVel', 3)
  const col = attr('aColor', 3)
  const life = attr('aLife', 2)
  const size = attr('aSize', 1)
  for (let i = 0; i < n; i++) life.setXY(i, -100, 1)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)
  const smoke = kind === 'smoke'
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: smoke ? FRAG_SMOKE : FRAG_SPARK,
    uniforms: { uTime: { value: 0 }, uGravity: { value: smoke ? -0.35 : 1.6 }, uDrag: { value: smoke ? 1.2 : 2.2 }, uScale: { value: 600 } },
    transparent: true,
    depthWrite: false,
    blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
  })
  const points = new THREE.Points(g, m)
  points.frustumCulled = false
  points.renderOrder = 10
  return { n, next: 0, points, pos, vel, col, life, size, m, time: 0, lo: Infinity, hi: -1 }
}

const C = new THREE.Color()
function emit(kind, p, { count, colors, speed, life, up, size, dir = null, spread = 1 }) {
  const P = pools[kind]
  if (!P) return
  for (let k = 0; k < count; k++) {
    const i = P.next
    P.next = (P.next + 1) % P.n
    P.lo = Math.min(P.lo, i)
    P.hi = Math.max(P.hi, i)
    if (P.next === 0) {
      P.lo = 0
      P.hi = P.n - 1
    }
    // random direction, biased along `dir` (a cone) when given
    let x = Math.random() * 2 - 1
    let y = Math.random() * 2 - 1
    let z = Math.random() * 2 - 1
    const l = Math.hypot(x, y, z) || 1
    const s = speed * (0.35 + 0.65 * Math.random())
    x = (x / l) * spread
    y = (y / l) * spread
    z = (z / l) * spread
    if (dir) {
      x += dir[0]
      y += dir[1]
      z += dir[2]
    }
    P.pos.setXYZ(i, p[0], p[1], p[2])
    P.vel.setXYZ(i, x * s, y * s + up, z * s)
    C.set(colors[k % colors.length])
    P.col.setXYZ(i, C.r, C.g, C.b)
    P.life.setXY(i, P.time, life * (0.7 + 0.3 * Math.random()))
    P.size.setX(i, size * (0.6 + 0.8 * Math.random()))
  }
}

export const fx = {
  sparks(p, o = {}) {
    emit('sparks', p, { count: 200, colors: ['#4a8fe7', '#ff6fb5', '#ffffff'], speed: 2.2, life: 0.8, up: 0.6, size: 0.09, ...o })
  },
  smoke(p, o = {}) {
    emit('smoke', p, { count: 60, colors: ['#8d8a86', '#b5b1ab', '#6f6c69'], speed: 0.8, life: 1.4, up: 0.5, size: 0.5, ...o })
  },
}

export function Bursts() {
  const list = useMemo(() => {
    pools.sparks = makePool('sparks')
    pools.smoke = makePool('smoke')
    return [pools.sparks, pools.smoke]
  }, [])
  useFrame(({ clock, size, gl }) => {
    for (const P of list) {
      P.time = clock.elapsedTime
      P.m.uniforms.uTime.value = P.time
      P.m.uniforms.uScale.value = (size.height * gl.getPixelRatio()) / 1.4
      if (P.hi >= 0) {
        for (const a of [P.pos, P.vel, P.col, P.life, P.size]) {
          a.clearUpdateRanges()
          a.addUpdateRange(P.lo * a.itemSize, (P.hi - P.lo + 1) * a.itemSize)
          a.needsUpdate = true
        }
        P.lo = Infinity
        P.hi = -1
      }
    }
  })
  return list.map((P, i) => <primitive key={i} object={P.points} />)
}
