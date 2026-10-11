import { createStore } from '../interact/store.js'
import { sound } from '../interact/sound.js'

// toast(text, { title, kind: 'info' | 'discovery', ms }); shows top-center for ms milliseconds.
export const toastState = createStore({ list: [] })
let nextId = 1

export function toast(text, { title = null, kind = 'info', ms = 3500 } = {}) {
  const id = nextId++
  toastState.set((s) => ({ list: [...s.list.slice(-3), { id, text, title, kind }] }))
  if (kind === 'discovery') sound.chime()
  else sound.blip(0.6)
  setTimeout(() => toastState.set((s) => ({ list: s.list.filter((t) => t.id !== id) })), ms)
  return id
}
