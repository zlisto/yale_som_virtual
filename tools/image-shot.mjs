// Headless Chrome screenshots and frame-rate readings for the image-quality work.
// Usage: node tools/image-shot.mjs <outDir> <tag> [base] [extraQuery]
//   base defaults to http://localhost:5193/ (vite dev). extraQuery is appended to every shot,
//   for example "off=ssr,dof". Each shot waits for the scene, settles, then reads the frame
//   rate over 6 s and the renderer pixel ratio, and writes <tag>-<name>.png.
// Env: SHOTS=courtyard;library limits the list; LOADING=1 also captures the loading screen
// and the start card.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const [outDir, tag = 'shot', base = 'http://localhost:5193/', extra = ''] = process.argv.slice(2)
// SCALE=2 renders like the M1's retina panel (devicePixelRatio 2), so the dpr search starts at 2
const SCALE = Number(process.env.SCALE) || 1
if (!outDir) throw new Error('usage: node tools/image-shot.mjs <outDir> <tag> [base] [extraQuery]')
fs.mkdirSync(outDir, { recursive: true })
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// cam = x,y,z,yawDeg,pitchDeg; yaw 0 looks north (-z), positive yaw turns west
const SHOTS = {
  courtyard: '-16,1.65,0,-90,6',
  cloister: '-24.4,1.65,22,0,0',
  classroom: '0,3.4,42,0,-10',
  library: '-29,1.65,11,20,-4',
}
// SHOTS=name or name=x,y,z,yaw,pitch (an ad hoc camera); separate entries with ';'
const pick = process.env.SHOTS === 'none'
  ? []
  : process.env.SHOTS
  ? process.env.SHOTS.split(';').map((e) => {
      const [n, cam] = e.split('=')
      if (cam) SHOTS[n] = cam
      return n
    })
  : Object.keys(SHOTS)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: SCALE },
})

async function measure(page, seconds = 6) {
  return page.evaluate(
    (ms) =>
      new Promise((res) => {
        let n = 0
        const t0 = performance.now()
        const tick = () => {
          n++
          if (performance.now() - t0 < ms) requestAnimationFrame(tick)
          else res(Math.round((n * 1000) / (performance.now() - t0)))
        }
        requestAnimationFrame(tick)
      }),
    seconds * 1000,
  )
}

const results = []
for (const name of pick) {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const q = `?cam=${SHOTS[name]}&hud=0&nolock=1&quality=high${extra ? '&' + extra : ''}`
  await page.goto(base + q, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => document.body.dataset.ready, { timeout: 120000 })
  // dpr search and shadow frames settle; the pixel ratio is sampled once a second
  const trace = []
  const settle = Number(process.env.SETTLE) || 9000
  for (let t = 0; t < settle; t += 1000) {
    await new Promise((r) => setTimeout(r, 1000))
    trace.push(await page.evaluate(() => window.__three?.gl.getPixelRatio?.() ?? null))
  }
  const fps = await measure(page)
  const dpr = await page.evaluate(() => window.__three?.gl.getPixelRatio?.() ?? null)
  const file = path.join(outDir, `${tag}-${name}.png`)
  await page.screenshot({ path: file })
  results.push({ name, fps, dpr, trace: trace.join(' '), file, errors: errors.slice(0, 3) })
  await page.close()
}

if (process.env.LOADING) {
  // loading screen: slow the network so the panel is mid-load when captured
  const page = await browser.newPage()
  const cdp = await page.createCDPSession()
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 1.5e6, uploadThroughput: 1e6 })
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await page.goto(base + '?quality=high', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.loading', { timeout: 60000 }).catch(() => {})
  await page.waitForFunction(() => /[1-9]\d?%/.test(document.querySelector('.loading .pct')?.textContent || ''), { timeout: 60000 }).catch(() => {})
  await page.screenshot({ path: path.join(outDir, `${tag}-loading.png`) })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await page.waitForSelector('.overlay .card', { timeout: 120000 }).catch(() => {})
  await page.waitForFunction(() => !document.querySelector('.loading'), { timeout: 60000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 1500))
  await page.screenshot({ path: path.join(outDir, `${tag}-startcard.png`) })
  results.push({ name: 'loading+startcard' })
  await page.close()
}

await browser.close()
console.log(JSON.stringify(results, null, 1))
