import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { interact, scan, useInteractable } from './registry.js'
import { ui } from './store.js'

// Wrapper form of useInteractable: a <group> at `position` whose children are the visible object.
// The interaction point follows the group's world position, so it still works inside a moving parent.
//   <Interactable position={[x, 0, z]} label="Lisa" verb="Talk to" onInteract={() => openDialogue(script)}>
//     <Lisa />
//   </Interactable>
export function Interactable({ position = [0, 0, 0], rotation, children, ...opts }) {
  const group = useRef()
  const wp = useRef(new THREE.Vector3(...position))
  const where = () => (group.current ? group.current.getWorldPosition(wp.current) : wp.current)
  const active = useInteractable({ ...opts, position: where })
  return (
    <group ref={group} position={position} rotation={rotation}>
      {typeof children === 'function' ? children(active) : children}
    </group>
  )
}

// Mount once inside <Canvas>. Picks the active interactable every frame and wires E and click.
export function InteractLoop() {
  const { camera, gl } = useThree()
  useFrame(() => scan(camera))
  useEffect(() => {
    const key = (e) => {
      if (e.code !== 'KeyE' || e.repeat || ui.get().frozen) return
      interact()
    }
    // a left click while walking also interacts; while locked, the browser sends pointer events to the canvas
    const click = (e) => {
      if (e.button !== 0 || e.pointerType === 'touch' || !ui.get().playing || ui.get().frozen) return
      interact()
    }
    window.addEventListener('keydown', key)
    gl.domElement.addEventListener('pointerdown', click)
    return () => {
      window.removeEventListener('keydown', key)
      gl.domElement.removeEventListener('pointerdown', click)
    }
  }, [gl])
  return null
}
