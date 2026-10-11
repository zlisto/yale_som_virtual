import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { Interactable, openDialogue, sound, useDiscovery } from '../../interact/index.jsx'
import { withAvatars } from '../../ui/portraits.js'
import Labubu from '../../Labubu.jsx'
import { Box, Pill, canvasTex, onDrum, saved, std } from './common.jsx'

// Egg: QR attendance at room 2400, the MGT 409 classroom (attendance is 10% of the grade).
// The poster hangs on the drum's outer wall just east of the north door (doors[0], facing stair A).
// The QR code is real: it encodes the course site.
const SITE = 'https://zlisto.github.io/mgt_409_fa26/'
const LS = 'evans.eggsB.attendance.v1'
const D = onDrum('2400', 0).drum
const POSTER_TH = D.doors[0] - D.gap - 0.28 // clear of the door fins and of a vertical pole that stands in front of the wall further west
const POSTER = onDrum('2400', POSTER_TH, 0.03)
const READER = onDrum('2400', POSTER_TH, 1.5).p // where a player stands to scan
const LATE = onDrum('2400', D.doors[0] - D.gap - 0.1, 0.7) // the late arrival stands between the poster and the door
const LATE_ROT = Math.atan2(READER[0] - LATE.p[0], READER[1] - LATE.p[1]) // it turns to the player who just scanned
const W = 768
const H = 1088

function posterTex() {
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#00356b'
    g.fillRect(0, 0, W, 190)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    g.font = '600 34px Inter, system-ui, sans-serif'
    g.fillText('MGT 409 · AI Foundations for Managers', W / 2, 62)
    g.font = '800 64px Inter, system-ui, sans-serif'
    g.fillText('Lecture 13 attendance', W / 2, 132)
    g.fillStyle = '#111114'
    g.font = '700 46px Inter, system-ui, sans-serif'
    g.fillText('Scan to check in', W / 2, 262)
    const qr = qrcode(0, 'M')
    qr.addData(SITE)
    qr.make()
    const n = qr.getModuleCount()
    const size = 520
    const cell = Math.floor(size / (n + 8)) // 4-module quiet zone on each side
    const x0 = Math.round((W - cell * n) / 2)
    const y0 = 320 + Math.round((size - cell * n) / 2)
    g.fillStyle = '#000000'
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(x0 + c * cell, y0 + r * cell, cell, cell)
    g.fillStyle = '#4a4a52'
    g.font = '500 30px "JetBrains Mono", ui-monospace, monospace'
    g.fillText('zlisto.github.io/mgt_409_fa26', W / 2, 890)
    g.fillStyle = '#a6192e'
    g.font = '700 34px Inter, system-ui, sans-serif'
    g.fillText('Attendance is 10% of your grade', W / 2, 960)
    g.fillStyle = '#6b6b73'
    g.font = '500 28px Inter, system-ui, sans-serif'
    g.fillText('Room 2400 · MBA Class of 1980 Classroom', W / 2, 1020)
  })
}

export default function Attendance() {
  const { discover } = useDiscovery('attendance', 'Marked present for Lecture 13')
  const [present, setPresent] = useState(() => saved.get(LS, false))
  const [hopping, setHopping] = useState(false)
  useEffect(() => {
    if (!hopping) return
    const t = setTimeout(() => setHopping(false), 1100) // one hop, then it settles
    return () => clearTimeout(t)
  }, [hopping])
  const mats = useMemo(() => ({ paper: std({ map: posterTex(), roughness: 0.85 }), backing: std({ color: '#2a2a30', roughness: 0.6 }) }), [])

  const scan = () => {
    if (present) {
      openDialogue(withAvatars([{ speaker: 'QR scanner', text: 'Already marked. Nice try.' }]))
      return
    }
    setPresent(true)
    setHopping(true)
    saved.set(LS, true)
    if (!discover()) sound.chime() // discover() chimes on its own the first time
    openDialogue(withAvatars([{ speaker: 'QR scanner', text: 'Scanned. You are marked present for Lecture 13.' }]))
  }

  const { p, rot } = POSTER
  const out = [Math.sin(rot) * 0.5, Math.cos(rot) * 0.5]
  return (
    <>
      <group position={[p[0], 1.5, p[1]]} rotation={[0, rot, 0]}>
        <Box size={[0.64, 0.89, 0.01]} material={mats.backing} position={[0, 0, 0.002]} />
        <mesh material={mats.paper} position={[0, 0, 0.0085]} castShadow receiveShadow>
          <planeGeometry args={[0.6, 0.85]} />
        </mesh>
      </group>
      <Interactable position={[p[0] + out[0], 0, p[1] + out[1]]} radius={2} label="the attendance QR code" verb="Scan" marker="egg" onInteract={scan} />
      {present && (
        <>
          <Labubu position={[LATE.p[0], 0, LATE.p[1]]} rotation={LATE_ROT} anim={hopping ? 'hop' : 'idle'} expression="surprised" shirt="yale" fur="#bba7e8" />
          <Pill k="attendance" label="attendance" value={1} total={1} order={23} />
        </>
      )}
    </>
  )
}
