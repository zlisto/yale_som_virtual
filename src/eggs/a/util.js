import * as THREE from 'three'
import { dialogueState } from '../../ui/dialogueStore.jsx'

// Shared helpers for the NPC eggs (Froggy, Lisa, the library portraits, the dump trap).

// A crisp sRGB canvas texture. draw(g, w, h) paints it once.
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// Lit material for a printed surface; glow > 0 makes it a screen (the texture also drives emissive).
export function printMat(map, { glow = 0, roughness = 0.7 } = {}) {
  return new THREE.MeshStandardMaterial({
    map,
    roughness,
    metalness: 0,
    emissive: glow ? '#ffffff' : '#000000',
    emissiveMap: glow ? map : null,
    emissiveIntensity: glow,
  })
}

export const solidMat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o })

// Wrap text to a max width on a canvas; returns the lines.
export function wrap(g, text, maxW) {
  const out = []
  let line = ''
  for (const word of text.split(' ')) {
    const t = line ? `${line} ${word}` : word
    if (g.measureText(t).width > maxW && line) {
      out.push(line)
      line = word
    } else line = t
  }
  if (line) out.push(line)
  return out
}

// Swap the open dialogue to a waiting line for `ms` (body class `cls` shows animated dots via eggsA.css),
// then to script[index]. The swap goes through dialogueState directly so pointer-lock bookkeeping in
// openDialogue is untouched. If the player closes the dialogue meanwhile, nothing happens.
export function waitThen(ms, { speaker, avatar, text = '', cls = 'egg-thinking' }, script, index = 0, during) {
  const hold = [{ speaker, avatar, text, next: 0 }] // Space while waiting keeps you on this line
  document.body.classList.add(cls)
  dialogueState.set({ script: hold, index: 0 })
  during?.()
  setTimeout(() => {
    document.body.classList.remove(cls)
    if (dialogueState.get().script === hold) dialogueState.set({ script, index })
  }, ms)
}

export const lineIndex = (script, id) => script.findIndex((l) => l.id === id)
