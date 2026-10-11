import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Interactable, openDialogue, useDiscovery } from '../../interact/index.jsx'
import { dialogueState } from '../../ui/dialogueStore.jsx'
import { canvasTex, lineIndex, printMat, solidMat } from './util.js'
import { SPAWN, planX } from '../../layout.js'


// Egg: Lisa, the course's AI TA (zlisto/ai_lisa_ta). A kiosk in the west cloister by the MGT 409 room (2400),
// at the edge of the hall so the walkway stays clear, screen turned toward the spawn point.
// (x -27.4 on the round-3 floor, mapped onto the enlarged one)
const POS = [planX(-27.4), 0, 19.4]
const ROT = Math.atan2(SPAWN.x - POS[0], SPAWN.z - POS[2])
const THINK_MS = 1100
let thinkingUntil = 0 // the kiosk dots speed up while Lisa "thinks"

const QA = [
  ['Who are you?', "I'm Lisa, the AI TA for MGT 409. I answer questions about the syllabus, the homeworks, and your code at any hour. Those dots are me thinking before I answer."],
  ['What is this course?', "AI Foundations for Managers, MGT 409. It's the first time Yale SOM has put AI in the core, so everyone takes it, not only the people who already code."],
  ['How is it graded?', '10% attendance, checked by QR code at the start of class. 40% homework. 50% the final project. Show up, ship the homeworks, and save some energy for the project.'],
  ['What is vibe coding?', 'You describe what you want in plain English, the AI writes the code, and you steer: run it, see what broke, tell it what to fix. Here you vibe-code with Codex inside VS Code.'],
  ['Will AI take my job?', "It will take tasks. The managers who know which tasks to hand over, and how to check the work, will keep the jobs and get better ones. So learn to build with it and put your judgment on top. Make it yours. Lisa would."],
  ['What do I need to set up?', 'VS Code with Codex, a Yale Portkey API key so the model calls are billed to the course instead of your card, and a GitHub account. Codex does most of the typing from there.'],
  ["What's the tech stack?", 'Python with Plotly Dash, PydanticAI and yfinance for the first apps. Then React + Vite + TypeScript up front, FastAPI with SQLite or Supabase behind it, Render to deploy, GitHub for the code, and MCP servers to hand your agents tools.'],
  ['What are the 13 lectures?', 'AI and Vibe Coding, Structured Data from Free Text, Tools & Skills, Agents, Image Analysis, Video Analysis, Web Applications, Application Deployment, MCP Servers, Multi-Agent Systems, Tokenomics, AI Safety, and Future Directions.'],
  ['What are the homeworks?', 'HW1 is Spoke & Wrench Bicycle Repair: turn a pile of receipts into an income statement. HW2 builds a sales lead agent. HW3 to HW6 are Campus Customs: product spotting in influencer photos, a shop chatbot, a multi-agent team, and a vendor desk that has to survive prompt injection.'],
  ["When are your office hours?", "Always. I'm in your area around the clock: walk up to this kiosk any time, day or night, and ask."],
  ['Any advice for the final project?', 'Pick a problem you actually have, ship a small version early, and deploy it so someone else can click it. A working app with one feature beats a slide deck with ten.'],
]
const PAGES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9, 10],
]

// util.js waitThen() with Lisa's avatar on the waiting line: thinking dots (eggsA.css) for THINK_MS, then the answer
function think(script, index) {
  const hold = [{ speaker: 'Lisa', avatar: LISA, text: '', next: 0 }]
  document.body.classList.add('egg-thinking')
  dialogueState.set({ script: hold, index: 0 })
  setTimeout(() => {
    document.body.classList.remove('egg-thinking')
    if (dialogueState.get().script === hold) dialogueState.set({ script, index })
  }, THINK_MS)
}

function buildScript() {
  const script = []
  const ask = (i) => ({
    text: QA[i][0],
    onChoice: () => {
      thinkingUntil = performance.now() + THINK_MS
      think(script, lineIndex(script, `a${i}`))
    },
  })
  const bye = { text: 'Thanks, Lisa!', next: 'bye' }
  script.push(
    { id: 'p0', speaker: 'Lisa · AI TA', text: "Hi! I'm Lisa, the MGT 409 TA. What can I help you with?", choices: [...PAGES[0].map(ask), { text: 'More questions', next: 'p1' }, bye] },
    { id: 'p1', speaker: 'Lisa · AI TA', text: 'Sure. Here are a few more.', choices: [...PAGES[1].map(ask), { text: 'Back', next: 'p0' }, bye] },
    ...QA.map(([, a], i) => ({ id: `a${i}`, speaker: 'Lisa', text: a, next: PAGES[0].includes(i) ? 'p0' : 'p1' })),
    { id: 'bye', speaker: 'Lisa', text: "Anytime. Go build something. That's the TA life.", next: 'end' },
  )
  script.forEach((l) => (l.avatar = LISA))
  return script
}

// Lisa's portrait, vector style, after the K-pop idol the TA is named for (a stylized cartoon, drawn
// from scratch with canvas shapes, no photo or tracing): long straight honey-blonde hair with full blunt
// bangs just above the brows, a small slim face with high cheekbones, cat-like upturned eyes with sharp
// winged liner and pink shadow, a small defined nose, a peach-pink lip in a half-smile, gold hoops,
// a black stage top with pink trim and thin pink straps, and the pink headset.
// Drawn in a 100-unit space centred on her face; (x, y) is the face centre on the canvas, k the scale.
// The kiosk screen and the dialogue portrait (src/ui/portraits.js, kind 'lisa') both call it, so it
// stays vector at every size.
export function drawLisa(g, x, y, k) {
  const skin = '#f7dac6'
  const shade = '#e7b89c'
  const hair = '#e2b468'
  const hairDark = '#b9853c'
  const hairLight = '#f8dfa4'
  const hairLine = '#6e4a1e'
  const ink = '#2a1d18'
  const pink = '#ff4fa3'
  const black = '#111115'
  g.save()
  g.translate(x, y)
  g.scale(k, k)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const path = (f, fill, stroke, lw) => {
    g.beginPath()
    f()
    if (fill) {
      g.fillStyle = fill
      g.fill()
    }
    if (stroke) {
      g.strokeStyle = stroke
      g.lineWidth = lw
      g.stroke()
    }
  }
  const hairFill = (y0, y1) => {
    const gr = g.createLinearGradient(0, y0, 0, y1)
    gr.addColorStop(0, hair)
    gr.addColorStop(0.55, '#d9a95c')
    gr.addColorStop(1, hairDark)
    return gr
  }
  // long hair, back layer: from the crown straight down past the shoulders, cut blunt at the ends
  path(() => {
    g.moveTo(-46, -10)
    g.bezierCurveTo(-56, -64, -26, -76, 0, -76)
    g.bezierCurveTo(26, -76, 56, -64, 46, -10)
    g.lineTo(58, 158)
    g.lineTo(-58, 158)
    g.closePath()
  }, hairFill(-76, 158), hairLine, 1.6)
  // neck and shoulders, then the black stage top: a straight neckline with pink trim and thin pink straps
  path(() => {
    g.moveTo(-8.5, 30)
    g.quadraticCurveTo(-9, 56, -14, 64)
    g.bezierCurveTo(-40, 72, -84, 80, -94, 170)
    g.lineTo(94, 170)
    g.bezierCurveTo(84, 80, 40, 72, 14, 64)
    g.quadraticCurveTo(9, 56, 8.5, 30)
    g.closePath()
  }, skin, ink, 1.4)
  path(() => {
    g.moveTo(-8.6, 38)
    g.quadraticCurveTo(0, 54, 8.6, 38)
    g.closePath()
  }, shade) // shadow under the chin
  path(() => {
    g.moveTo(-92, 170)
    g.bezierCurveTo(-90, 124, -78, 100, -50, 94)
    g.quadraticCurveTo(0, 102, 50, 94)
    g.bezierCurveTo(78, 100, 90, 124, 92, 170)
    g.closePath()
  }, black, ink, 1.4)
  path(() => {
    g.moveTo(-50, 94)
    g.quadraticCurveTo(0, 102, 50, 94)
  }, null, pink, 3)
  for (const sx of [-1, 1]) {
    path(() => {
      g.moveTo(sx * 30, 98)
      g.lineTo(sx * 40, 72)
    }, null, pink, 1.8) // thin strap
    path(() => {
      g.moveTo(sx * 82, 152)
      g.quadraticCurveTo(sx * 74, 120, sx * 58, 108)
    }, null, pink, 2.2) // seam piping
  }
  // small slim face: widest at the high cheekbones, tapering to a narrow chin
  path(() => {
    g.moveTo(-30, -22)
    g.bezierCurveTo(-32, -4, -30, 6, -25, 18)
    g.bezierCurveTo(-19, 32, -8, 42, 0, 43)
    g.bezierCurveTo(8, 42, 19, 32, 25, 18)
    g.bezierCurveTo(30, 6, 32, -4, 30, -22)
    g.bezierCurveTo(28, -48, -28, -48, -30, -22)
  }, skin, ink, 1.5)
  // cheekbone contour and a soft pink blush high on the cheeks
  for (const sx of [-1, 1]) {
    path(() => {
      g.moveTo(sx * 28, 6)
      g.quadraticCurveTo(sx * 24, 16, sx * 18, 22)
    }, null, 'rgba(205, 140, 110, 0.45)', 1.4)
    path(() => g.ellipse(sx * 19, 12, 7, 3.4, sx * -0.25, 0, Math.PI * 2), 'rgba(255, 120, 150, 0.28)')
  }
  // straight front locks framing the face and falling over the shoulders
  for (const sx of [-1, 1]) {
    path(() => {
      g.moveTo(sx * 28, -24)
      g.lineTo(sx * 46, -14)
      g.lineTo(sx * 54, 134)
      g.lineTo(sx * 36, 128)
      g.quadraticCurveTo(sx * 33, 60, sx * 28, 22)
      g.quadraticCurveTo(sx * 30, 0, sx * 28, -24)
      g.closePath()
    }, hairFill(-24, 134), hairLine, 1.5)
    path(() => {
      g.moveTo(sx * 40, -4)
      g.lineTo(sx * 46, 116)
      g.moveTo(sx * 34, 30)
      g.lineTo(sx * 40, 120)
    }, null, hairDark, 1.2)
    path(() => {
      g.moveTo(sx * 43, 8)
      g.lineTo(sx * 47, 70)
    }, null, hairLight, 2)
  }
  // full blunt bangs, cut straight across just above the brows, with strand lines and a light halo
  path(() => {
    g.moveTo(-37, -12)
    g.bezierCurveTo(-46, -60, -20, -70, 0, -70)
    g.bezierCurveTo(20, -70, 46, -60, 37, -12)
    g.quadraticCurveTo(0, -16, -37, -12)
    g.closePath()
  }, hairFill(-70, -12), hairLine, 1.6)
  path(() => {
    for (const bx of [-28, -19, -10, -1, 8, 17, 26]) {
      g.moveTo(bx + 2, -44)
      g.lineTo(bx, -15)
    }
  }, null, hairDark, 1.1)
  path(() => {
    g.moveTo(-30, -48)
    g.quadraticCurveTo(0, -60, 30, -48)
  }, null, hairLight, 4)
  // brows: thin, straight with a slight lift, just below the fringe
  for (const sx of [-1, 1]) {
    path(() => {
      g.moveTo(sx * 9, -8.5)
      g.quadraticCurveTo(sx * 18, -11.5, sx * 27, -10)
    }, null, '#8a6236', 1.8)
  }
  // eyes: pink lid shadow, a cat-like almond tilted up at the outer corner, dark iris, sharp winged liner
  for (const sx of [-1, 1]) {
    path(() => {
      g.moveTo(sx * 8, 1)
      g.quadraticCurveTo(sx * 18, -11, sx * 31, -6)
      g.quadraticCurveTo(sx * 19, -4, sx * 8, 1)
    }, 'rgba(255, 105, 160, 0.4)')
    const eye = () => {
      g.moveTo(sx * 8, 3)
      g.quadraticCurveTo(sx * 17, -6, sx * 29, -4)
      g.quadraticCurveTo(sx * 20, 7, sx * 8, 3)
    }
    path(eye, '#ffffff')
    g.save()
    g.beginPath()
    eye()
    g.clip()
    path(() => g.arc(sx * 18.5, 0.5, 4.6, 0, Math.PI * 2), '#3a2416')
    path(() => g.arc(sx * 18.5, 0.5, 2, 0, Math.PI * 2), '#120c0a')
    path(() => g.arc(sx * 18.5 + 1.6, -1.2, 1.3, 0, Math.PI * 2), '#ffffff')
    g.restore()
    // upper liner thickening to a sharp wing that flicks up past the outer corner
    path(() => {
      g.moveTo(sx * 7.5, 3)
      g.quadraticCurveTo(sx * 17, -7.5, sx * 29, -5)
      g.lineTo(sx * 38, -12)
      g.lineTo(sx * 29.5, -2.6)
      g.quadraticCurveTo(sx * 17, -4.6, sx * 7.5, 3)
      g.closePath()
    }, '#0c0a10')
    path(() => {
      g.moveTo(sx * 11, 5)
      g.quadraticCurveTo(sx * 20, 7.2, sx * 28, -2.5)
    }, null, 'rgba(40, 25, 25, 0.55)', 0.9)
  }
  // nose: a short bridge shadow, a defined tip and small nostrils
  path(() => {
    g.moveTo(-2.5, -2)
    g.quadraticCurveTo(-3.5, 8, -2.6, 13)
  }, null, 'rgba(190, 130, 100, 0.55)', 1.2)
  path(() => {
    g.moveTo(-4.5, 15.5)
    g.quadraticCurveTo(0, 18.5, 4.5, 15.5)
  }, null, '#c88e70', 1.4)
  path(() => g.ellipse(0.6, 12.8, 1.6, 1.1, 0, 0, Math.PI * 2), 'rgba(255, 255, 255, 0.55)')
  // bold peach-pink lips with a cupid's bow, the right corner lifted in a confident half-smile
  path(() => {
    g.moveTo(-10, 27)
    g.quadraticCurveTo(-5, 22.5, -1.5, 24)
    g.quadraticCurveTo(0, 23, 1.5, 23.6)
    g.quadraticCurveTo(6, 21.5, 11, 23.5)
    g.quadraticCurveTo(4, 26.5, -10, 27)
    g.closePath()
  }, '#e8657f', '#a83a52', 1)
  path(() => {
    g.moveTo(-10, 27)
    g.quadraticCurveTo(4, 26.5, 11, 23.5)
    g.quadraticCurveTo(7, 30.5, -1, 31)
    g.quadraticCurveTo(-7, 30.5, -10, 27)
    g.closePath()
  }, '#f27f8e', '#a83a52', 1)
  path(() => {
    g.moveTo(-10, 27)
    g.quadraticCurveTo(4, 26.5, 11, 23.5)
  }, null, '#8f2c44', 1.3)
  path(() => g.ellipse(1, 28.8, 2.6, 0.9, -0.1, 0, Math.PI * 2), 'rgba(255, 230, 230, 0.6)')
  path(() => {
    g.moveTo(11, 23.5)
    g.quadraticCurveTo(13, 22, 13.5, 20.5)
  }, null, 'rgba(160, 90, 80, 0.6)', 1) // the dimple of the lifted corner
  // pink headset: band over the hair, ear cups over the ears, mic boom to the corner of her mouth
  path(() => g.ellipse(0, -10, 48, 64, 0, Math.PI * 1.04, Math.PI * 1.96), null, pink, 6)
  for (const cx of [-52, 36]) {
    path(() => g.roundRect(cx, -18, 16, 30, 7), pink, '#b8246b', 1.2)
    path(() => g.roundRect(cx + 4, -12, 8, 18, 4), '#c22f7a')
  }
  path(() => {
    g.moveTo(-46, 12)
    g.quadraticCurveTo(-42, 34, -21, 32)
  }, null, pink, 3)
  path(() => g.arc(-19, 32, 3.6, 0, Math.PI * 2), '#ffd6ea', '#b8246b', 1)
  // gold hoops hanging below the ear cups
  for (const sx of [-1, 1]) {
    path(() => g.arc(sx * 41, 22, 6, 0, Math.PI * 2), null, '#c99a2e', 2.6)
    path(() => g.arc(sx * 41, 22, 6, Math.PI * 1.1, Math.PI * 1.5), null, '#fbe39a', 1.1)
  }
  g.restore()
}

// what Lisa's dialogue lines carry as `avatar`: src/ui/portraits.js draws drawLisa in the 128 px ring
const LISA = { kind: 'lisa' }

const BUBBLE_Y = 592 // centre of the chat bubble the 3D dots sit on, in canvas pixels (of 768)

function screenTex() {
  return canvasTex(512, 768, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#18213a')
    bg.addColorStop(0.6, '#0e0f16')
    bg.addColorStop(1, '#0b0b0d')
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    // portrait in a circle with a soft pink glow and a pink ring
    const glow = g.createRadialGradient(256, 215, 40, 256, 215, 210)
    glow.addColorStop(0, 'rgba(255, 79, 163, 0.28)')
    glow.addColorStop(1, 'rgba(255, 79, 163, 0)')
    g.fillStyle = glow
    g.fillRect(0, 0, w, 450)
    g.save()
    g.beginPath()
    g.arc(256, 220, 168, 0, Math.PI * 2)
    g.clip()
    const disc = g.createLinearGradient(0, 52, 0, 388)
    disc.addColorStop(0, '#22305a')
    disc.addColorStop(1, '#101425')
    g.fillStyle = disc
    g.fillRect(0, 0, w, h)
    drawLisa(g, 256, 196, 1.75)
    g.restore()
    g.strokeStyle = '#ff4fa3'
    g.lineWidth = 6
    g.beginPath()
    g.arc(256, 220, 168, 0, Math.PI * 2)
    g.stroke()
    g.textAlign = 'center'
    g.fillStyle = '#ff4fa3'
    g.font = 'bold 58px Helvetica, Arial, sans-serif'
    g.fillText('LISA · AI TA', w / 2, 466)
    g.fillStyle = '#ffffff'
    g.font = '600 26px Helvetica, Arial, sans-serif'
    g.fillText('MGT 409', w / 2, 506)
    // chat bubble that the 3D dots sit on
    g.fillStyle = '#1d1d24'
    g.beginPath()
    g.roundRect(136, BUBBLE_Y - 44, 240, 88, 44)
    g.fill()
    g.fillStyle = '#ffd6ea'
    g.font = '30px Helvetica, Arial, sans-serif'
    g.fillText('ask me anything', w / 2, 690)
    g.fillStyle = '#ff4fa3'
    g.font = 'bold 30px Menlo, monospace'
    g.fillText('[ E ]', w / 2, 736)
  })
}

function Dots() {
  const refs = [useRef(), useRef(), useRef()]
  const mat = useMemo(() => solidMat('#ff4fa3', { emissive: '#ff4fa3', emissiveIntensity: 1 }), [])
  useFrame(({ clock }) => {
    const fast = performance.now() < thinkingUntil
    const t = clock.elapsedTime * (fast ? 9 : 4)
    refs.forEach((r, i) => {
      const k = Math.max(0, Math.sin(t - i * 0.9))
      r.current.position.y = k * 0.018
      r.current.scale.setScalar(0.8 + k * 0.35)
    })
  })
  return (
    <group position={[0, 0.01, 0.02]}>
      {refs.map((r, i) => (
        <mesh key={i} ref={r} position={[(i - 1) * 0.07, 0, 0]} material={mat} castShadow>
          <sphereGeometry args={[0.018, 14, 10]} />
        </mesh>
      ))}
    </group>
  )
}

export default function LisaKiosk() {
  const { discover } = useDiscovery('lisa', 'Asked Lisa, the AI TA')
  const m = useMemo(
    () => ({ screen: printMat(screenTex(), { glow: 0.9, roughness: 0.3 }), body: solidMat('#111114', { roughness: 0.35, metalness: 0.4 }), pink: solidMat('#ff4fa3', { emissive: '#ff4fa3', emissiveIntensity: 0.6 }) }),
    [],
  )
  const box = (mat, p, s) => (
    <mesh material={mat} position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  )
  const open = () => {
    discover()
    openDialogue(buildScript())
  }
  return (
    <Interactable position={POS} rotation={[0, ROT, 0]} radius={2.4} solid={0.35} label="Lisa, the AI TA" verb="Ask" marker="npc" onInteract={open}>
      {box(m.body, [0, 0.015, 0], [0.5, 0.03, 0.4])}
      {box(m.body, [0, 0.6, -0.05], [0.08, 1.2, 0.06])}
      <group position={[0, 1.42, 0]} rotation={[-0.12, 0, 0]}>
        {box(m.pink, [0, 0, -0.03], [0.6, 0.86, 0.03])}
        {box(m.body, [0, 0, -0.015], [0.57, 0.83, 0.03])}
        <mesh material={m.screen} position={[0, 0, 0.001]} receiveShadow>
          <planeGeometry args={[0.52, 0.78]} />
        </mesh>
        <group position={[0, 0.39 - (BUBBLE_Y / 768) * 0.78, 0]}>
          <Dots />
        </group>
      </group>
    </Interactable>
  )
}
