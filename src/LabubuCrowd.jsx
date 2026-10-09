import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { EXPRESSIONS, G, SKIN, YALE_BLUE, faceTex, furTex, shirtTex } from './Labubu.jsx'
import { CHAIRS, DRUMS } from './layout.js'

// ~30 seated Labubu students per classroom, drawn with a handful of instanced meshes
// (one per body part) so hundreds of them stay cheap.
const STUDENTS_PER_ROOM = 30
const HEIGHT = 0.95
const FURS = ['#5a3d2e', '#d9c2a0', '#ff8fc7', '#9fe0c6', '#b9a5e6', '#8d8d93', '#f2efe9', '#f2a65a', '#7fb2ff', '#2b2b2e', '#c98f6b', '#e6d36b']
const SHIRTS = ['yale', 'yale', 'yale', 'stripes', 'plain', 'plain', 'plain', 'none']
const SHIRT_COLORS = ['#ffffff', YALE_BLUE, '#ff4fa3', '#7a9e7e', '#e8dcc0', '#2b2b2e', '#c94f4f']
const PANTS = ['#1d2a44', '#3d5a8a', '#d8cfc0', '#2c2c30', '#e8dcc0', null, null]

function rand(seed) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

const V = new THREE.Vector3()
const S = new THREE.Vector3()
const Q = new THREE.Quaternion()
const E = new THREE.Euler()
const M = (p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => new THREE.Matrix4().compose(V.set(...p), Q.setFromEuler(E.set(...r)), S.set(...s))
const mul = (...ms) => ms.reduce((a, b) => a.clone().multiply(b))

// pick seats + outfits once
export const STUDENTS = DRUMS.flatMap((d, di) => {
  const r = rand(4242 + di * 977)
  const pick = (a) => a[Math.floor(r() * a.length)]
  const seats = CHAIRS.filter((c) => c.room === d.id)
    .map((c) => [r(), c])
    .sort((a, b) => a[0] - b[0])
    .slice(0, STUDENTS_PER_ROOM)
    .map(([, c]) => c)
  return seats.map((c) => {
    const shirt = pick(SHIRTS)
    return {
      x: c.x,
      y: (c.y || 0) + 0.51 - 0.11 * HEIGHT,
      z: c.z,
      rot: c.rot + Math.PI,
      fur: pick(FURS),
      expression: pick(EXPRESSIONS),
      shirt,
      shirtColor: pick(SHIRT_COLORS),
      pants: pick(PANTS),
    }
  })
})

// local part transforms for a seated Labubu (same layout as Labubu.jsx)
function partsFor(s) {
  const out = []
  const add = (bucket, m, color) => out.push({ bucket, m, color })
  const fur = s.fur
  const legM = s.pants ? 0.078 : 0.07
  for (const x of [-0.085, 0.085]) {
    add(s.pants ? 'cyl' : 'furCyl', M([x, 0.15, 0.12], [Math.PI / 2, 0, 0], [legM, 0.2, legM]), s.pants || fur)
    add('skin', M([x, 0.17, 0.23], [0, 0, 0], [0.065, 0.09, 0.035]))
  }
  add('fur', M([0, 0.34, 0], [0, 0, 0], [0.2, 0.23, 0.18]), fur)
  if (s.pants) add('cyl', M([0, 0.22, 0], [0, 0, 0], [0.19, 0.12, 0.17]), s.pants)
  const shirtBucket = s.shirt === 'yale' ? 'shirtYale' : s.shirt === 'stripes' ? 'shirtStripes' : s.shirt === 'plain' ? 'shirtPlain' : null
  if (shirtBucket) add(shirtBucket, M([0, 0.39, 0], [0, 0, 0], [0.207, 0.22, 0.188]), s.shirtColor)
  for (const side of [1, -1]) {
    const shoulder = M([0.17 * side, 0.47, 0], [0.25, 0, 0.35 * side])
    add('furLimb', mul(shoulder, M([0, -0.09, 0], [0, 0, 0], [0.045, 0.06, 0.045])), fur)
    if (shirtBucket) add(shirtBucket === 'shirtPlain' ? 'cyl' : 'sleeve' + shirtBucket.slice(5), mul(shoulder, M([0, -0.04, 0], [0, 0, 0], [0.056, 0.07, 0.056])), s.shirt === 'plain' ? s.shirtColor : undefined)
    add('skin', mul(shoulder, M([0, -0.18, 0.01], [0, 0, 0], [0.04, 0.045, 0.035])))
  }
  const head = M([0, 0.7, 0])
  add('fur', mul(head, M([0, 0, 0], [0, 0, 0], [0.27, 0.25, 0.25])), fur)
  add('face-' + s.expression, mul(head, M([0, -0.02, 0.012], [0, 0, 0], [0.245, 0.235, 0.255])))
  for (const side of [-1, 1]) {
    const ear = mul(head, M([0.115 * side, 0.27, -0.02], [0, 0, -0.14 * side]))
    add('fur', mul(ear, M([0, 0, 0], [0, 0, 0], [0.075, 0.17, 0.05])), fur)
    add('skin', mul(ear, M([0, -0.01, 0.03], [0, 0, 0], [0.042, 0.12, 0.025])))
    add('dark', mul(ear, M([0, -0.02, 0.05], [0, 0, 0], [0.012, 0.055, 0.008])))
  }
  return out
}

function buckets() {
  const std = (o) => new THREE.MeshStandardMaterial(o)
  const furM = std({ color: '#ffffff', map: furTex(), bumpMap: furTex(), bumpScale: 2, roughness: 1 })
  const plain = std({ color: '#ffffff', roughness: 0.85 })
  const sleeveGeo = G.cyl
  const b = {
    fur: [G.sphere, furM, true],
    furLimb: [G.limb, furM, true],
    furCyl: [G.cyl, furM, true],
    skin: [G.sphere, std({ color: SKIN, roughness: 0.55 }), false],
    dark: [G.sphere, std({ color: '#3a2416', roughness: 0.6 }), false],
    cyl: [G.cyl, plain, true],
    shirtPlain: [G.shirt, plain, true],
    shirtYale: [G.shirt, std({ map: shirtTex('yale'), roughness: 0.85 }), false],
    shirtStripes: [G.shirt, std({ map: shirtTex('stripes'), roughness: 0.85 }), false],
    sleeveYale: [sleeveGeo, std({ color: YALE_BLUE, roughness: 0.85 }), false],
    sleeveStripes: [sleeveGeo, std({ map: shirtTex('stripes'), roughness: 0.85 }), false],
  }
  for (const e of EXPRESSIONS) b['face-' + e] = [G.face, std({ map: faceTex(e), roughness: 0.5 }), false]
  return b
}

function Bucket({ geo, mat, items, tinted }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const c = new THREE.Color()
    items.forEach((it, i) => {
      ref.current.setMatrixAt(i, it.m)
      if (tinted) ref.current.setColorAt(i, c.set(it.color || '#ffffff'))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [items, tinted])
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} frustumCulled={false} />
}

export default function LabubuCrowd() {
  const groups = useMemo(() => {
    const defs = buckets()
    const lists = Object.fromEntries(Object.keys(defs).map((k) => [k, []]))
    for (const s of STUDENTS) {
      const root = M([s.x, s.y, s.z], [0, s.rot, 0], [HEIGHT, HEIGHT, HEIGHT])
      for (const p of partsFor(s)) lists[p.bucket].push({ m: mul(root, p.m), color: p.color })
    }
    return Object.entries(defs)
      .filter(([k]) => lists[k].length)
      .map(([k, [geo, mat, tinted]]) => ({ k, geo, mat, tinted, items: lists[k] }))
  }, [])
  return groups.map((g) => <Bucket key={g.k} geo={g.geo} mat={g.mat} items={g.items} tinted={g.tinted} />)
}
