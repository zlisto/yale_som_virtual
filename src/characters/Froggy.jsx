import Labubu from '../Labubu.jsx'
import { preloadModel } from './rig.js'

// Froggy: the Labubu in a green frog hood with frog eyes on top (public/models/froggy.glb), for the
// AI Safety easter egg. reading=true holds the sheet of paper up to its face (Read clip), else Idle.
preloadModel('froggy')

export default function Froggy({ reading = true, fur = '#efe3cf', ...props }) {
  return <Labubu model="froggy" clip={reading ? 'Read' : 'Idle'} fur={fur} {...props} />
}
