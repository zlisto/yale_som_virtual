import { useEffect } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { createStore, useStore } from '../interact/store.js'
import { DRACO, modelUrl } from '../characters/rig.js'
import { FACE_OF, outfit } from '../Labubu.jsx'
import { drawLisa } from '../eggs/a/LisaKiosk.jsx'
import { BOOKS, drawBook, drawBoss } from '../eggs/a/portraitArt.js'
import { PROFESSORS } from '../Professor.jsx'

// Dialogue portraits: a 128 px head-and-shoulders picture of whoever is talking, on a dark gradient
// disc with a pink ring. Each is drawn once and cached as a data URL under a key built from the spec.
//
// A spec is a plain object, and a dialogue line's `avatar` may be a spec or an image URL:
//   { kind: 'labubu', color, expression, shirt }   a Labubu by fur color, face and shirt
//   { kind: 'froggy' } | { kind: 'dan' } | { kind: 'vendor' }  (the Campus Customs Labubu)
//   { kind: 'professor', who }                      who: a key of PROFESSORS (Professor.jsx)
//   { kind: 'lisa' } | { kind: 'boss' } | { kind: 'book', n }   canvas art (n: book index 0 to 6)
//   { kind: 'icon', icon }  icon: 'terminal' | 'plaque' | 'qr' | 'trash' | 'paper' | 'poster' | 'meter'
// The characters are the game's own GLBs, posed on the first frame of their Idle clip and drawn by
// one small offscreen WebGLRenderer (a second context, 256 px, made on the first request). A
// render takes one GLB load and parse, so the first portrait of a model shows up a few hundred ms
// after the line opens; until then the panel draws the empty disc.
export const portraitState = createStore({})
export const GENERIC = { kind: 'labubu', color: '#5a3d2e', expression: 'grin' } // Labubu.jsx default fur

// who each named speaker is, for lines that carry no avatar of their own
export const SPEAKER_AVATARS = {
  Lisa: { kind: 'lisa' },
  'Lisa · AI TA': { kind: 'lisa' },
  Froggy: { kind: 'froggy' },
  'Campus Customs vendor': { kind: 'vendor' },
  'Handsome Dan': { kind: 'dan' },
  'Boss Agent': { kind: 'boss' },
  'Analyst agent': { kind: 'icon', icon: 'terminal' },
  Plaque: { kind: 'icon', icon: 'plaque' },
  'QR scanner': { kind: 'icon', icon: 'qr' },
  'Trash can': { kind: 'icon', icon: 'trash' },
  'Crumpled printout': { kind: 'icon', icon: 'paper' },
  'Hidden text': { kind: 'icon', icon: 'paper' },
  'Bakery poster': { kind: 'icon', icon: 'poster' },
  'Token meter': { kind: 'icon', icon: 'meter' },
  ...Object.fromEntries(BOOKS.map((b, n) => [b.title, { kind: 'book', n }])),
  ...Object.fromEntries(Object.entries(PROFESSORS).map(([who, p]) => [p.name, { kind: 'professor', who }])),
}
export const avatarFor = (speaker) => SPEAKER_AVATARS[speaker] ?? null

// fill in `avatar` on every line of a script that has none, from SPEAKER_AVATARS (or `bySpeaker`)
export function withAvatars(script, bySpeaker = {}) {
  for (const l of script) if (!l.avatar && l.speaker) l.avatar = bySpeaker[l.speaker] ?? avatarFor(l.speaker) ?? undefined
  return script
}

export function portraitKey(spec) {
  if (!spec || typeof spec !== 'object') return null
  const { kind, color = '', expression = '', shirt = '', who = '', icon = '', n = '' } = spec
  return [kind, color, expression, shirt, who, icon, n].join('|')
}

// For callers (Roamers.jsx and the eggs): returns the spec to put on a line as `avatar`, and starts
// drawing it so it is ready by the time the panel opens.
export function portraitFor(spec) {
  getPortrait(spec)
  return spec
}

// the data URL if drawn, else null (and the drawing starts)
export function getPortrait(spec) {
  const key = portraitKey(spec)
  if (!key) return null
  const have = portraitState.get()[key]
  if (have) return have
  if (!pending.has(key)) {
    pending.add(key)
    queue = queue
      .then(() => draw(spec))
      .then((url) => url && portraitState.set({ [key]: url }))
      .catch((e) => console.warn('portrait', key, e))
  }
  return null
}

// avatar: a URL string, a spec, or nothing; returns a URL or null
export function usePortrait(avatar) {
  const key = typeof avatar === 'string' ? null : portraitKey(avatar)
  const url = useStore(portraitState, (s) => (key ? s[key] : null))
  useEffect(() => {
    if (key) getPortrait(avatar)
  })
  return typeof avatar === 'string' ? avatar : url
}

const pending = new Set()
let queue = Promise.resolve()

// ---------- the frame: gradient disc, picture, pink ring
const SIZE = 128
function frame(paint) {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const g = c.getContext('2d')
  g.save()
  g.beginPath()
  g.arc(64, 64, 63, 0, Math.PI * 2)
  g.clip()
  const bg = g.createLinearGradient(0, 0, 0, SIZE)
  bg.addColorStop(0, '#1b2440')
  bg.addColorStop(1, '#0b0b0d')
  g.fillStyle = bg
  g.fillRect(0, 0, SIZE, SIZE)
  paint(g)
  g.restore()
  g.strokeStyle = '#ff4fa3'
  g.lineWidth = 4
  g.beginPath()
  g.arc(64, 64, 61, 0, Math.PI * 2)
  g.stroke()
  return c.toDataURL('image/png')
}

// ---------- canvas art and icons
function art(w, h, paint, sx, sy, side) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d'), w, h)
  return frame((g) => g.drawImage(c, sx, sy, side, side, 0, 0, SIZE, SIZE))
}

function icon(name) {
  return frame((g) => {
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const P = '#ff4fa3'
    const W = '#f4f1ea'
    if (name === 'terminal') {
      g.fillStyle = '#0d1117'
      g.strokeStyle = W
      g.lineWidth = 3
      g.beginPath()
      g.roundRect(26, 34, 76, 60, 8)
      g.fill()
      g.stroke()
      g.fillStyle = '#2a2f3a'
      g.fillRect(27.5, 35.5, 73, 11)
      ;['#ff5f56', '#ffbd2e', '#27c93f'].forEach((c, i) => {
        g.fillStyle = c
        g.beginPath()
        g.arc(35 + i * 9, 41, 2.6, 0, Math.PI * 2)
        g.fill()
      })
      g.strokeStyle = '#4ade80'
      g.lineWidth = 4
      g.beginPath()
      g.moveTo(36, 60)
      g.lineTo(46, 68)
      g.lineTo(36, 76)
      g.stroke()
      g.strokeStyle = P
      g.beginPath()
      g.moveTo(52, 80)
      g.lineTo(68, 80)
      g.stroke()
    } else if (name === 'plaque') {
      const gold = g.createLinearGradient(0, 36, 0, 92)
      gold.addColorStop(0, '#e8cf86')
      gold.addColorStop(1, '#9c7a2e')
      g.fillStyle = gold
      g.beginPath()
      g.roundRect(24, 38, 80, 54, 6)
      g.fill()
      g.fillStyle = '#2a1d0c'
      g.beginPath()
      g.roundRect(31, 45, 66, 40, 3)
      g.fill()
      g.strokeStyle = '#e8cf86'
      g.lineWidth = 3
      for (const [y, w] of [[56, 44], [65, 52], [74, 36]]) {
        g.beginPath()
        g.moveTo(64 - w / 2, y)
        g.lineTo(64 + w / 2, y)
        g.stroke()
      }
      g.fillStyle = '#6d5520'
      for (const [x, y] of [[28, 42], [100, 42], [28, 88], [100, 88]]) {
        g.beginPath()
        g.arc(x, y, 2, 0, Math.PI * 2)
        g.fill()
      }
    } else if (name === 'qr') {
      g.fillStyle = W
      g.beginPath()
      g.roundRect(30, 30, 68, 68, 6)
      g.fill()
      g.fillStyle = '#111'
      const cell = 6
      const ox = 34
      const oy = 34
      let s = 9
      const r = () => (s = (s * 16807) % 2147483647) / 2147483647
      for (let y = 0; y < 10; y++)
        for (let x = 0; x < 10; x++) {
          const finder = (x < 3 && y < 3) || (x > 6 && y < 3) || (x < 3 && y > 6)
          if (!finder && r() < 0.48) g.fillRect(ox + x * cell, oy + y * cell, cell, cell)
        }
      for (const [fx, fy] of [[0, 0], [7, 0], [0, 7]]) {
        g.fillRect(ox + fx * cell, oy + fy * cell, cell * 3, cell * 3)
        g.fillStyle = W
        g.fillRect(ox + fx * cell + 3, oy + fy * cell + 3, cell * 3 - 6, cell * 3 - 6)
        g.fillStyle = '#111'
        g.fillRect(ox + fx * cell + 6, oy + fy * cell + 6, cell * 3 - 12, cell * 3 - 12)
      }
      g.strokeStyle = P
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(26, 64)
      g.lineTo(102, 64)
      g.stroke()
    } else if (name === 'trash') {
      g.fillStyle = '#8a929c'
      g.beginPath()
      g.moveTo(38, 46)
      g.lineTo(90, 46)
      g.lineTo(84, 98)
      g.lineTo(44, 98)
      g.closePath()
      g.fill()
      g.fillStyle = '#b6bec8'
      g.beginPath()
      g.roundRect(32, 36, 64, 10, 4)
      g.fill()
      g.fillRect(56, 30, 16, 7)
      g.strokeStyle = '#5d646d'
      g.lineWidth = 3
      for (const x of [52, 64, 76]) {
        g.beginPath()
        g.moveTo(x, 54)
        g.lineTo(x, 90)
        g.stroke()
      }
    } else if (name === 'paper' || name === 'poster') {
      g.save()
      g.translate(64, 64)
      g.rotate(name === 'paper' ? -0.12 : 0)
      g.fillStyle = name === 'poster' ? '#f3e2c2' : W
      g.beginPath()
      if (name === 'paper') {
        g.moveTo(-26, -34)
        g.lineTo(18, -36)
        g.lineTo(28, -24)
        g.lineTo(26, 34)
        g.lineTo(-24, 36)
        g.lineTo(-28, 4)
      } else g.rect(-28, -38, 56, 76)
      g.closePath()
      g.fill()
      if (name === 'poster') {
        // a croissant on the bakery poster
        g.fillStyle = '#c9822f'
        g.beginPath()
        g.ellipse(0, -12, 16, 9, 0, Math.PI, 0)
        g.fill()
        g.strokeStyle = '#8a531c'
        g.lineWidth = 2
        for (const x of [-8, 0, 8]) {
          g.beginPath()
          g.moveTo(x, -21)
          g.lineTo(x * 0.6, -12)
          g.stroke()
        }
      }
      g.strokeStyle = name === 'paper' ? '#9aa3b5' : '#8a531c'
      g.lineWidth = 3
      for (let y = name === 'paper' ? -22 : 4; y < 28; y += 9) {
        g.beginPath()
        g.moveTo(-18, y)
        g.lineTo(16, y)
        g.stroke()
      }
      g.restore()
    } else if (name === 'meter') {
      g.strokeStyle = '#2a3150'
      g.lineWidth = 10
      g.beginPath()
      g.arc(64, 76, 34, Math.PI, 0)
      g.stroke()
      g.strokeStyle = P
      g.beginPath()
      g.arc(64, 76, 34, Math.PI, Math.PI * 1.7)
      g.stroke()
      g.strokeStyle = W
      g.lineWidth = 4
      g.beginPath()
      g.moveTo(64, 76)
      g.lineTo(64 + 30 * Math.cos(Math.PI * 1.7), 76 + 30 * Math.sin(Math.PI * 1.7))
      g.stroke()
      g.fillStyle = W
      g.font = 'bold 15px Menlo, monospace'
      g.textAlign = 'center'
      g.fillText('$ tokens', 64, 100)
    }
  })
}

// ---------- 3D characters
let gl = null
let draco = null
const gltfs = new Map()
function loadModel(name) {
  if (!gltfs.has(name)) {
    if (!draco) {
      draco = new DRACOLoader()
      draco.setDecoderPath(DRACO)
    }
    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)
    gltfs.set(name, loader.loadAsync(modelUrl(name)))
  }
  return gltfs.get(name)
}

// which GLB, how to dress it and how to frame it, for each kind
// frame: cap is the most of the model above the head bone kept in view (hats), below how far under
// the head bone the picture reaches (the shoulders), shift moves the picture sideways (the
// bulldog's muzzle sits well in front of its head bone), all in meters
const LABUBU_FRAME = { cap: 1, below: 0.1 }
function rigFor(spec) {
  if (spec.kind === 'professor') return { model: `professor_${spec.who}`, cap: 0.42, below: 0.32 }
  if (spec.kind === 'dan') return { model: 'handsome_dan', yaw: -0.45, cap: 0.3, below: 0.3, shift: 0.11 }
  if (spec.kind === 'froggy') return { model: 'froggy', fur: '#efe3cf', expression: 'grin', ...LABUBU_FRAME }
  if (spec.kind === 'vendor') return { model: 'labubu', fur: '#ff9ccc', shirt: '#ff8a00', expression: 'grin', ...LABUBU_FRAME }
  return { model: 'labubu', fur: spec.color || GENERIC.color, expression: spec.expression || 'grin', shirt: spec.shirt ?? null, ...LABUBU_FRAME }
}

async function character(spec) {
  const rig = rigFor(spec)
  const gltf = await loadModel(rig.model)
  const o = gltf.scene.clone(true)
  // private materials, so a tint never reaches another portrait
  o.traverse((m) => {
    if (m.isMesh) m.material = m.material.clone()
  })
  if (rig.fur) {
    const face = FACE_OF[rig.expression] || 'grin'
    for (const f of ['grin', 'surprised', 'sleepy']) {
      const n = o.getObjectByName(`Face_${f}`)
      if (n) n.visible = f === face
    }
    const wear = outfit(rig.shirt, null, false)
    for (const k of ['Tee', 'Hoodie']) {
      const n = o.getObjectByName(k)
      if (n) n.visible = k === wear.kind
    }
    o.traverse((m) => {
      if (!m.isMesh) return
      if (m.material.name === 'Fur') m.material.color.set(rig.fur)
      if (m.material.name === 'Shirt' && wear.color) m.material.color.set(wear.color)
    })
  }
  // pose: half a second into Idle (the bind pose is a T-pose)
  const clip = gltf.animations.find((a) => a.name === 'Idle') || gltf.animations[0]
  let mixer = null
  if (clip) {
    mixer = new THREE.AnimationMixer(o)
    mixer.clipAction(clip).play()
    mixer.update(0.5)
  }
  o.rotation.y = rig.yaw ?? 0.35 // a three-quarter view
  o.updateMatrixWorld(true)

  // frame the head: the head bone if there is one, else the top 40% of the bounding box
  const box = new THREE.Box3().setFromObject(o)
  const top = box.max.y
  let head = null
  o.traverse((n) => {
    if (!head && n.isBone && /^head$/i.test(n.name)) head = n
  })
  if (!head) o.traverse((n) => !head && n.isBone && /head/i.test(n.name) && (head = n))
  const c = new THREE.Vector3()
  if (head) head.getWorldPosition(c)
  else c.set((box.min.x + box.max.x) / 2, top - (top - box.min.y) * 0.25, (box.min.z + box.max.z) / 2)
  const above = Math.max(0.12, Math.min(top - c.y, rig.cap ?? 0.45))
  const lo = c.y - (rig.below ?? 0.25)
  const hi = c.y + above + 0.03
  const half = (hi - lo) / 2 + 0.02
  const mid = (hi + lo) / 2
  c.x += rig.shift ?? 0
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50)
  const dist = half / Math.tan(THREE.MathUtils.degToRad(14))
  cam.position.set(c.x, mid + half * 0.15, c.z + dist)
  cam.lookAt(c.x, mid, c.z)

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#3a3550', 1.4))
  const key = new THREE.DirectionalLight('#fff4e8', 2.4)
  key.position.set(c.x + 2, mid + 2, c.z + 3)
  scene.add(key)
  const rim = new THREE.DirectionalLight('#ff8fc8', 1.6)
  rim.position.set(c.x - 2, mid + 1, c.z - 2)
  scene.add(rim)
  scene.add(o)

  if (!gl) {
    gl = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    gl.setPixelRatio(1)
    gl.setSize(256, 256, false)
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.setClearColor(0x000000, 0)
  }
  gl.render(scene, cam)
  const url = frame((g) => g.drawImage(gl.domElement, 0, 0, 256, 256, 0, 0, SIZE, SIZE))
  o.traverse((m) => m.isMesh && m.material.dispose())
  mixer?.stopAllAction()
  return url
}

async function draw(spec) {
  switch (spec.kind) {
    case 'lisa':
      return frame((g) => drawLisa(g, 64, 54, 0.8))
    case 'boss':
      return art(512, 683, drawBoss, 76, 60, 360)
    case 'book':
      return art(512, 640, (g, w, h) => drawBook(g, w, h, BOOKS[spec.n] ?? BOOKS[0], spec.n), 66, 66, 380)
    case 'icon':
      return icon(spec.icon)
    default:
      return character(spec)
  }
}

// dev only: window.__portraits.get(spec) for headless checks
if (import.meta.env?.DEV && typeof window !== 'undefined') window.__portraits = { get: getPortrait, state: () => portraitState.get() }
