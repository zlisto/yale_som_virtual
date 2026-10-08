import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { EYE, SPAWN, collide, locate } from './layout.js'

export default function Player({ lockRef, mapRef, onLock, onWhere }) {
  const { camera, gl } = useThree()
  const controls = useMemo(() => new PointerLockControls(camera, gl.domElement), [camera, gl])
  const keys = useRef({})
  const where = useRef('')
  const fwd = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    camera.position.set(SPAWN.x, EYE, SPAWN.z)
    camera.rotation.set(0, 0, 0)
    lockRef.current = () => controls.lock()
    const on = () => onLock(true)
    const off = () => onLock(false)
    controls.addEventListener('lock', on)
    controls.addEventListener('unlock', off)
    const down = (e) => (keys.current[e.code] = true)
    const up = (e) => (keys.current[e.code] = false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      controls.removeEventListener('lock', on)
      controls.removeEventListener('unlock', off)
      controls.dispose()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [camera, controls, lockRef, onLock])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    // dev only: teleport for screenshots by setting <body data-go="[x, z, yawDeg]">
    if (import.meta.env.DEV && document.body.dataset.go) {
      const [x, z, yaw, pitch = 0] = JSON.parse(document.body.dataset.go)
      delete document.body.dataset.go
      camera.position.set(x, EYE, z)
      camera.rotation.set(pitch, (yaw * Math.PI) / 180, 0, 'YXZ')
    }
    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    if (controls.isLocked) {
      const k = keys.current
      const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
      const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0)
      if (f || s) {
        const speed = k.ShiftLeft || k.ShiftRight ? 6.5 : 3.2
        let mx = fwd.x * f - fwd.z * s
        let mz = fwd.z * f + fwd.x * s
        const l = Math.hypot(mx, mz)
        mx /= l
        mz /= l
        const pos = { x: camera.position.x + mx * speed * dt, z: camera.position.z + mz * speed * dt }
        collide(pos)
        camera.position.x = pos.x
        camera.position.z = pos.z
      }
    }
    camera.position.y = EYE
    mapRef.current?.(camera.position.x, camera.position.z, fwd.x, fwd.z)
    const w = locate(camera.position.x, camera.position.z)
    if (w !== where.current) {
      where.current = w
      onWhere(w)
    }
  })
  return null
}
