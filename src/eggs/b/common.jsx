import * as THREE from 'three'
import { DRUMS, ellPt } from '../../layout.js'
import { useCounter } from '../../interact/index.jsx'

// Shared helpers for the egg set B (ticker, merch stand, plaques, attendance).

// A canvas texture drawn once by draw(g, w, h). Keep the canvas on t.image to redraw later.
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw?.(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export const std = (o) => new THREE.MeshStandardMaterial(o)

// A shadowed box. size = [w, h, d].
export function Box({ size, material, ...rest }) {
  return (
    <mesh castShadow receiveShadow material={material} {...rest}>
      <boxGeometry args={size} />
    </mesh>
  )
}

// localStorage that never throws (private windows, blocked storage)
export const saved = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key)
      return v == null ? fallback : JSON.parse(v)
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // storage blocked: the state lasts for this visit only
    }
  },
}

// A spot on a drum's outer wall: angle th (same convention as layout.ellPt), offset meters outside.
// Returns { p: [x, z], rot } with rot facing out of the drum.
export function onDrum(id, th, offset = 0.03) {
  const d = DRUMS.find((r) => r.id === id)
  return { p: ellPt(d.c, d.rx + offset, d.rz + offset, th), rot: th, drum: d }
}

// seeded random numbers (mulberry32)
export function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A top-right counter pill that only exists while mounted; render it conditionally,
// e.g. {n > 0 && <Pill k="merch" label="merch" value={n} total={4} />}
export function Pill({ k, label, value, total, order = 20 }) {
  useCounter(k, label, value, total, order)
  return null
}
