// Canvas art and lines for the library portraits. Lines are original; nothing is quoted from the novels.
export const BOOKS = [
  { n: 1, title: "The Sorcerer's Stone", bg: '#5e1414', ink: '#f3d27a', motif: 'stone',
    line: 'Book One here. I cover wands, owls, and a stone that is very hard to keep in a cupboard. First-years ask me everything.',
    cost: '`412 tokens` for that answer. Cheapest specialist on the wall, because I am the short one.' },
  { n: 2, title: 'The Chamber of Secrets', bg: '#123b26', ink: '#cfe7c8', motif: 'snake',
    line: 'I know every pipe under this castle and recommend none of them. Also, a diary that writes back is a red flag.',
    cost: '`538 tokens`, plus a small surcharge for the snake.' },
  { n: 3, title: 'The Prisoner of Azkaban', bg: '#16224a', ink: '#d6dcf5', motif: 'hourglass',
    line: 'Ask me about time, as long as you ask before three o\'clock. I may have answered you already.',
    cost: '`610 tokens`, billed twice because of the time loop.' },
  { n: 4, title: 'The Goblet of Fire', bg: '#101e26', ink: '#9fd8ff', motif: 'goblet',
    line: 'I handle one tournament, one maze, and one very strict cup. My answers run long, and so did I.',
    cost: '`1,204 tokens`. The context window got crowded somewhere around the second task.' },
  { n: 5, title: 'The Order of the Phoenix', bg: '#6a2a0c', ink: '#ffd9a0', motif: 'feather',
    line: 'I am the thickest specialist on this wall, and I hold strong views on pink cardigans and detention quills.',
    cost: '`2,870 tokens`. Please never ask me to summarize myself.' },
  { n: 6, title: 'The Half-Blood Prince', bg: '#2c2f17', ink: '#e4e2b0', motif: 'potion',
    line: 'Every useful thing I know is scribbled in the margins of a secondhand textbook. Always read the margins.',
    cost: '`940 tokens`, about half of them handwritten.' },
  { n: 7, title: 'The Deathly Hallows', bg: '#1d1d22', ink: '#e8e8ee', motif: 'hallows',
    line: 'I am the finale. I know where everything was hidden, and I do not tell the boss agent for free.',
    cost: '`1,980 tokens`, split across two films.' },
]

const MOTIF = {
  stone(g) {
    g.fillStyle = '#d42a3a'
    g.beginPath()
    for (let k = 0; k < 6; k++) g.lineTo(Math.cos((k / 6) * Math.PI * 2) * 80, Math.sin((k / 6) * Math.PI * 2) * 95)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.beginPath()
    g.moveTo(-40, -60), g.lineTo(10, -80), g.lineTo(-10, -10), g.closePath()
    g.fill()
  },
  snake(g, ink) {
    g.strokeStyle = ink
    g.lineWidth = 22
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(-70, 110)
    g.bezierCurveTo(90, 80, 90, 10, 0, 0)
    g.bezierCurveTo(-90, -10, -90, -90, 60, -110)
    g.stroke()
    g.fillStyle = ink
    g.beginPath()
    g.ellipse(66, -112, 26, 16, -0.2, 0, Math.PI * 2)
    g.fill()
  },
  hourglass(g, ink) {
    g.strokeStyle = ink
    g.lineWidth = 10
    g.beginPath()
    g.arc(0, 0, 120, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#e8c76a'
    g.beginPath()
    g.moveTo(-55, -80), g.lineTo(55, -80), g.lineTo(0, 0), g.lineTo(55, 80), g.lineTo(-55, 80), g.lineTo(0, 0), g.closePath()
    g.fill()
  },
  goblet(g) {
    g.fillStyle = '#5fb8ff'
    g.beginPath()
    g.moveTo(-50, -40)
    g.quadraticCurveTo(-30, -150, 0, -170)
    g.quadraticCurveTo(30, -150, 50, -40)
    g.fill()
    g.fillStyle = '#c9a44a'
    g.beginPath()
    g.moveTo(-80, -40), g.quadraticCurveTo(0, 90, 80, -40), g.closePath()
    g.fill()
    g.fillRect(-10, 30, 20, 70)
    g.fillRect(-55, 95, 110, 18)
  },
  feather(g) {
    g.save()
    g.rotate(-0.5)
    g.fillStyle = '#ff8a2a'
    g.beginPath()
    g.ellipse(0, -10, 45, 140, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffd34a'
    g.beginPath()
    g.ellipse(0, -40, 20, 90, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#4a1d08'
    g.lineWidth = 6
    g.beginPath()
    g.moveTo(0, -150), g.lineTo(0, 170)
    g.stroke()
    g.restore()
  },
  potion(g, ink) {
    g.fillStyle = '#4ad66d'
    g.beginPath()
    g.arc(0, 50, 85, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.25)'
    g.fillRect(-25, -120, 50, 100)
    g.strokeStyle = ink
    g.lineWidth = 8
    g.strokeRect(-25, -120, 50, 100)
    g.fillStyle = '#7a5a3a'
    g.fillRect(-30, -150, 60, 32)
  },
  hallows(g, ink) {
    g.strokeStyle = ink
    g.lineWidth = 10
    g.beginPath()
    g.moveTo(0, -140), g.lineTo(125, 85), g.lineTo(-125, 85), g.closePath()
    g.stroke()
    g.beginPath()
    g.arc(0, 18, 66, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.moveTo(0, -140), g.lineTo(0, 85)
    g.stroke()
  },
}

export function drawBook(g, w, h, b) {
  const grad = g.createRadialGradient(w / 2, h * 0.38, 20, w / 2, h * 0.4, w * 0.7)
  grad.addColorStop(0, b.bg)
  grad.addColorStop(1, '#050507')
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  g.save()
  g.translate(w / 2, h * 0.4)
  MOTIF[b.motif](g, b.ink)
  g.restore()
  g.textAlign = 'center'
  g.fillStyle = b.ink
  g.font = '600 28px Georgia, serif'
  g.fillText(`BOOK ${b.n}`, w / 2, h - 150)
  g.font = 'bold 40px Georgia, serif'
  const words = b.title.replace(/^The /, '').split(' ')
  const mid = Math.ceil(words.length / 2)
  const lines = words.length > 2 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [words.join(' ')]
  lines.forEach((l, k) => g.fillText(l, w / 2, h - 95 + k * 46 - (lines.length - 1) * 10))
}

export function drawBoss(g, w, h) {
  const grad = g.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#2a1446')
  grad.addColorStop(1, '#0c0614')
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  let s = 3
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  g.fillStyle = 'rgba(255,255,240,0.8)'
  for (let i = 0; i < 70; i++) g.fillRect(r() * w, r() * h * 0.7, 2, 2)
  // silhouette: crooked hat, head, long beard, robe
  g.fillStyle = '#050308'
  g.beginPath()
  g.moveTo(150, 250), g.quadraticCurveTo(250, 180, 300, 40), g.quadraticCurveTo(320, 160, 370, 250), g.closePath()
  g.fill()
  g.fillRect(120, 240, 272, 22)
  g.beginPath()
  g.ellipse(256, 300, 70, 70, 0, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(80, h - 120), g.quadraticCurveTo(110, 380, 256, 360), g.quadraticCurveTo(402, 380, 432, h - 120), g.closePath()
  g.fill()
  g.fillStyle = '#c9c4d6' // beard catches the light
  g.beginPath()
  g.moveTo(206, 320), g.quadraticCurveTo(256, 560, 256, 600), g.quadraticCurveTo(256, 560, 306, 320), g.closePath()
  g.fill()
  g.strokeStyle = '#e8d38a' // half-moon glasses
  g.lineWidth = 4
  for (const x of [232, 280]) {
    g.beginPath()
    g.arc(x, 296, 16, 0, Math.PI)
    g.stroke()
  }
  g.fillStyle = '#e8d38a'
  g.textAlign = 'center'
  g.font = 'bold 44px Georgia, serif'
  g.fillText('BOSS AGENT', w / 2, h - 50)
}
