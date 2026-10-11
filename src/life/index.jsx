import { Suspense, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { LIFE, LIFE_ON } from './common.js'
import Roamers from './Roamers.jsx'
import { Bursts } from './fx.jsx'
import SpellSchool from './SpellSchool.jsx'
import Ambient from './Ambient.jsx'
import Birds from './Birds.jsx'

// Everything alive outside the classrooms (the classroom extras mount from LabubuCrowd).
// Mounted from LabubuParty, at world origin. ?off=life switches it all off.
export default function Life() {
  return LIFE_ON ? <LifeOn /> : null
}
function LifeOn() {
  const ref = useRef()
  useFrame(() => (ref.current.visible = LIFE.on))
  return (
    <group ref={ref}>
      <Suspense fallback={null}>
        <Roamers />
        <SpellSchool />
        <Ambient />
        <Birds />
        <Bursts />
      </Suspense>
    </group>
  )
}
