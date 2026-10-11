// Character screenshots and frame-rate readings in headless Chrome (needs the dev server and puppeteer-core:
// `npm i --no-save puppeteer-core`). Usage:
//   node tools/polish-shot.mjs <outDir> [shotName ...] [--fps] [--port=5192]
// Each shot places the camera from `from` looking at `to` via ?cam=. A shot with `follow` finds that object
// in the scene (window.__three, dev only) and moves the camera next to it before the capture.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const args = process.argv.slice(2)
const out = args.find((a) => !a.startsWith('--')) || '/tmp/polish-shots'
const names = args.filter((a) => !a.startsWith('--') && a !== out)
const FPS = args.includes('--fps')
const extra = (args.find((a) => a.startsWith('--q=')) || '--q=').slice(4) // extra query, e.g. --q=fur=0
const port = (args.find((a) => a.startsWith('--port=')) || '--port=5192').split('=')[1]

// yaw/pitch in degrees for a camera at `f` looking at `t` (three.js camera looks down -Z at yaw 0)
function cam(f, t) {
  const dx = t[0] - f[0]
  const dy = t[1] - f[1]
  const dz = t[2] - f[2]
  const yaw = (Math.atan2(-dx, -dz) * 180) / Math.PI
  const pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI
  return [...f, yaw, pitch].map((v) => v.toFixed(3)).join(',')
}

export const SHOTS = {
  // Dumbledore at the front of 2400 (he faces -X), seen from the third row with the front rows between
  classroom: { from: [-31.6, 2.35, 31.0], to: [-28.65, 1.4, 32.3] },
  // the crowd view for frame-rate readings: the whole seated class from the front corner
  crowd: { from: [-28.1, 2.5, 27.2], to: [-34.5, 0.9, 35.5] },
  courtyard: { from: [-1.5, -2.6, 10.5], to: [0.5, -4.4, -0.5] },
  froggy: { from: [27.55, 1.25, -15.05], to: [26.55, 0.7, -14.3] },
  merch: { from: [26.0, 1.35, 19.7], to: [28.2, 1.0, 19.7] },
  meeting: { from: [-23.6, 1.75, 46.7], to: [-25.6, 0.75, 48.75] },
  dan: { from: [0, 1.65, 0], to: [0, 0, -1], follow: 'DanRig', dist: 1.7, height: 0.45 },
}

const pick = names.length ? names : Object.keys(SHOTS).filter((k) => k !== 'crowd')
fs.mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1440,900', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  defaultViewport: { width: 1440, height: 900 },
})
const results = {}
for (const name of pick) {
  const s = SHOTS[name]
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log(`[${name}] pageerror ${e.message}`))
  const url = `http://localhost:${port}/?nolock=1&hud=0&quality=high&dpr=1&cam=${cam(s.from, s.to)}${extra ? '&' + extra : ''}`
  await page.goto(url, { waitUntil: 'load', timeout: 120000 })
  await new Promise((r) => setTimeout(r, 12000)) // models load, shaders compile, shadows settle
  if (s.follow) {
    // grab the camera from the renderer, then park it beside the followed object, facing it
    const ok = await page.evaluate(
      ({ follow, dist, height }) =>
        new Promise((res) => {
          const { gl, scene } = window.__three || {}
          if (!gl) return res('no __three')
          // the player resets the camera height every frame, so the camera is placed inside the render call
          let frames = 0
          const orig = gl.render.bind(gl)
          gl.render = (sc, c) => {
            const o = scene.getObjectByName(follow)
            if (o && c && c.isPerspectiveCamera && c.fov === 72) {
              const p = o.getWorldPosition(o.position.clone())
              const v = new o.position.constructor(0, 0, 1).applyQuaternion(o.getWorldQuaternion(c.quaternion.clone()))
              const yawOff = 0.5 // three-quarter view from the front
              const ex = v.x * Math.cos(yawOff) - v.z * Math.sin(yawOff)
              const ez = v.x * Math.sin(yawOff) + v.z * Math.cos(yawOff)
              c.position.set(p.x + ex * dist, p.y + height, p.z + ez * dist)
              c.lookAt(p.x, p.y + 0.3, p.z)
              c.updateMatrixWorld()
              if (++frames === 3) res('ok')
            }
            return orig(sc, c)
          }
          setTimeout(() => res('not found'), 5000)
        }),
      s,
    )
    if (ok !== 'ok') console.log(`[${name}] follow: ${ok}`)
  }
  if (FPS) {
    // median frame interval over 6 s, plus triangles and draw calls per frame (renderer.info summed over
    // every render call in the frame: shadow maps, the scene pass and the post passes)
    const r = await page.evaluate(
      () =>
        new Promise((res) => {
          const gl = window.__three?.gl
          if (gl) gl.info.autoReset = false
          const dts = []
          const tri = []
          const calls = []
          let last = performance.now()
          const t0 = last
          const f = () => {
            const now = performance.now()
            dts.push(now - last)
            last = now
            if (gl) {
              tri.push(gl.info.render.triangles)
              calls.push(gl.info.render.calls)
              gl.info.reset()
            }
            if (now - t0 < 6000) requestAnimationFrame(f)
            else {
              const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
              res({ fps: 1000 / med(dts.slice(2)), mean: (1000 * (dts.length - 2)) / dts.slice(2).reduce((x, y) => x + y, 0), tris: med(tri.slice(2)), calls: med(calls.slice(2)) })
            }
          }
          requestAnimationFrame(f)
        }),
    )
    results[name] = r
    console.log(`[fps] ${name} median ${r.fps.toFixed(1)} mean ${r.mean.toFixed(1)} tris ${r.tris} calls ${r.calls}`)
  }
  const file = path.join(out, `${name}.jpg`)
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 })
  console.log(`[shot] ${file}`)
  await page.close()
}
await browser.close()
if (FPS) fs.writeFileSync(path.join(out, 'fps.json'), JSON.stringify(results, null, 2))
