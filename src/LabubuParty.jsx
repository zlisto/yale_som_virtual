import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import Labubu, { EXPRESSIONS, YALE_BLUE } from './Labubu.jsx'
import { MEETING } from './layout.js'
import Life from './life/index.jsx'
import TerraceParty from './life/TerraceParty.jsx'

// The courtyard lawn belongs to the spell school (src/life/SpellSchool.jsx): four classes, one per quadrant.
// The hopping, dancing and catch-playing Labubus and the ring around the maple were taken off the lawn in round 3.
// Life (src/life) mounts here, in world coordinates.
export default function LabubuParty() {
  return (
    <>
      <Life />
      <TerraceParty />
    </>
  )
}

// two or three Labubus in a meeting in every small glass room, sitting at the glass table
const FURS = ['#5a3d2e', '#d9c2a0', '#ff8fc7', '#9fe0c6', '#b9a5e6', '#8d8d93', '#f2efe9', '#f2a65a', '#7fb2ff', '#2b2b2e', '#c98f6b']
const SHIRTS = ['yale', 'yale', 'stripes', '#ffffff', YALE_BLUE, '#ff4fa3', '#7a9e7e', null]
const PANTS = ['#1d2a44', '#3d5a8a', '#d8cfc0', '#2c2c30', '#e8dcc0', null]
function rand(seed) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}
const SEAT_Y = 0.51 // chair seat top
const MEETERS = MEETING.flatMap((m, i) => {
  const r = rand(1000 + i * 7919)
  const pick = (arr) => arr[Math.floor(r() * arr.length)]
  const seats = [...m.seats].sort(() => r() - 0.5).slice(0, 2 + Math.floor(r() * 2))
  return seats.map((c, k) => ({
    key: `${i}-${k}`,
    fur: pick(FURS),
    expression: pick(EXPRESSIONS),
    shirt: pick(SHIRTS),
    pants: pick(PANTS),
    hat: r() < 0.15 ? 'bucket' : null,
    anim: r() < 0.25 ? 'wave' : 'idle',
    phase: r() * 10,
    position: [c.x, SEAT_Y - 0.11, c.z],
    rotation: c.rot + Math.PI, // face the table
  }))
})

// each meeting room's Labubus draw only while the camera is within 16 m: the rooms sit behind the drums in the
// back hallways, and from the cloister and the courtyard the frustum took in about 20 of them behind walls
const ROOMS_OF = MEETING.map((m, i) => ({ m, list: MEETERS.filter((c) => c.key.startsWith(`${i}-`)) }))
function MeetingRoom({ m, list }) {
  const ref = useRef()
  useFrame(({ camera }) => {
    ref.current.visible = Math.hypot(camera.position.x - m.x, camera.position.z - m.z) < 16
  })
  return (
    <group ref={ref}>
      {list.map(({ key, ...c }) => (
        <Labubu key={key} sitting {...c} />
      ))}
    </group>
  )
}
export function MeetingLabubus() {
  return ROOMS_OF.map((r, i) => <MeetingRoom key={i} {...r} />)
}
