import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Interactable, openDialogue, useDiscovery } from '../../interact/index.jsx'
import { withAvatars } from '../../ui/portraits.js'
import { Box, canvasTex, seeded, std } from './common.jsx'
import { MEETING } from '../../layout.js'

// Egg: "MGT 409 Analyst Desk", a wall screen in north meeting room 2246 (the west end of the north bar).
// Lecture 4 builds a financial analyst agent over these ten tickers. Quotes are fake: a seeded
// random walk, one step a second, and the canvas redraws at 2 fps to stay cheap.
// read from layout.MEETING so the screen follows the room if the plan moves; the room's own monitor
// is on the east divider, this one hangs on the west divider (0.15 m thick)
const ROOM = MEETING.find((m) => m.num === 2246)
const ROOM_WEST_WALL = ROOM.x - ROOM.w / 2
const Z = ROOM.z
const SCREEN = [ROOM_WEST_WALL + 0.11, 2.95, Z] // classroom screens hang at y 2.95, 2.1 x 1.18 m
const W = 1024
const H = 576

// [ticker, plausible price level, daily volatility scale]
const BOOK = [
  ['AAPL', 228, 1], ['MSFT', 432, 1], ['NVDA', 178, 2.2], ['GOOGL', 196, 1.3], ['AMZN', 214, 1.4],
  ['META', 712, 1.6], ['TSLA', 341, 3], ['JPM', 286, 0.9], ['BAC', 48.6, 1], ['GS', 742, 1.1],
]

function makeQuotes() {
  const r = seeded(409)
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
  const q = BOOK.map(([sym, lvl, vol]) => {
    const open = lvl * (1 + (r() - 0.5) * 0.04)
    return { sym, vol, open, price: open * (1 + (r() - 0.5) * 0.05 * vol) }
  })
  return {
    q,
    step() {
      for (const s of q) s.price *= Math.exp(0.0012 * s.vol * gauss())
    },
  }
}

const pct = (s) => (s.price / s.open - 1) * 100
const fmt = (s) => `${s.sym} $${s.price.toFixed(2)}, ${pct(s) >= 0 ? 'up' : 'down'} ${Math.abs(pct(s)).toFixed(2)}% from the open`
const UP = '#3ddc84'
const DOWN = '#ff5a5f'

function draw(g, quotes, scroll) {
  g.fillStyle = '#06122a'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#00356b'
  g.fillRect(0, 0, W, 84)
  g.fillStyle = '#ffffff'
  g.font = 'bold 46px Inter, system-ui, sans-serif'
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  g.fillText('MGT 409 Analyst Desk', 32, 44)
  g.textAlign = 'right'
  g.font = '600 24px "JetBrains Mono", ui-monospace, monospace'
  g.fillStyle = '#9fc3ff'
  g.fillText(`${new Date().toLocaleTimeString('en-US', { hour12: false })} · simulated`, W - 30, 44)
  quotes.q.forEach((s, i) => {
    const x = i < 5 ? 32 : W / 2 + 16
    const y = 128 + (i % 5) * 76
    const up = pct(s) >= 0
    g.fillStyle = i % 2 ? '#0b1b3a' : '#0e2246'
    g.fillRect(x - 12, y - 34, W / 2 - 40, 68)
    g.textAlign = 'left'
    g.fillStyle = '#ffffff'
    g.font = 'bold 36px Inter, system-ui, sans-serif'
    g.fillText(s.sym, x, y)
    g.textAlign = 'right'
    g.font = '600 32px "JetBrains Mono", ui-monospace, monospace'
    g.fillText(s.price.toFixed(2), x + 290, y)
    g.fillStyle = up ? UP : DOWN
    g.fillText(`${up ? '▲' : '▼'}${Math.abs(pct(s)).toFixed(2)}%`, x + W / 2 - 64, y)
  })
  // scrolling tape along the bottom
  g.fillStyle = '#000000'
  g.fillRect(0, H - 70, W, 70)
  g.font = '600 30px "JetBrains Mono", ui-monospace, monospace'
  g.textAlign = 'left'
  const items = quotes.q.map((s) => [`${s.sym} ${s.price.toFixed(2)} `, `${pct(s) >= 0 ? '▲' : '▼'}${Math.abs(pct(s)).toFixed(2)}%   `, pct(s) >= 0])
  const widths = items.map(([a, b]) => g.measureText(a + b).width)
  const total = widths.reduce((a, b) => a + b, 0)
  let x = -(scroll % total)
  for (let k = 0; x < W; k++) {
    const [a, b, up] = items[k % items.length]
    g.fillStyle = '#ffffff'
    g.fillText(a, x, H - 35)
    g.fillStyle = up ? UP : DOWN
    g.fillText(b, x + g.measureText(a).width, H - 35)
    x += widths[k % items.length]
  }
}

function answers(q) {
  const sorted = [...q].sort((a, b) => pct(b) - pct(a))
  return { best: sorted[0], worst: sorted.at(-1) }
}

export default function Ticker() {
  const { discover } = useDiscovery('ticker', 'Checked the markets')
  const quotes = useMemo(makeQuotes, [])
  const tex = useMemo(() => canvasTex(W, H), [])
  const mats = useMemo(
    () => ({
      screen: std({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.85, roughness: 0.35 }),
      bezel: std({ color: '#141418', roughness: 0.5, metalness: 0.3 }),
    }),
    [tex],
  )
  const clock = useRef({ draw: 0, step: 0, scroll: 0, first: true })
  useFrame((_, dt) => {
    const c = clock.current
    c.draw += dt
    c.step += dt
    if (c.step >= 1) {
      c.step %= 1
      quotes.step()
    }
    if (c.first || c.draw >= 0.5) {
      c.first = false
      c.draw %= 0.5
      c.scroll += 28
      draw(tex.image.getContext('2d'), quotes, c.scroll)
      tex.needsUpdate = true
    }
  })

  // answers read the live quotes when the choice is made: each choice reopens the script at its answer
  const script = (start) => {
    const { best, worst } = answers(quotes.q)
    const pick = (id) => () => openDialogue(withAvatars(script(id)))
    const lines = {
      hello: { speaker: 'Analyst agent', text: 'Hi. I track AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, JPM, BAC and GS. What do you want to know?', next: 'menu' },
      best: { id: 'best', speaker: 'Analyst agent', text: `Best today: ${fmt(best)}.`, next: 'menu' },
      worst: { id: 'worst', speaker: 'Analyst agent', text: `Worst today: ${fmt(worst)}.`, next: 'menu' },
      buy: {
        id: 'buy',
        speaker: 'Analyst agent',
        text: 'I am not a licensed financial advisor. I only summarize `yfinance` data for these ten tickers. Ask a human professional before you trade.',
        next: 'menu',
      },
    }
    const menu = {
      id: 'menu',
      speaker: 'Analyst agent',
      text: 'Ask the analyst agent.',
      choices: [
        { text: 'Best performer today?', onChoice: pick('best') },
        { text: 'Worst performer today?', onChoice: pick('worst') },
        { text: 'Should I buy?', onChoice: pick('buy') },
        { text: "That's all, thanks", next: 'end' },
      ],
    }
    return [lines[start], menu]
  }
  const ask = () => {
    discover()
    openDialogue(withAvatars(script('hello')))
  }

  return (
    <>
      <group position={SCREEN} rotation={[0, Math.PI / 2, 0]}>
        <Box size={[2.22, 1.3, 0.05]} material={mats.bezel} position={[0, 0, -0.03]} />
        <mesh material={mats.screen} receiveShadow>
          <planeGeometry args={[2.1, 1.18]} />
        </mesh>
      </group>
      <Interactable position={[ROOM_WEST_WALL + 1.1, 0, Z + 1.1]} radius={2.4} label="the analyst desk" verb="Ask" marker="egg" onInteract={ask} />
    </>
  )
}
