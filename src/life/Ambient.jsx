import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BENCHES, LOUNGES, planX } from '../layout.js'
import { openDialogue, useInteractable } from '../interact/index.jsx'
import { rand, timed, turnToward, useLabubuRig } from './common.js'
import { clampSprite, sprite } from './sprites.js'

// Small scenes around the floor, cheap and mostly static:
//   a Labubu asleep in a library lounge chair (Sleep, now and then a Yawn) with z's floating up
//   one reading on the north-cloister banquette, turning a page every 3 s (SitRead)
//   three queueing at the southeast stair down to the cafe, heads down in their phones (Phone)
//   two chatting by the north courtyard glass, with speech bubbles
//   one sketching the courtyard on the floor by the south glass, the page filling in over 30 s (E to talk)
//   two racing each other down the west cloister in hops, once every 40 s, then cheering at the far end

// a seated or standing Labubu at a fixed spot
function Still({ look, position, yaw, scale = 1, children, update }) {
  const rig = useLabubuRig(look)
  const root = useRef()
  useMemo(() => children?.(rig), [rig, children])
  useFrame(
    timed((state, dt) => {
      update(rig, state.clock.elapsedTime, root.current)
      rig.tick(dt, state, 30)
    }),
  )
  return (
    <group ref={root} position={position} rotation={[0, yaw, 0]} scale={scale}>
      <primitive object={rig.object} />
    </group>
  )
}

// ---------- the sleeper: library lounge chair (render/Scenery.jsx loungeChairs: the north-west chair of the
// south lounge group, facing the low table)
const SLEEP_AT = [LOUNGES[1].x - 0.62, 0.42 - 0.11, LOUNGES[1].z + 1.12]
function Sleeper() {
  const zs = useMemo(() => [0, 1, 2].map(() => sprite('z', 0.16, { font: 'bold 56px Georgia, serif', bubble: false })), [])
  const st = useMemo(() => ({ nextYawn: 9, yawnUntil: 0 }), [])
  const update = (rig, t) => {
    if (t > st.nextYawn) {
      st.yawnUntil = t + 2.1
      st.nextYawn = t + 11 + Math.random() * 6
    }
    rig.play(t < st.yawnUntil ? 'Yawn' : 'Sleep', { fade: 0.5 })
    rig.setFace('sleepy')
    // three z's rise from the head, drift sideways, grow and fade, one every 0.8 s
    zs.forEach((z, i) => {
      const u = ((t + i * 0.8) % 2.4) / 2.4
      z.position.set(0.18 + 0.25 * u + 0.05 * Math.sin(u * 9), 1.1 + 0.55 * u, -0.05)
      const k = 0.16 + 0.2 * u
      z.scale.set(k * 0.6, k, 1)
      z.material.opacity = t < st.yawnUntil ? 0 : Math.min(1, u * 4) * (1 - u)
    })
  }
  return (
    <group>
      <Still look={{ fur: '#c98f6b', expression: 'sleepy', shirt: '#7a9e7e' }} position={SLEEP_AT} yaw={Math.PI} update={update} />
      <group position={SLEEP_AT} rotation={[0, Math.PI, 0]}>
        {zs.map((z, i) => (
          <primitive key={i} object={z} />
        ))}
      </group>
    </group>
  )
}

// ---------- the reader: north cloister banquette (layout BENCHES[3], seat cushion top at 0.48 m)
const B = BENCHES[3]
const READ_AT = (() => {
  const c = Math.cos(B.rot)
  const s = Math.sin(B.rot)
  // the cushion's middle is 0.12 m in front of the bench line; sit 0.8 m along the bench from its center
  const lx = -0.12
  const lz = 0.8
  return [B.c[0] + lx * c + lz * s, 0.48 - 0.11, B.c[1] - lx * s + lz * c]
})()
const READ_YAW = Math.atan2(-Math.cos(B.rot), Math.sin(B.rot))
const BOOK_COVER = new THREE.MeshStandardMaterial({ color: '#00356b', roughness: 0.7, side: THREE.DoubleSide })
const BOOK_PAGE = new THREE.MeshStandardMaterial({ color: '#f4efe2', roughness: 0.9, side: THREE.DoubleSide })
function openBook() {
  // in the spine bone's frame (Y up, Z forward): an open book held in front of the chest, tilted toward the eyes
  const g = new THREE.Group()
  g.position.set(0, 0.22, 0.27)
  g.rotation.x = -0.9
  const half = (side) => {
    const h = new THREE.Group()
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.21), BOOK_COVER)
    cover.position.x = 0.075 * side
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.012), BOOK_PAGE)
    pages.position.set(0.072 * side, 0, 0.007)
    h.add(cover, pages)
    h.rotation.y = -0.25 * side
    return h
  }
  g.add(half(1), half(-1))
  // the turning page, hinged on the spine
  const leaf = new THREE.Group()
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.135, 0.195), BOOK_PAGE)
  sheet.position.x = 0.068
  sheet.position.z = 0.015
  leaf.add(sheet)
  g.add(leaf)
  g.userData.leaf = leaf
  return g
}
function Reader() {
  const book = useMemo(openBook, [])
  return (
    <Still
      look={{ fur: '#bba7e8', expression: 'happy', shirt: 'yale' }}
      position={READ_AT}
      yaw={READ_YAW}
      update={(rig, t) => {
        rig.play('SitRead')
        // the page lifts from the right and settles on the left while the paw sweeps (frames 62 to 78 of 90)
        const a = rig.actions.SitRead
        const f = a ? (a.time * 30) % 90 : 0
        const u = Math.min(1, Math.max(0, (f - 62) / 16))
        book.userData.leaf.rotation.y = -0.25 - u * (Math.PI - 0.5)
      }}
    >
      {(rig) => rig.bones.spine?.add(book)}
    </Still>
  )
}

// ---------- the cafe queue: in front of the southeast stair core (stair G opens north at z 23)
const PHONE_MAT = new THREE.MeshStandardMaterial({ color: '#16161a', roughness: 0.3, metalness: 0.4 })
const SCREEN_MAT = new THREE.MeshBasicMaterial({ color: '#9fd2ff', toneMapped: false })
function phone() {
  // on the right arm bone, in the paw, screen turned up toward the face
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.13, 0.012), PHONE_MAT)
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.115), SCREEN_MAT)
  scr.position.z = 0.0065
  g.add(body, scr)
  g.position.set(0.03, 0.27, 0.06)
  g.rotation.set(-0.4, 0, 0.3)
  return g
}
const QUEUE = [
  { at: [planX(25.2), 0, 22.25], look: { fur: '#efe3cf', expression: 'grin', shirt: '#a6192e' } },
  { at: [planX(25.35), 0, 21.45], look: { fur: '#3a3a3e', expression: 'happy', shirt: 'yale' } },
  { at: [planX(25.6), 0, 20.65], look: { fur: '#8cc3ff', expression: 'mischief', shirt: 'stripes', pants: '#1f7a8c', overalls: true } },
]
function Queuer({ q, i }) {
  return (
    <Still
      look={q.look}
      position={q.at}
      yaw={0.1 * (i - 1)}
      update={(rig, t) => {
        rig.play('Phone', { timeScale: 0.8 + 0.15 * i })
        if (rig.actions.Phone && !rig.started) {
          rig.actions.Phone.time = i * 0.7
          rig.started = true
        }
        void t
      }}
    >
      {(rig) => rig.bones.armR?.add(phone())}
    </Still>
  )
}

// ---------- two chatting by the north courtyard glass
const LINES = [
  ['did you do HW4?', 'not yet. you?'],
  ['Lisa says 10% is attendance', 'I scanned the QR from the hall'],
  ['the dump trap got Kevin', 'Dumbledore appeared?!'],
  ['tokens are not free', 'my agent spent $3 on hello'],
  ['office hours with Dumbledore?', 'Tuesday, bring snacks'],
  ['my agent ordered 40 coffees', 'deploy it anyway'],
]
const CHAT = [
  { at: [planX(11.2), 0, -20.85], look: { fur: '#ff9ccc', expression: 'grin', shirt: '#2f6b4f' } },
  { at: [planX(12.25), 0, -21.05], look: { fur: '#6b4a3a', expression: 'surprised', shirt: 'yale' } },
]
function Chatters() {
  const bubbles = useMemo(() => LINES.map((pair) => pair.map((t) => sprite(t, 0.3))), [])
  const st = useMemo(() => ({ r: rand(4), line: 0 }), [])
  const yaw0 = Math.atan2(CHAT[1].at[0] - CHAT[0].at[0], CHAT[1].at[2] - CHAT[0].at[2])
  const speaking = (t) => {
    // 3.2 s per bubble: question, answer, a short pause, next pair
    const k = Math.floor(t / 3.2)
    const pair = Math.floor(k / 3) % LINES.length
    const who = k % 3 // 0 asks, 1 answers, 2 pause
    return { pair, who }
  }
  useFrame(({ clock, camera }) => {
    const { pair, who } = speaking(clock.elapsedTime)
    bubbles.forEach((p, i) =>
      p.forEach((b, j) => {
        b.visible = i === pair && j === who
        b.position.set(CHAT[j].at[0], 1.62, CHAT[j].at[2])
        if (b.visible) clampSprite(b, camera, 0.06)
      }),
    )
    void st
  })
  return (
    <>
      {CHAT.map((c, j) => (
        <Still
          key={j}
          look={c.look}
          position={c.at}
          yaw={j === 0 ? yaw0 : yaw0 + Math.PI}
          update={(rig, t) => {
            const { who } = speaking(t)
            rig.play(who === j ? 'Talk' : 'Idle', { fade: 0.4 })
          }}
        />
      ))}
      {bubbles.flat().map((b, i) => (
        <primitive key={i} object={b} />
      ))}
    </>
  )
}

// ---------- the sketcher: Clementine sits on the floor of the south cloister at the courtyard glass, facing the
// lawn, a sketchbook on her lap and a pencil in her right paw. The page is a canvas drawing of the courtyard that
// fills in stroke by stroke over 30 s, holds for 3 s and starts again on a fresh page. Press E and she shows you
// the page and says a line about drawing Evans Hall.
const SKETCH_AT = [planX(-1.2), -0.11, 21.0] // the Sit clip puts the seat 0.11 above the root: on the floor
const SKETCH_LOOK = { fur: '#f2efe9', expression: 'happy', shirt: '#7a9e7e' }
const SKETCH_T = 30
// facing the lawn, turned 50 degrees west, so from the cloister walkway east of her you look over her shoulder
const SKETCH_YAW = Math.PI - 0.9
const PAPER = '#f6f1e4'
// the drawing, as strokes in page units (0..1 across, 0..0.75 down), drawn in this order: the glass frame, the
// roof edge, the drums beyond the lawn, the lawn edge, the trees, a wash of green and blue, the four classes
function sketchStrokes() {
  const r = rand(2026)
  const S = []
  const line = (pts, w = 1.2, c = '#4a4a4f', a = 0.85) => S.push({ pts, w, c, a })
  // glass frame: two mullions and the sill
  line([[0.04, 0.05], [0.04, 0.72]], 1.6)
  line([[0.96, 0.05], [0.96, 0.72]], 1.6)
  line([[0.5, 0.05], [0.5, 0.72]], 1.2)
  line([[0.02, 0.7], [0.98, 0.7]], 1.4)
  // roof canopy edge, a long soft curve
  line(Array.from({ length: 12 }, (_, i) => [0.05 + i * 0.082, 0.1 + 0.04 * Math.sin((i / 11) * Math.PI)]), 1.3)
  // the drums across the lawn: four rounded blocks
  for (let k = 0; k < 4; k++) {
    const x0 = 0.12 + k * 0.2
    line([[x0, 0.36], [x0, 0.2], [x0 + 0.04, 0.17], [x0 + 0.13, 0.17], [x0 + 0.16, 0.2], [x0 + 0.16, 0.36]], 1.1)
    line([[x0 + 0.02, 0.27], [x0 + 0.14, 0.27]], 0.7, '#4a4a4f', 0.5)
  }
  // the lawn edge, a rounded rectangle in perspective
  line([[0.06, 0.62], [0.12, 0.4], [0.3, 0.37], [0.7, 0.37], [0.88, 0.4], [0.94, 0.62]], 1.2)
  // trees: a trunk and a scribbled crown each
  for (const [x, y, s] of [[0.2, 0.47, 0.06], [0.32, 0.42, 0.045], [0.68, 0.42, 0.045], [0.8, 0.47, 0.06], [0.42, 0.55, 0.07], [0.6, 0.56, 0.07]]) {
    line([[x, y + s * 1.6], [x, y]], 1.1, '#5b4a3a')
    const crown = []
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2.2
      const rr = s * (0.75 + 0.35 * r())
      crown.push([x + Math.cos(a) * rr, y - s * 0.6 + Math.sin(a) * rr * 0.8])
    }
    line(crown, 1, '#3f6b3a', 0.8)
  }
  // a wash of green over the lawn and blue on the drums, in broad soft strokes
  for (let i = 0; i < 7; i++) line([[0.1 + r() * 0.05, 0.6 - i * 0.03], [0.9 - r() * 0.05, 0.6 - i * 0.03]], 7, '#8fc27a', 0.22)
  for (let k = 0; k < 4; k++) line([[0.13 + k * 0.2, 0.3], [0.27 + k * 0.2, 0.3]], 12, '#5f86c4', 0.22)
  // the four classes: a tall figure and a row of little dots each
  for (const [x, y] of [[0.24, 0.6], [0.76, 0.6], [0.3, 0.48], [0.7, 0.48]]) {
    line([[x, y], [x, y - 0.05]], 2, '#2b2b30')
    for (let k = -2; k <= 2; k++) line([[x + k * 0.022, y + 0.035], [x + k * 0.022 + 0.002, y + 0.03]], 3, '#2b2b30', 0.9)
  }
  return S
}
function drawSketch(g, strokes, n, W, H) {
  g.fillStyle = PAPER
  g.fillRect(0, 0, W, H)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (let i = 0; i < n; i++) {
    const s = strokes[i]
    g.globalAlpha = s.a
    g.strokeStyle = s.c
    g.lineWidth = s.w * 2 * (W / 256) // twice the page-unit width, so the lines read from the walkway
    g.beginPath()
    s.pts.forEach(([x, y], k) => (k ? g.lineTo(x * W, (y / 0.75) * H) : g.moveTo(x * W, (y / 0.75) * H)))
    g.stroke()
  }
  g.globalAlpha = 1
}
const COVER_MAT = new THREE.MeshStandardMaterial({ color: '#2b3a55', roughness: 0.8 })
const PENCIL_MAT = new THREE.MeshStandardMaterial({ color: '#e8b33a', roughness: 0.6 })
function Sketcher() {
  const rig = useLabubuRig(SKETCH_LOOK)
  const root = useRef()
  const kit = useMemo(() => {
    const W = 256
    const H = 192
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')
    const strokes = sketchStrokes()
    drawSketch(g, strokes, 0, W, H)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    // the sketchbook on her lap, tilted up toward her face (the page faces +y before the tilt)
    const book = new THREE.Group()
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.22), COVER_MAT)
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }))
    page.rotation.x = -Math.PI / 2
    page.position.y = 0.0065
    book.add(cover, page)
    book.position.set(0.03, 0.3, 0.34)
    book.rotation.x = -0.35
    book.traverse((m) => m.isMesh && (m.castShadow = true))
    // the pencil, in the right arm bone's frame (Y down the arm to the paw at about 0.24)
    const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 6), PENCIL_MAT)
    pencil.position.set(0, 0.27, 0.05)
    pencil.rotation.x = 1.2
    return { c, g, strokes, tex, book, pencil, W, H, shown: -1 }
  }, [])
  const rest = useMemo(() => {
    rig.bones.armR?.add(kit.pencil)
    const out = {}
    for (const k of ['armR', 'armL', 'head']) if (rig.bones[k]) out[k] = rig.bones[k].quaternion.clone()
    return out
  }, [rig, kit])
  const _e = useMemo(() => new THREE.Euler(), [])
  const _q = useMemo(() => new THREE.Quaternion(), [])
  const pose = (k, x, y, z) => rig.bones[k] && rest[k] && rig.bones[k].quaternion.copy(rest[k]).multiply(_q.setFromEuler(_e.set(x, y, z)))
  useInteractable({
    position: [SKETCH_AT[0], 0.5, SKETCH_AT[2]],
    radius: 2.4,
    label: 'Clementine, sketching',
    verb: 'Talk to',
    marker: 'npc',
    solid: 0.35,
    onInteract: () => {
      const n = kit.shown
      openDialogue([
        { speaker: 'Clementine', text: n < kit.strokes.length / 2 ? 'Only the outline so far. Give me a minute.' : 'Here is the courtyard so far.', avatar: kit.c.toDataURL() },
        { speaker: 'Clementine', text: 'Evans Hall is all glass and curves. I draw the drums first, then the trees, and the spell classes come last because they never stand still.', avatar: { kind: 'labubu', color: SKETCH_LOOK.fur, expression: SKETCH_LOOK.expression, shirt: SKETCH_LOOK.shirt } },
      ])
    },
  })
  useFrame(
    timed((state, dt) => {
      const t = state.clock.elapsedTime
      rig.play('Sit')
      rig.tick(dt, state, 30)
      // the page fills in over 30 s, holds 3 s, then a fresh page
      const u = (t % (SKETCH_T + 3)) / SKETCH_T
      const n = Math.min(kit.strokes.length, Math.floor(u * kit.strokes.length))
      if (n !== kit.shown) {
        kit.shown = n
        drawSketch(kit.g, kit.strokes, n, kit.W, kit.H)
        kit.tex.needsUpdate = true
      }
      // small pencil strokes while drawing, the paw still while the page holds; the left paw steadies the book
      const drawing = u < 1
      const k = drawing ? 1 : 0
      pose('armR', 1.05 + k * 0.06 * Math.sin(t * 9.0), 0, 0.32 + k * 0.05 * Math.sin(t * 5.3))
      pose('armL', 0.95, 0, -0.35)
      pose('head', 0.2 + 0.03 * Math.sin(t * 0.7), 0, 0) // looking down at the page
    }),
  )
  return (
    <group ref={root} position={SKETCH_AT} rotation={[0, SKETCH_YAW, 0]}>
      <primitive object={rig.object} />
      <primitive object={kit.book} />
    </group>
  )
}

// ---------- the race: two hop down the west cloister side by side, one start every 40 s, direction alternating
const RACE = { every: 40, z0: -16.5, z1: 16.5, lanes: [planX(-22.95), planX(-23.8)] } // x on the round-3 floor, mapped
const RACERS = [
  { fur: '#7fb2ff', expression: 'mischief', shirt: '#ffffff' },
  { fur: '#c98f6b', expression: 'grin', shirt: 'yale' },
]
function Racer({ i, race }) {
  const rig = useLabubuRig(RACERS[i])
  const root = useRef()
  useFrame(
    timed((state, dt) => {
      const t = state.clock.elapsedTime
      const o = root.current
      const R = race(t)
      const dir = R.dir
      const len = RACE.z1 - RACE.z0
      const T = R.times[i] // this racer's time for the course
      const u = Math.min(1, Math.max(0, R.u / T))
      const from = dir > 0 ? RACE.z0 : RACE.z1
      const z = from + dir * len * u
      // hops of about 1.4 m: the Hop clip (1 s) plays at the matching rate; the root arcs inside the clip
      const hopping = R.u > 0 && u < 1
      o.position.set(RACE.lanes[i], 0, z)
      turnToward(o, dir > 0 ? 0 : Math.PI, dt * 8)
      if (hopping) rig.play('Hop', { timeScale: (len / T) / 1.4, fade: 0.15 })
      else if (u >= 1) rig.play(R.winner === i ? 'Dance' : 'Idle', { fade: 0.3 })
      else rig.play('Idle', { fade: 0.3 })
      rig.setFace(u >= 1 && R.winner !== i ? 'surprised' : RACERS[i].expression)
      rig.tick(dt, state, 34)
    }),
  )
  return (
    <group ref={root} position={[RACE.lanes[i], 0, RACE.z0]}>
      <primitive object={rig.object} />
    </group>
  )
}
function Race() {
  // each race: a 3 s ready pause, then both hop the 33 m course in 10 to 12.5 s (seeded per race)
  const race = useMemo(() => {
    const cache = new Map()
    return (t) => {
      const n = Math.floor(t / RACE.every)
      if (!cache.has(n)) {
        const r = rand(500 + n)
        const times = [10 + r() * 2.5, 10 + r() * 2.5]
        cache.set(n, { times, winner: times[0] < times[1] ? 0 : 1, dir: n % 2 ? -1 : 1 })
        if (cache.size > 4) cache.delete(cache.keys().next().value)
      }
      return { ...cache.get(n), u: (t % RACE.every) - 3 }
    }
  }, [])
  return (
    <>
      <Racer i={0} race={race} />
      <Racer i={1} race={race} />
    </>
  )
}

export default function Ambient() {
  if (import.meta.env.DEV && typeof window !== 'undefined')
    Object.assign((window.__life ||= {}), { sleeper: SLEEP_AT, reader: READ_AT, queue: QUEUE[1].at, chat: CHAT[0].at, sketcher: SKETCH_AT })
  return (
    <>
      <Sleeper />
      <Reader />
      {QUEUE.map((q, i) => (
        <Queuer key={i} q={q} i={i} />
      ))}
      <Chatters />
      <Sketcher />
      <Race />
    </>
  )
}
