import { useSyncExternalStore } from 'react'

// Tiny external store. Works from inside the R3F canvas, from the DOM tree,
// and from plain functions (useFrame callbacks, timers), which React context cannot reach.
export function createStore(initial) {
  let state = initial
  const subs = new Set()
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...next }
      subs.forEach((f) => f(state))
    },
    sub(f) {
      subs.add(f)
      return () => subs.delete(f)
    },
  }
}

export function useStore(store, select = (s) => s) {
  return useSyncExternalStore(store.sub, () => select(store.get()))
}

// Shared UI state the player, HUD and dialogue all read.
// frozen: a dialogue (or anything modal) owns the input; the player stops moving and looking.
// playing: pointer locked, touch mode on, or ?nolock; Player.jsx keeps it current.
// awaitLock: a pointer-lock request is pending or was refused; the next click retries (Player.jsx).
export const ui = createStore({ frozen: false, playing: false, touch: false, awaitLock: false })
