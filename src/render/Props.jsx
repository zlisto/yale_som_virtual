import { Suspense, useLayoutEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import * as T from '../textures.js'
import { COUNTERS, RECEPTION, SIGNAGE, DRUMS, MEETING, LIBRARY, STAIRS, BEIN, BEIN_CURTAIN, H, EAST, ellPt, planX } from '../layout.js'
import { slideTex, COURSE_KEYS } from '../slides.js'
import Scenery, { METAL } from './Scenery.jsx'
import Backdrop from './Backdrop.jsx'
import Fixtures from './Fixtures.jsx'
import { OFF } from './debugCam.js'
import { unbakedFill } from './Baked.jsx'
import { pbr, worldUV } from './pbr.js'

// Procedural props: high counters, a reception desk, signage screens and exit signs over drum
// doors. Scanned models (plants, furniture, trees) live in Scenery.jsx, the view out in Backdrop.jsx.
const box = new THREE.BoxGeometry(1, 1, 1)
const cyl = new THREE.CylinderGeometry(1, 0.8, 1, 20)
const mats = {
  top: new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.35 }),
  base: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: '#b8bec4', metalness: 0.85, roughness: 0.3 }),
  // counter frames: dark painted steel (ambientCG Metal 027 normal and roughness)
  frame: new THREE.MeshStandardMaterial({ color: '#2e3033', metalness: 0.55, roughness: 1, ...METAL }),
  bezel: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.4 }),
}
const exitMat = (() => {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 48
  const g = c.getContext('2d')
  g.fillStyle = '#0d3b1e'
  g.fillRect(0, 0, 128, 48)
  g.fillStyle = '#4dff88'
  g.font = 'bold 32px Arial, sans-serif'
  g.fillText('EXIT', 26, 36)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  // a lit sign: brighter than 1 so it picks up a little bloom
  return new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.8, 1.8, 1.8), toneMapped: false })
})()

// slim white high counter on a dark steel frame (photo 01): top, two end frames, a footrest
function Counter({ k }) {
  const legX = k.w / 2 - 0.08
  return (
    <group position={[k.x, 0, k.z]}>
      <mesh geometry={box} material={mats.top} position={[0, 1.04, 0]} scale={[k.w, 0.05, k.d]} castShadow receiveShadow />
      {[-legX, legX].map((x) => (
        <group key={x}>
          <mesh geometry={box} material={mats.frame} position={[x, 0.51, 0]} scale={[0.05, 1.02, k.d - 0.12]} castShadow receiveShadow />
          <mesh geometry={box} material={mats.frame} position={[x, 0.02, 0]} scale={[0.07, 0.04, k.d - 0.04]} castShadow receiveShadow />
        </group>
      ))}
      <mesh geometry={box} material={mats.frame} position={[0, 0.98, 0]} scale={[k.w - 0.16, 0.06, 0.04]} castShadow />
      <mesh geometry={box} material={mats.steel} position={[0, 0.25, -Math.sign(k.z) * 0.12]} scale={[k.w - 0.2, 0.03, 0.03]} castShadow />
    </group>
  )
}

function Reception() {
  const r = RECEPTION
  return (
    <group position={[r.x, 0, r.z]}>
      <mesh geometry={box} material={mats.top} position={[0, 0.55, 0]} scale={[r.d, 1.1, r.w]} />
      <mesh geometry={box} material={mats.base} position={[-0.05, 0.05, 0]} scale={[r.d - 0.1, 0.1, r.w - 0.1]} />
      <mesh geometry={box} material={mats.steel} position={[0.2, 1.12, 0]} scale={[0.35, 0.03, r.w + 0.1]} />
    </group>
  )
}

function Signage() {
  const slideMats = useMemo(() => SIGNAGE.map((_, i) => new THREE.MeshBasicMaterial({ map: slideTex(COURSE_KEYS[(i + 3) % COURSE_KEYS.length], 'title'), toneMapped: false })), [])
  return SIGNAGE.map((s, i) => (
    <group key={i} position={[s.x, 1.9, s.z]} rotation={[0, s.rot, 0]}>
      <mesh geometry={box} material={mats.bezel} scale={[1.36, 0.8, 0.05]} />
      <mesh material={slideMats[i]} position={[0, 0, 0.03]}>
        <planeGeometry args={[1.28, 0.72]} />
      </mesh>
    </group>
  ))
}

// one exit sign over each drum's first door, facing the concourse
function ExitSigns() {
  const signs = useMemo(
    () =>
      DRUMS.map((d) => {
        const p = ellPt(d.c, d.rx + 0.05, d.rz + 0.05, d.doors[0])
        return { p, rot: Math.atan2(p[0] - d.c[0], p[1] - d.c[1]) }
      }),
    [],
  )
  return signs.map((s, i) => (
    <mesh key={i} material={exitMat} position={[s.p[0], 2.75, s.p[1]]} rotation={[0, s.rot, 0]}>
      <planeGeometry args={[0.42, 0.16]} />
    </mesh>
  ))
}

// ---------- wayfinding: brushed-aluminium plates with a bevelled edge and a printed face
// face drawn on a canvas at 512 px per metre so the type stays crisp up close. Inter comes from
// Google Fonts (index.html); the face is drawn again once the font has arrived.
const FONT = "Inter, Helvetica, Arial, sans-serif"
function plateTex(w, h, draw, bg = '#2f3237') {
  const PX = 512
  const c = document.createElement('canvas')
  c.width = Math.round(w * PX)
  c.height = Math.round(h * PX)
  const g = c.getContext('2d')
  const paint = () => {
    g.textAlign = 'left'
    g.fillStyle = bg
    g.fillRect(0, 0, c.width, c.height)
    g.fillStyle = '#f4f3ef'
    g.textBaseline = 'middle'
    draw(g, c.width, c.height)
  }
  paint()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.repeat.set(1 / w, 1 / h) // the extruded face's UVs are its shape coordinates in metres
  document.fonts?.load(`700 40px Inter`).then(() => {
    paint()
    t.needsUpdate = true
  })
  return t
}
const plateEdge = new THREE.MeshStandardMaterial({ color: '#aeb3b8', metalness: 0.8, roughness: 0.35 })
const plateBack = new THREE.MeshStandardMaterial({ color: '#d9dcdf', metalness: 0.6, roughness: 0.45, side: THREE.FrontSide })
const plateGeos = new Map()
function plateGeo(w, h) {
  const k = `${w}x${h}`
  if (!plateGeos.has(k)) {
    const r = Math.min(w, h) * 0.08
    const sh = new THREE.Shape()
    sh.moveTo(r, 0)
    sh.lineTo(w - r, 0)
    sh.quadraticCurveTo(w, 0, w, r)
    sh.lineTo(w, h - r)
    sh.quadraticCurveTo(w, h, w - r, h)
    sh.lineTo(r, h)
    sh.quadraticCurveTo(0, h, 0, h - r)
    sh.lineTo(0, r)
    sh.quadraticCurveTo(0, 0, r, 0)
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 6 })
    g.translate(-w / 2, -h / 2, 0)
    // The extruded lids share group 0, so the back lid drew the face texture mirrored (read from
    // behind, the hanging signs showed their text backwards). The back lid, the first half of
    // that group, becomes group 2: a plain panel.
    const lids = g.groups[0]
    const half = lids.count / 2
    const z0 = g.attributes.position.getZ(lids.start)
    const backFirst = z0 < 0.005
    g.clearGroups()
    g.addGroup(lids.start, half, backFirst ? 2 : 0)
    g.addGroup(lids.start + half, half, backFirst ? 0 : 2)
    g.addGroup(lids.start + lids.count, g.attributes.position.count - lids.count, 1)
    plateGeos.set(k, g)
  }
  return plateGeos.get(k)
}
function Plate({ p, rot, w, h, draw, bg }) {
  const mat = useMemo(() => {
    const t = plateTex(w, h, draw, bg) // UVs were generated before the geometry was centred
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.1, side: THREE.FrontSide })
  }, [w, h, draw, bg])
  return <mesh geometry={plateGeo(w, h)} material={[mat, plateEdge, plateBack]} position={p} rotation={[0, rot, 0]} castShadow />
}

// room-number plates beside every meeting-room door, on the corridor side
const roomPlate = (num) => (g, w, h) => {
  g.font = `bold ${h * 0.42}px Helvetica, Arial, sans-serif`
  g.fillText(String(num), w * 0.1, h * 0.38)
  g.font = `${h * 0.17}px Helvetica, Arial, sans-serif`
  g.fillStyle = '#c9ccd1'
  g.fillText('Meeting room', w * 0.1, h * 0.75)
}
function RoomPlates() {
  return MEETING.map((m) => {
    const [hx, hz] = m.door.hinge
    const south = m.z > 0
    return <Plate key={m.num} p={[hx - 0.22, 1.5, hz + (south ? -0.06 : 0.06)]} rot={south ? Math.PI : 0} w={0.26} h={0.16} draw={roomPlate(m.num)} />
  })
}

// directional signs: a Yale-blue header over a white panel, one destination per line, arrow on
// the side it points to. Sized to read from 3 m: cap height about 55 mm on the lines, the same
// order as building wayfinding guidance (about 25 mm of letter height per metre of reading
// distance, my reading of the usual rule of thumb).
const YALE_BLUE = '#00356b'
const ARROW = { left: '\u2190', right: '\u2192', up: '\u2191' }
const SIGN_W = 1.5
const HEAD_H = 0.2
const LINE_H = 0.2
const dirSign = (lines, head = 'Level 2') => (g, w, h) => {
  const hh = (HEAD_H / (HEAD_H + LINE_H * lines.length)) * h
  g.fillStyle = YALE_BLUE
  g.fillRect(0, 0, w, hh)
  g.fillStyle = '#ffffff'
  g.font = `700 ${hh * 0.46}px ${FONT}`
  g.fillText(head, w * 0.05, hh * 0.54)
  const lh = (h - hh) / lines.length
  lines.forEach(([dir, text], i) => {
    const y = hh + lh * (i + 0.5)
    g.fillStyle = '#16181c'
    g.font = `600 ${lh * 0.4}px ${FONT}`
    if (dir === 'right') {
      g.textAlign = 'right'
      g.fillText(text, w * 0.84, y)
    } else {
      g.textAlign = 'left'
      g.fillText(text, w * 0.16, y)
    }
    g.textAlign = 'center'
    g.fillStyle = YALE_BLUE
    g.font = `700 ${lh * 0.5}px ${FONT}`
    g.fillText(ARROW[dir], dir === 'right' ? w * 0.92 : w * 0.08, y)
    if (i) {
      g.fillStyle = '#c4c7cc'
      g.fillRect(w * 0.04, hh + lh * i - 2, w * 0.92, 4)
    }
  })
  g.textAlign = 'left'
}
// centred where the old 1.0 m plates were, so the larger plates cover their baked contact shadows
const SIGNS = [
  // library's north outer wall, read facing south: east (the library door, Beinecke) is on the left
  { p: [planX(-30.5), 2.0, LIBRARY.z0 - 0.105], rot: Math.PI, lines: [['left', 'Ross Library  2100'], ['left', 'Beinecke Terrace Room  2300']] },
  // library's south outer wall, read facing north: east is on the right
  { p: [planX(-28.2), 2.0, LIBRARY.z1 + 0.105], rot: 0, lines: [['right', 'Ross Library  2100'], ['right', 'Beinecke Terrace Room  2300']] },
  // east column, read facing east toward the Beinecke door: north on the left, south on the right
  { p: [planX(26.36), 2.0, -3.8], rot: -Math.PI / 2, lines: [['up', 'Beinecke Terrace Room  2300'], ['left', 'Classrooms  2210 \u2013 2230'], ['right', 'Classrooms  2410 \u2013 2430']] },
]
function DirectionSigns() {
  return SIGNS.map((sg, i) => {
    const h = HEAD_H + LINE_H * sg.lines.length
    return <Plate key={i} p={sg.p} rot={sg.rot} w={SIGN_W} h={h} draw={dirSign(sg.lines)} bg="#f7f7f5" />
  })
}

// ---------- stair doors: a pair of painted steel leaves in a steel frame, each with a narrow
// wired-glass vision panel and a horizontal push bar, plus a "Stair X" plate beside the frame.
// The stair cores are baked (render/Baked.jsx), so this sits on top of the wall; the World's
// flat opening picture (material key 'opening') is hidden.
const doorMats = {
  leaf: new THREE.MeshStandardMaterial({ color: '#d6d5d0', roughness: 0.45, metalness: 0.2, ...METAL, normalScale: new THREE.Vector2(0.15, 0.15) }),
  frame: new THREE.MeshStandardMaterial({ color: '#8c9196', roughness: 0.35, metalness: 0.8 }),
  vision: new THREE.MeshPhysicalMaterial({ color: '#4a5560', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55, envMapIntensity: 1.5 }),
}
const DOOR_W = 1.8 // clear width of the pair, as the opening it replaces
const DOOR_H = 2.25
const FR = 0.06 // frame face width
const stairPlate = (id) => (g, w, h) => {
  g.fillStyle = YALE_BLUE
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#ffffff'
  g.font = `700 ${h * 0.4}px ${FONT}`
  g.fillText(`Stair ${id}`, w * 0.1, h * 0.38)
  g.font = `500 ${h * 0.18}px ${FONT}`
  g.fillText('Exit  \u00b7  Levels 1 \u2013 4', w * 0.1, h * 0.76)
}
function StairDoor({ s }) {
  const ext = s.face[0] !== 0 ? s.w / 2 : s.d / 2
  const off = ext + 0.1 // wall face: the core outline plus half the 0.2 m wall
  const p = [s.c[0] + s.face[0] * off, 0, s.c[1] + s.face[1] * off]
  const rot = Math.atan2(s.face[0], s.face[1])
  const leafW = DOOR_W / 2 - 0.01
  return (
    <group position={p} rotation={[0, rot, 0]}>
      {/* frame: two jambs and a head, proud of the wall */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} geometry={box} material={doorMats.frame} position={[sx * (DOOR_W / 2 + FR / 2), (DOOR_H + FR) / 2, 0.03]} scale={[FR, DOOR_H + FR, 0.06]} castShadow />
      ))}
      <mesh geometry={box} material={doorMats.frame} position={[0, DOOR_H + FR / 2, 0.03]} scale={[DOOR_W + 2 * FR, FR, 0.06]} castShadow />
      {[-1, 1].map((sx) => {
        const cx = sx * (DOOR_W / 4)
        return (
          <group key={sx} position={[cx, 0, 0.025]}>
            <mesh geometry={box} material={doorMats.leaf} position={[0, DOOR_H / 2, 0]} scale={[leafW, DOOR_H - 0.01, 0.04]} castShadow receiveShadow />
            {/* vision panel near the meeting stiles, steel bead round it */}
            <mesh geometry={box} material={doorMats.frame} position={[-sx * 0.2, 1.5, 0.021]} scale={[0.17, 0.66, 0.006]} />
            <mesh geometry={box} material={doorMats.vision} position={[-sx * 0.2, 1.5, 0.025]} scale={[0.13, 0.62, 0.004]} />
            {/* push bar: a steel tube on two end brackets */}
            <mesh material={doorMats.frame} position={[0, 1.0, 0.075]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.018, 0.018, leafW - 0.16, 14]} />
            </mesh>
            {[-1, 1].map((e) => (
              <mesh key={e} geometry={box} material={doorMats.frame} position={[e * (leafW / 2 - 0.07), 1.0, 0.045]} scale={[0.05, 0.09, 0.06]} castShadow />
            ))}
            {/* kick plate */}
            <mesh geometry={box} material={doorMats.frame} position={[0, 0.13, 0.021]} scale={[leafW - 0.04, 0.24, 0.004]} />
          </group>
        )
      })}
      <Plate p={[DOOR_W / 2 + FR + 0.28, 1.55, 0.012]} rot={0} w={0.44} h={0.2} draw={stairPlate(s.id)} bg={YALE_BLUE} />
    </group>
  )
}
function StairDoors() {
  const { scene, gl } = useThree()
  useLayoutEffect(() => {
    const hidden = []
    scene.traverse((o) => {
      if (o.isMesh && o.material?.userData?.key === 'opening') {
        o.visible = false
        hidden.push(o)
      }
    })
    gl.shadowMap.needsUpdate = true
    return () => hidden.forEach((o) => (o.visible = true))
  }, [scene, gl])
  return STAIRS.map((s) => <StairDoor key={s.id} s={s} />)
}

// ---------- Beinecke Terrace Room: a dark curtain wall behind the mural (photos 16, 17) and slim
// silver mullions with one transom on the room's glass
const texLoader = new THREE.TextureLoader()
const fabricTex = (file, rx, ry) => {
  const t = texLoader.load(`${import.meta.env.BASE_URL}scenery/tex/${file}`)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.anisotropy = 8
  return t
}
// ambientCG Fabric 030 weave; the folds are in the geometry
// Navy, lifted like the other unbaked furniture (it read black from inside the room), and washed
// from the cove above: an warm emissive term that rises over the top 1.8 m of the curtain.
const curtainMat = unbakedFill(new THREE.MeshStandardMaterial({
  color: '#16263d', roughness: 1, side: THREE.DoubleSide,
  normalMap: fabricTex('fabric_normal.jpg', 1, 1), roughnessMap: fabricTex('fabric_rough.jpg', 1, 1), normalScale: new THREE.Vector2(0.6, 0.6),
}), 3)
{
  const prev = curtainMat.onBeforeCompile
  const key = curtainMat.customProgramCacheKey()
  curtainMat.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWashY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWashY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWashY;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3( 0.13, 0.12, 0.13 ) * pow( smoothstep( ${(H - 2.4).toFixed(2)}, ${(H - 0.6).toFixed(2)}, vWashY ), 2.0 );`)
  }
  curtainMat.customProgramCacheKey = () => `${key}|wash`
}
// the cove over the curtain: a white fascia ring, a warm lit underside and a thin brass band
const COVE = { gap: 0.32, y: H - 0.6 }
function coveGeos() {
  const { r, half } = BEIN_CURTAIN
  const a0 = Math.PI / 2 - half
  const span = 2 * half
  const ro = r + COVE.gap
  const fascia = new THREE.CylinderGeometry(ro, ro, H - COVE.y, 64, 1, true, a0, span).translate(0, (H + COVE.y) / 2, 0)
  const brass = new THREE.CylinderGeometry(ro + 0.006, ro + 0.006, 0.05, 64, 1, true, a0, span).translate(0, COVE.y + 0.04, 0)
  const lit = new THREE.RingGeometry(r + 0.02, ro, 64, 1, Math.PI / 2 - (a0 + span), span).rotateX(Math.PI / 2).translate(0, COVE.y + 0.005, 0)
  return { fascia, brass, lit }
}
const coveMats = {
  fascia: new THREE.MeshStandardMaterial({ color: '#f2f0ec', roughness: 0.9, side: THREE.DoubleSide }),
  brass: new THREE.MeshStandardMaterial({ color: '#b8893a', metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }),
  lit: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.86, 0.68).multiplyScalar(2.2), toneMapped: false, side: THREE.DoubleSide }),
}
function curtainGeo() {
  const { r, half } = BEIN_CURTAIN
  const a0 = Math.PI / 2 - half
  const span = 2 * half
  const FOLD = 0.2 // pleat spacing along the curtain, m
  const AMP = 0.035 // pleat depth, m
  const n = Math.ceil((span * r) / FOLD) * 8
  const top = H - 0.04
  const pos = []
  const uv = []
  const idx = []
  for (let i = 0; i <= n; i++) {
    const th = a0 + (span * i) / n
    const arcLen = (th - a0) * r
    const rr = r + AMP * Math.sin((arcLen / FOLD) * Math.PI * 2)
    const x = BEIN.c[0] + rr * Math.sin(th)
    const z = BEIN.c[1] + rr * Math.cos(th)
    pos.push(x, 0, z, x, top, z)
    uv.push(arcLen / 0.6, 0, arcLen / 0.6, top / 0.6) // weave tiles every 0.6 m
    if (i < n) {
      const k = i * 2
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
const mullionMat = new THREE.MeshStandardMaterial({ color: '#b4bbc1', metalness: 0.85, roughness: 0.3 })
// vertical mullions about 1.6 m apart (photo 16) and a transom at 4.6 m, on the curved glass and
// on the straight glass toward the concourse
function beinMullions() {
  const { c, r, doorGap } = BEIN
  const out = []
  const TRANSOM = 4.6
  const curve = (t0, t1) => {
    const n = Math.max(1, Math.round(((t1 - t0) * r) / 1.6))
    for (let i = 0; i <= n; i++) {
      const th = t0 + ((t1 - t0) * i) / n
      const [x, z] = ellPt(c, r - 0.08, r - 0.08, th)
      out.push({ p: [x, H / 2, z], r: th, s: [0.05, H, 0.1] })
      if (i < n) {
        const tm = th + (t1 - t0) / n / 2
        const [mx, mz] = ellPt(c, r - 0.08, r - 0.08, tm)
        const chord = 2 * (r - 0.08) * Math.sin((t1 - t0) / n / 2)
        out.push({ p: [mx, TRANSOM, mz], r: tm, s: [chord, 0.06, 0.08] })
      }
    }
  }
  curve(0, Math.PI / 2 - doorGap)
  curve(Math.PI / 2 + doorGap, Math.PI)
  for (const [z0, z1] of [[-r, -1.3], [1.3, r]]) {
    const n = Math.round((z1 - z0) / 1.6)
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n
      out.push({ p: [EAST + 0.08, H / 2, z], r: 0, s: [0.1, H, 0.05] })
      if (i < n) out.push({ p: [EAST + 0.08, TRANSOM, z + (z1 - z0) / n / 2], r: 0, s: [0.08, 0.06, (z1 - z0) / n] })
    }
  }
  return out
}
function Boxes({ items, material }) {
  const geo = useMemo(() => {
    const g = box.clone()
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    return { g, set: (mesh) => {
      if (!mesh) return
      items.forEach((it, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(...it.p), q.setFromAxisAngle(up, it.r), new THREE.Vector3(...it.s))))
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    } }
  }, [items])
  return <instancedMesh ref={geo.set} args={[geo.g, material, items.length]} castShadow receiveShadow />
}
function Beinecke() {
  const curtain = useMemo(curtainGeo, [])
  const mullions = useMemo(beinMullions, [])
  const cove = useMemo(coveGeos, [])
  return (
    <>
      <mesh geometry={curtain} material={curtainMat} receiveShadow />
      <group position={[BEIN.c[0], 0, BEIN.c[1]]}>
        <mesh geometry={cove.fascia} material={coveMats.fascia} />
        <mesh geometry={cove.brass} material={coveMats.brass} />
        <mesh geometry={cove.lit} material={coveMats.lit} />
      </group>
      <Boxes items={mullions} material={mullionMat} />
    </>
  )
}

// ---------- meeting rooms: a white table, 2.6 x 1.1 m with a 4 cm top, on two dark steel T-legs,
// in place of the World's glass slab and its four box legs (hidden here)
const tableMats = {
  top: new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.35 }),
  leg: new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.7, roughness: 0.35 }),
}
const meetTops = MEETING.map((m) => ({ p: [m.x, 0.72, m.z], r: 0, s: [2.6, 0.04, 1.1] }))
const meetLegs = MEETING.flatMap((m) =>
  [-0.95, 0.95].flatMap((dx) => [
    { p: [m.x + dx, 0.35, m.z], r: 0, s: [0.07, 0.7, 0.07] }, // post
    { p: [m.x + dx, 0.015, m.z], r: 0, s: [0.08, 0.03, 0.85] }, // foot
    { p: [m.x + dx, 0.68, m.z], r: 0, s: [0.06, 0.04, 0.9] }, // top rail
  ]),
)
function MeetingTables() {
  const { scene, gl } = useThree()
  useLayoutEffect(() => {
    const hidden = []
    scene.traverse((o) => {
      if (!o.isInstancedMesh) return
      const k = o.material?.userData?.key
      // the glass tops, and the box legs: the only mullion-material instance set with 4 per room
      if (k === 'tableGlass' || (k === 'mullion' && o.count === MEETING.length * 4)) {
        o.visible = false
        hidden.push(o)
      }
    })
    gl.shadowMap.needsUpdate = true
    return () => hidden.forEach((o) => (o.visible = true))
  }, [scene, gl])
  return (
    <>
      <Boxes items={meetTops} material={tableMats.top} />
      <Boxes items={meetLegs} material={tableMats.leg} />
    </>
  )
}

// ---------- library: a plaster wall behind the west shelf run, floor to ceiling, so the 2.5 m
// shelves stand against a wall and not in front of open sky; and study tables with a 4 cm top on
// slim legs in place of the scanned Wooden Table 02 (its top read toy-thick)
const plaster = pbr('plaster', { color: false })
const libWallMat = worldUV(new THREE.MeshStandardMaterial({ color: '#f2f0ec', roughness: 1, ...plaster, normalScale: new THREE.Vector2(0.35, 0.35) }), 0.5)
const libWall = [{ p: [LIBRARY.x0 + 0.06, H / 2, (LIBRARY.z0 + LIBRARY.z1) / 2], r: 0, s: [0.08, H, LIBRARY.z1 - LIBRARY.z0] }]
const LIB_DESK_X = LIBRARY.x1 - 4 // matches the desk colliders in layout.js
const libTops = [-8, -4, 4, 8].map((z) => ({ p: [LIB_DESK_X, 0.74, z], r: 0, s: [0.9, 0.04, 2.2] }))
const libLegs = [-8, -4, 4, 8].flatMap((z) => [
  ...[-1, 1].flatMap((sx) => [-1, 0, 1].map((k) => ({ p: [LIB_DESK_X + sx * 0.41, 0.36, z + k * 1.06], r: 0, s: [0.04, 0.72, 0.04] }))),
  ...[-1, 1].map((sx) => ({ p: [LIB_DESK_X + sx * 0.41, 0.69, z], r: 0, s: [0.03, 0.06, 2.1] })), // aprons
])
// Upper library wall: a mezzanine ledge over the 2.4 m shelf run (white slab edge, glass
// balustrade, steel handrail) and three framed prints on the plaster above it (textures.js
// libraryPrintTex). Reading lamps on the study tables: a steel stem and a dark shade over a
// warm emissive disc, no real light.
const MEZ = { y: 3.3, depth: 1.0, z0: LIBRARY.z0 + 0.4, z1: LIBRARY.z1 - 0.4 }
const mezLen = MEZ.z1 - MEZ.z0
const mezZ = (MEZ.z0 + MEZ.z1) / 2
const mezSlab = [{ p: [LIBRARY.x0 + 0.1 + MEZ.depth / 2, MEZ.y, mezZ], r: 0, s: [MEZ.depth, 0.28, mezLen] }]
const mezRail = [{ p: [LIBRARY.x0 + 0.1 + MEZ.depth - 0.05, MEZ.y + 0.14 + 0.5, mezZ], r: 0, s: [0.02, 1.0, mezLen] }]
const mezHand = [
  { p: [LIBRARY.x0 + 0.1 + MEZ.depth - 0.05, MEZ.y + 1.17, mezZ], r: 0, s: [0.06, 0.05, mezLen] },
  ...Array.from({ length: 12 }, (_, i) => ({ p: [LIBRARY.x0 + 0.1 + MEZ.depth - 0.05, MEZ.y + 0.66, MEZ.z0 + (mezLen * i) / 11], r: 0, s: [0.04, 1.04, 0.04] })),
]
const mezGlass = new THREE.MeshStandardMaterial({ color: '#d7ecf2', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false })
const steelMat = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.9, roughness: 0.25 })
const frameMat = new THREE.MeshStandardMaterial({ color: '#1e1f22', roughness: 0.5 })
const PRINTS = [-8.4, 0, 8.4].map((z, k) => ({ z, k, w: k === 1 ? 3.0 : 3.4, h: k === 1 ? 2.12 : 2.4 }))
const PRINT_Y = 5.75
const printFrames = PRINTS.map((pr) => ({ p: [LIBRARY.x0 + 0.13, PRINT_Y, pr.z], r: 0, s: [0.05, pr.h + 0.12, pr.w + 0.12] }))
function Prints() {
  const mats = useMemo(() => PRINTS.map((pr) => new THREE.MeshStandardMaterial({ map: T.libraryPrintTex(pr.k), roughness: 0.6 })), [])
  return PRINTS.map((pr, i) => (
    <mesh key={i} position={[LIBRARY.x0 + 0.16, PRINT_Y, pr.z]} rotation={[0, Math.PI / 2, 0]} material={mats[i]}>
      <planeGeometry args={[pr.w, pr.h]} />
    </mesh>
  ))
}
const LAMPS = [-8, -4, 4, 8].flatMap((z) => [-0.95, 0.95].map((dz) => [LIB_DESK_X, z + dz]))
const lampGeos = {
  base: new THREE.CylinderGeometry(0.07, 0.08, 0.02, 20).translate(0, 0.01, 0),
  stem: new THREE.CylinderGeometry(0.008, 0.008, 0.36, 8).translate(0, 0.19, 0),
  shade: new THREE.CylinderGeometry(0.035, 0.12, 0.13, 24, 1, true).translate(0, 0.42, 0),
  bulb: new THREE.CircleGeometry(0.105, 24).rotateX(Math.PI / 2).translate(0, 0.365, 0),
}
const lampMats = {
  shade: new THREE.MeshStandardMaterial({ color: '#244a36', roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }),
  bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.82, 0.55).multiplyScalar(2.4), toneMapped: false }),
}
function Lamps() {
  const set = (geo) => (mesh) => {
    if (!mesh) return
    const m = new THREE.Matrix4()
    LAMPS.forEach(([x, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, 0.762, z)))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }
  return (
    <>
      <instancedMesh ref={set()} args={[lampGeos.base, steelMat, LAMPS.length]} />
      <instancedMesh ref={set()} args={[lampGeos.stem, steelMat, LAMPS.length]} />
      <instancedMesh ref={set()} args={[lampGeos.shade, lampMats.shade, LAMPS.length]} castShadow />
      <instancedMesh ref={set()} args={[lampGeos.bulb, lampMats.bulb, LAMPS.length]} />
    </>
  )
}
function Library() {
  return (
    <>
      <Boxes items={libWall} material={libWallMat} />
      <Boxes items={libTops} material={tableMats.top} />
      <Boxes items={libLegs} material={tableMats.top} />
      <Boxes items={mezSlab} material={libWallMat} />
      <Boxes items={mezRail} material={mezGlass} />
      <Boxes items={mezHand} material={steelMat} />
      <Boxes items={printFrames} material={frameMat} />
      <Prints />
      <Lamps />
    </>
  )
}

export default function Props() {
  return (
    <>
      {COUNTERS.map((k, i) => (
        <Counter key={i} k={k} />
      ))}
      <Reception />
      <Signage />
      <ExitSigns />
      <RoomPlates />
      <DirectionSigns />
      <StairDoors />
      <Beinecke />
      <MeetingTables />
      <Library />
      {!OFF.has('fixtures') && <Fixtures />}
      <Suspense fallback={null}>
        {!OFF.has('scenery') && <Scenery />}
        {!OFF.has('backdrop') && <Backdrop />}
      </Suspense>
    </>
  )
}
