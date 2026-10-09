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

**Keyboard + mouse** (works like a PC shooter):

| Key | Action |
| --- | --- |
| W A S D / arrows | walk |
| Mouse | look |
| Shift | sprint |
| Space | jump |
| C | crouch |
| M | toggle map |
| Esc | pause |

**Phone / tablet:** tap **Tap to walk in**. The left-thumb joystick walks (push it all the way to sprint), dragging anywhere else looks around, and there are on-screen jump and pause buttons. On a laptop, click **Use on-screen joystick** to try the phone controls. WASD still works in that mode.

## How it's built

- `src/layout.js`: the floor plan in meters (+x east, -z north). It holds the drums, library, Beinecke, stairs, meeting rooms, wall colliders, and room lookup. Each classroom faces the courtyard, with the whiteboard and podium on the inner side and stadium-seating rows (32 cm risers) stepping up toward the outer wall; its two doors are at the front corners. You climb the center-aisle steps one riser at a time.
- `src/World.jsx`: all the meshes. Walls use instanced boxes and the drums use partial cylinders.
- `src/textures.js`: procedural canvas textures (carpet, navy drum glass, wood slats, mural, signs, stairwell paintings).
- `src/Player.jsx`: walking (pointer lock or touch), jump/crouch, circle-vs-wall collision.
- `src/TouchControls.jsx`: on-screen joystick, drag-to-look, jump and pause buttons.
- `src/Minimap.jsx`: the black-and-pink map in the corner.

The layout is estimated from the wayfinding plan posted on the floor, so room sizes are approximate. The Stair G painting comes from a photo; the other stairwell paintings are made up.

Made for MGT 409: AI Foundations for Managers, Lecture 13.
