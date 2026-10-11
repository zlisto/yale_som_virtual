import { useMemo, useState } from 'react'
import { Interactable, openDialogue, useDiscovery } from '../../interact/index.jsx'
import { withAvatars } from '../../ui/portraits.js'
import { BEIN, LIBRARY, ellPt, planX } from '../../layout.js'
import { Box, Pill, canvasTex, onDrum, saved, seeded, std } from './common.jsx'

// Egg: three small brushed-metal plaques. Hidden from the minimap until read, since finding them is the game.
const LS = 'evans.eggsB.plaques.v1'
const muralBack = BEIN.muralR + 0.02 // the convex (east) face of the Beinecke mural wall, out of sight from the door
const thA = Math.PI / 2 + 0.35
const atC = onDrum('2400', 2.25, 0.02) // drum 2400's outer wall, right behind the spawn point
const PLAQUES = [
  {
    id: 'hybrid',
    quote: 'Hybrid is the adult answer.',
    who: 'Instructor outline, Lecture 13',
    context: 'From the Lecture 13 outline, on choosing between full automation and keeping people in the loop.',
    p: ellPt(BEIN.c, muralBack, muralBack, thA),
    rot: thA,
  },
  {
    id: 'overlords',
    quote: 'I welcome our new computer overlords.',
    who: 'Ken Jennings, as quoted in Lecture 1',
    context: 'Jennings wrote it under his Final Jeopardy! answer in 2011, the night IBM Watson beat him.',
    p: [planX(-31), LIBRARY.z1 + 0.12], // outside face of the library's south wall, across from stair A

    rot: 0,
  },
  {
    id: 'core',
    quote: 'First time Yale SOM has put AI in the core.',
    who: 'Lecture 1',
    context: 'Lecture 1 of MGT 409, AI Foundations for Managers, on the course joining the core curriculum.',
    p: atC.p,
    rot: atC.rot,
  },
]

function wrap(g, text, maxW) {
  const lines = ['']
  for (const w of text.split(' ')) {
    const t = lines.at(-1) ? `${lines.at(-1)} ${w}` : w
    if (g.measureText(t).width > maxW && lines.at(-1)) lines.push(w)
    else lines[lines.length - 1] = t
  }
  return lines
}

function plaqueTex({ quote, who }, seed) {
  return canvasTex(1024, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, '#d9dadc')
    grad.addColorStop(0.5, '#b9bbbf')
    grad.addColorStop(1, '#cfd1d4')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    const r = seeded(seed)
    for (let i = 0; i < 2600; i++) {
      // brushed grain: thin horizontal streaks
      g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.18})` : `rgba(60,60,64,${r() * 0.12})`
      g.fillRect(r() * w - 100, r() * h, 60 + r() * 260, 1)
    }
    g.strokeStyle = 'rgba(40,40,44,0.55)'
    g.lineWidth = 6
    g.strokeRect(26, 26, w - 52, h - 52)
    for (const [x, y] of [[52, 52], [w - 52, 52], [52, h - 52], [w - 52, h - 52]]) {
      g.fillStyle = '#8b8d91'
      g.beginPath()
      g.arc(x, y, 11, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#5c5e62'
      g.fillRect(x - 8, y - 1.5, 16, 3)
    }
    // engraved text: dark letters with a light lip underneath
    const engrave = (t, x, y) => {
      g.fillStyle = 'rgba(255,255,255,0.65)'
      g.fillText(t, x, y + 2)
      g.fillStyle = '#26272b'
      g.fillText(t, x, y)
    }
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = '600 62px Georgia, "Times New Roman", serif'
    const lines = wrap(g, `“${quote}”`, w - 170)
    const y0 = 215 - (lines.length - 1) * 38
    lines.forEach((t, i) => engrave(t, w / 2, y0 + i * 76))
    g.font = 'italic 46px Georgia, "Times New Roman", serif'
    engrave(who, w / 2, 395)
  })
}

function Plaque({ plaque, index, read, onRead }) {
  const mats = useMemo(
    () => ({
      face: std({ map: plaqueTex(plaque, 7 + index), metalness: 0.35, roughness: 0.45 }),
      edge: std({ color: '#9a9ca0', metalness: 0.5, roughness: 0.4 }),
    }),
    [plaque, index],
  )
  const { p, rot } = plaque
  const out = [Math.sin(rot) * 0.45, Math.cos(rot) * 0.45]
  return (
    <>
      <group position={[p[0], 1.5, p[1]]} rotation={[0, rot, 0]}>
        <Box size={[0.52, 0.27, 0.012]} material={mats.edge} position={[0, 0, 0.004]} />
        <mesh material={mats.face} position={[0, 0, 0.0105]} castShadow receiveShadow>
          <planeGeometry args={[0.5, 0.25]} />
        </mesh>
      </group>
      <Interactable
        position={[p[0] + out[0], 0, p[1] + out[1]]}
        radius={1.8}
        label="a small metal plaque"
        verb="Read"
        marker={read ? 'egg' : false}
        onInteract={() => {
          onRead(plaque.id)
          openDialogue(
            withAvatars([
              { speaker: 'Plaque', text: `“${plaque.quote}” (${plaque.who})` },
              { speaker: 'Plaque', text: plaque.context },
            ]),
          )
        }}
      />
    </>
  )
}

export default function Plaques() {
  const { discover } = useDiscovery('plaques', 'Read all three plaques')
  const [read, setRead] = useState(() => saved.get(LS, []))
  const onRead = (id) => {
    if (read.includes(id)) return
    const next = [...read, id]
    setRead(next)
    saved.set(LS, next)
    if (next.length === PLAQUES.length) setTimeout(discover, 400)
  }
  return (
    <>
      {PLAQUES.map((pl, i) => (
        <Plaque key={pl.id} plaque={pl} index={i} read={read.includes(pl.id)} onRead={onRead} />
      ))}
      {read.length > 0 && <Pill k="plaques" label="plaques" value={read.length} total={PLAQUES.length} order={22} />}
    </>
  )
}
