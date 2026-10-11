import Ticker from './b/Ticker.jsx'
import Merch from './b/Merch.jsx'
import Plaques from './b/Plaques.jsx'
import Attendance from './b/Attendance.jsx'

// Egg set B, mounted once inside <Canvas> next to <InteractScene />.
export default function EggsB() {
  return (
    <>
      <Ticker />
      <Merch />
      <Plaques />
      <Attendance />
    </>
  )
}
