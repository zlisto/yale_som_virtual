# Labubu (Pop Mart, The Monsters). Headless:
#   blender -b -P tools/blender/labubu.py               -> public/models/labubu.glb + labubu_seated.glb
#   blender -b -P tools/blender/labubu.py -- costume=frog  (froggy.py calls build() with costume="frog")
# The skinned GLB holds one shared body plus toggled sub-meshes: Face_grin / Face_surprised / Face_sleepy,
# Tee, Hoodie (and FrogHood / Paper for the frog costume). Fur and shirt materials are near-white so the
# app tints them per character. The seated GLB holds six static meshes, seated_<face>_<clothes>.
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
from mathutils import Vector

# Proportions (meters, the app scales the root): feet at z=0, ear tips near 1.15.
HEAD_C, HEAD_R = (0.0, 0.0, 0.74), (0.31, 0.28, 0.285)
FACE_C, FACE_R = (0.0, -0.105, 0.712), (0.215, 0.2, 0.19)
BODY_C, BODY_R = (0.0, 0.0, 0.33), (0.19, 0.17, 0.22)
FACES = ("grin", "surprised", "sleepy")
SKINNED_LOD, SEATED_LOD = 0.6, 0.4  # budgets: a visible skinned Labubu < 12k triangles, a seated variant < 5k
CLOTHES = ("tee", "hoodie")

BONES = [
    ("root", (0, 0, 0), (0, 0, 0.1), None),
    ("spine", (0, 0, 0.14), (0, 0, 0.5), "root"),
    ("head", (0, 0, 0.5), (0, 0, 0.98), "spine"),
    ("ear.L", (0.12, 0.02, 0.92), (0.19, 0.02, 1.15), "head"),
    ("ear.R", (-0.12, 0.02, 0.92), (-0.19, 0.02, 1.15), "head"),
    ("eye.L", (0.1, -0.27, 0.745), (0.1, -0.27, 0.81), "head"),
    ("eye.R", (-0.1, -0.27, 0.745), (-0.1, -0.27, 0.81), "head"),
    ("arm.L", (0.16, 0, 0.5), (0.27, 0, 0.3), "spine"),
    ("arm.R", (-0.16, 0, 0.5), (-0.27, 0, 0.3), "spine"),
    ("leg.L", (0.085, 0, 0.2), (0.085, 0, 0.0), "root"),
    ("leg.R", (-0.085, 0, 0.2), (-0.085, 0, 0.0), "root"),
    ("paper", (0, -0.2, 0.3), (0, -0.2, 0.4), "spine"),
]


def materials():
    M = {
        "fur": lib.mat("Fur", (0.92, 0.92, 0.92), 1.0, fur_bump=True),
        "skin": lib.mat("Skin", lib.hexrgb("#f7c4a5"), 0.55),
        "pink": lib.mat("Pink", lib.hexrgb("#f29aa6"), 0.6),
        "white": lib.mat("White", (0.97, 0.97, 0.95), 0.35),
        "dark": lib.mat("Dark", lib.hexrgb("#24140e"), 0.45),
        "mouth": lib.mat("Mouth", lib.hexrgb("#3a120f"), 0.6),
        "iris": lib.mat("Iris", lib.hexrgb("#24140e"), 0.15),
        "eyewhite": lib.mat("EyeWhite", (0.97, 0.97, 0.95), 0.25),
        "glint": lib.mat("EyeGlint", (1, 1, 1), 0.1, emit=(1, 1, 1)),
        "teeth": lib.mat("Teeth", (0.97, 0.96, 0.92), 0.3),
        "shirt": lib.mat("Shirt", (0.92, 0.92, 0.92), 0.85),
        "print": lib.mat("Print", (0.98, 0.98, 0.98), 0.7),
        "frog": lib.mat("Frog", lib.hexrgb("#5fb548"), 0.9, fur_bump=True),
        "paper": lib.mat("Paper", (0.96, 0.95, 0.9), 0.9),
        "ink": lib.mat("Ink", (0.15, 0.15, 0.2), 0.9),
    }
    return M


def face_pt(x, z, off):
    return lib.ellipsoid_front(FACE_C, FACE_R, x, z, off)


def body(P, M, costume):
    """Shared fur body, face skin, ears, limbs."""
    fur = M["fur"]
    for s, side in ((1, "L"), (-1, "R")):
        P.sphere(f"leg.{side}", (0.085 * s, -0.005, 0.1), (0.072, 0.075, 0.115), fur, f"leg.{side}", seg=12, rings=8, displace=0.006)
        P.sphere(f"foot.{side}", (0.088 * s, -0.04, 0.035), (0.07, 0.095, 0.045), fur, f"leg.{side}", seg=12, rings=8)
        P.sphere(f"arm.{side}", (0.225 * s, -0.005, 0.4), (0.05, 0.055, 0.12), fur, f"arm.{side}", rot=(0, 0.5 * s, 0), seg=12, rings=8, displace=0.006)
        P.sphere(f"paw.{side}", (0.27 * s, -0.02, 0.305), (0.045, 0.045, 0.045), fur, f"arm.{side}", seg=10, rings=6)
        if costume != "frog":
            # tall pointed ears, tilted out, pink inner ear facing forward
            P.sphere(f"ear.{side}", (0.14 * s, 0.03, 1.04), (0.07, 0.04, 0.25), fur, f"ear.{side}", rot=(0.08, -0.17 * s, 0), seg=12, rings=10, taper=(0.1, 0.72), displace=0.005)
            P.sphere(f"earin.{side}", (0.136 * s, -0.004, 1.03), (0.042, 0.02, 0.19), M["pink"], f"ear.{side}", rot=(0.08, -0.17 * s, 0), seg=10, rings=8, taper=(0.1, 0.72))
    P.sphere("body", BODY_C, BODY_R, fur, "spine", seg=18, rings=12, displace=0.012)
    hood = M["frog"] if costume == "frog" else fur
    P.sphere("head", HEAD_C, HEAD_R, hood, "head", seg=28, rings=16, displace=0.016)
    P.sphere("face", FACE_C, FACE_R, M["skin"], "head", seg=24, rings=14)
    # the fur hood's rim framing the bare face: the Labubu signature
    P.torus("hoodrim", (0, -0.215, 0.712), 0.2, 0.034, hood, "head", rot=(math.pi / 2, 0, 0), seg=28, minor=7, scale=(1.04, 1, 0.98))
    # blush + tiny nose
    for s in (1, -1):
        p = face_pt(0.145 * s, 0.66, 0.0)
        P.sphere(f"blush{s}", p, (0.035, 0.012, 0.022), M["pink"], "head", seg=10, rings=6)
    P.sphere("nose", face_pt(0, 0.685, 0.0), (0.016, 0.012, 0.011), M["pink"], "head", seg=10, rings=6)
    if costume == "frog":
        hood = M["frog"]
        for s in (1, -1):
            P.sphere(f"frogeye{s}", (0.12 * s, -0.05, 1.0), (0.085, 0.08, 0.075), hood, "head", seg=16, rings=10)
            P.sphere(f"frogwhite{s}", (0.12 * s, -0.115, 1.02), (0.055, 0.03, 0.05), M["eyewhite"], "head", seg=12, rings=8)
            P.sphere(f"frogpupil{s}", (0.12 * s, -0.14, 1.02), (0.022, 0.012, 0.03), M["iris"], "head", seg=10, rings=6)


def eyes(P, M, face):
    """Big round widely spaced eyes on the eye bones (blink = scale the eye bone)."""
    big = 1.18 if face == "surprised" else 1.0
    iris = 0.6 if face == "surprised" else 0.86
    for s, side in ((1, "L"), (-1, "R")):
        x, z = 0.1 * s, 0.745
        bone = f"eye.{side}"
        c = face_pt(x, z, 0.004)
        P.sphere(f"sclera.{side}", c, (0.062 * big, 0.022, 0.07 * big), M["eyewhite"], bone, seg=16, rings=10)
        ci = face_pt(x + 0.003 * s, z - 0.003, 0.022)
        P.sphere(f"iris.{side}", ci, (0.05 * big * iris, 0.008, 0.058 * big * iris), M["iris"], bone, seg=16, rings=10)
        for dx, dz, r in ((-0.014, 0.018, 0.012), (0.012, -0.018, 0.0055)):
            P.sphere(f"glint.{side}{r}", face_pt(x + dx * s, z + dz, 0.031), (r, 0.004, r), M["glint"], bone, seg=8, rings=4, subd=0)
        if face == "sleepy":
            # heavy lid: skin dome over the top half of each eye, with a dark lash line at its edge
            lid = P.sphere(f"lid.{side}", face_pt(x, z + 0.012, 0.012), (0.07, 0.03, 0.06), M["skin"], bone, seg=16, rings=10)
            import bmesh
            bm = bmesh.new()
            bm.from_mesh(lid.data)
            cz = face_pt(x, z + 0.012, 0.012).z - 0.005
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, cz), plane_no=(0, 0, 1), clear_inner=True)
            bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
            bm.to_mesh(lid.data)
            bm.free()
            pts = []
            for i in range(9):
                u = (i / 8) * 2 - 1
                pts.append((x + 0.068 * u, cz - 0.004 * (1 - u * u)))
            lash = []
            for px, pz in pts:
                lash.append(face_pt(px, pz + 0.004, 0.03))
                lash.append(face_pt(px, pz - 0.004, 0.03))
            faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(8)]
            P.poly(f"lash.{side}", lash, faces, M["dark"], bone)


def grin(P, M, width=0.15, z0=0.62, depth=0.05, up=0.035, n_teeth=9, name="grin"):
    """Wide upturned dark mouth with exactly `n_teeth` separate pointed white teeth along the top lip."""
    N = 24
    top, bot = [], []
    for i in range(N + 1):
        u = (i / N) * 2 - 1
        x = width * u
        zt = z0 + up * u * u
        zb = zt - depth * (1 - u * u) ** 0.8 - 0.004
        top.append((x, zt))
        bot.append((x, zb))
    verts = [face_pt(x, z, 0.004) for x, z in top] + [face_pt(x, z, 0.004) for x, z in bot]
    faces = [(i, i + 1, N + 2 + i, N + 1 + i) for i in range(N)]
    P.poly(f"{name}.mouth", verts, faces, M["mouth"], "head", smooth=True)
    # teeth: triangles hanging from the top lip, gaps between them so they read as separate
    span = 2 * width * 0.9
    step = span / n_teeth
    tv, tf = [], []
    for k in range(n_teeth):
        xc = -span / 2 + step * (k + 0.5)
        u = xc / width
        zt = z0 + up * u * u + 0.003
        local_depth = depth * (1 - u * u) ** 0.8
        h = max(0.014, local_depth * 0.62)
        w = step * 0.4
        a = face_pt(xc - w, zt + 0.002 + up * 2 * u * (-w / width), 0.009)
        b = face_pt(xc + w, zt + 0.002 + up * 2 * u * (w / width), 0.009)
        c = face_pt(xc, zt - h, 0.009)
        base = len(tv)
        tv += [a, b, c]
        tf.append((base, base + 2, base + 1))
    P.poly(f"{name}.teeth", tv, tf, M["teeth"], "head")


def surprised_mouth(P, M):
    N = 20
    c, rx, rz = (0.0, 0.6), 0.045, 0.055
    ring = [face_pt(c[0] + rx * math.cos(2 * math.pi * i / N), c[1] + rz * math.sin(2 * math.pi * i / N), 0.004) for i in range(N)]
    centre = face_pt(c[0], c[1], 0.004)
    verts = ring + [centre]
    faces = [(N, (i + 1) % N, i) for i in range(N)]
    P.poly("surprised.mouth", verts, faces, M["mouth"], "head", smooth=True)
    tv, tf = [], []
    for k in range(4):  # four little teeth on the top edge
        xc = -0.027 + k * 0.018
        zt = c[1] + rz * math.sqrt(max(0, 1 - (xc / rx) ** 2)) - 0.004
        base = len(tv)
        tv += [face_pt(xc - 0.007, zt, 0.008), face_pt(xc + 0.007, zt, 0.008), face_pt(xc, zt - 0.02, 0.008)]
        tf.append((base, base + 2, base + 1))
    P.poly("surprised.teeth", tv, tf, M["teeth"], "head")


def face_parts(P, M, face):
    eyes(P, M, face)
    if face == "grin":
        grin(P, M)
    elif face == "sleepy":
        grin(P, M, width=0.12, z0=0.625, depth=0.035, up=0.025, name="sleepy")
    else:
        surprised_mouth(P, M)


def body_pt(x, z, off):
    return lib.ellipsoid_front(BODY_C, (BODY_R[0] + 0.012, BODY_R[1] + 0.012, BODY_R[2]), x, z, off)


def clothes_parts(P, M, kind):
    sh = M["shirt"]
    if kind == "tee":
        P.cyl("tee.band", (0, 0, 0.36), 0.205, 0.17, 0.19, sh, "spine", verts=30, scale=(1, 0.93, 1), cap=False)
        P.cyl("tee.hem", (0, 0, 0.27), 0.2, 0.208, 0.02, sh, "spine", verts=30, scale=(1, 0.93, 1), cap=False)
        for s, side in ((1, "L"), (-1, "R")):
            P.cyl(f"tee.sleeve.{side}", (0.2 * s, -0.004, 0.45), 0.062, 0.055, 0.08, sh, f"arm.{side}", rot=(0, 0.5 * s, 0), verts=14)
    else:
        P.cyl("hoodie.band", (0, 0, 0.33), 0.212, 0.172, 0.27, sh, "spine", verts=30, scale=(1, 0.93, 1), cap=False)
        P.torus("hoodie.cuffs", (0, 0, 0.2), 0.2, 0.018, sh, "spine", seg=20, minor=6, scale=(1, 0.93, 1))
        for s, side in ((1, "L"), (-1, "R")):
            P.cyl(f"hoodie.sleeve.{side}", (0.225 * s, -0.005, 0.395), 0.06, 0.052, 0.19, sh, f"arm.{side}", rot=(0, 0.5 * s, 0), verts=14)
        # the hood, down: a soft roll behind the neck under the ears
        P.sphere("hoodie.hood", (0, 0.12, 0.5), (0.17, 0.09, 0.08), sh, "spine", seg=14, rings=8)
        P.sphere("hoodie.pocket", body_pt(0, 0.25, 0.006), (0.09, 0.012, 0.035), sh, "spine", seg=10, rings=6)
    # MGT 409 printed on the chest
    z = 0.385 if kind == "tee" else 0.37

    def place(v):
        p = body_pt(v.x, z + v.z, 0.012)
        return p
    P.text(f"{kind}.print", "MGT 409", M["print"], "spine", 0.05, place)


def frog_extras(P, M):
    # a sheet of paper on the paper bone, with lines of ink on the side facing the reader
    pw, ph = 0.2, 0.26
    c = Vector((0, -0.2, 0.35))
    P.box("paper.sheet", c, (pw, 0.004, ph), M["paper"], "paper")
    for i in range(7):
        P.box(f"paper.line{i}", c + Vector((0, 0.003, ph * 0.35 - i * 0.035)), (pw * 0.75, 0.002, 0.008), M["ink"], "paper")


def build_rig_and_meshes(costume="none", lod=1.0, subd=0, detail_subd=None):
    lib.reset()
    M = materials()
    P = lib.Parts(lod, subd)
    body(P, M, costume)
    meshes = {"Body": P.join("Body")}
    P.subd = subd if detail_subd is None else detail_subd  # faces and clothes (the seated crowd skips it)
    for f in FACES:
        face_parts(P, M, f)
        meshes[f"Face_{f}"] = P.join(f"Face_{f}")
    for c in CLOTHES:
        clothes_parts(P, M, c)
        meshes[c.capitalize()] = P.join(c.capitalize())
    if costume == "frog":
        frog_extras(P, M)
        meshes["Paper"] = P.join("Paper")
    rig = lib.armature("LabubuRig", BONES)
    for o in meshes.values():
        lib.bind(o, rig)
    return rig, meshes, M


def animate(rig, costume="none"):
    A = lib.Anim(rig)
    # Idle: 120 frames, breathe, ear twitches, one blink
    A.reset()
    for f, s in ((1, 1.0), (31, 1.03), (61, 1.0), (91, 1.03), (121, 1.0)):
        A.key("spine", "scale", f, (1 + (s - 1) * 0.6, s, 1 + (s - 1) * 0.6))
        A.key("head", "rotation_euler", f, ((s - 1) * 1.2, 0, 0))
    for side, sgn, st in (("L", 1, 40), ("R", -1, 86)):
        A.keys(f"ear.{side}", "rotation_euler", [(1, (0, 0, 0)), (st, (0, 0, 0)), (st + 3, (0, 0, -0.3 * sgn)), (st + 6, (0, 0, 0.1 * sgn)), (st + 9, (0, 0, 0)), (121, (0, 0, 0))])
    for side in ("L", "R"):
        A.keys(f"eye.{side}", "scale", [(1, (1, 1, 1)), (70, (1, 1, 1)), (73, (1, 0.1, 1)), (76, (1, 1, 1)), (121, (1, 1, 1))])
        A.keys(f"arm.{side}", "rotation_euler", [(1, (0, 0, 0)), (61, (0.08, 0, 0)), (121, (0, 0, 0))])
    if costume == "frog":
        A.keys("paper", "location", [(1, (-0.31, -0.03, -0.17))])  # held edge-on at the right paw
        A.keys("paper", "rotation_euler", [(1, (0, 1.45, 0))])
    A.push("Idle")

    # Hop: 30 frames, squash, stretch, air, land
    for f, h, sc in ((1, 0, (1, 1, 1)), (5, 0, (1.14, 0.82, 1.14)), (9, 0.12, (0.92, 1.15, 0.92)), (15, 0.25, (1, 1, 1)),
                     (21, 0.12, (0.94, 1.08, 0.94)), (24, 0, (1.16, 0.8, 1.16)), (28, 0, (0.98, 1.03, 0.98)), (31, 0, (1, 1, 1))):
        A.key("root", "location", f, (0, h, 0))
        A.key("root", "scale", f, sc)
    for f, a in ((1, 0), (5, -0.3), (9, 0.5), (15, 0.6), (24, -0.3), (31, 0)):
        A.key("ear.L", "rotation_euler", f, (a, 0, 0))
        A.key("ear.R", "rotation_euler", f, (a, 0, 0))
        A.key("arm.L", "rotation_euler", f, (0, 0, a * 1.6))
        A.key("arm.R", "rotation_euler", f, (0, 0, -a * 1.6))
    A.push("Hop")

    # Sit: static pose (legs forward, paws on the lap); two keys so it is a valid clip
    for f in (1, 31):
        A.key("leg.L", "rotation_euler", f, (1.5, 0, 0.05))
        A.key("leg.R", "rotation_euler", f, (1.5, 0, -0.05))
        A.key("arm.L", "rotation_euler", f, (0.8, 0, -0.25))
        A.key("arm.R", "rotation_euler", f, (0.8, 0, 0.25))
    A.push("Sit")

    # Wave: right arm up and waving, 40 frames
    for f, w in ((1, 0), (11, 1), (21, -1), (31, 1), (41, 0)):
        A.key("arm.R", "rotation_euler", f, (0.35, 0.0, -1.55 - 0.3 * w))
        A.key("arm.R", "scale", f, (1, 1.3, 1))
        A.key("head", "rotation_euler", f, (0, 0, 0.06 * w))
        A.key("spine", "rotation_euler", f, (0, 0.04 * w, 0))
    A.push("Wave")

    # SitWave: seated with the right arm waving (meeting-room Labubus)
    for f, w in ((1, 0), (11, 1), (21, -1), (31, 1), (41, 0)):
        A.key("leg.L", "rotation_euler", f, (1.5, 0, 0.05))
        A.key("leg.R", "rotation_euler", f, (1.5, 0, -0.05))
        A.key("arm.L", "rotation_euler", f, (0.8, 0, -0.25))
        A.key("arm.R", "rotation_euler", f, (0.35, 0, -1.55 - 0.3 * w))
        A.key("arm.R", "scale", f, (1, 1.3, 1))
    A.push("SitWave")

    # Dance: 40 frames, sway, bounce, arms up and pumping
    for f, k in ((1, 0), (11, 1), (21, 0), (31, -1), (41, 0)):
        A.key("spine", "rotation_euler", f, (0, 0.18 * k, 0))
        A.key("root", "location", f, (0, 0.04 * abs(math.sin(k * math.pi / 2)) if k == 0 else 0.0, 0))
        A.key("arm.L", "rotation_euler", f, (0.35, 0, 1.45 + 0.3 * k))
        A.key("arm.R", "rotation_euler", f, (0.35, 0, -1.45 + 0.3 * k))
        A.key("arm.L", "scale", f, (1, 1.25, 1))
        A.key("arm.R", "scale", f, (1, 1.25, 1))
        A.key("head", "rotation_euler", f, (0, 0, -0.12 * k))
    A.push("Dance")

    # Catch: arms reach up together, 48 frames (matches the 1.6 s toss)
    for f, k in ((1, 0), (25, 1), (49, 0)):
        A.key("arm.L", "rotation_euler", f, (0, 0, 0.8 + 1.1 * k))
        A.key("arm.R", "rotation_euler", f, (0, 0, -0.8 - 1.1 * k))
        A.key("arm.L", "scale", f, (1, 1 + 0.15 * k, 1))
        A.key("arm.R", "scale", f, (1, 1 + 0.15 * k, 1))
        A.key("root", "location", f, (0, 0.05 * k, 0))
        A.key("head", "rotation_euler", f, (-0.25 * k, 0, 0))
    A.push("Catch")
    life_clips(A)

    if costume == "frog":
        # Read: paper up in front of the face (below the eyes), paws holding its edges, small head bob
        for f, b in ((1, 0), (31, 1), (61, 0)):
            A.key("paper", "location", f, (0, 0.26 + 0.006 * b, 0.17))
            A.key("paper", "rotation_euler", f, (0.12, 0, 0))
            A.key("arm.L", "rotation_euler", f, (1.55, 0, -0.4))
            A.key("arm.R", "rotation_euler", f, (1.55, 0, 0.4))
            A.key("head", "rotation_euler", f, (0.12 + 0.03 * b, 0, 0))
        A.push("Read")
    lib.bpy.context.scene.frame_start, lib.bpy.context.scene.frame_end = 1, 120


SIT_LEGS = (("leg.L", (1.5, 0, 0.05)), ("leg.R", (1.5, 0, -0.05)))
LAP_L, LAP_R = (0.8, 0, -0.25), (0.8, 0, 0.25)


def sit_legs(A, frames):
    for f in frames:
        for b, v in SIT_LEGS:
            A.key(b, "rotation_euler", f, v)


def life_clips(A):
    """Clips for the living building (src/life, LabubuCrowd extras). Bone axes (lib.armature): arms and legs
    swing forward about local X; arm.R raises sideways with negative local Z, arm.L with positive; head and
    spine nod about X (positive is down), turn about Y (positive turns toward the character's left)."""
    # RaiseHand: seated, right arm up beside the head with the paw above the ear tips, a small eager wave,
    # left paw on the lap, 60 frames (loops). The head is far wider than the shoulders, so the body leans away
    # from the raised arm (spine about -Z, toward the left) and the arm is stretched to reach past the ears.
    sit_legs(A, (1, 61))
    for f, w in ((1, 0), (16, 1), (31, 0), (46, -1), (61, 0)):
        A.key("arm.R", "rotation_euler", f, (0.35, 0, -2.3 - 0.1 * w))
        A.key("arm.R", "scale", f, (1.35, 3.4, 1.35))  # thicker too, so it reads from the back row
        A.key("arm.L", "rotation_euler", f, LAP_L)
        A.key("spine", "rotation_euler", f, (-0.05, 0, -0.22 + 0.02 * w))
        A.key("head", "rotation_euler", f, (-0.1, 0, 0.04 * w))
        A.key("root", "location", f, (0, 0.03 + 0.012 * abs(w), 0))
    A.push("RaiseHand")

    # Nod: seated, two nods in 40 frames
    sit_legs(A, (1, 41))
    for f, k in ((1, 0), (8, 1), (16, 0), (26, 1), (34, 0), (41, 0)):
        A.key("head", "rotation_euler", f, (0.28 * k, 0, 0))
        A.key("arm.L", "rotation_euler", f, LAP_L)
        A.key("arm.R", "rotation_euler", f, LAP_R)
    A.push("Nod")

    # Type: seated, paws forward on the laptop tapping in turn, head down at the screen, 20 frames
    sit_legs(A, (1, 21))
    for f, k in ((1, 0), (6, 1), (11, 0), (16, -1), (21, 0)):
        A.key("arm.L", "rotation_euler", f, (1.25 + 0.12 * max(k, 0), 0, -0.3))
        A.key("arm.R", "rotation_euler", f, (1.25 + 0.12 * max(-k, 0), 0, 0.3))
        A.key("head", "rotation_euler", f, (0.22 + 0.02 * abs(k), 0, 0))
        A.key("spine", "rotation_euler", f, (0.06, 0, 0))
    A.push("Type")

    # Yawn: seated, head back, both arms stretch up, eyes squeezed, 60 frames
    sit_legs(A, (1, 61))
    for f, k in ((1, 0), (14, 1), (40, 1), (54, 0), (61, 0)):
        A.key("head", "rotation_euler", f, (-0.38 * k, 0, 0.06 * k))
        A.key("spine", "rotation_euler", f, (-0.1 * k, 0, 0))
        A.key("arm.L", "rotation_euler", f, (0.8 - 0.6 * k, 0, -0.25 + 2.35 * k))
        A.key("arm.R", "rotation_euler", f, (0.8 - 0.6 * k, 0, 0.25 - 2.35 * k))
        A.key("arm.L", "scale", f, (1, 1 + 0.25 * k, 1))
        A.key("arm.R", "scale", f, (1, 1 + 0.25 * k, 1))
        for side in ("L", "R"):
            A.key(f"eye.{side}", "scale", f, (1, 1 - 0.8 * k, 1))
    A.push("Yawn")

    # Whisper: seated, leans and turns to the neighbor on its left, left paw cupped by the face, 60 frames
    sit_legs(A, (1, 61))
    for f, k in ((1, 0), (10, 1), (25, 0.8), (40, 1), (52, 1), (61, 0)):
        A.key("spine", "rotation_euler", f, (0, 0.4 * k, -0.18 * k))
        A.key("head", "rotation_euler", f, (0.05 * k, 0.61 * k, -0.12 * k + 0.03 * math.sin(f)))  # head turned 35 degrees
        A.key("arm.L", "rotation_euler", f, (0.8 + 1.0 * k, 0, -0.25 + 0.55 * k))
        A.key("arm.R", "rotation_euler", f, LAP_R)
    A.push("Whisper")

    # Stretch: a seated student stands up on the seat (legs straighten, feet on the cushion), stretches both
    # arms high with a sway, and sits back down; 72 frames, played once. Standing on the floor would hide it
    # behind the desk, so it stands on the chair.
    for f, k, sw in ((1, 0, 0), (12, 1, 0), (24, 1, 1), (36, 1, -1), (48, 1, 0), (62, 0, 0), (73, 0, 0)):
        A.key("leg.L", "rotation_euler", f, (1.5 * (1 - k), 0, 0.05))
        A.key("leg.R", "rotation_euler", f, (1.5 * (1 - k), 0, -0.05))
        A.key("root", "location", f, (0, 0.13 * k, 0))
        # arms in a wide V beside the head (straight up hides them behind it)
        A.key("arm.L", "rotation_euler", f, (0.8 - 0.55 * k, 0, -0.25 + 2.2 * k))
        A.key("arm.R", "rotation_euler", f, (0.8 - 0.55 * k, 0, 0.25 - 2.2 * k))
        A.key("arm.L", "scale", f, (1, 1 + 2.0 * k, 1))
        A.key("arm.R", "scale", f, (1, 1 + 2.0 * k, 1))
        A.key("spine", "rotation_euler", f, (-0.08 * k, 0, 0.14 * sw))
        A.key("head", "rotation_euler", f, (-0.2 * k, 0, 0.1 * sw))
    A.push("Stretch")

    # Walk: bouncy two-leg walk, 24 frames (two steps); the root bobs on every step
    for i in range(0, 25, 3):
        u = i / 24
        s = math.sin(2 * math.pi * u)
        f = i + 1
        A.key("leg.L", "rotation_euler", f, (0.55 * s, 0, 0))
        A.key("leg.R", "rotation_euler", f, (-0.55 * s, 0, 0))
        A.key("arm.L", "rotation_euler", f, (-0.45 * s, 0, 0.12))
        A.key("arm.R", "rotation_euler", f, (0.45 * s, 0, -0.12))
        A.key("root", "location", f, (0, 0.035 * abs(math.sin(2 * math.pi * u)), 0))
        A.key("spine", "rotation_euler", f, (0.04, 0.08 * s, 0.04 * s))
        A.key("head", "rotation_euler", f, (0.03 * abs(s), -0.05 * s, -0.03 * s))
        A.key("ear.L", "rotation_euler", f, (0.12 * abs(s), 0, -0.08 * s))
        A.key("ear.R", "rotation_euler", f, (0.12 * abs(s), 0, -0.08 * s))
    A.push("Walk")

    # Throw: backhand disc throw with the right paw, 20 frames: wind up across the chest, then snap out
    for f, arm, spine, root in ((1, (0.2, 0, 0), (0, 0, 0), 0), (7, (0.9, 0, 0.6), (0, 0.55, 0), 0.0),
                                (11, (0.75, 0, -1.2), (0, -0.25, 0), 0.03), (14, (0.5, 0, -1.55), (0, -0.45, 0), 0.02),
                                (21, (0.2, 0, -0.1), (0, 0, 0), 0)):
        A.key("arm.R", "rotation_euler", f, arm)
        A.key("arm.R", "scale", f, (1, 1.25, 1))
        A.key("spine", "rotation_euler", f, spine)
        A.key("root", "location", f, (0, root, 0))
        A.key("arm.L", "rotation_euler", f, (0.2, 0, 0.35 + 0.3 * abs(spine[1])))
        A.key("head", "rotation_euler", f, (0, -spine[1] * 0.6, 0))
    A.push("Throw")

    # Cast: wand flick with the right paw, 18 frames: lift, then snap the wand forward and down
    # (a forward-up arm hides in the big head, so the lift goes up and out to the side)
    for f, arm, sc, k in ((1, (1.0, 0, -0.6), 1.3, 0), (6, (0.4, 0, -2.0), 1.6, 1), (10, (1.3, 0, -0.7), 1.45, -1),
                          (13, (1.2, 0, -0.55), 1.4, -1), (19, (1.0, 0, -0.6), 1.3, 0)):
        A.key("arm.R", "rotation_euler", f, arm)
        A.key("arm.R", "scale", f, (1, sc, 1))
        A.key("arm.L", "rotation_euler", f, (0.25, 0, 0.3))
        A.key("head", "rotation_euler", f, (0.06 * max(-k, 0) - 0.06 * max(k, 0), 0, 0))
        A.key("spine", "rotation_euler", f, (0.1 * max(-k, 0) - 0.05 * max(k, 0), 0, 0.06 * k))
        A.key("root", "location", f, (0, 0.03 * max(k, 0), 0))
    A.push("Cast")

    # SitRead: seated with a book in both paws, head down; the right paw turns a page at frame 70, 90 frames
    sit_legs(A, (1, 91))
    for f, k in ((1, 0), (62, 0), (70, 1), (78, 0), (91, 0)):
        A.key("arm.L", "rotation_euler", f, (1.15, 0, -0.45))
        A.key("arm.R", "rotation_euler", f, (1.15 + 0.2 * k, 0, 0.45 - 0.9 * k))
        A.key("head", "rotation_euler", f, (0.3, 0.08 * k, 0))
    A.push("SitRead")

    # Sleep: seated, chin down and to one side, slow breathing, eyes shut, 120 frames
    sit_legs(A, (1, 121))
    for f, b in ((1, 0), (61, 1), (121, 0)):
        A.key("head", "rotation_euler", f, (0.42 + 0.04 * b, 0, 0.22))
        A.key("spine", "scale", f, (1 + 0.02 * b, 1 + 0.03 * b, 1 + 0.02 * b))
        A.key("spine", "rotation_euler", f, (0.12, 0, 0.05))
        A.key("arm.L", "rotation_euler", f, LAP_L)
        A.key("arm.R", "rotation_euler", f, LAP_R)
        A.key("ear.L", "rotation_euler", f, (0.2, 0, 0.25))
        A.key("ear.R", "rotation_euler", f, (0.2, 0, -0.1))
        for side in ("L", "R"):
            A.key(f"eye.{side}", "scale", f, (1, 0.12, 1))
    A.push("Sleep")

    # Phone: standing, right paw holds a phone up in front of the chest, head down, thumb taps, 60 frames
    for f, k in ((1, 0), (10, 1), (20, 0), (40, 0), (46, 1), (52, 0), (61, 0)):
        A.key("arm.R", "rotation_euler", f, (1.35 + 0.05 * k, 0, 0.35))
        A.key("arm.L", "rotation_euler", f, (1.2 + 0.08 * k, 0, -0.45))
        A.key("head", "rotation_euler", f, (0.35, 0, 0.04 * k))
    A.push("Phone")

    # Talk: standing, gestures with one paw then the other, head bobbing, 48 frames
    for f, k in ((1, 0), (9, 1), (17, 0), (25, -1), (33, 0), (41, 1), (49, 0)):
        A.key("arm.R", "rotation_euler", f, (0.6 + 0.4 * max(k, 0), 0, -0.4 - 0.5 * max(k, 0)))
        A.key("arm.L", "rotation_euler", f, (0.6 + 0.4 * max(-k, 0), 0, 0.4 + 0.5 * max(-k, 0)))
        A.key("head", "rotation_euler", f, (0.08 * abs(k) - 0.05, 0.1 * k, 0))
        A.key("root", "location", f, (0, 0.012 * abs(k), 0))
    A.push("Talk")

    # Look: standing, looks left, then right, then back (head and a little spine), 120 frames
    for f, k in ((1, 0), (20, 1), (45, 1), (65, -1), (95, -1), (121, 0)):
        A.key("head", "rotation_euler", f, (-0.05, 0.65 * k, 0.05 * k))
        A.key("spine", "rotation_euler", f, (0, 0.15 * k, 0))
        A.key("arm.L", "rotation_euler", f, (0.05, 0, 0.1))
        A.key("arm.R", "rotation_euler", f, (0.05, 0, -0.1))
    A.push("Look")


def build(costume="none", out_name="labubu", seated=True):
    # coarse cage + one applied subdivision level: rounder silhouettes than the old lod 0.85 at about 2x the triangles
    rig, meshes, M = build_rig_and_meshes(costume, lod=SKINNED_LOD, subd=1)
    animate(rig, costume)
    stats = {k: lib.tris([o]) for k, o in meshes.items()}
    print("[labubu] tris per mesh", stats)
    os.makedirs(lib.MODELS, exist_ok=True)
    lib.export(os.path.join(lib.MODELS, f"{out_name}.glb"), [rig] + list(meshes.values()))
    seated_stats = {}
    if seated:
        lib.bpy.ops.wm.save_as_mainfile(filepath=f"/tmp/{out_name}_skinned.blend")
        rig, meshes, M = build_rig_and_meshes(costume, lod=SEATED_LOD, subd=1, detail_subd=0)
        animate(rig, costume)
        baked = []
        for f in FACES:
            for c in CLOTHES:
                parts = []
                for key in ("Body", f"Face_{f}", c.capitalize()):
                    parts.append(lib.bake_pose(meshes[key], rig, "Sit", 1, f"tmp_{key}"))
                P = lib.Parts()
                o = P.join(f"seated_{f}_{c}", parts)
                baked.append(o)
                seated_stats[o.name] = lib.tris([o])
        lib.unmute_all(rig)
        print("[labubu] seated tris", seated_stats)
        lib.export(os.path.join(lib.MODELS, f"{out_name}_seated.glb"), baked, animations=False, skins=False)
        lib.bpy.ops.wm.open_mainfile(filepath=f"/tmp/{out_name}_skinned.blend")
        rig = lib.bpy.data.objects["LabubuRig"]
        meshes = {k: lib.bpy.data.objects[k] for k in meshes}
    return rig, meshes, stats, seated_stats


def previews(rig, meshes, name, costume="none", fur="#e9dcc6", shirt="#00356b", face="grin", clothes="tee"):
    if not lib.PREVIEWS:
        return
    lib.set_color("Fur", lib.hexrgb(fur))
    lib.set_color("Shirt", lib.hexrgb(shirt))
    for k, o in meshes.items():
        o.hide_render = k.startswith("Face_") and k != f"Face_{face}" or k in ("Tee", "Hoodie") and k != clothes.capitalize()
    shots = [
        ("Idle", 1, (0, 0, 0.6), 2.6, -28, 0.2, ""),
        ("Idle", 1, (0, 0, 0.7), 0.95, 0, 0.0, "_face"),
        ("Idle", 74, (0, 0, 0.7), 0.95, 0, 0.0, "_blink"),
        ("Hop", 15, (0, 0, 0.75), 2.8, -28, 0.2, ""),
        ("Wave", 11, (0, 0, 0.6), 2.6, 0, 0.2, ""),
        ("Sit", 1, (0, 0, 0.55), 2.6, -60, 0.3, ""),
        ("Dance", 11, (0, 0, 0.6), 2.6, 0, 0.2, ""),
        ("Catch", 25, (0, 0, 0.65), 2.6, 0, 0.2, ""),
    ]
    if lib.args().get("life"):
        shots = [
            ("RaiseHand", 16, (0, 0, 0.6), 2.6, -35, 0.3, ""), ("RaiseHand", 16, (0, 0, 0.6), 2.6, 0, 0.1, "_front"),
            ("RaiseHand", 16, (0, 0, 0.6), 2.6, 180, 0.3, "_back"), ("Stretch", 30, (0, 0, 0.7), 2.8, -20, 0.2, ""), ("Nod", 8, (0, 0, 0.55), 2.4, -70, 0.2, ""),
            ("Type", 6, (0, 0, 0.55), 2.4, -40, 0.3, ""), ("Yawn", 20, (0, 0, 0.6), 2.6, -25, 0.2, ""),
            ("Whisper", 40, (0, 0, 0.55), 2.4, -20, 0.2, ""), ("Walk", 7, (0, 0, 0.6), 2.6, -80, 0.2, ""),
            ("Walk", 19, (0, 0, 0.6), 2.6, -80, 0.2, ""), ("Throw", 7, (0, 0, 0.6), 2.6, -30, 0.2, ""),
            ("Throw", 14, (0, 0, 0.6), 2.6, -30, 0.2, ""), ("Cast", 6, (0, 0, 0.7), 2.8, -70, 0.2, ""),
            ("Cast", 12, (0, 0, 0.7), 2.8, -70, 0.2, ""), ("SitRead", 70, (0, 0, 0.55), 2.4, -30, 0.3, ""),
            ("Sleep", 61, (0, 0, 0.55), 2.4, -30, 0.2, ""), ("Phone", 10, (0, 0, 0.6), 2.4, -40, 0.3, ""),
            ("Talk", 9, (0, 0, 0.6), 2.4, -20, 0.2, ""), ("Look", 30, (0, 0, 0.6), 2.4, 0, 0.2, ""),
        ]
    if costume == "frog":
        shots.append(("Read", 31, (0, 0, 0.6), 2.4, -25, 0.2, ""))
        shots.append(("Read", 31, (0, 0, 0.6), 2.4, -110, 0.2, "_side"))
    lib.clips_preview(rig, name, shots)


if __name__ == "__main__":
    a = lib.args()
    rig, meshes, stats, seated = build()
    previews(rig, meshes, "labubu", face=a.get("face", "grin"), clothes=a.get("clothes", "tee"))
    for f in a.get("faces", "").split(","):
        if f:
            previews(rig, meshes, f"labubu-{f}", face=f, clothes="hoodie", fur="#8d8d93", shirt="#c94f4f")
