import { useEffect } from 'react'
import { createStore, useStore } from '../interact/store.js'
import { toast } from './toast.js'

// The eight easter eggs, in the order the tracker lists them (src/ui/Tracker.jsx, T key).
//   title: the toast line, same as the egg's useDiscovery(id, title)
//   name, desc: what the tracker shows once found; hint: the cryptic line it shows before
export const EGGS = [
  { id: 'froggy', title: 'Caught Froggy falling for prompt injection', name: 'Froggy', hint: 'A frog by the east glass reads more than the poster says.', desc: 'Froggy obeyed an instruction hidden in a bakery poster. Lecture 12, AI safety.' },
  { id: 'lisa', title: 'Asked Lisa, the AI TA', name: 'Lisa, the AI TA', hint: 'Someone in the west cloister answers at any hour. Watch the dots.', desc: 'The MGT 409 TA kiosk by room 2400 answers ten questions about the course.' },
  { id: 'library', title: 'Consulted all seven book specialists', name: 'The boss agent', hint: 'Seven books and one boss hang where it is quiet. Ask every one.', desc: 'The multi-agent desk on the Ross Library wall: a boss agent routes to seven specialists. Lecture 10.' },
  { id: 'dumptrap', title: 'Sprung the homework dump trap', name: 'The dump trap', hint: 'Every homework hides a trap. One of them is in the bin.', desc: 'The anti-cheating line hidden in every homework page, found in a trash can by room 2210.' },
  { id: 'ticker', title: 'Checked the markets', name: 'The analyst desk', hint: 'Ten tickers flicker in a north meeting room.', desc: 'The financial analyst agent from lecture 4, on a wall screen in meeting room 2246.' },
  { id: 'merch', title: 'Bought the full Campus Customs line', name: 'Campus Customs', hint: 'A pop-up stand sells what the homework invented. Buy one of everything.', desc: 'The merch business from HW3 to HW6, sold out at the stand in the east cloister.' },
  { id: 'plaques', title: 'Read all three plaques', name: 'Three plaques', hint: 'Three small metal plates, easy to walk past. Read them all.', desc: 'Three brushed-metal plaques with quotes, hidden around the floor.' },
  { id: 'attendance', title: 'Marked present for Lecture 13', name: 'Attendance', hint: 'Ten percent of the grade hangs on a wall by 2400.', desc: 'The QR attendance poster outside the MGT 409 classroom. The code is real.' },
]

// id -> the line shown in the toast. N in "Easter egg found: name · X / N" is the size of this catalog plus any id
// registered at runtime.
export const CATALOG = Object.fromEntries(EGGS.map((e) => [e.id, e.title]))

const LS = 'evans.discoveries.v1'
const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(LS) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
const save = (found) => {
  try {
    localStorage.setItem(LS, JSON.stringify(found))
  } catch {
    // storage blocked: progress lasts for this visit only
  }
}

// when each egg was found (ms since epoch), kept beside the found list so its format stays as it was
const LS_TIMES = 'evans.discoveries.times.v1'
const loadTimes = () => {
  try {
    const v = JSON.parse(localStorage.getItem(LS_TIMES) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
const saveTimes = (times) => {
  try {
    localStorage.setItem(LS_TIMES, JSON.stringify(times))
  } catch {
    // storage blocked
  }
}

export const discoveryState = createStore({ found: load(), catalog: { ...CATALOG }, times: loadTimes() })

const total = (s) => Object.keys(s.catalog).length

// Mark an egg found. Returns false if it was already found. Plays the chime and shows a toast.
export function discover(id, title) {
  const s = discoveryState.get()
  if (!s.catalog[id]) discoveryState.set({ catalog: { ...s.catalog, [id]: title ?? id } })
  if (s.found.includes(id)) return false
  const found = [...s.found, id]
  const times = { ...s.times, [id]: Date.now() }
  discoveryState.set({ found, times })
  save(found)
  saveTimes(times)
  const t = discoveryState.get()
  const name = EGGS.find((e) => e.id === id)?.name ?? title ?? t.catalog[id]
  toast(title ?? t.catalog[id], { title: `Easter egg found: ${name} · ${found.length} / ${total(t)}`, kind: 'discovery', ms: 4500 })
  return true
}

export function resetDiscoveries() {
  discoveryState.set({ found: [], times: {} })
  save([])
  saveTimes({})
}

// All discoveries: { found: string[], count, total, has(id), discover(id, title?), reset() }
export function useDiscoveries() {
  const s = useStore(discoveryState)
  return {
    found: s.found,
    count: s.found.length,
    total: total(s),
    has: (id) => s.found.includes(id),
    discover,
    reset: resetDiscoveries,
  }
}

// One egg: registers id in the catalog (so it counts toward N) and returns { found, discover }.
export function useDiscovery(id, title) {
  useEffect(() => {
    const s = discoveryState.get()
    if (!s.catalog[id] || (title && s.catalog[id] !== title)) discoveryState.set({ catalog: { ...s.catalog, [id]: title ?? id } })
  }, [id, title])
  const found = useStore(discoveryState, (s) => s.found.includes(id))
  return { found, discover: () => discover(id, title) }
}

// The tracker puts its HUD pill in the 'counters' slot itself; loading it from here means no App.jsx edit.
if (typeof window !== 'undefined') import('./Tracker.jsx')
