import { useMemo } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { OFF } from '../render/debugCam.js'
import { addFurShells, dressMaterial, useModel } from '../characters/rig.js'
import { FACE_OF, outfit } from '../Labubu.jsx'
import { sound, soundState } from '../interact/index.jsx'

// Shared pieces for the living building (src/life and the LabubuCrowd extras).
// ?off=life switches every animated extra off (frame-rate A/B), leaving the scene as it was before.
export const LIFE_ON = !OFF.has('life')

export function rand(seed) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}
export const lerp = (a, b, u) => a + (b - a) * u
export const clamp01 = (u) => Math.min(1, Math.max(0, u))
export const smooth = (u) => u * u * (3 - 2 * u)
export const angleTo = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]) // yaw that faces +z toward `to`
export function turnToward(obj, yaw, k) {
  let d = yaw - obj.rotation.y
  d = Math.atan2(Math.sin(d), Math.cos(d))
  obj.rotation.y += d * Math.min(1, k)
}

// ---------- per-frame CPU cost of the life systems (dev readout: window.__lifeMs())
const costs = new Float64Array(120)
let costFrame = -1
let costIdx = 0
export function lifeCost(frame, ms) {
  if (frame !== costFrame) {
    costFrame = frame
    costIdx = (costIdx + 1) % costs.length
    costs[costIdx] = 0
  }
  costs[costIdx] += ms
}
if (typeof window !== 'undefined' && import.meta.env.DEV) window.__lifeMs = () => costs.reduce((a, b) => a + b, 0) / costs.length
// runtime switch for in-page A/B frame timing (dev: window.__lifeToggle(false)); ?off=life is the hard switch
export const LIFE = { on: true }
if (typeof window !== 'undefined' && import.meta.env.DEV) window.__lifeToggle = (v) => (LIFE.on = v)
// wraps a useFrame body so its CPU time is counted (and skipped while the life switch is off)
export const timed = (fn) => (state, dt) => {
  if (!LIFE.on) return
  const t0 = performance.now()
  fn(state, dt)
  lifeCost(state.clock.elapsedTime, performance.now() - t0)
}

// ---------- a skinned Labubu whose mixer only runs while it is near the camera and in view
// (drei's useAnimations ticks every mixer every frame; 50 extra Labubus behind walls do not need that)
const _p = new THREE.Vector3()
const _s = new THREE.Sphere()
const _f = new THREE.Frustum()
const _m = new THREE.Matrix4()
let frustumFrame = -1
export function useLabubuRig({ model = 'labubu', fur = '#5a3d2e', expression = 'grin', shirt = null, pants = null, overalls = false }) {
  const { scene, animations } = useModel(model)
  const wear = outfit(shirt, pants, overalls)
  const rig = useMemo(() => {
    const o = cloneSkinned(scene)
    const mats = new Map()
    o.traverse((m) => {
      if (!m.isMesh) return
      m.castShadow = true
      m.receiveShadow = true
      if (m.isSkinnedMesh) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
        m.boundingSphere = m.geometry.boundingSphere.clone()
        m.boundingSphere.radius += 0.5
      } else m.frustumCulled = false
      m.material = dressMaterial(m.material)
    })
    const cloneMat = (name) => {
      if (!mats.has(name)) {
        let base
        o.traverse((m) => m.isMesh && m.material.name === name && (base = m.material))
        if (!base) return null
        const c = dressMaterial(base.clone())
        mats.set(name, c)
        o.traverse((m) => m.isMesh && m.material === base && (m.material = c))
      }
      return mats.get(name)
    }
    const faces = {}
    for (const f of ['grin', 'surprised', 'sleepy']) faces[f] = o.getObjectByName(`Face_${f}`)
    for (const k of ['Tee', 'Hoodie']) {
      const n = o.getObjectByName(k)
      if (n) n.visible = k === wear.kind
    }
    cloneMat('Fur')?.color.set(fur)
    if (wear.kind) cloneMat('Shirt')?.color.set(wear.color)
    addFurShells(o, wear.kind === 'Tee' ? 1 : wear.kind === 'Hoodie' ? 2 : 0)
    const mixer = new THREE.AnimationMixer(o)
    const actions = {}
    for (const c of animations) actions[c.name] = mixer.clipAction(c)
    let cur = null
    let face = null
    const bones = {}
    o.traverse((b) => b.isBone && (bones[b.name] = b))
    const r = {
      object: o,
      mixer,
      actions,
      bones,
      clip: null,
      setFace(f) {
        f = FACE_OF[f] || f
        if (f === face) return
        face = f
        for (const [k, n] of Object.entries(faces)) if (n) n.visible = k === f
      },
      // one clip at a time, cross-faded (same as rig.js useClipPlayer)
      play(name, { timeScale = 1, fade = 0.3, once = false, time } = {}) {
        const next = actions[name]
        if (!next) return null
        next.timeScale = timeScale
        if (cur === next) return next
        next.reset()
        if (once) {
          next.setLoop(THREE.LoopOnce, 1)
          next.clampWhenFinished = true
        } else next.setLoop(THREE.LoopRepeat, Infinity)
        if (time !== undefined) next.time = time
        next.play()
        if (cur) next.crossFadeFrom(cur, fade, false)
        cur = next
        r.clip = name
        return next
      },
      // advance the mixer when the character is within `far` m of the camera and inside the view
      // and stop drawing it past `hide` m (a Labubu is a few pixels tall there)
      tick(dt, state, far = 32, hide = 40) {
        const camera = state.camera
        o.getWorldPosition(_p)
        const d = camera.position.distanceTo(_p)
        o.visible = d < hide
        if (d > far || !o.visible) return false
        if (frustumFrame !== state.clock.elapsedTime) {
          frustumFrame = state.clock.elapsedTime
          _f.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
        }
        _s.center.copy(_p)
        _s.center.y += 0.6
        _s.radius = 1.5
        if (d > 3 && !_f.intersectsSphere(_s)) return false
        mixer.update(dt)
        return true
      },
    }
    r.setFace(expression)
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])
  return rig
}

// a bone-attached prop: `mesh` follows bone `name` of the rig with a local offset (bone axes: Y along the bone)
export function attach(rig, name, mesh) {
  const b = rig.bones[name]
  if (b) b.add(mesh)
  return () => b && b.remove(mesh)
}

// ---------- soft positional chimes for spells and pops (Web Audio through the shared context, mute-aware)
function voice(x, y, z) {
  const ctx = sound.context
  if (!ctx || soundState.get().muted || ctx.state !== 'running') return null
  const pn = ctx.createPanner()
  pn.panningModel = 'HRTF'
  pn.distanceModel = 'inverse'
  pn.refDistance = 2
  pn.rolloffFactor = 1.4
  if (pn.positionX) {
    pn.positionX.value = x
    pn.positionY.value = y
    pn.positionZ.value = z
  } else pn.setPosition(x, y, z)
  pn.connect(ctx.destination)
  return { ctx, pn }
}
function ping(v, t, f, dur, gain, type = 'sine') {
  const o = v.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  const g = v.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(v.pn)
  o.start(t)
  o.stop(t + dur + 0.05)
  return o
}
export const sfx = {
  // a soft two-note bell for a cast; `fail` drops it to a low wobble; `level` scales the volume
  cast(x, y, z, fail = false, level = 1) {
    const v = voice(x, y, z)
    if (!v) return
    sound.stats.castChimes = (sound.stats.castChimes || 0) + 1 // dev counter for headless checks
    const t = v.ctx.currentTime
    if (fail) {
      const o = ping(v, t, 330, 0.35, 0.05, 'triangle')
      o.frequency.exponentialRampToValueAtTime(140, t + 0.3)
      return
    }
    const base = 1318.5 * (0.9 + Math.random() * 0.2)
    ping(v, t, base, 0.9, 0.035 * level)
    ping(v, t + 0.07, base * 1.5, 0.8, 0.025 * level)
    ping(v, t, base * 2.76, 0.3, 0.008 * level)
  },
}
