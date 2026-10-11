import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { rand } from './common.js'
import { LECTURES } from './lectures.js'
import { clampSprite, liveBubble } from './sprites.js'

// A classroom professor's speech bubble (replaces the murmur audio, which Lan found unpleasant). The bubble
// cycles through the course lines in life/lectures.js: each line holds 5 to 8 s, then 1 s with no bubble,
// and types in over its first 0.6 s. The line clock runs on wall time, so a line keeps going while the bubble
// is hidden. The bubble shows only while speaking() is true (Professor.jsx: the Lecture or Point clip) and
// the camera is within 18 m; walls hide it from outside the room (the sprite still depth-tests).
const GAP = 1
const TYPE = 0.6
const RANGE = 18
const _w = new THREE.Vector3()
export default function ProfBubble({ who, height, phase = 0, speaking }) {
  const lines = LECTURES[who]
  const sp = useMemo(() => {
    if (!lines) return null
    const b = liveBubble(0.5)
    b.center.set(0.34, 0.04) // anchor at the tail tip, so the tail points at the professor's head
    return b
  }, [lines])
  const plan = useMemo(() => {
    if (!lines) return null
    const r = rand(911 + who.length * 37 + Math.round(phase * 10))
    r()
    r()
    const dur = lines.map(() => 5 + r() * 3 + GAP) // 6 to 9 s per line, the last second empty
    return { dur, len: dur.reduce((a, b) => a + b, 0) }
  }, [lines, who, phase])
  useFrame(({ clock, camera }) => {
    if (!sp) return
    let u = (clock.elapsedTime + phase * 5) % plan.len
    let i = 0
    while (u >= plan.dur[i]) u -= plan.dur[i++]
    const show = u < plan.dur[i] - GAP && speaking() && camera.position.distanceTo(sp.getWorldPosition(_w)) < RANGE
    sp.visible = show
    if (!show) return
    const text = lines[i]
    sp.userData.say(text, Math.ceil(text.length * Math.min(1, u / TYPE)))
    clampSprite(sp, camera, 0.07) // at most about 4 degrees tall
  })
  if (!sp) return null
  return <primitive object={sp} position={[0, height + 0.12, 0]} />
}
