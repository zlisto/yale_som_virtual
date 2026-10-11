import './a/eggsA.css'
import FroggyEgg from './a/FroggyEgg.jsx'
import LisaKiosk from './a/LisaKiosk.jsx'
import LibraryPortraits from './a/LibraryPortraits.jsx'
import DumpTrap from './a/DumpTrap.jsx'

// Egg set A, the NPC eggs. Mounted once inside <Canvas> from App.jsx.
export default function EggsA() {
  return (
    <>
      <FroggyEgg />
      <LisaKiosk />
      <LibraryPortraits />
      <DumpTrap />
    </>
  )
}
