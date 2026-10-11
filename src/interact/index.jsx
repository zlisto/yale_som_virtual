// Public API for easter eggs. Import from 'src/interact' (or '../interact/index.jsx').
export { useInteractable, interact, interactState } from './registry.js'
export { Interactable, InteractLoop } from './Interactable.jsx'
export { sound, soundState } from './sound.js'
export { ui } from './store.js'
export { openDialogue, closeDialogue, useDialogue, DialogueProvider } from '../ui/dialogueStore.jsx'
export { toast } from '../ui/toast.js'
export { useHudItem, setHudItem, removeHudItem, useCounter, Counter } from '../ui/hudSlots.jsx'
export { useDiscoveries, useDiscovery, discover, CATALOG } from '../ui/discoveries.js'

import { useThree } from '@react-three/fiber'
import { InteractLoop } from './Interactable.jsx'
import { SoundLoop } from './SoundLoop.jsx'

// Mount once inside <Canvas>: the interact scan and sound.
// dev only: window.__advance(ms) steps the frame loop, for automated tests in a background tab
// where the browser pauses requestAnimationFrame
function DevAdvance() {
  const advance = useThree((s) => s.advance)
  if (import.meta.env.DEV) {
    let t = performance.now()
    window.__advance = (ms = 16) => advance((t += ms))
  }
  return null
}

export function InteractScene() {
  return (
    <>
      <InteractLoop />
      <SoundLoop />
      <DevAdvance />
    </>
  )
}
