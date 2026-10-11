import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { openDialogue, useInteractable } from '../interact/index.jsx'
import { dialogueState } from '../ui/dialogueStore.jsx'
import { RING, RING_HX, RING_HZ } from '../HandsomeDan.jsx'
import { collide } from '../layout.js'
import { Walker, fromPoi, poiByName, toPoi } from './walk.js'
import { angleTo, rand, timed, turnToward, useLabubuRig } from './common.js'
import { clampSprite, sprite } from './sprites.js'

// Six Labubus roam the cloisters on Dan's loop plus spurs to points of interest. Each has a beat of stops in
// one cloister (west, east, north, south, and one in the southeast corner), so every cloister has someone in
// view most of the time; at each stop they look around for 5 to 15 s. Mocha carries a coffee cup, Pebble a
// backpack, Bubblegum wears headphones and bobs to the music. Kevin and Juniper walk the south cloister
// together, side by side, and chat in speech bubbles. A small name label floats over each head (capped in size
// up close). Within 4 m, when you and one face each other, it waves. Press E and it turns to you, steps 0.5 m
// closer, and then tells you what it thinks of the course.
const LINES = [
  'HW4 is due Friday. My vendor desk still gives a discount to anyone who says please.',
  'Lisa answered my question at 3 a.m. and then asked if I had eaten. I had not.',
  'Do not paste the homework page into a chatbot. There is a dump trap in it. Dumbledore appears next to a trash can. I have seen it happen.',
  'Every token costs money. I spent forty cents asking a model to summarize my own notes. Tokenomics is lecture eleven, and I skipped it.',
  'Froggy reads the AI Safety paper out loud by the east wall all day. He says the frog hood is for alignment.',
  "Dumbledore's office hours: he answers every question with another question, and somehow you leave with working code.",
  'Attendance is 10% and it is a QR code. I hopped all the way up from the courtyard to scan it.',
  'My final project is an agent that orders me coffee. It ordered forty coffees. Deployment is lecture eight.',
  'Campus Customs sold out of MGT 409 tees again. My multi-agent team was supposed to restock them.',
  'Vibe coding: I describe it, Codex writes it, and I find out what broke. Mostly I find out what broke.',
]
let lineIdx = 0

// RING index: 0 east cloister (x RING_HX, z 0), 30 south, 60 west, 90 north. The first stop is the first entry of
// the beat, picked so each roamer starts in view from the middle of its cloister.
const CREW = [
  { name: 'Mocha', fur: '#6b4a3a', expression: 'grin', shirt: 'yale', start: 57, seed: 11, coffee: true, beat: ['glassW2', 'glassW', 'lisa'] },
  { name: 'Bubblegum', fur: '#ff9ccc', expression: 'mischief', shirt: '#2f6b4f', start: 118, seed: 23, headphones: true, beat: ['glassE', 'beinecke', 'froggy'] },
  { name: 'Pebble', fur: '#9a9aa2', expression: 'happy', shirt: 'stripes', pants: '#2b2b2e', overalls: true, start: 87, seed: 37, backpack: true, beat: ['glassN3', 'glassN', 'glassN2'] },
  { name: 'Kevin', fur: '#efe3cf', expression: 'surprised', shirt: '#a6192e', start: 34, seed: 41, beat: ['glassS', 'glassS2', 'lisa'] },
  { name: 'Juniper', fur: '#9fe0c6', expression: 'grin', shirt: '#5b3f8c', seed: 43, follow: 3 },
  { name: 'Biscuit', fur: '#f2a65a', expression: 'happy', shirt: '#1f7a8c', start: 16, seed: 53, beat: ['merch', 'cafe', 'glassE'] },
]
export const ROAMERS = [] // live positions (dev readout for screenshots)
const STATE = [] // each roamer's state, so a follower can read its leader

// what the walking pair says, alternating, 3 s a bubble
const PAIR_LINES = [
  ['did you finish HW4?', 'almost. Lisa helped'],
  ['coffee before lecture?', 'only if it is not 40 of them'],
  ['my agent wrote my notes', 'and you read them?'],
  ['Dumbledore was in the trash again', 'the dump trap got you too?'],
]

const SLEEVE_MAT = new THREE.MeshStandardMaterial({ color: '#a8754a', roughness: 0.8 })
const LID_MAT = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.5 })
function coffeeCup() {
  // in the right arm bone's frame (Y down the arm toward the paw at about 0.24): a takeaway cup in the paw
  const g = new THREE.Group()
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.034, 0.12, 16), CUP_MAT)
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.038, 0.05, 16), SLEEVE_MAT)
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.014, 16), LID_MAT)
  lid.position.y = 0.066
  g.add(cup, sleeve, lid)
  // the bone points down the arm: turn the cup upright in the paw
  g.position.set(0, 0.27, 0.05)
  g.rotation.x = Math.PI
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  return g
}
const PACK_MAT = new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.75 })
const STRAP_MAT = new THREE.MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.7 })
function backpack() {
  // in the spine bone's frame (Y up the spine from the hips, Z forward): a pack on the back
  const g = new THREE.Group()
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.13), PACK_MAT)
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.05), PACK_MAT)
  pocket.position.set(0, -0.06, -0.08)
  g.add(bag, pocket)
  for (const sx of [-0.08, 0.08]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.3), STRAP_MAT)
    strap.position.set(sx, 0.02, 0.12)
    strap.scale.z = 0.12
    g.add(strap)
  }
  g.position.set(0, 0.18, -0.22)
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  return g
}
const HEAD_MAT = new THREE.MeshStandardMaterial({ color: '#1d1d22', roughness: 0.4, metalness: 0.3 })
const CUP_MAT = new THREE.MeshStandardMaterial({ color: '#f4f4f6', roughness: 0.35 })
function headphones() {
  // in the head bone's frame (Y up, Z forward, origin at the neck, 0.5 m above the feet): a band over the
  // crown between the ears and two cups on the sides of the head at eye height
  const g = new THREE.Group()
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.022, 8, 28, Math.PI), HEAD_MAT)
  band.position.set(0, 0.24, -0.02)
  g.add(band)
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 20), CUP_MAT)
    cup.rotation.z = Math.PI / 2
    cup.position.set(0.33 * s, 0.24, -0.02)
    g.add(cup)
  }
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  return g
}

const _cam = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _x = new THREE.Vector3(1, 0, 0)
const STEP = 0.5 // m a roamer steps toward you before it talks
const APPROACH = 0.55 // s for that step
function Roamer({ cfg, id }) {
  const rig = useLabubuRig(cfg)
  const root = useRef()
  const label = useMemo(() => sprite(cfg.name, 0.16, { font: 'bold 40px system-ui, sans-serif', bubble: false, tag: true }), [cfg.name])
  const bubbles = useMemo(() => (cfg.follow !== undefined || CREW.some((c) => c.follow === id) ? PAIR_LINES.map((p) => p.map((t) => sprite(t, 0.26))) : []), [cfg, id])
  const st = useMemo(() => {
    const r = rand(cfg.seed)
    const w = new Walker(0.85, 0.6)
    const s = { r, w, ring: cfg.start ?? 0, phase: 'go', poi: null, until: 0, waveUntil: 0, waveCool: 0, talk: null, pos: [0, 0, 0], off: [0, 0], moving: true }
    if (cfg.beat) {
      s.poi = poiByName(cfg.beat[0])
      w.start(toPoi(s.ring, s.poi))
    }
    return s
  }, [cfg])
  ROAMERS[id] = st.pos
  STATE[id] = st
  useMemo(() => {
    if (cfg.headphones && rig.bones.head) rig.bones.head.add(headphones())
    if (cfg.coffee && rig.bones.armR) rig.bones.armR.add(coffeeCup())
    if (cfg.backpack && rig.bones.spine) rig.bones.spine.add(backpack())
  }, [rig, cfg])

  useInteractable({
    position: () => st.pos,
    radius: 2.2,
    label: `${cfg.name}, a Labubu`,
    verb: 'Talk to',
    marker: 'npc',
    onInteract: () => {
      // turn to you and step closer first; the panel opens when the step is done (in the frame loop)
      st.talk = { t0: null, opened: false, text: LINES[lineIdx++ % LINES.length] }
    },
  })

  useFrame(
    timed((state, dt) => {
      dt = Math.min(dt, 0.05)
      const t = state.clock.elapsedTime
      const { r, w } = st
      const o = root.current
      const cam = state.camera.getWorldPosition(_cam)
      const dx = cam.x - o.position.x
      const dz = cam.z - o.position.z
      const dist = Math.hypot(dx, dz)
      const tk = st.talk
      if (tk && tk.t0 === null) tk.t0 = t
      const talking = !!tk
      // wave when we face each other within 4 m (cool down 20 s)
      if (!talking && t > st.waveCool && dist < 4 && dist > 0.8 && Math.abs(cam.y - 1.65) < 2.5 && w.mode !== 'hop') {
        const fwd = [Math.sin(o.rotation.y), Math.cos(o.rotation.y)]
        const facesYou = (fwd[0] * dx + fwd[1] * dz) / dist > 0.3
        const cf = state.camera.getWorldDirection(new THREE.Vector3())
        const youFace = -(cf.x * dx + cf.z * dz) / (Math.hypot(cf.x, cf.z) * dist + 1e-6) > 0.6
        if (facesYou && youFace) {
          st.waveUntil = t + 2.6
          st.waveCool = t + 20
        }
      }
      let clip
      let ts = 1
      // where the body would be without the talk step (the walker's spot, or beside the leader)
      const lead = cfg.follow !== undefined ? STATE[cfg.follow] : null
      st.moving = false
      if (talking) {
        // face you; step up to 0.5 m closer (never closer than 1.4 m), then open the panel and talk until it closes
        const yaw = angleTo([o.position.x, o.position.z], [cam.x, cam.z])
        turnToward(o, yaw, dt * 10)
        const u = Math.min(1, (t - tk.t0) / APPROACH)
        const reach = Math.max(0, Math.min(STEP, dist + Math.hypot(st.off[0], st.off[1]) - 1.4))
        const goal = [Math.sin(yaw) * reach, Math.cos(yaw) * reach]
        if (!tk.opened) {
          st.off[0] += (goal[0] - st.off[0]) * Math.min(1, dt * 12)
          st.off[1] += (goal[1] - st.off[1]) * Math.min(1, dt * 12)
          clip = 'Walk'
          ts = 1.6
          if (u >= 1) {
            tk.opened = true
            // avatar: a portrait spec for src/ui/portraits.js (r3-h), drawn from this roamer's fur, face and shirt
            openDialogue([{ speaker: cfg.name, text: tk.text, avatar: { kind: 'labubu', color: cfg.fur, expression: cfg.expression, shirt: cfg.shirt } }])
          }
        } else {
          clip = 'Talk'
          if (!dialogueState.get().script) st.talk = null
        }
      } else if (t < st.waveUntil) {
        turnToward(o, angleTo([o.position.x, o.position.z], [cam.x, cam.z]), dt * 6)
        clip = 'Wave'
      }
      if (!talking) {
        // the talk step eases back once the panel closes
        st.off[0] *= Math.max(0, 1 - dt * 2)
        st.off[1] *= Math.max(0, 1 - dt * 2)
      }
      let base = null
      if (lead) {
        // walk beside the leader, 0.7 m on the outer side of the cloister (away from the courtyard glass and the
        // banquettes along it); stand facing it when it stops
        const ly = lead.pos[3] || 0
        const ax = Math.abs(lead.pos[0]) / RING_HX
        const az = Math.abs(lead.pos[2]) / RING_HZ

        const out = ax > az ? [Math.sign(lead.pos[0]), 0] : [0, Math.sign(lead.pos[2])]
        const q = collide({ x: lead.pos[0] + out[0] * 0.7, z: lead.pos[2] + out[1] * 0.7 })
        base = [q.x, lead.pos[1], q.z]
        if (!clip) {
          if (lead.moving) {
            turnToward(o, ly, dt * 7)
            clip = 'Walk'
            ts = 1.6
            st.moving = true
          } else {
            turnToward(o, angleTo([base[0], base[2]], [lead.pos[0], lead.pos[2]]), dt * 4)
            clip = 'Idle'
          }
        }
      } else if (talking || t < st.waveUntil) {
        base = [o.position.x - st.off[0], o.position.y, o.position.z - st.off[1]]
        if (st.base) base = st.base
      } else if (st.phase === 'stop') {
        turnToward(o, st.poi.look, dt * 3)
        clip = st.poi.name === 'merch' || st.poi.name === 'lisa' ? 'Idle' : 'Look'
        if (t > st.until) {
          w.start(fromPoi(st.poi))
          st.ring = st.poi.ring
          st.phase = 'back'
        }
      } else {
        w.update(dt)
        turnToward(o, w.yaw, dt * 7)
        clip = 'Walk'
        ts = 1.6
        st.moving = true
        if (w.done) {
          if (st.phase === 'go') {
            st.phase = 'stop'
            st.until = t + 5 + r() * 10
          } else {
            // back on the loop: pick the next stop on the beat (not the same one twice)
            let next = st.poi
            while (next === st.poi) next = poiByName(cfg.beat[Math.floor(r() * cfg.beat.length)])
            st.poi = next
            w.start(toPoi(st.ring, next))
            st.phase = 'go'
          }
        }
      }
      if (!base) base = [w.pos.x, w.pos.y, w.pos.z]
      st.base = base
      o.position.set(base[0] + st.off[0], base[1], base[2] + st.off[1])
      // the pair talks in bubbles: the leader asks, the follower answers, then a pause
      if (bubbles.length) {
        const k = Math.floor(t / 3)
        const pair = Math.floor(k / 3) % PAIR_LINES.length
        const who = k % 3
        const me = lead ? 1 : 0
        bubbles.forEach((p, i) => {
          const b = p[me]
          b.visible = !talking && i === pair && who === me
          if (b.visible) {
            b.position.set(o.position.x, o.position.y + 1.62, o.position.z)
            clampSprite(b, state.camera, 0.06)
          }
        })
        if (!talking && !lead && !st.moving && clip === 'Look') clip = who === 0 ? 'Talk' : 'Idle'
        if (!talking && lead && !lead.moving) clip = who === 1 ? 'Talk' : 'Idle'
      }
      rig.play(clip, { timeScale: ts, fade: 0.25 })
      // the name label: hidden past 14 m, capped in size up close
      label.position.set(o.position.x, o.position.y + 1.36, o.position.z)
      label.visible = dist < 14 && !(bubbles.length && bubbles.some((p) => p[lead ? 1 : 0].visible))
      if (label.visible) clampSprite(label, state.camera, 0.035)
      st.pos[0] = o.position.x
      st.pos[1] = o.position.y
      st.pos[2] = o.position.z
      st.pos[3] = o.rotation.y
      if (rig.tick(dt, state, 34) && cfg.headphones && rig.bones.head) {
        // bob to the beat (about 118 bpm) on top of whatever the clip does
        _q.setFromAxisAngle(_x, 0.13 * Math.max(0, Math.sin(t * Math.PI * 2 * 1.97)))
        rig.bones.head.quaternion.multiply(_q)
      }
    }),
  )
  const p0 = RING[cfg.start ?? CREW[cfg.follow].start]
  return (
    <>
      <group ref={root} position={[p0[0], 0, p0[1]]}>
        <primitive object={rig.object} />
      </group>
      <primitive object={label} />
      {bubbles.flat().map((b, i) => (
        <primitive key={i} object={b} />
      ))}
    </>
  )
}

export default function Roamers() {
  if (import.meta.env.DEV && typeof window !== 'undefined') (window.__life ||= {}).roamers = ROAMERS
  return CREW.map((c, i) => <Roamer key={c.name} cfg={c} id={i} />)
}
