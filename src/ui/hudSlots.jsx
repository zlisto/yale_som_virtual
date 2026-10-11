import { useEffect } from 'react'
import { createStore } from '../interact/store.js'

// HUD slots, so an easter egg can put something on screen without touching App.jsx.
//   'status'   top-left, under the location pill
//   'prompt'   bottom-center, above the interact prompt
//   'counters' top-right, under the map button
// Each item is { key, node, order }; lower order renders first.
export const SLOTS = ['status', 'prompt', 'counters']
export const hudState = createStore({ status: [], prompt: [], counters: [] })

export function setHudItem(slot, key, node, order = 0) {
  if (!SLOTS.includes(slot)) throw new Error(`unknown HUD slot "${slot}"`)
  hudState.set((s) => {
    const list = s[slot].filter((it) => it.key !== key)
    list.push({ key, node, order })
    list.sort((a, b) => a.order - b.order)
    return { [slot]: list }
  })
}

export function removeHudItem(slot, key) {
  hudState.set((s) => ({ [slot]: s[slot].filter((it) => it.key !== key) }))
}

// node is a plain React element; it re-renders whenever the caller passes a new one.
export function useHudItem(slot, key, node, order = 0) {
  useEffect(() => {
    setHudItem(slot, key, node, order)
  })
  useEffect(() => () => removeHudItem(slot, key), [slot, key])
}

// A counter pill in the top-right slot: "label value / total" (total optional).
export function Counter({ label, value, total }) {
  return (
    <div className="hud-pill">
      <span className="hud-label">{label}</span>
      <span className="hud-num">
        {value}
        {total != null && <span className="hud-total"> / {total}</span>}
      </span>
    </div>
  )
}

export function useCounter(key, label, value, total, order = 10) {
  useHudItem('counters', key, <Counter label={label} value={value} total={total} />, order)
}
