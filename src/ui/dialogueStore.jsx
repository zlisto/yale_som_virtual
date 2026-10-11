import { createContext, useContext } from 'react'
import { createStore, ui } from '../interact/store.js'
import { sound } from '../interact/sound.js'

// Dialogue script format: an array of lines, played in order unless a line says where to go.
//   { id?, speaker, text, choices?: [{ text, next?, onChoice? }], next?, onChoice?, code? }
// avatar: an image URL or a src/ui/portraits.js spec, shown as a small circle before the speaker
// name; a line without one uses the speaker's entry in SPEAKER_AVATARS or a generic Labubu.
// next: a line id, a line index, or 'end'. Text inside `backticks` renders in monospace.
// onChoice on a choice runs when that choice is picked; onChoice on the line runs for any choice,
// called as onChoice(choice, index).
export const dialogueState = createStore({ script: null, index: 0, opts: null })

let wasPlaying = false

// opts: { onClose }
export function openDialogue(script, opts = {}) {
  if (!Array.isArray(script) || !script.length) return
  wasPlaying = ui.get().playing
  dialogueState.set({ script, index: 0, opts })
  ui.set({ frozen: true })
  if (document.pointerLockElement) document.exitPointerLock()
  sound.blip()
}

// relock: true when a click or key closed it (a user gesture), so pointer lock can come back
export function closeDialogue(relock = false) {
  const { script, opts } = dialogueState.get()
  if (!script) return
  dialogueState.set({ script: null, index: 0, opts: null })
  ui.set({ frozen: false })
  if (relock && wasPlaying && !ui.get().touch) ui.get().relock?.()
  opts?.onClose?.()
}

function resolveNext(script, from, next) {
  if (next === 'end' || next === null) return -1
  if (typeof next === 'number') return next
  if (typeof next === 'string') {
    const i = script.findIndex((l) => l.id === next)
    if (i < 0) console.warn(`dialogue: no line with id "${next}"`)
    return i
  }
  return from + 1
}

export function advanceDialogue(choiceIndex = null, relock = true) {
  const { script, index } = dialogueState.get()
  if (!script) return
  const line = script[index]
  let next = line.next
  if (line.choices?.length) {
    if (choiceIndex === null) return // a choice line waits for a choice
    const c = line.choices[choiceIndex]
    if (!c) return
    c.onChoice?.(c, choiceIndex)
    line.onChoice?.(c, choiceIndex)
    next = c.next
  }
  // the callback may have closed or replaced the dialogue
  if (dialogueState.get().script !== script) return
  const n = resolveNext(script, index, next)
  if (n < 0 || n >= script.length) closeDialogue(relock)
  else {
    sound.blip(0.7)
    dialogueState.set({ index: n })
  }
}

const api = { openDialogue, closeDialogue, isOpen: () => !!dialogueState.get().script }
// dev only: window.__dialogue.open(script) for headless checks of the panel and its portraits
if (import.meta.env.DEV && typeof window !== 'undefined') window.__dialogue = api
// The default value is the real API, so useDialogue() works with or without a provider,
// including inside the R3F <Canvas>, which does not inherit DOM-tree context.
export const DialogueContext = createContext(api)
export const DialogueProvider = ({ children }) => <DialogueContext.Provider value={api}>{children}</DialogueContext.Provider>
export const useDialogue = () => useContext(DialogueContext)
