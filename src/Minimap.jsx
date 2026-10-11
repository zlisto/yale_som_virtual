import { useEffect, useRef } from 'react'
import { BEIN, BOUNDS, COURTYARD, DRUMS, LIBRARY, MEETING, STAIRS, arc } from './layout.js'
import { DAN } from './HandsomeDan.jsx'
import { allInteractables, resolvePos } from './interact/registry.js'
import './ui/ui.css'

const PAD = 3
const X0 = BOUNDS.xMin - PAD
const X1 = BOUNDS.xMax + BEIN.terrace + PAD
const Z0 = BOUNDS.zMin - PAD
const Z1 = BOUNDS.zMax + PAD
const S = 2.6 // px per meter
const Wpx = Math.round((X1 - X0) * S)
const Hpx = Math.round((Z1 - Z0) * S)
const px = (x, z) => [(x - X0) * S, (z - Z0) * S]
const RES = 2 // backing-store pixels per map unit, so labels stay sharp when the CSS scales the map

// marker kinds an interactable can ask for with `marker`; the legend lists the same set
const MARKERS = {
  interact: { color: '#ffd6ea', label: 'interactable' },
  npc: { color: '#7fd1ff', label: 'person' },
  egg: { color: '#ffd23f', label: 'easter egg' },
}

function diamond(g, x, y, r) {
  g.beginPath()
  g.moveTo(x, y - r)
  g.lineTo(x + r, y)
  g.lineTo(x, y + r)
  g.lineTo(x - r, y)
  g.closePath()
  g.fill()
  g.stroke()
}

function drawStatic(g) {
  g.fillStyle = '#0b0b0d'
  g.fillRect(0, 0, Wpx, Hpx)
  const path = (pts, close = true) => {
    g.beginPath()
    pts.forEach((p, i) => (i ? g.lineTo(...px(...p)) : g.moveTo(...px(...p))))
    if (close) g.closePath()
  }
  // building
  g.fillStyle = '#1a1a1f'
  g.strokeStyle = '#ff4fa3'
  g.lineWidth = 1.5
  path([[BOUNDS.xMin, BOUNDS.zMin], [BOUNDS.xMax, BOUNDS.zMin], [BOUNDS.xMax, BOUNDS.zMax], [BOUNDS.xMin, BOUNDS.zMax]])
  g.fill()
  g.stroke()
  // terrace + Beinecke
  path(arc(BEIN.c, BEIN.terrace, BEIN.terrace, 0, Math.PI, 30))
  g.fillStyle = '#2a2622'
  g.fill()
  path(arc(BEIN.c, BEIN.r, BEIN.r, 0, Math.PI, 30))
  g.fillStyle = '#3a2a33'
  g.fill()
  g.stroke()
  // courtyard
  path(COURTYARD)
  g.fillStyle = '#18321a'
  g.fill()
  g.strokeStyle = '#ffb3d9'
  g.stroke()
  // drums
  g.strokeStyle = '#ff4fa3'
  for (const d of DRUMS) {
    path(arc(d.c, d.rx, d.rz, 0, Math.PI * 2, 48))
    g.fillStyle = '#16244f'
    g.fill()
    for (const [a0, a1] of d.arcs) {
      path(arc(d.c, d.rx, d.rz, a0, a1, 32), false)
      g.stroke()
    }
  }
  // library, meeting rooms, stairs
  g.fillStyle = '#3b2a1c'
  g.fillRect(...px(LIBRARY.x0, LIBRARY.z0), (LIBRARY.x1 - LIBRARY.x0) * S, (LIBRARY.z1 - LIBRARY.z0) * S)
  g.fillStyle = '#26262e'
  for (const m of MEETING) g.fillRect(...px(m.x - 2.6, m.z - 2.8), 5.2 * S, 5.6 * S)
  g.fillStyle = '#ff4fa3'
  g.font = 'bold 10px system-ui, sans-serif'
  for (const s of STAIRS) {
    g.fillRect(...px(s.c[0] - s.w / 2, s.c[1] - s.d / 2), s.w * S, s.d * S)
    g.fillStyle = '#0b0b0d'
    g.fillText(s.id, ...px(s.c[0] - 0.9, s.c[1] + 1.2))
    g.fillStyle = '#ff4fa3'
  }
  g.fillStyle = '#ffd6ea'
  g.font = '9px system-ui, sans-serif'
  g.fillText('ROSS LIB', ...px(LIBRARY.x0 + 0.6, 1))
  g.fillText('BEINECKE', ...px(BEIN.c[0] + 2, 1))
  g.fillText('COURTYARD', ...px(-7, 1))
  g.fillText('N ↑', ...px(BOUNDS.xMax + 6, BOUNDS.zMin + 2))
  for (const d of DRUMS) g.fillText(d.id, ...px(d.c[0] - 2.4, d.c[1] + 1))
  // room numbers: library, Beinecke, and each meeting room (last two digits; the full number is in the HUD)
  g.fillStyle = '#ff9fcc'
  g.font = '7px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText('2100', ...px((LIBRARY.x0 + LIBRARY.x1) / 2, 4.5))
  g.fillText('2300', ...px(BEIN.c[0] + 5, 4.5))
  g.fillStyle = '#bdbdc8'
  g.font = '6px system-ui, sans-serif'
  for (const m of MEETING) g.fillText(String(m.num).slice(-2), ...px(m.x, m.z + 1))
  g.textAlign = 'start'
}

export default function Minimap({ drawRef }) {
  const ref = useRef()
  useEffect(() => {
    const bg = document.createElement('canvas')
    bg.width = Wpx * RES
    bg.height = Hpx * RES
    const bgc = bg.getContext('2d')
    bgc.scale(RES, RES)
    drawStatic(bgc)
    const g = ref.current.getContext('2d')
    g.setTransform(RES, 0, 0, RES, 0, 0)
    drawRef.current = (x, z, fx, fz) => {
      g.drawImage(bg, 0, 0, Wpx, Hpx)
      // registered interactables (signs, NPCs, easter eggs); marker: false hides one
      g.lineWidth = 0.8
      g.strokeStyle = '#0b0b0d'
      for (const e of allInteractables()) {
        const o = e.ref.current
        if (o.marker === false || o.marker === 'egg' || o.enabled === false) continue // no egg spoilers (Tracker.jsx)
        const p = resolvePos(o.position)
        if (!p) continue
        g.fillStyle = (MARKERS[o.marker] ?? MARKERS.interact).color
        diamond(g, ...px(p.x, p.z), 3.2)
      }
      // Handsome Dan
      const [dx, dy] = px(DAN.x, DAN.z)
      g.fillStyle = '#4a90ff'
      g.strokeStyle = '#ffffff'
      g.lineWidth = 1.5
      g.beginPath()
      g.arc(dx, dy, 4, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      const [cx, cy] = px(x, z)
      g.fillStyle = 'rgba(255,79,163,0.25)'
      g.beginPath()
      g.moveTo(cx, cy)
      const a = Math.atan2(fz, fx)
      g.arc(cx, cy, 26, a - 0.5, a + 0.5)
      g.closePath()
      g.fill()
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.arc(cx, cy, 4, 0, Math.PI * 2)
      g.fill()
    }
  }, [drawRef])
  return (
    <>
      <canvas ref={ref} className="minimap" width={Wpx * RES} height={Hpx * RES} />
      <div className="map-legend">
        <span><i style={{ background: '#fff' }} />you</span>
        <span><i style={{ background: '#4a90ff' }} />Handsome Dan</span>
        {Object.values(MARKERS).filter((m) => m !== MARKERS.egg).map((m) => (
          <span key={m.label}>
            <i className="dia" style={{ background: m.color }} />
            {m.label}
          </span>
        ))}
      </div>
    </>
  )
}

