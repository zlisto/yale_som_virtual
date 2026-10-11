# Froggy: the Labubu in a green frog hood with frog eyes on top, holding a sheet of paper (AI Safety easter egg).
#   blender -b -P tools/blender/froggy.py -> public/models/froggy.glb (clips include Idle and Read)
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import labubu

if __name__ == "__main__":
    rig, meshes, stats, _ = labubu.build(costume="frog", out_name="froggy", seated=False)
    labubu.previews(rig, meshes, "froggy", costume="frog", fur="#e9dcc6", face="grin", clothes="none")
