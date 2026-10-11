import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Counter, Interactable, openDialogue, removeHudItem, setHudItem, useDiscovery } from '../../interact/index.jsx'
import { LIBRARY } from '../../layout.js'
import { canvasTex, lineIndex, printMat, solidMat, waitThen } from './util.js'
import { BOOKS, drawBook, drawBoss } from './portraitArt.js'
import { withAvatars } from '../../ui/portraits.js'

// Egg: the multi-agent desk from lecture 10 (a Harry Potter boss agent with seven book specialists), metered as
// in lecture 11. Seven portraits and a larger Boss Agent frame hang on the north wall of Ross Library.
const WALL_Z = LIBRARY.z0 + 0.12 // face of the north wall, plus a hair
const BOOK_W = 0.8
const BOSS_W = 1.2
const GAP = 0.32
const CX = (LIBRARY.x0 + LIBRARY.x1) / 2
// left to right: books 1-3, the boss, books 4-7
const SLOTS = (() => {
  const widths = [BOOK_W, BOOK_W, BOOK_W, BOSS_W, BOOK_W, BOOK_W, BOOK_W, BOOK_W]
  const total = widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1)
  let x = CX - total / 2
  return widths.map((w) => {
    const c = x + w / 2
    x += w + GAP
    return c
  })
})()
const BOOK_X = [0, 1, 2, 4, 5, 6, 7].map((i) => SLOTS[i])
const BOSS_X = SLOTS[3]
const STEP = 0.22 // s per frame while the boss routes
const flash = { t0: -1, hits: [] } // routing animation: sweep 1..7, then hold the chosen books

const QUESTIONS = [
  { q: 'Where is the best place to hide a diary?', hits: [1], a: 'Routed to Chamber of Secrets. Its advice: do not. A diary that writes back is an agent nobody authorized. Cost: 1 router call plus 1 specialist, `744 tokens`.' },
  { q: 'How do I get to two classes at once?', hits: [2], a: 'Routed to Prisoner of Azkaban. It recommends a small hourglass and one strict rule about never being seen by yourself. Cost: `1,310 tokens`, some of them spent twice.' },
  { q: 'Which book has a dragon in it?', hits: [0, 3, 6], a: 'Three specialists raised their hands: books one, four and seven. I merged their answers. Cost: 1 router call plus 3 specialists, `3,962 tokens`. Sending a question to everyone is how a multi-agent desk runs up the bill.' },
]

function bossScript() {
  const s = [
    {
      id: 'menu',
      speaker: 'Boss Agent',
      text: 'I never answer a question myself. I route it to whichever of my seven specialists knows best, then take the credit. What would you like to know?',
      choices: [
        ...QUESTIONS.map((x, i) => ({
          text: x.q,
          onChoice: () => {
            flash.t0 = performance.now() / 1000
            flash.hits = x.hits
            waitThen((STEP * 7 + 0.6) * 1000, { speaker: 'Boss Agent', avatar: { kind: 'boss' }, text: 'router: asking book_1 ... book_7', cls: 'egg-routing' }, s, lineIndex(s, `a${i}`))
          },
        })),
        { text: 'That is all, thank you', next: 'end' },
      ],
    },
    ...QUESTIONS.map((x, i) => ({ id: `a${i}`, speaker: 'Boss Agent', text: x.a, next: 'menu' })),
  ]
  return s
}

const portraitScript = (b) => [
  { speaker: b.title, text: b.line },
  { speaker: 'Token meter', text: b.cost, next: 'end' },
]

function Frame({ w, h, mat, frameMat }) {
  const t = 0.07
  const bar = (p, s) => (
    <mesh material={frameMat} position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  )
  return (
    <>
      {bar([0, h / 2 + t / 2, 0.02], [w + 2 * t, t, 0.06])}
      {bar([0, -h / 2 - t / 2, 0.02], [w + 2 * t, t, 0.06])}
      {bar([-w / 2 - t / 2, 0, 0.02], [t, h, 0.06])}
      {bar([w / 2 + t / 2, 0, 0.02], [t, h, 0.06])}
      <mesh material={mat} position={[0, 0, 0.005]} receiveShadow>
        <planeGeometry args={[w, h]} />
      </mesh>
    </>
  )
}

export default function LibraryPortraits() {
  const [talked, setTalked] = useState(() => new Set())
  const [inLib, setInLib] = useState(false)
  const { discover } = useDiscovery('library', 'Consulted all seven book specialists')
  const mats = useMemo(() => BOOKS.map((b, i) => printMat(canvasTex(512, 640, (g, w, h) => drawBook(g, w, h, b, i)), { glow: 0.0001 })), [])
  // each book has its own frame so the routing flash can light it gold
  const frames = useMemo(() => BOOKS.map(() => solidMat('#b08d3c', { metalness: 0.7, roughness: 0.35, emissive: '#ffb52e', emissiveIntensity: 0 })), [])
  const boss = useMemo(() => ({ mat: printMat(canvasTex(512, 683, drawBoss)), frame: solidMat('#b08d3c', { metalness: 0.7, roughness: 0.35 }) }), [])
  const libRef = useRef(false)

  useFrame(({ camera }) => {
    const p = camera.position
    const inside = p.x < LIBRARY.x1 && p.x > LIBRARY.x0 && p.z > LIBRARY.z0 && p.z < LIBRARY.z1
    if (inside !== libRef.current) setInLib((libRef.current = inside))
    const t = performance.now() / 1000 - flash.t0
    mats.forEach((m, i) => {
      let k = 0
      if (flash.t0 >= 0 && t < STEP * 7 + 1.6) {
        const sweep = Math.max(0, 1 - Math.abs(t - (i + 0.5) * STEP) / STEP)
        const hold = flash.hits.includes(i) && t > STEP * 7 ? 1 : 0
        k = Math.max(sweep, hold)
      }
      m.emissiveIntensity = 0.0001 + k * 3.6
      frames[i].emissiveIntensity = k * 2.4
    })
  })

  useEffect(() => {
    if (inLib) setHudItem('counters', 'egg-library', <Counter label="specialists consulted" value={talked.size} total={7} />, 20)
    else removeHudItem('counters', 'egg-library')
  }, [inLib, talked])
  useEffect(() => () => removeHudItem('counters', 'egg-library'), [])

  const talk = (i) => {
    openDialogue(withAvatars(portraitScript(BOOKS[i])))
    if (talked.has(i)) return
    const next = new Set(talked).add(i)
    setTalked(next)
    if (next.size === 7) discover()
  }

  return (
    <>
      {BOOKS.map((b, i) => (
        <Interactable key={i} position={[BOOK_X[i], 0, WALL_Z + 0.5]} radius={1.4} label={b.title} verb="Talk to" marker="npc" onInteract={() => talk(i)}>
          <group position={[0, 1.6, -0.5]}>
            <Frame w={BOOK_W} h={1.0} mat={mats[i]} frameMat={frames[i]} />
          </group>
        </Interactable>
      ))}
      <Interactable position={[BOSS_X, 0, WALL_Z + 0.5]} radius={2.1} label="the Boss Agent" verb="Ask" marker="npc" onInteract={() => openDialogue(withAvatars(bossScript()))}>
        <group position={[0, 1.85, -0.5]}>
          <Frame w={BOSS_W} h={1.6} mat={boss.mat} frameMat={boss.frame} />
        </group>
      </Interactable>
    </>
  )
}
