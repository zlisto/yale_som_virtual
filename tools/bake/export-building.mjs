// Export the static building for the bake: loads the app with ?exportGLB=1 in headless Chrome,
// calls window.__bakeExportParts() (src/render/exportGLB.js), writes building.glb and lights.json
// next to this script.
//   node tools/bake/export-building.mjs [base url, default http://localhost:5190/]
import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const base = process.argv[2] || 'http://localhost:5190/'
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  protocolTimeout: 900000, // the enlarged floor (round 4) takes longer than the 180 s default to export
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--user-data-dir=/tmp/shots-profile-bake-export'],
})
const p = await b.newPage()
await p.setViewport({ width: 800, height: 500 })
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)))
await p.goto(`${base}?exportGLB=1&nolock=1&hud=0&quality=high`, { waitUntil: 'load', timeout: 120000 })
await p.waitForFunction(() => window.__bakeExport, { timeout: 60000 })
await new Promise((r) => setTimeout(r, 5000)) // texture images load, so their mean colours are real
console.time('export')
const { size, lights } = await p.evaluate(() => window.__bakeExportParts())
console.timeEnd('export')
const parts = []
const SLICE = 8 << 20
for (let i = 0; i < size; i += SLICE) parts.push(Buffer.from(await p.evaluate((a, n) => window.__bakeSlice(a, n), i, SLICE), 'base64'))
const glbBuf = Buffer.concat(parts)
writeFileSync(join(here, 'building.glb'), glbBuf)
writeFileSync(join(here, 'lights.json'), JSON.stringify(lights, null, 1))
const tris = Object.entries(lights.triangles)
console.log(`building.glb ${(glbBuf.length / 1e6).toFixed(1)} MB, ${tris.length} meshes, ${tris.reduce((s, [, n]) => s + n, 0)} triangles`)
console.log(tris.filter(([k]) => k.startsWith('bake_')).map(([k, n]) => `${k} ${n}`).join('\n'))
if (errs.length) console.log('CONSOLE', [...new Set(errs)].slice(0, 8))
await b.close()
