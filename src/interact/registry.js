import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createStore, ui, useStore } from './store.js'
import { sound } from './sound.js'

// Every interactable lives in this Map. The per-frame scan in InteractLoop is a plain
// distance loop over it, so a few dozen entries cost nothing. Upgrade path if it ever
// holds hundreds: bucket entries in a coarse grid keyed by floor(x/10), floor(z/10).
const entries = new Map()
let nextId = 1

// active: the one interactable the prompt points at (nearest, in radius, in front of you)
export const interactState = createStore({ active: null, version: 0 })

const tmp = new THREE.Vector3()
// position may be [x, y, z], {x, y, z}, a THREE.Vector3, or a function returning any of those
export function resolvePos(p) {
  const v = typeof p === 'function' ? p() : p
  if (!v) return null
  if (Array.isArray(v)) return tmp.set(v[0], v[1] ?? 0, v[2] ?? 0)
  return tmp.set(v.x, v.y ?? 0, v.z)
}

// opts is any object whose fields are read live each frame (getters are fine).
// Returns { id, off }.
export function register(opts, fixedId) {
  const id = fixedId ?? `i${nextId++}`
  if (entries.has(id)) console.warn(`interactable id "${id}" registered twice; the newer one wins`)
  const entry = { id, inside: false, ref: { current: opts } }
  entries.set(id, entry)
  interactState.set((s) => ({ version: s.version + 1 }))
  const off = () => {
    if (entries.get(id) !== entry) return
    if (entry.inside) opts.onLeave?.()
    entries.delete(id)
    if (interactState.get().active?.id === id) interactState.set({ active: null })
    interactState.set((s) => ({ version: s.version + 1 }))
  }
  return { id, off }
}

export const allInteractables = () => entries.values()

// Keep the player outside any interactable with `solid` set (a radius in meters), so you
// cannot walk through a sign or an NPC. Player.jsx calls this right after the wall collision.
export function pushOut(pos, rPlayer = 0.35) {
  for (const e of entries.values()) {
    const o = e.ref.current
    if (!o.solid) continue
    const p = resolvePos(o.position)
    if (!p) continue
    const dx = pos.x - p.x
    const dz = pos.z - p.z
    const d = Math.hypot(dx, dz)
    const min = o.solid + rPlayer
    if (d < min && d > 1e-6) {
      pos.x = p.x + (dx / d) * min
      pos.z = p.z + (dz / d) * min
    }
  }
  return pos
}

// Run the active interactable's onInteract (E key, click, phone action button).
export function interact() {
  const a = interactState.get().active
  if (!a || ui.get().frozen) return false
  const o = entries.get(a.id)?.ref.current
  if (!o || o.enabled === false) return false
  sound.blip()
  o.onInteract?.()
  return true
}

const FACING = 0.35 // cos of ~70 deg: the target must be roughly in front of you
const CLOSE = 0.9 // m; this close, facing no longer matters (you are standing on it)
const fwd = new THREE.Vector3()

// Called once per frame by InteractLoop with the camera.
export function scan(camera) {
  camera.getWorldDirection(fwd)
  fwd.y = 0
  fwd.normalize()
  const cx = camera.position.x
  const cz = camera.position.z
  let best = null
  let bestD = Infinity
  for (const e of entries.values()) {
    const o = e.ref.current
    const p = resolvePos(o.position)
    if (!p) continue
    const dx = p.x - cx
    const dz = p.z - cz
    const d = Math.hypot(dx, dz)
    const r = o.radius ?? 2
    const inside = d < r
    if (inside !== e.inside) {
      e.inside = inside
      inside ? o.onEnter?.() : o.onLeave?.()
    }
    if (!inside || o.enabled === false || !o.onInteract) continue
    if (d > CLOSE && (dx * fwd.x + dz * fwd.z) / d < FACING) continue
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  const cur = interactState.get().active
  const label = best ? best.ref.current.label : null
  if ((best?.id ?? null) !== (cur?.id ?? null) || (cur && cur.label !== label)) {
    if (best && !cur) sound.blip(0.5)
    interactState.set({ active: best ? { id: best.id, label, verb: best.ref.current.verb } : null })
  }
}

// Register a scene object as interactable for the life of the component.
// opts: { position, radius = 2, label, verb = 'Interact', onInteract, onEnter, onLeave,
//         enabled = true, marker = 'interact' | 'npc' | 'egg' | false, solid = 0 (m), id }
// Callbacks are read fresh every frame, so inline arrow functions are fine.
// Returns true while this is the active interactable.
export function useInteractable(opts) {
  const optsRef = useRef(opts)
  optsRef.current = opts
  const idRef = useRef(null)
  useEffect(() => {
    const live = {}
    for (const k of ['position', 'radius', 'label', 'verb', 'onInteract', 'onEnter', 'onLeave', 'enabled', 'marker', 'solid'])
      Object.defineProperty(live, k, { get: () => optsRef.current[k] })
    const { id, off } = register(live, opts.id)
    idRef.current = id
    return off
  }, [opts.id])
  const active = useStore(interactState, (s) => s.active?.id ?? null)
  return active !== null && active === idRef.current
}
