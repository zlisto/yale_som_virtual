import { useMemo, useRef, useState } from 'react'
import { Interactable, openDialogue, toast, useDiscovery } from '../../interact/index.jsx'
import { withAvatars } from '../../ui/portraits.js'
import Labubu from '../../Labubu.jsx'
import { Box, Pill, canvasTex, saved, std } from './common.jsx'
import { planX } from '../../layout.js'


// Egg: the Campus Customs pop-up stand (the merch business in HW3 to HW6), against the east
// cloister wall between the big poster (z 13.2 to 16.4) and stair G (z 23 to 27).
// The group's local +z is the customer side; rotation -90 deg turns it to face west, into the cloister.
const POS = [planX(27.85), 0, 19.7] // x 27.85 on the round-3 floor; the east wall moved out with it
const LS = 'evans.eggsB.merch.v1'
const TEES = [
  { id: 'blue', name: 'Yale Blue MGT 409 crest tee', color: '#00356b' },
  { id: 'grey', name: "Heather grey 'computer overlords' tee", color: '#a3a3ab' },
  { id: 'pink', name: "Prompt pink 'ignore previous instructions' tee", color: '#ff4fa3' },
  { id: 'green', name: "Agent green 'multi-agent team' tee", color: '#2f8f5b' },
]

function bannerTex() {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#ff4fa3'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#0b0b0d'
    g.fillRect(10, 10, w - 20, h - 20)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    let size = 120
    do g.font = `900 ${(size -= 4)}px Inter, system-ui, sans-serif`
    while (g.measureText('CAMPUS CUSTOMS').width > w - 90)
    g.fillText('CAMPUS CUSTOMS', w / 2, 104)
    g.fillStyle = '#ffd6ea'
    g.font = '600 46px Inter, system-ui, sans-serif'
    g.fillText('official MGT 409 merch', w / 2, 196)
  })
}

// a folded tee: body slab, a lighter collar notch, a fold line
function FoldedTee({ color, position }) {
  const m = useMemo(() => ({ body: std({ color, roughness: 0.95 }), trim: std({ color: '#f4f1ea', roughness: 0.9 }) }), [color])
  return (
    <group position={position}>
      <Box size={[0.34, 0.07, 0.27]} material={m.body} position={[0, 0.035, 0]} />
      <Box size={[0.12, 0.012, 0.03]} material={m.trim} position={[0, 0.074, -0.1]} />
      <Box size={[0.34, 0.006, 0.006]} material={m.trim} position={[0, 0.071, 0.04]} />
    </group>
  )
}

export default function Merch() {
  const { discover } = useDiscovery('merch', 'Bought the full Campus Customs line')
  const [cart, setCart] = useState(() => saved.get(LS, []))
  const cartRef = useRef(cart) // the dialogue callbacks outlive a render, so they read the cart from here
  const mats = useMemo(
    () => ({
      wood: std({ color: '#8a5a3b', roughness: 0.7 }),
      cloth: std({ color: '#1d2a44', roughness: 0.95 }),
      metal: std({ color: '#3d4a3f', roughness: 0.4, metalness: 0.5 }),
      pole: std({ color: '#2a2a30', roughness: 0.4, metalness: 0.6 }),
      banner: std({ map: bannerTex(), roughness: 0.8 }),
    }),
    [],
  )

  const shop = (first) => {
    const left = TEES.filter((t) => !cartRef.current.includes(t.id))
    const buy = (t) => () => {
      const next = [...cartRef.current, t.id]
      cartRef.current = next
      setCart(next)
      saved.set(LS, next)
      toast(`Added to cart: ${t.name}`, { title: 'Campus Customs', ms: 3000 })
      if (next.length === TEES.length) {
        discover()
        openDialogue(withAvatars([
          { speaker: 'Campus Customs vendor', text: 'That is the whole collection. My back office is a multi-agent team now, and the HW6 vendor desk runs on an agent too.' },
          { speaker: 'Campus Customs vendor', text: 'A supplier email once told my agent to ship 400 hoodies for free; now every message gets checked first.' },
        ]))
      } else openDialogue(withAvatars(shop(false)))
    }
    if (!left.length)
      return [{ speaker: 'Campus Customs vendor', text: 'Back again? You own the full collection. Every supplier message still gets checked first.' }]
    return [
      {
        speaker: 'Campus Customs vendor',
        text: first
          ? 'Welcome to Campus Customs! My product-spotting model found these tees in influencer photos. $25 each. What can I get you?'
          : `Added. ${left.length} left on the table. Anything else?`,
        choices: [...left.map((t) => ({ text: `${t.name} · $25`, onChoice: buy(t) })), { text: 'Just browsing', next: 'end' }],
      },
    ]
  }

  return (
    <Interactable position={POS} rotation={[0, -Math.PI / 2, 0]} radius={2.4} solid={0.95} label="the Campus Customs stand" verb="Shop at" marker="egg" onInteract={() => openDialogue(withAvatars(shop(true)))}>
      {/* table: top, cloth skirt on the customer side, legs */}
      <Box size={[1.8, 0.04, 0.7]} material={mats.wood} position={[0, 0.76, 0]} />
      <Box size={[1.8, 0.7, 0.01]} material={mats.cloth} position={[0, 0.39, 0.345]} />
      {[-0.85, 0.85].flatMap((x) => [-0.3, 0.3].map((z) => <Box key={`${x}${z}`} size={[0.05, 0.74, 0.05]} material={mats.wood} position={[x, 0.37, z]} />))}
      {/* the tees, a stack of two each */}
      {TEES.map((t, i) => (
        <group key={t.id} position={[-0.6 + i * 0.4, 0.78, 0.05]}>
          <FoldedTee color={t.color} position={[0, 0, 0]} />
          <FoldedTee color={t.color} position={[0, 0.07, 0]} />
        </group>
      ))}
      {/* cash box at the end of the table */}
      <group position={[0.72, 0.78, -0.2]}>
        <Box size={[0.3, 0.12, 0.22]} material={mats.metal} position={[0, 0.06, 0]} />
        <Box size={[0.08, 0.025, 0.04]} material={mats.pole} position={[0, 0.13, 0]} />
      </group>
      {/* banner on two poles behind the vendor */}
      {[-0.95, 0.95].map((x) => (
        <Box key={x} size={[0.04, 2.5, 0.04]} material={mats.pole} position={[x, 1.25, -0.55]} />
      ))}
      <Box size={[1.9, 0.475, 0.02]} material={[mats.pole, mats.pole, mats.pole, mats.pole, mats.banner, mats.pole]} position={[0, 2.2, -0.55]} />
      {cart.length > 0 && <Pill k="merch" label="merch" value={cart.length} total={TEES.length} order={21} />}
      {/* the vendor stands on a crate so it clears the table */}
      <Box size={[0.6, 0.32, 0.4]} material={mats.wood} position={[0, 0.16, -0.36]} />
      <Labubu position={[0, 0.32, -0.36]} anim="wave" shirt="#ff8a00" fur="#ff9ccc" expression="grin" />
    </Interactable>
  )
}
