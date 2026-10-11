# Plan of record

This file is the plan for the realism upgrade of the Evans Hall floor 2 walkthrough. The work happens on the fork ericluo04/yale_som_virtual and goes back to zlisto/yale_som_virtual as one pull request at the end.

## Phase 1: make it look and feel like the building

Three workstreams run in parallel on branches off `realism`, each in its own git worktree, and the coordinator merges them into `realism`.

The rendering workstream (`realism-render`) owns the look of the building. It adds tone mapping, soft sun shadows, ceiling downlights, ambient occlusion and bloom on high quality, CC0 texture sets for carpet, wood and plaster, an HDRI sky, and procedural props. It also corrects the floor plan against the Foster level 2 drawing and the reference photos in `yale_som_virtual-refs/`: drum sizes and positions, the courtyard size, the blue glass drums, the grey concourse, the roof canopy and the columns. The debug camera (`?cam=x,y,z,yaw,pitch`, `?nolock=1`, `?quality=low|high`, `?stats=1`, `?hud=0`) exists so that headless browsers can take screenshots.

The characters workstream (`realism-chars`) owns the Labubus, the professors, the faculty and Handsome Dan.

The interaction workstream (`realism-interact`) owns the player controls, the touch controls and the minimap.

## Phase 2: eight easter eggs

Phase 2 starts after phase 1 is merged. Each easter egg is small and self-contained.

1. Froggy, a Labubu that has been prompt-injected and says things it should not.
2. Lisa, an AI teaching-assistant kiosk.
3. Seven Harry Potter book portraits on the walls of the Ross Library.
4. A live-looking stock ticker in the finance classroom.
5. A Campus Customs merchandise stand.
6. Hidden plaques around the floor.
7. QR-code attendance at the door of room 2400.
8. A trash can that is a trap for anyone who dumps into it.

## Deployment and review

Preview builds deploy from the fork's `main` branch to GitHub Pages, so every merge into `main` produces a page someone can open. When both phases are done, one pull request goes from the fork to zlisto/yale_som_virtual.
