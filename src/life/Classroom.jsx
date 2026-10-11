import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CHAIRS, DRUMS } from '../layout.js'
import { LIVE, STUDENTS, TYPING } from '../LabubuCrowd.jsx'
import { POIS, Walker, fromPoi, ringNodes, ringToSeat, seatToRing, seatY, toPoi } from './walk.js'
import { rand, timed, turnToward, useLabubuRig } from './common.js'

// Classroom life on top of the static seated crowd (LabubuCrowd):
//   extras    6 students per room, in the two front rows, are skinned Labubus (their static copies only draw
//             while the room is far). They cycle Nod, Type, Yawn and Whisper on a seeded schedule; every 6 s
//             one of them does something visible from the back row (a hand above the head, standing on the seat
//             to stretch, or turning to whisper to a neighbor), and two react 0.5 s after the professor raises
//             the wand.
//   commuters two Labubus that leave a free seat, hop over the desks and out of the door, roam the cloister to
//             a point of interest, then walk into a room and sit in another free seat (so seats free and fill
//             while the head count stays the same).
const HEIGHT = 0.95
const LIVE_PAD = 7 // a room's extras are skinned while the camera is within its radius plus 7 m

// the professor in room i raises the wand on every positive half of sin(1.3 (t + 1.7 i)) (Professor.jsx, Faculty.jsx)
const wandCycle = (t, i) => {
  const w = (t + i * 1.7) * 1.3
  const cyc = Math.floor(w / (2 * Math.PI))
  return { cyc, rising: w - cyc * 2 * Math.PI < Math.PI }
}

const DUR = { Sit: [3, 7], Type: [4, 9], Nod: [2.6, 2.7], Yawn: [2.1, 2.2], Whisper: [4, 6], RaiseHand: [3, 4.5], Stretch: [2.4, 2.4] }
const EVENT_EVERY = 6 // seconds between visible events in each room
const EVENTS = [['RaiseHand', 0.45], ['Stretch', 0.35], ['Whisper', 0.2]]
function nextClip(r, laptop) {
  const k = r()
  if (laptop) return k < 0.5 ? 'Type' : k < 0.66 ? 'Nod' : k < 0.84 ? 'Sit' : k < 0.92 ? 'Yawn' : 'Whisper'
  return k < 0.4 ? 'Sit' : k < 0.62 ? 'Nod' : k < 0.8 ? 'Whisper' : k < 0.92 ? 'Yawn' : 'Sit'
}

function Extra({ s, ctl }) {
  const rig = useLabubuRig({ fur: s.fur, expression: s.face, shirt: s.clothes === 'tee' ? s.shirt : null, pants: s.shirt, overalls: s.clothes === 'hoodie' })
  useFrame(
    timed((state, dt) => {
      const c = ctl.clip
      rig.play(c, { fade: 0.35, once: c === 'Stretch' })
      rig.setFace(c === 'Yawn' ? 'sleepy' : ctl.surprised ? 'surprised' : s.face)
      if (c === 'Type') TYPING.add(s)
      else TYPING.delete(s)
      rig.tick(dt, state, 26)
    }),
  )
  return (
    <group position={[s.x, s.y, s.z]} rotation={[0, s.rot, 0]} scale={HEIGHT}>
      <primitive object={rig.object} />
    </group>
  )
}

function RoomExtras({ room, index }) {
  const group = useRef()
  const extras = useMemo(() => STUDENTS.filter((s) => s.room === room.id && s.extra), [room.id])
  const st = useMemo(() => {
    const r = rand(31337 + index * 101)
    const ctl = extras.map((s, k) => ({ clip: 'Sit', until: r() * 4, laptop: s.prop === 'laptop', k }))
    return { r, ctl, nextEvent: 1 + r() * 3, react: null, lastCyc: null }
  }, [extras, index])
  if (import.meta.env.DEV && typeof window !== 'undefined') ((window.__life ||= {}).extras ||= {})[room.id] = st.ctl
  const reach = Math.max(room.rx, room.rz) + LIVE_PAD
  useFrame(
    timed(({ clock, camera }) => {
      const t = clock.elapsedTime
      const live = Math.hypot(camera.position.x - room.c[0], camera.position.z - room.c[1]) < reach
      if (live !== LIVE.has(room.id)) live ? LIVE.add(room.id) : LIVE.delete(room.id)
      group.current.visible = live
      const { r, ctl } = st
      // every 6 s one student who is not already doing an event raises a hand, stretches or whispers
      if (t > st.nextEvent) {
        const free = ctl.filter((c) => !EVENTS.some(([e]) => e === c.clip))
        if (free.length) {
          const c = free[Math.floor(r() * free.length)]
          let k = r()
          c.clip = EVENTS.find(([, p]) => (k -= p) < 0)?.[0] || 'RaiseHand'
          const [a, b] = DUR[c.clip]
          c.until = t + a + r() * (b - a)
        }
        st.nextEvent = t + EVENT_EVERY
      }
      // the wand goes up: half a second later a couple of students nod or put a hand up
      const w = wandCycle(t, index)
      if (st.lastCyc !== null && w.cyc !== st.lastCyc && w.rising) st.react = t + 0.5
      st.lastCyc = w.cyc
      if (st.react && t > st.react) {
        st.react = null
        const order = [...ctl].sort(() => r() - 0.5).slice(0, 2)
        const handUp = ctl.some((c) => c.clip === 'RaiseHand')
        order.forEach((c, k) => {
          c.clip = k === 0 && !handUp ? 'RaiseHand' : 'Nod'
          c.until = t + (c.clip === 'Nod' ? 2.7 : 2.6)
          c.surprised = c.clip === 'RaiseHand' && r() < 0.4 // some look startled by the sparks
        })
      }
      for (const c of ctl) {
        if (t < c.until) continue
        c.clip = nextClip(r, c.laptop)
        c.surprised = false
        const [a, b] = DUR[c.clip]
        c.until = t + a + r() * (b - a)
      }
    }),
  )
  return (
    <group ref={group} visible={false}>
      {extras.map((s, k) => (
        <Extra key={k} s={s} ctl={st.ctl[k]} />
      ))}
    </group>
  )
}

// ---------- commuters
// chairs no static student sits in (built on first use: LabubuCrowd imports this module before STUDENTS exists)
let FREE_SEATS = null
const freeSeats = () => {
  if (FREE_SEATS) return FREE_SEATS
  const taken = new Set(STUDENTS.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`))
  return (FREE_SEATS = CHAIRS.filter((c) => c.room && !taken.has(`${c.x.toFixed(2)},${c.z.toFixed(2)}`)))
}
const reserved = new Set()
export const COMMUTERS = [] // live positions (dev readout for screenshots)

function pickSeat(r, avoidRoom) {
  const rooms = DRUMS.map((d) => d.id).filter((id) => id !== avoidRoom)
  for (let tries = 0; tries < 20; tries++) {
    const room = rooms[Math.floor(r() * rooms.length)]
    const list = freeSeats().filter((c) => c.room === room && !reserved.has(c))
    if (list.length) return list[Math.floor(r() * list.length)]
  }
  return freeSeats().find((c) => !reserved.has(c))
}

const LOOKS = [
  { fur: '#ff9ccc', shirt: '#00356b', face: 'grin' },
  { fur: '#9fe0c6', shirt: '#c8641e', face: 'surprised', hoodie: true },
]

function Commuter({ id }) {
  const look = LOOKS[id]
  const rig = useLabubuRig({ fur: look.fur, expression: look.face, shirt: look.hoodie ? null : look.shirt, pants: look.shirt, overalls: !!look.hoodie })
  const root = useRef()
  const st = useMemo(() => {
    const r = rand(2026 + id * 7)
    const seat = pickSeat(r, null)
    reserved.add(seat)
    const w = new Walker(0.95, 0.6)
    return { r, seat, phase: 'seated', until: 8 + id * 14 + r() * 10, w, poi: null, clip: 'Sit', ring: 0, pos: [0, 0, 0] }
  }, [id])
  COMMUTERS[id] = st.pos
  useFrame(
    timed((state, dt) => {
      const t = state.clock.elapsedTime
      dt = Math.min(dt, 0.05)
      const { r, w } = st
      const o = root.current
      if (st.phase === 'seated') {
        const c = st.seat
        o.position.set(c.x, seatY(c), c.z)
        o.rotation.y = c.rot + Math.PI
        if (t > st.nextFidget || st.nextFidget === undefined) {
          st.clip = ['Sit', 'Sit', 'Nod', 'Whisper', 'Yawn'][Math.floor(r() * 5)]
          st.nextFidget = t + 3 + r() * 5
        }
        rig.play(st.clip)
        if (t > st.until) {
          // stand up and leave: the seat frees
          const route = seatToRing(c)
          reserved.delete(c)
          st.leftRoom = c.room
          st.ring = route.ring
          w.start(route.path)
          st.phase = 'exit'
        }
      } else if (st.phase === 'stop') {
        rig.play('Look')
        turnToward(o, st.poi.look, dt * 3)
        if (t > st.until) {
          w.start(fromPoi(st.poi))
          st.ring = st.poi.ring
          st.phase = 'back'
        }
      } else {
        const mode = w.update(dt)
        o.position.set(w.pos.x, w.pos.y, w.pos.z)
        turnToward(o, w.yaw, dt * (mode === 'hop' ? 14 : 7))
        rig.play(mode === 'hop' ? 'Hop' : 'Walk', { timeScale: mode === 'hop' ? 1 / 0.6 : 1.7, fade: 0.2 })
        if (w.done) {
          if (st.phase === 'exit') {
            // join the roamers: walk the cloister to a point of interest
            st.poi = POIS[Math.floor(r() * POIS.length)]
            w.start(toPoi(st.ring, st.poi))
            st.phase = 'roam'
          } else if (st.phase === 'roam') {
            st.phase = 'stop'
            st.until = t + 5 + r() * 8
          } else if (st.phase === 'back') {
            // walk into a room and take a free seat
            const seat = pickSeat(r, st.leftRoom)
            reserved.add(seat)
            st.seat = seat
            const route = ringToSeat(seat)
            w.start([...ringNodes(st.ring, route.ring), ...route.path.slice(1)])
            st.phase = 'enter'
          } else if (st.phase === 'enter') {
            st.phase = 'seated'
            st.until = t + 25 + r() * 25
          }
        }
      }
      st.pos[0] = o.position.x
      st.pos[1] = o.position.y
      st.pos[2] = o.position.z
      rig.tick(dt, state, 30)
    }),
  )
  return (
    <group ref={root} scale={HEIGHT}>
      <primitive object={rig.object} />
    </group>
  )
}

export default function ClassroomLife() {
  if (import.meta.env.DEV && typeof window !== 'undefined') (window.__life ||= {}).commuters = COMMUTERS
  return (
    <Suspense fallback={null}>
      {DRUMS.map((d, i) => (
        <RoomExtras key={d.id} room={d} index={i} />
      ))}
      <Commuter id={0} />
      <Commuter id={1} />
    </Suspense>
  )
}
