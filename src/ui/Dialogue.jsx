import { Fragment, useEffect, useRef, useState } from 'react'
import { ui, useStore } from '../interact/store.js'
import { sound } from '../interact/sound.js'
import { advanceDialogue, closeDialogue, dialogueState } from './dialogueStore.jsx'
import { GENERIC, avatarFor, usePortrait } from './portraits.js'

const CPS = 55 // typewriter characters per second

// `code` spans in monospace
function rich(text) {
  return text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>))
}

export default function Dialogue() {
  const { script, index } = useStore(dialogueState)
  const touch = useStore(ui, (s) => s.touch)
  const line = script?.[index]
  // who is talking: the line's avatar (a URL or a portraits.js spec), else the speaker's entry in
  // SPEAKER_AVATARS, else (any other named speaker, such as a roamer) a generic Labubu
  const avatar = line ? line.avatar ?? (line.speaker ? avatarFor(line.speaker) ?? GENERIC : null) : null
  const portrait = usePortrait(avatar)
  const [shown, setShown] = useState(0)
  const full = line?.text ?? ''
  const done = shown >= full.length
  const shownRef = useRef(0)
  shownRef.current = shown
  // the typewriter's counter; a skip sets it to the full length so the next tick cannot shrink the line
  const typed = useRef(0)
  const finish = () => {
    typed.current = full.length
    setShown(full.length)
  }

  // typewriter
  useEffect(() => {
    setShown(0)
    if (!line) return
    typed.current = 0
    const t0 = performance.now()
    const id = setInterval(() => {
      const target = Math.min(full.length, Math.floor(((performance.now() - t0) / 1000) * CPS))
      if (target > typed.current) {
        if (Math.floor(target / 3) > Math.floor(typed.current / 3)) sound.tick()
        typed.current = target
        setShown(target)
      }
      if (typed.current >= full.length) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [line, full])

  // Space / Enter advance (first press finishes the line), number keys choose, Esc closes
  useEffect(() => {
    if (!line) return
    const key = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        closeDialogue(false)
        return
      }
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (e.repeat) return
        if (shownRef.current < full.length) finish()
        else if (!line.choices?.length) advanceDialogue(null, true)
        return
      }
      const m = e.code.match(/^(?:Digit|Numpad)([1-9])$/)
      if (m && shownRef.current >= full.length && line.choices?.[+m[1] - 1]) advanceDialogue(+m[1] - 1, true)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [line, full])

  if (!line) return null
  const click = (e) => {
    e.stopPropagation()
    if (!done) finish()
    else if (!line.choices?.length) advanceDialogue(null, true)
  }
  return (
    <div className="dlg-scrim" onPointerDown={(e) => e.stopPropagation()}>
      <div className="dlg" onClick={click} role="dialog" aria-live="polite">
        <div className="dlg-head">
          {avatar && (portrait ? <img className="dlg-avatar" src={portrait} alt="" /> : <span className="dlg-avatar empty" />)}
          {line.speaker && <span className="dlg-speaker">{line.speaker}</span>}
          <button
            className="dlg-x"
            aria-label="close"
            onClick={(e) => {
              e.stopPropagation()
              closeDialogue(true)
            }}
          >
            esc
          </button>
        </div>
        <p className={line.code ? 'dlg-text mono' : 'dlg-text'}>
          {rich(full.slice(0, shown))}
          {!done && <span className="dlg-caret" />}
        </p>
        {done && line.choices?.length > 0 && (
          <div className="dlg-choices">
            {line.choices.map((c, i) => (
              <button
                key={i}
                className="dlg-choice"
                onClick={(e) => {
                  e.stopPropagation()
                  advanceDialogue(i, true)
                }}
              >
                <kbd>{i + 1}</kbd>
                {rich(c.text)}
              </button>
            ))}
          </div>
        )}
        {done && !line.choices?.length && <div className="dlg-next">{touch ? 'tap' : 'space'} ▸</div>}
      </div>
    </div>
  )
}
