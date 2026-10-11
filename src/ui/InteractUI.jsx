import { ui, useStore } from '../interact/store.js'
import { interactState } from '../interact/registry.js'
import { sound, soundState } from '../interact/sound.js'
import Dialogue from './Dialogue.jsx'
import { hudState } from './hudSlots.jsx'
import { toastState } from './toast.js'
import { HUD } from '../render/debugCam.js'
import './ui.css'

// ?hud=0 (clean screenshots) hides every slot: the egg pills, the counters and the prompt
function Slot({ name, children }) {
  const items = useStore(hudState, (s) => s[name])
  if (!HUD) return null
  return (
    <div className={`hud-slot hud-${name}`}>
      {children}
      {items.map((it) => (
        <div key={it.key} className="hud-item">
          {it.node}
        </div>
      ))}
    </div>
  )
}

function Prompt() {
  const active = useStore(interactState, (s) => s.active)
  const frozen = useStore(ui, (s) => s.frozen)
  const touch = useStore(ui, (s) => s.touch)
  if (!active || frozen) return null
  return (
    <div className="hud-ask">
      <kbd>{touch ? 'action' : 'E'}</kbd>
      <span>
        {active.verb ?? 'Interact with'} {active.label}
      </span>
    </div>
  )
}

function Toasts() {
  const list = useStore(toastState, (s) => s.list)
  return (
    <div className="toasts">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.title && <div className="toast-title">{t.title}</div>}
          <div>{t.text}</div>
        </div>
      ))}
    </div>
  )
}

function MuteButton() {
  const muted = useStore(soundState, (s) => s.muted)
  return (
    <button className="hud-pill hud-btn" onClick={() => sound.toggleMute()} title="mute (N)">
      <span className="hud-label">sound</span>
      <span className="hud-num">{muted ? 'off' : 'on'}</span>
      <kbd>N</kbd>
    </button>
  )
}

function MusicButton() {
  const music = useStore(soundState, (s) => s.music)
  return (
    <button className="hud-pill hud-btn" onClick={() => sound.toggleMusic()} title="music (B)">
      <span className="hud-label">music</span>
      <span className="hud-num">{music ? 'on' : 'off'}</span>
      <kbd>B</kbd>
    </button>
  )
}

// Mount once in App, outside the <Canvas>: HUD slots, the interact prompt, toasts, dialogue.
export default function InteractUI() {
  return (
    <>
      <Slot name="status" />
      <Slot name="counters">
        <div className="hud-row">
          <MuteButton />
          <MusicButton />
        </div>
      </Slot>
      <Slot name="prompt">
        <Prompt />
      </Slot>
      <Toasts />
      <Dialogue />
    </>
  )
}
