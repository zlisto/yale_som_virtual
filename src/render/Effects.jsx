import { useMemo } from 'react'
import { EffectComposer, N8AO, Bloom, SMAA, Vignette, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { OFF, ON, QUALITY } from './debugCam.js'
import SSR from './SSR.jsx'
import FarBlur from './FarBlur.jsx'
import Grade from './Grade.jsx'
import { DepthCopyPass } from './depthCopy.js'

// High quality only. The composer renders the scene to a linear HDR buffer, so tone
// mapping moves out of the materials into the ToneMapping effect at the end of the chain.
// Bloom threshold 1.6 sits above a sunlit floor (about 1.2 linear), so only the downlights
// (4.0) and specular glints bloom. The far blur and SSR are off by default (?on=dof,ssr brings
// them back): at dpr 1.5 on an M1 retina panel they cost about 4 fps each and held the
// courtyard, corridor and classrooms under 45. The baked reflection probes cover the drums.
export default function Effects() {
  const depthCopy = useMemo(() => new DepthCopyPass(), [])
  if (QUALITY === 'low' || OFF.has('post')) return null
  return (
    <EffectComposer multisampling={0}>
      <primitive object={depthCopy} />
      {!OFF.has('ao') && <N8AO halfRes aoRadius={1.0} distanceFalloff={0.6} intensity={1.0} quality="performance" />}
      {ON.has('ssr') && <SSR />}
      {!OFF.has('bloom') && <Bloom mipmapBlur luminanceThreshold={1.6} luminanceSmoothing={0.15} intensity={0.55} radius={0.7} />}
      {ON.has('dof') && <FarBlur />}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {!OFF.has('grade') && <Grade />}
      {!OFF.has('smaa') && <SMAA />}
      {!OFF.has('vignette') && <Vignette offset={0.35} darkness={0.35} />}
    </EffectComposer>
  )
}
