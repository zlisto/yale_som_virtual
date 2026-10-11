# Credits

Third-party assets bundled in `public/`. All are released under CC0 1.0 (public domain dedication), so no attribution is legally required. They are listed here so their source is traceable.

| File | Source | Licence |
|---|---|---|
| `public/tex/carpet_*.jpg` | Carpet 016 by ambientCG, https://ambientcg.com/view?id=Carpet016 | CC0 1.0 |
| `public/tex/wood_*.jpg` | Wood 092 by ambientCG, https://ambientcg.com/view?id=Wood092 | CC0 1.0 |
| `public/tex/plaster_*.jpg` | Painted Plaster 017 by ambientCG, https://ambientcg.com/view?id=PaintedPlaster017 | CC0 1.0 |
| `public/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr` | Kloofendal 48d Partly Cloudy (Pure Sky) by Greg Zaal and Jarod Guest, Poly Haven, https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0 1.0 |
| `public/hdri/kloofendal_48d_partly_cloudy_sky_4k.jpg` | The same Poly Haven HDRI at 4K, encoded as an 8-bit JPG: each channel stores L / (1 + L) of the linear radiance, the sun disc clipped at 200, the lower hemisphere replaced by a flat horizon haze. It is the visible sky on the backdrop sphere (`src/render/Backdrop.jsx`), which decodes it back to HDR | CC0 1.0 |

The ambientCG sets were downloaded at 1K and re-encoded as JPG (colour and roughness at quality 80, normal maps at quality 90). Only the colour, OpenGL normal, and roughness maps are kept.

## Scenery models and backdrop (`public/scenery/`)

Downloaded at 1K, then compressed with glTF-Transform (WebP textures at 512 or 1024 px, Draco geometry). Some were decimated in Blender first to fit the frame budget; the ratio is in the last column.

| File | Source | Licence | Notes |
|---|---|---|---|
| `plant_a.glb` | Potted Plant 01 by Rico Cilliers, Poly Haven, https://polyhaven.com/a/potted_plant_01 | CC0 1.0 | decimated to 12% |
| `plant_b.glb` | Potted Plant 02 by Rico Cilliers, Poly Haven, https://polyhaven.com/a/potted_plant_02 | CC0 1.0 | decimated to 25% |
| `lounge_chair.glb` | Mid Century Lounge Chair by Kuutti Siitonen, Poly Haven, https://polyhaven.com/a/mid_century_lounge_chair | CC0 1.0 | |
| `side_table.glb` | Coffee Table Round 01 by Ulan Cabanilla, Poly Haven, https://polyhaven.com/a/coffee_table_round_01 | CC0 1.0 | |
| `dining_chair.glb` | Dining Chair 02 by James Ray Cock, Poly Haven, https://polyhaven.com/a/dining_chair_02 | CC0 1.0 | decimated to 12%; recoloured black in code |
| `round_table.glb` | Round Wooden Table 01 by Ulan Cabanilla, Poly Haven, https://polyhaven.com/a/round_wooden_table_01 | CC0 1.0 | decimated to 40%; recoloured to oak in code |
| `study_table.glb` | Wooden Table 02 by Serhii Khromov, Poly Haven, https://polyhaven.com/a/wooden_table_02 | CC0 1.0 | no longer placed: the library tables are procedural since the 4 cm tops |
| `shelf.glb` | Shelf 01 by Gabriel Radić, Poly Haven, https://polyhaven.com/a/Shelf_01 | CC0 1.0 | recoloured white in code |
| `books.glb` | Book Encyclopedia Set 01 by John Malcolm, Poly Haven, https://polyhaven.com/a/book_encyclopedia_set_01 | CC0 1.0 | decimated to 1% |
| `wall_clock.glb` | Wall Clock by PierreB3D, Poly Haven, https://polyhaven.com/a/wall_clock | CC0 1.0 | |
| `extinguisher.glb` | Korean Fire Extinguisher 01 by UM JOORIN, Poly Haven, https://polyhaven.com/a/korean_fire_extinguisher_01 | CC0 1.0 | |
| `laptop.glb` | Classic Laptop by Arrangemonk, Poly Haven, https://polyhaven.com/a/classic_laptop | CC0 1.0 | decimated to 15% |
| `office_chair.glb` | chairDesk from the Furniture Kit by Kenney, https://kenney.nl/assets/furniture-kit | CC0 1.0 | recoloured black in code |
| `trash_bin.glb` | trashcan from the Furniture Kit by Kenney, https://kenney.nl/assets/furniture-kit | CC0 1.0 | recoloured in code |
| `tree_maple.glb`, `tree_aspen.glb`, `tree_birch.glb` | Grown for this project in Blender 5.2 with the Sapling Tree Gen add-on (https://extensions.blender.org/add-ons/sapling-tree-gen/, GPL; its output carries no licence of its own) from the small maple, quaking aspen and white birch presets. Bark: Bark 001 and Bark 007 by ambientCG (https://ambientcg.com/view?id=Bark001, https://ambientcg.com/view?id=Bark007). Leaf-twig cards composited from Leaf 001 by ambientCG (https://ambientcg.com/view?id=Leaf001) | CC0 1.0 | |
| `backdrop_museumplein_2k.jpg` | Museumplein by Greg Zaal, Poly Haven, https://polyhaven.com/a/museumplein | CC0 1.0 | 2K HDR tone mapped (ACES) to an 8-bit equirectangular JPG. No longer referenced: the backdrop sphere shows the Kloofendal sky instead |
| `tex/leather_*.jpg` | Leather 037 by ambientCG, https://ambientcg.com/view?id=Leather037 | CC0 1.0 | normal and roughness at 512 px |
| `tex/metal_*.jpg` | Metal 027 by ambientCG, https://ambientcg.com/view?id=Metal027 | CC0 1.0 | normal and roughness at 512 px |
| `tex/carpet_*_2k.jpg` | Carpet 016 by ambientCG at 2K, https://ambientcg.com/view?id=Carpet016 | CC0 1.0 | swapped in at run time for the 1K normal and roughness maps of the same set |
| `tex/plaster_*_2k.jpg` | Painted Plaster 017 by ambientCG at 2K, https://ambientcg.com/view?id=PaintedPlaster017 | CC0 1.0 | as above |
| `tex/paving_*_2k.jpg` | Paving Stones 128 by ambientCG, https://ambientcg.com/view?id=PavingStones128 | CC0 1.0 | courtyard paving |
| `tex/sidewalk_*.jpg` | Paving Stones 136 by ambientCG, https://ambientcg.com/view?id=PavingStones136 | CC0 1.0 | sidewalks outside |
| `tex/grass_*.jpg` | Grass 004 by ambientCG, https://ambientcg.com/view?id=Grass004 | CC0 1.0 | lawn outside, 512 px |
| `tex/facade_brick_*.jpg` | Facade 018 A by ambientCG, https://ambientcg.com/view?id=Facade018A | CC0 1.0 | source of `brick_red_tile.jpg`; no longer referenced at run time since the canvas facades |
| `tex/facade_brown_*.jpg` | Facade 020 A by ambientCG, https://ambientcg.com/view?id=Facade020A | CC0 1.0 | source of `brick_brown_tile.jpg`; no longer referenced at run time |
| `tex/fabric_*.jpg` | Fabric 030 by ambientCG, https://ambientcg.com/view?id=Fabric030 | CC0 1.0 | Beinecke curtain weave; normal and roughness at 512 px |
| `tex/lawn_*.jpg` | Grass 005 by ambientCG, https://ambientcg.com/view?id=Grass005 | CC0 1.0 | courtyard lawn; colour and normal at 2K, roughness at 1K |
| `tex/brick_red_tile.jpg`, `tex/brick_brown_tile.jpg` | Cut from the Facade 018 A and Facade 020 A scans above (the full-width brick bands and the dark brick piers, re-tiled to 512 px, about 5 m square) | CC0 1.0 | brick for the canvas facades of the neighbourhood (`src/render/Town.jsx`) |
| `car_sedan.glb`, `car_suv.glb`, `car_van.glb`, `car_taxi.glb`, `car_sedan-sports.glb`, `car_hatchback-sports.glb` | Car Kit 3.1 by Kenney, https://kenney.nl/assets/car-kit | CC0 1.0 | body and wheels joined into one mesh, Draco-compressed with the colour map embedded (about 30 KB each); parked along Whitney Avenue and the north street |

No CC0 water cooler was found on Poly Haven, Kenney or Quaternius, so none is placed.

The painted skyline on the distance wall, the facades, the street furniture, the low-poly ring trees and the terrace furniture are drawn in code (canvas and three.js primitives) and carry no third-party assets.

The classroom whiteboard writing uses the Caveat typeface by Impallari Type, served by Google Fonts (https://fonts.google.com/specimen/Caveat), SIL Open Font License 1.1. The library's book spines, prints and reading lamps, and the level 4 offices, are drawn in code.
