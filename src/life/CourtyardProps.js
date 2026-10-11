import * as THREE from 'three'

// Small props shared by the courtyard classes and fills: picnic blankets, an open book held in a Labubu's paws,
// a wicker basket.

// a picnic blanket 2.0 x 1.5 m in a two-colour tartan (a canvas texture), lying flat a few millimetres proud
const blanketMats = new Map()
export function blanket([a, b, line = '#ffffff'], size = [2.0, 1.5]) {
  const key = `${a}${b}${line}`
  if (!blanketMats.has(key)) {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    g.fillStyle = a
    g.fillRect(0, 0, 128, 128)
    g.globalAlpha = 0.55
    g.fillStyle = b
    for (let i = 0; i < 128; i += 32) {
      g.fillRect(i, 0, 14, 128)
      g.fillRect(0, i, 128, 14)
    }
    g.globalAlpha = 0.7
    g.fillStyle = line
    for (let i = 20; i < 128; i += 32) {
      g.fillRect(i, 0, 2, 128)
      g.fillRect(0, i, 128, 2)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(3, 2.25)
    t.anisotropy = 4
    blanketMats.set(key, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }))
  }
  const geo = new THREE.PlaneGeometry(size[0], size[1], 6, 4)
  geo.rotateX(-Math.PI / 2)
  // a few soft rumples
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, 0.012 * Math.sin(p.getX(i) * 4.1 + p.getZ(i) * 2.3) + 0.012)
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, blanketMats.get(key))
  m.receiveShadow = true
  return m
}

// an open book for the spine bone (Y up, Z forward), held in front of the chest and tilted toward the eyes;
// userData.leaf is the turning page (rotate it about y). Same as the north-cloister reader in Ambient.jsx.
const COVERS = ['#00356b', '#7a1f2b', '#2f5d3a', '#5b3f8c'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide }))
const PAGE = new THREE.MeshStandardMaterial({ color: '#f4efe2', roughness: 0.9, side: THREE.DoubleSide })
export function openBook(k = 0) {
  const g = new THREE.Group()
  g.position.set(0, 0.22, 0.27)
  g.rotation.x = -0.9
  const half = (side) => {
    const h = new THREE.Group()
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.21), COVERS[k % COVERS.length])
    cover.position.x = 0.075 * side
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.012), PAGE)
    pages.position.set(0.072 * side, 0, 0.007)
    h.add(cover, pages)
    h.rotation.y = -0.25 * side
    return h
  }
  g.add(half(1), half(-1))
  const leaf = new THREE.Group()
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.135, 0.195), PAGE)
  sheet.position.x = 0.068
  sheet.position.z = 0.015
  leaf.add(sheet)
  g.add(leaf)
  g.userData.leaf = leaf
  return g
}
// a closed book lying on a blanket
export function closedBook(k = 0) {
  const g = new THREE.Group()
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.24), COVERS[k % COVERS.length])
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.032, 0.232), PAGE)
  c.position.y = p.position.y = 0.02
  p.position.x = 0.006
  g.add(c, p)
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  return g
}

// a wicker picnic basket with a lid and a handle, 0.5 m long
const WICKER = new THREE.MeshStandardMaterial({ color: '#b08850', roughness: 0.9 })
const CLOTH = new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.9 })
export function basket() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.34), WICKER)
  body.position.y = 0.13
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.36), WICKER)
  lid.position.y = 0.28
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.37), CLOTH)
  cloth.position.set(0.12, 0.305, 0)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 6, 16, Math.PI), WICKER)
  handle.position.y = 0.3
  g.add(body, lid, cloth, handle)
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  return g
}
