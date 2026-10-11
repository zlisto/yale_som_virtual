// Headless Chrome screenshots and frame-rate probes at 1440x900.
//   node shot.mjs <url> <out.png>            one screenshot after the scene settles
//   node shot.mjs --fps <url> [<url> ...]    mean fps and p95 frame time over 5 s per url
// UNCAP=1 lifts the 60 fps vsync cap so frame cost differences show.
// WAIT (ms, default 6000) is the settle time before the shot or the measurement.
import puppeteer from 'puppeteer-core'

const args = process.argv.slice(2)
const fps = args[0] === '--fps'
const urls = fps ? args.slice(1) : [args[0]]
const wait = +(process.env.WAIT || 6000)
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--user-data-dir=/tmp/shots-profile-bake', '--hide-scrollbars', ...(process.env.UNCAP ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])],
})
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => ['error', 'warning'].includes(m.type()) && errs.push(m.text().slice(0, 600)))
for (const url of urls) {
  await p.goto(url, { waitUntil: 'load', timeout: 120000 })
  // the baked building has loaded and its probes are captured (src/render/Probes.jsx)
  await p.waitForFunction(() => window.__bakedReady || new URLSearchParams(location.search).get('bake') === '0', { timeout: 60000 }).catch(() => console.log('no __bakedReady after 60 s'))
  await new Promise((r) => setTimeout(r, wait))
  if (!fps) {
    await p.screenshot({ path: args[1] })
    console.log(args[1])
    continue
  }
  const r = await p.evaluate(() => new Promise((res) => {
    const ts = []
    const t0 = performance.now()
    const f = (t) => {
      ts.push(t)
      if (t - t0 < 5000) return requestAnimationFrame(f)
      const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b)
      res({ fps: (((ts.length - 1) * 1000) / (ts.at(-1) - ts[0])).toFixed(1), p95ms: d[Math.floor(d.length * 0.95)].toFixed(1) })
    }
    requestAnimationFrame(f)
  }))
  r.probeMs = await p.evaluate(() => window.__probeMs?.toFixed(0))
  console.log(url, JSON.stringify(r))
}
if (errs.length) console.log('CONSOLE', [...new Set(errs)].slice(0, 8))
await b.close()
