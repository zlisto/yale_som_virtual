import * as THREE from 'three'

// Fake lecture slides drawn on canvas, one deck per course.
// kind: 'title' | 'chart' | 'content'
export const COURSES = {
  ai: { name: 'AI Foundations for Managers', code: 'MGT 409' },
  econ: { name: 'Economics', code: 'Econ' },
  stats: { name: 'Probability & Statistics', code: 'Prob & Stats' },
  games: { name: 'Game Theory', code: 'Game Theory' },
  acct: { name: 'Accounting', code: 'Accounting' },
}
export const COURSE_KEYS = Object.keys(COURSES)
export const SLIDE_KINDS = ['title', 'chart', 'content']

const BLUE = '#00356b'
const INK = '#1d2433'
const PINK = '#ff4fa3'
const W = 1280
const Hh = 720

const DECKS = {
  ai: {
    title: ['Vibe Coding with Agents', 'Lecture 13 · Walk the floor'],
    content: ['How a vibe coder ships', ['Say what you want in plain words', 'Let the agent plan, then build', 'Run it, look at it, fix it', 'Pick the cheapest model that works']],
    chart: 'models',
  },
  econ: {
    title: ['Supply & Demand', 'Where the curves meet'],
    content: ['Price elasticity of demand', ['ε = (%ΔQ) / (%ΔP)', '|ε| > 1 → elastic: raise price, lose revenue', '|ε| < 1 → inelastic: raise price, gain revenue', 'Substitutes make demand more elastic']],
    chart: 'supplydemand',
  },
  stats: {
    title: ['The Normal Distribution', 'and why everything is bell-shaped'],
    content: ["Bayes' Rule", ['P(A | B) = P(B | A) · P(A) / P(B)', 'Prior → evidence → posterior', 'Base rates matter more than you think', 'Test is 99% accurate ≠ 99% you have it']],
    chart: 'normal',
  },
  games: {
    title: ["The Prisoner's Dilemma", 'Nash equilibrium in one picture'],
    content: ['Finding a Nash equilibrium', ['List each player’s best response', 'Equilibrium: nobody wants to deviate', 'Defect / Defect is stable — and worse for both', 'Repeated games make cooperation possible']],
    chart: 'payoff',
  },
  acct: {
    title: ['The Balance Sheet', 'Assets = Liabilities + Equity'],
    content: ['Reading an income statement', ['Revenue − COGS = Gross profit', 'Gross profit − OpEx = Operating income', 'Accrual ≠ cash: watch working capital', 'Every debit has a credit']],
    chart: 'balance',
  },
}

function frame(g, course, title) {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, Hh)
  g.fillStyle = BLUE
  g.fillRect(0, 0, W, 120)
  g.fillStyle = '#ffffff'
  g.font = 'bold 54px Georgia, serif'
  g.fillText(title, 56, 80)
  g.fillStyle = '#e9edf3'
  g.fillRect(0, Hh - 56, W, 56)
  g.fillStyle = '#5a6475'
  g.font = '24px Georgia, serif'
  g.fillText(`Yale SOM · ${COURSES[course].code}`, 56, Hh - 20)
  g.fillStyle = PINK
  g.fillRect(W - 140, Hh - 40, 84, 24)
}

function drawChart(g, which) {
  g.strokeStyle = INK
  g.lineWidth = 4
  const ox = 180
  const oy = 600
  const axes = () => {
    g.beginPath()
    g.moveTo(ox, 170)
    g.lineTo(ox, oy)
    g.lineTo(1150, oy)
    g.stroke()
  }
  g.font = '30px Georgia, serif'
  if (which === 'models') {
    axes()
    const bars = [['luna', 1, PINK], ['terra', 3, '#8aa4c8'], ['sol', 6, '#5a7bb0'], ['astra', 10, BLUE]]
    bars.forEach(([n, v, c], i) => {
      const x = ox + 60 + i * 230
      const h = v * 38
      g.fillStyle = c
      g.fillRect(x, oy - h, 150, h)
      g.fillStyle = INK
      g.fillText(n, x + 40, oy + 40)
    })
    g.fillText('relative cost per task', ox + 20, 200)
  } else if (which === 'supplydemand') {
    axes()
    g.lineWidth = 6
    g.strokeStyle = BLUE
    g.beginPath()
    g.moveTo(ox + 60, 210)
    g.lineTo(1080, 560)
    g.stroke()
    g.strokeStyle = PINK
    g.beginPath()
    g.moveTo(ox + 60, 560)
    g.lineTo(1080, 210)
    g.stroke()
    g.fillStyle = INK
    g.beginPath()
    g.arc(630, 385, 14, 0, Math.PI * 2)
    g.fill()
    g.fillText('Demand', 980, 600 - 10)
    g.fillText('Supply', 980, 200)
    g.fillText('P*, Q*', 655, 375)
    g.fillText('Q', 1120, 640)
    g.fillText('P', 140, 190)
  } else if (which === 'normal') {
    axes()
    const mx = 665
    const sx = 140
    const y = (x) => oy - 380 * Math.exp(-(((x - mx) / sx) ** 2) / 2)
    g.fillStyle = 'rgba(255,79,163,0.3)'
    g.beginPath()
    g.moveTo(mx - sx, oy)
    for (let x = mx - sx; x <= mx + sx; x += 4) g.lineTo(x, y(x))
    g.lineTo(mx + sx, oy)
    g.fill()
    g.strokeStyle = BLUE
    g.lineWidth = 6
    g.beginPath()
    for (let x = ox + 20; x < 1140; x += 4) (x === ox + 20 ? g.moveTo : g.lineTo).call(g, x, y(x))
    g.stroke()
    g.fillStyle = INK
    g.fillText('68% within ±1σ', mx - 105, 470)
    g.fillText('μ', mx - 8, oy + 40)
  } else if (which === 'payoff') {
    const x0 = 360
    const y0 = 200
    const c = 260
    g.font = 'bold 30px Georgia, serif'
    g.fillStyle = INK
    g.fillText('Cooperate', x0 + 50, y0 - 20)
    g.fillText('Defect', x0 + c + 80, y0 - 20)
    g.fillText('Cooperate', x0 - 190, y0 + 135)
    g.fillText('Defect', x0 - 140, y0 + c + 135)
    const cells = [['3 , 3', '0 , 5'], ['5 , 0', '1 , 1']]
    for (let r = 0; r < 2; r++)
      for (let k = 0; k < 2; k++) {
        g.fillStyle = r === 1 && k === 1 ? 'rgba(255,79,163,0.25)' : '#f3f6fa'
        g.fillRect(x0 + k * c, y0 + r * c, c - 8, c - 8)
        g.fillStyle = INK
        g.font = 'bold 48px Georgia, serif'
        g.fillText(cells[r][k], x0 + k * c + 70, y0 + r * c + 145)
      }
    g.font = '28px Georgia, serif'
    g.fillText('Nash eq.', x0 + c + 75, y0 + 2 * c + 20)
  } else {
    axes()
    g.fillStyle = BLUE
    g.fillRect(330, 220, 240, 380)
    g.fillStyle = '#8aa4c8'
    g.fillRect(700, 400, 240, 200)
    g.fillStyle = PINK
    g.fillRect(700, 220, 240, 180)
    g.fillStyle = INK
    g.fillText('Assets', 390, 640)
    g.fillText('Liabilities + Equity', 690, 640)
    g.fillStyle = '#ffffff'
    g.fillText('Equity', 760, 320)
    g.fillText('Liabilities', 740, 510)
  }
}

const cache = new Map()
export function slideTex(course, kind) {
  const key = `${course}-${kind}`
  if (cache.has(key)) return cache.get(key)
  const c = document.createElement('canvas')
  c.width = W
  c.height = Hh
  const g = c.getContext('2d')
  const deck = DECKS[course]
  if (kind === 'title') {
    g.fillStyle = BLUE
    g.fillRect(0, 0, W, Hh)
    g.fillStyle = PINK
    g.fillRect(80, 300, 140, 10)
    g.fillStyle = '#ffffff'
    g.font = 'bold 76px Georgia, serif'
    g.fillText(deck.title[0], 80, 270)
    g.font = '40px Georgia, serif'
    g.fillText(deck.title[1], 80, 380)
    g.font = '30px Georgia, serif'
    g.fillStyle = '#c9d6ea'
    g.fillText(`${COURSES[course].name} · Yale SOM`, 80, 620)
  } else if (kind === 'content') {
    frame(g, course, deck.content[0])
    g.fillStyle = INK
    g.font = '42px Georgia, serif'
    deck.content[1].forEach((line, i) => {
      g.fillStyle = PINK
      g.fillRect(80, 205 + i * 100, 18, 18)
      g.fillStyle = INK
      g.fillText(line, 125, 228 + i * 100)
    })
  } else {
    frame(g, course, deck.title[0])
    drawChart(g, deck.chart)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  cache.set(key, t)
  return t
}
