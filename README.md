# Yale SOM Virtual: Evans Hall, Floor 2

A first-person walk-through of the 2nd floor of Edward P. Evans Hall (Yale School of Management), built with React, Vite, three.js, and @react-three/fiber.

It includes the blue classroom drums you can walk into, the curvy glass cloister around the courtyard, Ross Library on the west side, the Beinecke Terrace Room and its outdoor terrace on the east side, the small glass meeting rooms, and paintings above the stairwells.

**Walk it in your browser:** https://zlisto.github.io/yale_som_virtual/

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click **Click to walk in**.

| Key | Action |
| --- | --- |
| W A S D / arrows | walk |
| Mouse | look |
| Shift | hurry |
| M | toggle map |
| Esc | pause |

## How it's built

- `src/layout.js`: the floor plan in meters (+x east, -z north). It holds the drums, library, Beinecke, stairs, meeting rooms, wall colliders, and room lookup.
- `src/World.jsx`: all the meshes. Walls use instanced boxes and the drums use partial cylinders.
- `src/textures.js`: procedural canvas textures (carpet, navy drum glass, wood slats, mural, signs, stairwell paintings).
- `src/Player.jsx`: pointer-lock walking with circle-vs-wall collision.
- `src/Minimap.jsx`: the black-and-pink map in the corner.

The layout is estimated from the wayfinding plan posted on the floor, so room sizes are approximate. The Stair G painting comes from a photo; the other stairwell paintings are made up.

Made for MGT 409: AI Foundations for Managers, Lecture 13.
