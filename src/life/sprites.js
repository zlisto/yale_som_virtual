import * as THREE from 'three'

// Canvas sprites for the living building: speech bubbles, z's and name labels.
// a white rounded bubble 112 px tall with a navy outline and a tail at the lower left
function bubbleShape(g, w) {
  g.fillStyle = 'rgba(255,255,255,0.96)'
  g.strokeStyle = '#00356b'
  g.lineWidth = 5
  const r = 30
  g.beginPath()
  g.moveTo(r, 4)
  g.arcTo(w - 4, 4, w - 4, 84, r)
  g.arcTo(w - 4, 84, 4, 84, r)
  g.lineTo(w * 0.42, 84)
  g.lineTo(w * 0.34, 108)
  g.lineTo(w * 0.3, 84)
  g.arcTo(4, 84, 4, 4, r)
  g.arcTo(4, 4, w - 4, 4, r)
  g.closePath()
  g.fill()
  g.stroke()
}
function bubbleTex(text, { font = 'bold 44px system-ui, sans-serif', bubble = true, tag = false } = {}) {
  const c = document.createElement('canvas')
  const g = c.getContext('2d')
  g.font = font
  const pad = bubble ? 56 : tag ? 36 : 8
  const w = Math.ceil(g.measureText(text).width) + pad
  c.width = w
  c.height = bubble ? 112 : 64
  g.font = font
  if (bubble) {
    bubbleShape(g, w)
  } else if (tag) {
    // a dark rounded pill behind the name
    g.fillStyle = 'rgba(0,26,56,0.72)'
    g.beginPath()
    g.roundRect(2, 6, w - 4, 52, 26)
    g.fill()
  }
  g.fillStyle = bubble ? '#1d2a44' : '#ffffff'
  g.textBaseline = 'middle'
  g.fillText(text, bubble ? 28 : tag ? 18 : 4, bubble ? 46 : tag ? 33 : 34)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return { t, aspect: c.width / c.height }
}
export function sprite(text, height, opts) {
  const { t, aspect } = bubbleTex(text, opts)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }))
  s.scale.set(height * aspect, height, 1)
  s.userData.aspect = aspect
  s.userData.height = height
  s.renderOrder = 5
  return s
}

// Keep a sprite from filling the screen up close: its world height is capped at `perM` m per metre of
// distance from the camera (0.04 is about 2.3 degrees tall at any range closer than height / perM).
const _w = new THREE.Vector3()
export function clampSprite(s, camera, perM = 0.04) {
  const d = camera.position.distanceTo(s.getWorldPosition(_w))
  const h = Math.min(s.userData.height, perM * d)
  s.scale.set(h * s.userData.aspect, h, 1)
}

// A speech bubble whose text changes: say(text, n) sizes the bubble for the whole line and draws its first n
// characters, so a line types in without the bubble growing. The canvas is redrawn only when text or n changes;
// a new line gets a new texture (its canvas width changes, and a GPU texture cannot be resized in place).
export function liveBubble(height, font = '600 44px Inter, system-ui, sans-serif') {
  const c = document.createElement('canvas')
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }))
  s.userData.height = height
  s.userData.aspect = 1
  s.renderOrder = 5
  let cur = null
  let shown = -1
  s.userData.say = (text, n) => {
    if (text === cur && n === shown) return
    const g = c.getContext('2d')
    if (text !== cur) {
      g.font = font
      c.width = Math.ceil(g.measureText(text).width) + 56
      c.height = 112
      s.material.map?.dispose()
      s.material.map = new THREE.CanvasTexture(c)
      s.material.map.colorSpace = THREE.SRGBColorSpace
      s.material.needsUpdate = true
      s.userData.aspect = c.width / c.height
      cur = text
    }
    g.clearRect(0, 0, c.width, c.height)
    bubbleShape(g, c.width)
    g.font = font
    g.fillStyle = '#1d2a44'
    g.textBaseline = 'middle'
    g.fillText(text.slice(0, n), 28, 46)
    s.material.map.needsUpdate = true
    shown = n
  }
  return s
}
