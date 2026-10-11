# Handsome Dan, Yale's English bulldog mascot. Headless:
#   blender -b -P tools/blender/handsome_dan.py -> public/models/handsome_dan.glb (clips Walk, Idle, Sit)
# Feet at z=0, faces -Y (three.js +Z). Rigid per-part skinning, two bones per leg.
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
from mathutils import Vector, Matrix

LEGS = {  # name: (x, y, hip z), front legs wide-set
    "fl.L": (0.155, -0.2, 0.33), "fl.R": (-0.155, -0.2, 0.33),
    "hl.L": (0.13, 0.22, 0.34), "hl.R": (-0.13, 0.22, 0.34),
}


def materials():
    return {
        "white": lib.mat("Coat", lib.hexrgb("#f3efe6"), 0.85, fur_bump=True),
        "brindle": lib.mat("Brindle", lib.hexrgb("#9a6a44"), 0.85, fur_bump=True),
        "dark": lib.mat("DarkBrindle", lib.hexrgb("#4a3020"), 0.85),
        "nose": lib.mat("Nose", lib.hexrgb("#1b1514"), 0.35),
        "eye": lib.mat("Eye", lib.hexrgb("#120c08"), 0.15),
        "glint": lib.mat("Glint", (1, 1, 1), 0.2),
        "pink": lib.mat("Mouth", lib.hexrgb("#c76a6e"), 0.5),
        "tongue": lib.mat("Tongue", lib.hexrgb("#e5868c"), 0.4),
        "tooth": lib.mat("Tooth", (0.97, 0.96, 0.92), 0.3),
        "collar": lib.mat("Collar", lib.hexrgb("#00356b"), 0.6),
        "y": lib.mat("CollarY", (1, 1, 1), 0.5),
    }


def build():
    lib.reset()
    M = materials()
    P = lib.Parts(lod=0.65, subd=1)  # coarse cage + one applied subdivision level
    W, Bn = M["white"], M["brindle"]
    # body: broad chest, barrel, narrower hips
    P.sphere("chest", (0, -0.17, 0.4), (0.235, 0.2, 0.2), W, "spine", seg=16, rings=10, displace=0.006)
    P.sphere("barrel", (0, 0.04, 0.39), (0.2, 0.28, 0.17), W, "spine", seg=16, rings=10, displace=0.006)
    P.sphere("hips", (0, 0.22, 0.39), (0.175, 0.14, 0.16), W, "spine", seg=14, rings=10)
    # brindle saddle and patches
    P.sphere("saddle", (0.05, 0.1, 0.5), (0.15, 0.2, 0.07), Bn, "spine", rot=(0, 0.35, 0), seg=14, rings=8)
    P.sphere("patch.hip", (-0.12, 0.24, 0.43), (0.08, 0.1, 0.09), Bn, "spine", seg=12, rings=8)
    P.sphere("patch.chest", (0.15, -0.2, 0.47), (0.08, 0.09, 0.08), Bn, "spine", seg=12, rings=8)
    # legs: upper (shoulder to elbow), lower (to the paw), paws turned slightly out
    for name, (x, y, z) in LEGS.items():
        front = name.startswith("f")
        up, lo = f"{name}.up", f"{name}.lo"
        P.sphere(f"{name}.thigh", (x, y + (0 if front else 0.01), z - 0.07), (0.075 if front else 0.08, 0.08, 0.11), W, up, seg=12, rings=8)
        P.cyl(f"{name}.shin", (x * 1.03, y, 0.1), 0.05, 0.056, 0.17, W, lo, verts=16)
        P.sphere(f"{name}.paw", (x * 1.06, y - 0.035, 0.026), (0.062, 0.08, 0.032), W, lo, seg=12, rings=6)
    # tail: short stub
    P.sphere("tail", (0, 0.37, 0.47), (0.035, 0.05, 0.035), W, "tail", rot=(-0.6, 0, 0), seg=10, rings=6)
    # collar: Yale blue band around the neck, round blue tag with a white Y
    P.torus("collar", (0, -0.335, 0.47), 0.165, 0.026, M["collar"], "spine", rot=(math.pi / 2 - 0.3, 0, 0), seg=24, minor=6, scale=(1.02, 0.88, 1.9))
    # tag hangs in front of the chest; the Y is built flat in the tag's frame and rotated with it
    tag_c = Vector((0, -0.43, 0.3))
    tilt = Matrix.Rotation(-0.3, 4, "X")
    P.cyl("tag", tag_c, 0.055, 0.055, 0.012, M["collar"], "spine", rot=(math.pi / 2 - 0.3, 0, 0), verts=28)
    for i, (dx, dz, ang, ln) in enumerate(((-0.009, 0.01, -0.62, 0.03), (0.009, 0.01, 0.62, 0.03), (0, -0.013, 0, 0.026))):
        off = tilt @ Vector((dx, -0.008, dz))
        P.box(f"Y{i}", tag_c + off, (0.011, 0.004, ln), M["y"], "spine", rot=(-0.3, ang, 0))
    # head: wide skull, brindle patch over the right eye, jowls, flat muzzle, underbite
    H = "head"
    P.sphere("skull", (0, -0.42, 0.58), (0.19, 0.15, 0.15), W, H, seg=20, rings=14, displace=0.004)
    P.sphere("brow", (0, -0.5, 0.66), (0.14, 0.06, 0.04), W, H, seg=14, rings=8)
    P.sphere("eyepatch", (-0.075, -0.52, 0.64), (0.07, 0.04, 0.06), Bn, H, seg=12, rings=8)
    P.sphere("muzzle", (0, -0.55, 0.55), (0.12, 0.07, 0.07), W, H, seg=16, rings=10)
    for s, side in ((1, "L"), (-1, "R")):
        P.sphere(f"jowl.{side}", (0.075 * s, -0.575, 0.5), (0.075, 0.06, 0.07), W, H, seg=14, rings=8)
        P.sphere(f"eye.{side}", (0.085 * s, -0.55, 0.625), (0.024, 0.016, 0.022), M["eye"], H, seg=10, rings=6)
        P.sphere(f"glint.{side}", (0.08 * s, -0.565, 0.632), (0.006, 0.003, 0.006), M["glint"], H, seg=6, rings=4, subd=0)
        # rose ears folded back
        P.sphere(f"ear.{side}", (0.155 * s, -0.36, 0.69), (0.06, 0.035, 0.04), M["dark"], H, rot=(0.3, 0.5 * s, 0.4 * s), seg=10, rings=6)
    P.sphere("nose", (0, -0.625, 0.575), (0.045, 0.02, 0.028), M["nose"], H, seg=12, rings=6)
    P.box("nose.line", (0, -0.62, 0.53), (0.006, 0.006, 0.05), M["dark"], H)
    for k in (-1, 1):  # forehead wrinkles
        P.sphere(f"wrinkle{k}", (0.03 * k, -0.555, 0.672), (0.035, 0.006, 0.005), M["dark"], H, rot=(0, -0.25 * k, 0), seg=8, rings=4)
    # lower jaw on its own bone, jutting forward past the upper lip, teeth pointing up
    J = "jaw"
    P.sphere("jaw", (0, -0.57, 0.455), (0.1, 0.065, 0.04), W, J, seg=14, rings=8)
    P.sphere("mouth", (0, -0.6, 0.48), (0.085, 0.03, 0.02), M["pink"], J, seg=12, rings=6)
    P.sphere("tongue", (0.0, -0.62, 0.47), (0.035, 0.03, 0.012), M["tongue"], J, seg=10, rings=6)
    for i, x in enumerate((-0.06, -0.025, 0.0, 0.025, 0.06)):
        big = abs(x) > 0.05
        P.cyl(f"tooth{i}", (x, -0.632, 0.49 + (0.008 if big else 0)), 0.009 if big else 0.006, 0.0, 0.03 if big else 0.016, M["tooth"], J, verts=6)

    meshes = {"Dan": P.join("Dan")}
    bones = [
        ("root", (0, 0, 0), (0, 0, 0.1), None),
        ("spine", (0, 0.3, 0.4), (0, -0.3, 0.4), "root"),
        ("head", (0, -0.32, 0.55), (0, -0.55, 0.55), "spine"),
        ("jaw", (0, -0.48, 0.47), (0, -0.62, 0.47), "head"),
        ("tail", (0, 0.32, 0.45), (0, 0.32, 0.55), "spine"),
    ]
    for name, (x, y, z) in LEGS.items():
        bones.append((f"{name}.up", (x, y, z), (x, y, 0.18), "spine"))
        bones.append((f"{name}.lo", (x, y, 0.18), (x, y, 0.02), f"{name}.up"))
    rig = lib.armature("DanRig", bones)
    lib.bind(meshes["Dan"], rig)
    return rig, meshes


def animate(rig):
    A = lib.Anim(rig)
    # Walk: 24-frame lateral-sequence walk (LH, LF, RH, RF a quarter cycle apart); the app sets timeScale
    phase = {"hl.L": 0.0, "fl.L": 0.25, "hl.R": 0.5, "fl.R": 0.75}
    N = 24
    for f in range(0, N + 1, 2):
        u = f / N
        for name, ph in phase.items():
            w = 2 * math.pi * (u - ph)
            swing = 0.42 * math.sin(w)
            lift = max(0.0, math.cos(w)) ** 1.5
            front = name.startswith("f")
            A.key(f"{name}.up", "rotation_euler", f + 1, (swing + (0.15 * lift if front else -0.1 * lift), 0, 0))
            A.key(f"{name}.lo", "rotation_euler", f + 1, ((-0.9 if front else -0.7) * lift, 0, 0))
        A.key("root", "location", f + 1, (0, 0.012 * math.cos(4 * math.pi * u), 0))
        A.key("spine", "rotation_euler", f + 1, (0, 0.05 * math.sin(2 * math.pi * u), 0))
        A.key("head", "rotation_euler", f + 1, (0.03 * math.cos(4 * math.pi * u), 0.04 * math.sin(2 * math.pi * u), 0))
        A.key("tail", "rotation_euler", f + 1, (0, 0, 0.5 * math.sin(4 * math.pi * u)))
        A.key("jaw", "rotation_euler", f + 1, (-0.12, 0, 0))
    A.push("Walk")

    # Idle: 120 frames, panting jaw, slow look left and right, breathing, tail wag
    for f in range(1, 122, 4):
        u = (f - 1) / 120
        A.key("jaw", "rotation_euler", f, (-0.1 - 0.12 * (0.5 + 0.5 * math.sin(2 * math.pi * 12 * u)), 0, 0))
        A.key("spine", "scale", f, (1 + 0.02 * math.sin(2 * math.pi * 12 * u), 1, 1 + 0.02 * math.sin(2 * math.pi * 12 * u)))
        A.key("tail", "rotation_euler", f, (0, 0, 0.45 * math.sin(2 * math.pi * 10 * u)))
    for f, yaw in ((1, 0), (20, 0), (40, 0.55), (60, 0.55), (80, -0.5), (100, -0.5), (121, 0)):
        A.key("head", "rotation_euler", f, (0, 0, yaw))
    A.push("Idle")

    # Sit: hindquarters down, chest up, front legs straight
    for f in (1, 31):
        A.key("root", "location", f, (0, -0.2, 0))
        A.key("spine", "rotation_euler", f, (0.45, 0, 0))
        A.key("head", "rotation_euler", f, (-0.35, 0, 0))
        A.key("jaw", "rotation_euler", f, (-0.15, 0, 0))
        for s in ("L", "R"):
            A.key(f"fl.{s}.up", "rotation_euler", f, (-0.45, 0, 0))
            A.key(f"hl.{s}.up", "rotation_euler", f, (1.3, 0, 0))
            A.key(f"hl.{s}.lo", "rotation_euler", f, (-1.5, 0, 0))
    A.push("Sit")
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 120


if __name__ == "__main__":
    rig, meshes = build()
    animate(rig)
    print("[dan] triangles", lib.tris(list(meshes.values())))
    lib.export(os.path.join(lib.MODELS, "handsome_dan.glb"), [rig] + list(meshes.values()))
    lib.clips_preview(rig, "dan", [
        ("Idle", 1, (0, -0.1, 0.4), 2.2, -40, 0.25, ""),
        ("Idle", 1, (0, -0.5, 0.56), 0.9, 0, 0.0, "_face"),
        ("Idle", 1, (0, -0.45, 0.4), 0.7, -20, 0.0, "_collar"),
        ("Idle", 45, (0, -0.1, 0.4), 2.2, 20, 0.25, ""),
        ("Walk", 1, (0, 0, 0.35), 2.2, -90, 0.1, ""),
        ("Walk", 7, (0, 0, 0.35), 2.2, -90, 0.1, ""),
        ("Walk", 13, (0, 0, 0.35), 2.2, -90, 0.1, ""),
        ("Sit", 1, (0, 0, 0.4), 2.2, -60, 0.2, ""),
    ])
