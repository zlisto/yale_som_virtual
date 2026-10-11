import { Suspense, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { LIFE, LIFE_ON } from './common.js'
import { FountainLife } from './CourtyardFountain.jsx'
import CourtyardRange from './CourtyardRange.jsx'
import CourtyardLumos from './CourtyardLumos.jsx'
import CourtyardFolk from './CourtyardFolk.jsx'

// The moving parts of the courtyard lawn, mounted from render/Lawn.jsx so they sit with the lawn's furniture.
// ?off=life drops all of it (like life/index.jsx), leaving the static lawn: the fountain's stone and still water.
export default function CourtyardLife() {
  return LIFE_ON ? <On /> : null
}
function On() {
  const ref = useRef()
  useFrame(() => (ref.current.visible = LIFE.on))
  return (
    <group ref={ref}>
      <Suspense fallback={null}>
        <FountainLife />
        <CourtyardRange />
        <CourtyardLumos />
        <CourtyardFolk />
      </Suspense>
    </group>
  )
}
