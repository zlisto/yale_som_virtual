import { useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import {
  H, EAST, BOUNDS, COURTYARD, DRUMS, DRUM_WALL, WALLS, CHAIRS, SCREENS, BOARDS, LECTERNS,
  STAIRS, MEETING, BEIN, BEIN_TABLES, PLANTS, LIBRARY, inPoly, ellPt,
} from './layout.js'
import * as T from './textures.js'
import { rng } from './textures.js'

const TAU = Math.PI * 2

// ---------- helpers
function Instanced({ items, material, geometry }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    items.forEach((it, i) => {
      p.set(...it.p)
      e.set(0, it.r || 0, 0)
      q.setFromEuler(e)
      s.set(...(it.s || [1, 1, 1]))
      m.compose(p, q, s)
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [items])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled={false} />
}

const BOX = new THREE.BoxGeometry(1, 1, 1)

function wallItems(mat) {
  return WALLS.filter((w) => w.mat === mat).map((w) => {
    const dx = w.b[0] - w.a[0]
    const dz = w.b[1] - w.a[1]
    return {
      p: [(w.a[0] + w.b[0]) / 2, w.y0 + w.h / 2, (w.a[1] + w.b[1]) / 2],
      r: -Math.atan2(dz, dx),
      s: [Math.max(Math.hypot(dx, dz), 0.01) + 0.02, w.h, w.t],
    }
  })
}

// vertical strip along a closed polyline
function ribbon(points, y0, y1, uPerMeter = 0.25) {
  const pts = [...points, points[0]]
  const pos = []
  const uv = []
  const idx = []
  let u = 0
  pts.forEach((p, i) => {
    if (i > 0) u += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) * uPerMeter
    pos.push(p[0], y0, p[1], p[0], y1, p[1])
    uv.push(u, 0, u, 1)
    if (i > 0) {
      const a = (i - 1) * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function Arc({ c, rx, rz = rx, a0, a1, y0 = 0, h = H, material }) {
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, h, 72, 1, true, a0, a1 - a0), [h, a0, a1])
  return <mesh geometry={geo} material={material} position={[c[0], y0 + h / 2, c[1]]} scale={[rx, 1, rz]} />
}

function Plane({ p, rot = 0, w, h, material }) {
  return (
    <mesh position={p} rotation={[0, rot, 0]} material={material}>
      <planeGeometry args={[w, h]} />
    </mesh>
  )
}

// ---------- materials
function useMaterials() {
  return useMemo(() => {
    const std = (o) => new THREE.MeshStandardMaterial(o)
    const glass = (color, opacity) =>
      std({ color, transparent: true, opacity, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false })
    return {
      white: std({ color: '#f2f0ec', roughness: 0.9 }),
      sage: std({ map: T.sageTex(), roughness: 0.9 }),
      exterior: glass('#2a3a55', 0.35),
      glass: glass('#d7ecf2', 0.14),
      libGlass: glass('#d7ecf2', 0.12),
      beinGlass: glass('#d7ecf2', 0.12),
      meetGlass: glass('#c9d6e6', 0.22),
      rail: glass('#9fb3c8', 0.3),
      slats: std({ map: T.slatsTex(), roughness: 0.7 }),
      desk: std({ map: T.teakTex(), roughness: 0.55 }),
      shelf: std({ map: T.booksTex(), roughness: 0.8 }),
      leather: std({ color: '#9a4f22', roughness: 0.45 }),
      orange: std({ color: '#d4552a', roughness: 0.8 }),
      chair: std({ color: '#141416', roughness: 0.6 }),
      drum: std({ map: T.drumTex(), roughness: 0.08, metalness: 0.65, envMapIntensity: 1.6 }),
      drumIn: std({ map: T.sageTex(), roughness: 0.9, side: THREE.BackSide }),
      frosted: std({ color: '#e9eef2', transparent: true, opacity: 0.75, roughness: 0.3 }),
      carpet: std({ map: T.carpetTex(), color: '#d9cdb8', roughness: 1 }),
      roomCarpet: std({ map: T.carpetTex([3, 3], '#c3bcae'), roughness: 1 }),
      beinCarpet: std({ map: T.carpetTex([4, 4]), roughness: 1 }),
      stone: std({ map: T.stoneTex([2, 2]), roughness: 0.95 }),
      ceiling: std({ color: '#f7f5f0', roughness: 1, side: THREE.DoubleSide }),
      lawn: std({ map: T.lawnTex(), roughness: 1 }),
      ground: std({ color: '#2b3a26', roughness: 1 }),
      cafe: std({ map: T.windowsTex(true), emissive: '#ffffff', emissiveMap: T.windowsTex(true), emissiveIntensity: 0.6, side: THREE.DoubleSide }),
      upper: std({ map: T.windowsTex(false), emissive: '#ffffff', emissiveMap: T.windowsTex(false), emissiveIntensity: 0.35, side: THREE.DoubleSide }),
      mural: std({ map: T.muralTex(), roughness: 0.9, side: THREE.DoubleSide }),
      velvet: std({ color: '#0d0b10', roughness: 1 }),
      mullion: std({ color: '#2a2d33', roughness: 0.4, metalness: 0.6 }),
      screen: new THREE.MeshBasicMaterial({ map: T.screenTex() }),
      poster: new THREE.MeshBasicMaterial({ map: T.posterTex() }),
      board: std({ color: '#fbfbf8', roughness: 0.3 }),
      dark: std({ color: '#1b1c20', roughness: 0.6 }),
      exit: new THREE.MeshBasicMaterial({ map: T.exitTex() }),
      opening: std({ map: T.stairOpeningTex(), roughness: 0.9 }),
      trunk: std({ color: '#4a3524', roughness: 1 }),
      crown: std({ color: '#2f4a25', roughness: 1 }),
      pot: std({ color: '#26262a', roughness: 0.7 }),
      leaf: std({ color: '#3f7a35', roughness: 0.9 }),
      lamp: new THREE.MeshBasicMaterial({ color: '#fffaf0' }),
      column: std({ color: '#eceae6', roughness: 0.6 }),
    }
  }, [])
}

// ---------- scene setup: env reflections + dusk sky
function Atmosphere() {
  const { gl, scene } = useThree()
  useLayoutEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.55
    scene.background = T.skyTex()
    return () => {
      env.dispose()
      pm.dispose()
    }
  }, [gl, scene])
  return (
    <>
      <hemisphereLight args={['#e3ebff', '#8a7a66', 0.75]} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[20, 40, 10]} intensity={0.6} />
    </>
  )
}

// ---------- floor + ceiling with the courtyard hole
function FloorAndCeiling({ M }) {
  const [floor, ceil, lawn] = useMemo(() => {
    const { xMin, xMax, zMin, zMax } = BOUNDS
    const make = (flip) => {
      const f = (x, z) => new THREE.Vector2(x, flip ? -z : z)
      const s = new THREE.Shape([f(xMin, zMin), f(xMax, zMin), f(xMax, zMax), f(xMin, zMax)])
      s.holes.push(new THREE.Path(COURTYARD.map(([x, z]) => f(x, z))))
      const g = new THREE.ShapeGeometry(s)
      g.rotateX(flip ? -Math.PI / 2 : Math.PI / 2)
      return g
    }
    const lawnShape = new THREE.Shape(COURTYARD.map(([x, z]) => new THREE.Vector2(x, -z)))
    const lg = new THREE.ShapeGeometry(lawnShape)
    lg.rotateX(-Math.PI / 2)
    return [make(true), make(false), lg]
  }, [])
  return (
    <>
      <mesh geometry={floor} material={M.carpet} />
      <mesh geometry={ceil} material={M.ceiling} position={[0, H, 0]} />
      <mesh geometry={lawn} material={M.lawn} position={[0, -5, 0]} />
      <mesh material={M.ground} rotation={[-Math.PI / 2, 0, 0]} position={[0, -5.05, 0]}>
        <planeGeometry args={[600, 600]} />
      </mesh>
    </>
  )
}

function Courtyard({ M }) {
  const glass = useMemo(() => ribbon(COURTYARD, 0, H), [])
  const cafe = useMemo(() => ribbon(COURTYARD, -5, 0), [])
  const upper = useMemo(() => ribbon(COURTYARD, H, H + 9, 0.12), [])
  const mullions = useMemo(
    () => COURTYARD.filter((_, i) => i % 6 === 0).map(([x, z]) => ({ p: [x, H / 2, z], s: [0.07, H, 0.07] })),
    [],
  )
  const trees = useMemo(() => {
    const spots = [[-10, -9], [0, -11.5], [10, -8.5], [-12, 3], [12, 4], [-5, 11], [7, 11.5], [-2, 1]]
    return spots
  }, [])
  const cafeTables = useMemo(() => {
    const r = rng(4)
    const out = []
    for (let i = 0; i < 14; i++) {
      const a = r() * TAU
      out.push({ p: [Math.sin(a) * 12, -4.6, Math.cos(a) * 14], s: [0.9, 0.06, 0.9] })
    }
    return out
  }, [])
  return (
    <>
      <mesh geometry={glass} material={M.glass} />
      <mesh geometry={cafe} material={M.cafe} />
      <mesh geometry={upper} material={M.upper} />
      <Instanced items={mullions} material={M.mullion} geometry={BOX} />
      <Instanced items={trees.map(([x, z]) => ({ p: [x, -3.5, z], s: [0.35, 3, 0.35] }))} material={M.trunk} geometry={BOX} />
      <Instanced
        items={trees.map(([x, z], i) => ({ p: [x, -0.8 + (i % 3) * 0.6, z], s: [3.2, 2.6, 3.2] }))}
        material={M.crown}
        geometry={SPHERE}
      />
      <Instanced items={cafeTables} material={M.board} geometry={BOX} />
    </>
  )
}
const SPHERE = new THREE.SphereGeometry(1, 14, 10)

function OutsideTrees({ M }) {
  const items = useMemo(() => {
    const r = rng(12)
    const out = []
    for (let i = 0; i < 70; i++) {
      const side = Math.floor(r() * 4)
      let x
      let z
      if (side === 0) [x, z] = [-48 - r() * 40, -60 + r() * 120]
      else if (side === 1) [x, z] = [46 + r() * 40, -60 + r() * 120]
      else if (side === 2) [x, z] = [-45 + r() * 120, -58 - r() * 30]
      else [x, z] = [-45 + r() * 120, 58 + r() * 30]
      out.push([x, z, 3 + r() * 3])
    }
    return out
  }, [])
  return (
    <>
      <Instanced items={items.map(([x, z]) => ({ p: [x, -2.5, z], s: [0.5, 5, 0.5] }))} material={M.trunk} geometry={BOX} />
      <Instanced items={items.map(([x, z, s]) => ({ p: [x, 1 + s * 0.5, z], s: [s, s * 0.9, s] }))} material={M.crown} geometry={SPHERE} />
    </>
  )
}

// ---------- walls (instanced by material)
const WALL_MATS = ['white', 'sage', 'exterior', 'libGlass', 'beinGlass', 'meetGlass', 'slats', 'desk', 'shelf', 'leather', 'orange']
function Walls({ M }) {
  const groups = useMemo(() => WALL_MATS.map((m) => [m, wallItems(m)]), [])
  return groups.map(([m, items]) => <Instanced key={m} items={items} material={M[m]} geometry={BOX} />)
}

// ---------- classroom drums
function Drums({ M }) {
  const signs = useMemo(() => DRUMS.map((d) => new THREE.MeshBasicMaterial({ map: T.signTex(d.name, d.id) })), [])
  const disc = useMemo(() => {
    const g = new THREE.CircleGeometry(1, 48)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  return DRUMS.map((d, i) => {
    const { c, rx, rz, gap, doors, arcs } = d
    const sp = ellPt(c, rx + 0.03, rz + 0.03, doors[0] + gap + 0.16)
    const n = [sp[0] - c[0], sp[1] - c[1]]
    return (
      <group key={d.id}>
        {arcs.map(([a0, a1], j) => (
          <group key={j}>
            <Arc c={c} rx={rx} rz={rz} a0={a0} a1={a1} material={M.drum} />
            <Arc c={c} rx={rx - DRUM_WALL} rz={rz - DRUM_WALL} a0={a0} a1={a1} material={M.drumIn} />
          </group>
        ))}
        {doors.map((a, j) => {
          const e1 = ellPt(c, rx, rz, a + gap)
          const e2 = ellPt(c, rx, rz, a - gap)
          return (
            <mesh
              key={j}
              material={M.frosted}
              position={[(e1[0] + e2[0]) / 2, (2.45 + H) / 2, (e1[1] + e2[1]) / 2]}
              rotation={[0, -Math.atan2(e2[1] - e1[1], e2[0] - e1[0]), 0]}
            >
              <boxGeometry args={[Math.hypot(e1[0] - e2[0], e1[1] - e2[1]), H - 2.45, 0.08]} />
            </mesh>
          )
        })}
        <mesh geometry={disc} material={M.roomCarpet} position={[c[0], 0.004, c[1]]} scale={[rx - DRUM_WALL, 1, rz - DRUM_WALL]} />
        <Plane p={[sp[0], 1.55, sp[1]]} rot={Math.atan2(n[0], n[1])} w={0.5} h={0.62} material={signs[i]} />
      </group>
    )
  })
}

function ClassroomStuff({ M }) {
  const seats = useMemo(() => CHAIRS.map((c) => ({ p: [c.x, 0.47, c.z], r: c.rot, s: [0.5, 0.08, 0.5] })), [])
  const backs = useMemo(
    () => CHAIRS.map((c) => ({ p: [c.x + Math.sin(c.rot) * 0.22, 0.8, c.z + Math.cos(c.rot) * 0.22], r: c.rot, s: [0.5, 0.6, 0.06] })),
    [],
  )
  const legs = useMemo(() => CHAIRS.map((c) => ({ p: [c.x, 0.22, c.z], s: [0.06, 0.44, 0.06] })), [])
  return (
    <>
      <Instanced items={seats} material={M.chair} geometry={BOX} />
      <Instanced items={backs} material={M.chair} geometry={BOX} />
      <Instanced items={legs} material={M.mullion} geometry={BOX} />
      {SCREENS.map((s, i) => (
        <Plane key={i} p={[s.x, 2.95, s.z]} rot={s.rot} w={2.1} h={1.2} material={M.screen} />
      ))}
      {BOARDS.map((b, i) => (
        <mesh key={i} position={[b.x, 1.45, b.z]} rotation={[0, b.rot, 0]} material={M.board}>
          <boxGeometry args={[b.w, 1.0, 0.04]} />
        </mesh>
      ))}
      {LECTERNS.map((l, i) => (
        <mesh key={i} position={[l.x, 0.55, l.z]} rotation={[0, l.rot, 0]} material={M.dark}>
          <boxGeometry args={[0.7, 1.1, 0.5]} />
        </mesh>
      ))}
    </>
  )
}

// ---------- Beinecke Terrace Room + terrace
function Beinecke({ M }) {
  const { c, r, terrace, doorGap, muralR, muralHalf } = BEIN
  const geos = useMemo(() => {
    const half = (rr) => {
      const g = new THREE.CircleGeometry(rr, 64, -Math.PI / 2, Math.PI)
      return g
    }
    const floor = half(r)
    floor.rotateX(-Math.PI / 2)
    const ceil = half(r)
    ceil.rotateX(Math.PI / 2)
    const ter = new THREE.RingGeometry(r, terrace, 64, 1, -Math.PI / 2, Math.PI)
    ter.rotateX(-Math.PI / 2)
    const over = new THREE.RingGeometry(r, 12.9, 64, 1, -Math.PI / 2, Math.PI)
    over.rotateX(Math.PI / 2)
    return { floor, ceil, ter, over }
  }, [r, terrace])
  const sign = useMemo(() => new THREE.MeshBasicMaterial({ map: T.signTex('Beinecke Terrace Room', '2300') }), [])
  const libSign = useMemo(() => new THREE.MeshBasicMaterial({ map: T.signTex('Ross Library', '2100') }), [])
  const col = ellPt(c, 12.6, 12.6, 0.6)
  return (
    <>
      <mesh geometry={geos.floor} material={M.beinCarpet} position={[c[0], 0.002, c[1]]} />
      <mesh geometry={geos.ceil} material={M.ceiling} position={[c[0], H, c[1]]} />
      <mesh geometry={geos.ter} material={M.stone} position={[c[0], 0.001, c[1]]} />
      <mesh geometry={geos.over} material={M.ceiling} position={[c[0], H, c[1]]} />
      <Arc c={c} rx={r} a0={0} a1={Math.PI / 2 - doorGap} material={M.glass} />
      <Arc c={c} rx={r} a0={Math.PI / 2 + doorGap} a1={Math.PI} material={M.glass} />
      <Arc c={c} rx={9.7} a0={0.12} a1={1.0} h={H - 0.2} material={M.velvet} />
      <Arc c={c} rx={terrace} a0={0} a1={Math.PI} h={1.05} material={M.rail} />
      <Arc c={c} rx={muralR} a0={Math.PI / 2 - muralHalf} a1={Math.PI / 2 + muralHalf} h={3.8} material={M.mural} />
      <mesh position={[col[0], H / 2, col[1]]} material={M.column}>
        <cylinderGeometry args={[0.25, 0.25, H, 20]} />
      </mesh>
      {BEIN_TABLES.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.74, z]} material={M.desk}>
          <cylinderGeometry args={[0.8, 0.8, 0.04, 32]} />
        </mesh>
      ))}
      <Plane p={[EAST - 0.12, 1.55, -2.0]} rot={-Math.PI / 2} w={0.5} h={0.62} material={sign} />
      <Plane p={[LIBRARY.x1 + 0.08, 1.55, 2.0]} rot={Math.PI / 2} w={0.5} h={0.62} material={libSign} />
      <Plane p={[EAST - 0.15, 2.3, 14.8]} rot={-Math.PI / 2} w={3.2} h={3.6} material={M.poster} />
    </>
  )
}

// ---------- stairwells with paintings above
function Stairs({ M }) {
  const mats = useMemo(() => {
    return STAIRS.map((s) => {
      if (s.photo) {
        const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/stair-g.jpg`)
        t.colorSpace = THREE.SRGBColorSpace
        t.repeat.set(215 / 1200, 282 / 1600)
        t.offset.set(450 / 1200, 1 - 797 / 1600)
        return new THREE.MeshBasicMaterial({ map: t })
      }
      return new THREE.MeshBasicMaterial({ map: T.paintingTex(s.seed) })
    })
  }, [])
  return STAIRS.map((s, i) => {
    const ext = s.face[0] !== 0 ? s.w / 2 : s.d / 2
    const off = ext + 0.12
    const p = [s.c[0] + s.face[0] * off, s.c[1] + s.face[1] * off]
    const rot = Math.atan2(s.face[0], s.face[1])
    return (
      <group key={s.id}>
        <Plane p={[p[0], 1.2, p[1]]} w={1.8} h={2.4} rot={rot} material={M.opening} />
        <Plane p={[p[0] + s.face[0] * 0.01, 2.5, p[1] + s.face[1] * 0.01]} w={0.5} h={0.18} rot={rot} material={M.exit} />
        <mesh position={[p[0], 3.5, p[1]]} rotation={[0, rot, 0]} material={M.dark}>
          <boxGeometry args={[1.4, 1.78, 0.04]} />
        </mesh>
        <Plane p={[p[0] + s.face[0] * 0.03, 3.5, p[1] + s.face[1] * 0.03]} w={1.25} h={1.64} rot={rot} material={mats[i]} />
      </group>
    )
  })
}

// ---------- pot lights, plants
function Details({ M }) {
  const lights = useMemo(() => {
    const out = []
    const { xMin, xMax, zMin, zMax } = BOUNDS
    for (let x = xMin + 1.2; x < xMax; x += 2.4)
      for (let z = zMin + 1.2; z < zMax; z += 2.4) if (!inPoly(x, z, COURTYARD)) out.push({ p: [x, H - 0.01, z] })
    for (let x = EAST + 1; x < EAST + 9.5; x += 2.4)
      for (let z = -9; z < 9.5; z += 2.4) if (Math.hypot(x - EAST, z) < 9.3) out.push({ p: [x, H - 0.01, z] })
    return out
  }, [])
  const lampGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(0.09, 12)
    g.rotateX(Math.PI / 2)
    return g
  }, [])
  return (
    <>
      <Instanced items={lights} material={M.lamp} geometry={lampGeo} />
      <Instanced items={PLANTS.map(([x, z]) => ({ p: [x, 0.3, z], s: [0.3, 0.6, 0.3] }))} material={M.pot} geometry={BOX} />
      <Instanced items={PLANTS.map(([x, z]) => ({ p: [x, 1.1, z], s: [0.5, 0.65, 0.5] }))} material={M.leaf} geometry={SPHERE} />
      {MEETING.map((m, i) => (
        <Plane key={i} p={[m.x, 1.6, m.z + (m.z > 0 ? 2.85 : -2.85)]} rot={m.z > 0 ? Math.PI : 0} w={1.6} h={0.9} material={M.dark} />
      ))}
    </>
  )
}

export default function World() {
  const M = useMaterials()
  return (
    <>
      <Atmosphere />
      <FloorAndCeiling M={M} />
      <Courtyard M={M} />
      <OutsideTrees M={M} />
      <Walls M={M} />
      <Drums M={M} />
      <ClassroomStuff M={M} />
      <Beinecke M={M} />
      <Stairs M={M} />
      <Details M={M} />
    </>
  )
}
