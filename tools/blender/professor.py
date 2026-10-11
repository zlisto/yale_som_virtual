# Hogwarts professors, one rigged GLB each. Headless:
#   blender -b -P tools/blender/professor.py                 -> all nine public/models/professor_<key>.glb
#   blender -b -P tools/blender/professor.py -- who=snape    -> one
# Modeled in a 1.9 m reference figure; every coordinate is multiplied by s = height / 1.9 (x and y also by
# the width factor) before it reaches Blender, so each GLB is already at its real height and the app
# never scales it. Faces -Y, feet at z = 0, wand in the right hand (at -X).
import bpy, bmesh, math, os, sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

PROFESSORS = {
    "dumbledore": dict(name="Albus Dumbledore", robe="#4b2479", trim="#c9b6e8", skin="#efd2bd", hair="#f1f0ec", iris="#3f7fc6", height=1.95),
    "mcgonagall": dict(name="Minerva McGonagall", robe="#0f3b2a", trim="#1b5a40", skin="#f0d6c4", hair="#5d5a58", iris="#5d7a5a", height=1.78),
    "trelawney": dict(name="Sybill Trelawney", robe="#6b4a32", trim="#d9a441", skin="#f2dccb", hair="#8a6a4a", iris="#8a6a2e", height=1.7),
    "slughorn": dict(name="Horace Slughorn", robe="#5a1f2e", trim="#c9a44a", skin="#efc9ae", hair="#bcb7ad", iris="#6b8a5a", height=1.78),
    "snape": dict(name="Severus Snape", robe="#0b0b0d", trim="#1c1c22", skin="#e6dccf", hair="#0f0e10", iris="#1a1416", height=1.88),
    "lockhart": dict(name="Gilderoy Lockhart", robe="#a77fd0", trim="#e6c9ff", skin="#f3d3bb", hair="#e8c870", iris="#3f86d6", height=1.85),
    "moody": dict(name="Alastor Moody", robe="#3a3a30", trim="#5a5240", skin="#d9b39a", hair="#8f8a80", iris="#5a4632", height=1.85),
    "flitwick": dict(name="Filius Flitwick", robe="#22304f", trim="#3d5a8a", skin="#f0cfb4", hair="#f2f2f2", iris="#4a3426", height=1.05),
    "hagrid": dict(name="Rubeus Hagrid", robe="#5b4330", trim="#3b2c1f", skin="#e2b28f", hair="#2e2219", iris="#24170f", height=2.7),
}
WIDE = {"hagrid": 1.3, "slughorn": 1.12}
# Dress per professor. cloak: colour of a cape hung from the shoulders (None = no cape), clasp: its clasp metal,
# buttons: count down the front, belt / sash: colour, collar: stand | high | flare | None, shoes: leather colour.
STYLE = {
    "dumbledore": dict(cloak="#2c1656", clasp="gold", buttons=0, belt=None, sash=None, collar="stand", shoes="#3b2457"),
    "mcgonagall": dict(cloak="#0a2219", clasp="gold", buttons=7, belt="#15100c", sash=None, collar="high", shoes="#15100c"),
    "trelawney": dict(cloak=None, clasp=None, buttons=4, belt=None, sash="#8a3d6b", collar="stand", shoes="#5a3b25"),
    "slughorn": dict(cloak=None, clasp=None, buttons=0, belt=None, sash=None, collar="stand", shoes="#2a1a12"),
    "snape": dict(cloak="#121216", clasp="metal", buttons=14, belt=None, sash=None, collar="high", shoes="#0b0b0d"),
    "lockhart": dict(cloak="#6a4596", clasp="gold", buttons=5, belt=None, sash="#e8c870", collar="flare", shoes="#c9a46a"),
    "moody": dict(cloak="#4a3b2c", clasp="metal", buttons=5, belt="#2a1d12", sash=None, collar="stand", shoes="#2a1d12"),
    "flitwick": dict(cloak=None, clasp=None, buttons=5, belt="#15100c", sash=None, collar="stand", shoes="#15100c"),
    "hagrid": dict(cloak=None, clasp=None, buttons=5, belt="#1a1410", sash=None, collar=None, shoes="#2b1d12"),
}

HEAD_C, HEAD_R = (0.0, 0.0, 1.7), (0.12, 0.125, 0.14)
SH_X, SH_Z, EL_Z, WR_Z = 0.25, 1.46, 1.2, 0.98
H0 = 0.06  # the robe hem stands this far off the floor, so the shoes show under it
FRONT = -math.pi / 2  # lathe angle of the robe's front (-Y)


class Sc:
    """Parts wrapper that maps reference-figure coordinates to the real figure."""

    def __init__(self, P, s, w):
        self.P, self.s, self.w = P, s, w

    def T(self, v):
        return (v[0] * self.s * self.w, v[1] * self.s * self.w, v[2] * self.s)

    def R(self, r):
        return (r[0] * self.s * self.w, r[1] * self.s * self.w, r[2] * self.s)

    def sphere(self, name, loc, radii, m, bone, **kw):
        return self.P.sphere(name, self.T(loc), self.R(radii), m, bone, **kw)

    def cyl(self, name, loc, r1, r2, depth, m, bone, **kw):
        sw = self.s * self.w
        return self.P.cyl(name, self.T(loc), r1 * sw, r2 * sw, depth * self.s, m, bone, **kw)

    def box(self, name, loc, size, m, bone, **kw):
        return self.P.box(name, self.T(loc), self.R(size), m, bone, **kw)

    def torus(self, name, loc, R, r, m, bone, **kw):
        sw = self.s * self.w
        return self.P.torus(name, self.T(loc), R * sw, r * sw, m, bone, **kw)

    def strand(self, name, pts, r0, r1, m, bone, blend=None, **kw):
        sw = self.s * self.w
        if blend:
            blend = (blend[0], blend[1] * self.s, blend[2] * self.s)
        return self.P.strand(name, [self.T(q) for q in pts], r0 * sw, r1 * sw, m, bone, blend=blend, **kw)

    def lathe(self, name, profile, m, bone, loc=(0, 0, 0), disp=None, **kw):
        sw = self.s * self.w
        d = (lambda th, z: disp(th, z / self.s) * sw) if disp else None
        return self.P.lathe(name, [(r * sw, z * self.s) for r, z in profile], m, bone, loc=self.T(loc), disp=d, **kw)


def head_pt(x, z, off=0.0):
    return lib.ellipsoid_front(HEAD_C, HEAD_R, x, z, off)


def cut_half(o, keep_below_z):
    """Keep the part of mesh `o` below world z (half-moon glasses)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, keep_below_z), plane_no=(0, 0, 1), clear_outer=True)
    bm.to_mesh(o.data)
    bm.free()


def cut_above(o, keep_above_z):
    """Keep the part of mesh `o` above world z (eyelids)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, keep_above_z), plane_no=(0, 0, -1), clear_outer=True)
    bm.to_mesh(o.data)
    bm.free()


def skull_pt(x, y, off=0.0):
    """Point on the top of the head ellipsoid above (x, y), raised `off`."""
    u = 1 - (x / HEAD_R[0]) ** 2 - ((y - HEAD_C[1]) / HEAD_R[1]) ** 2
    return (x, y, HEAD_C[2] + HEAD_R[2] * math.sqrt(max(u, 0.0)) + off)


def robe_r(z):
    """Outer radius of the robe skirt at the front (reference meters), pleats included."""
    zl = min(max(z - H0, 0.0), 1.24)
    return 0.37 - 0.137 * zl + robe_folds(FRONT, zl)


def front_y(z, who):
    """y of the front of the body at height z: robe, torso, or Slughorn's belly, whichever stands out most."""
    r = robe_r(z) if z < 1.3 else 0.0
    if 1.18 <= z <= 1.48:
        r = max(r, 0.2 + 0.015 * (z - 1.18) / 0.3)
    y = -r
    if who == "slughorn" and abs(z - 1.1) < 0.33:
        y = min(y, -0.06 - 0.3 * math.sqrt(1 - ((z - 1.1) / 0.33) ** 2))
    return y


def shell(Q, name, m, a0, a1, rings, thick=0.01, cols=20, bone="spine", blend=None, fold=None):
    """Open cloth shell: rings (rx, ry, yoff, z) from top to bottom, each an arc from angle a0 to a1 measured from
    the back (+Y) toward +X; outer and inner skins joined at the edges, with UVs for the cloth normal map.
    fold(a, z) adds to both radii; blend=(bone2, z_hi, z_lo) fades the weights to bone2 going down."""
    verts, faces, uvs = [], [], []
    rows = len(rings) - 1
    W = cols + 1
    for dr in (0.0, -thick):
        for rx, ry, yo, z in rings:
            for j in range(W):
                a = a0 + (a1 - a0) * j / cols
                f = fold(a, z) if fold else 0.0
                verts.append(((rx + f + dr) * math.sin(a), (ry + f + dr) * math.cos(a) + yo, z))
                uvs.append((3 * j / cols, 4 * z))
    off = (rows + 1) * W
    for i in range(rows):
        for j in range(cols):
            q = i * W + j
            faces.append((q, q + 1, q + W + 1, q + W))
            faces.append((off + q, off + q + W, off + q + W + 1, off + q + 1))
    for i in range(rows):
        for j, flip in ((0, True), (cols, False)):
            q = i * W + j
            f = (q, q + W, off + q + W, off + q)
            faces.append(f[::-1] if flip else f)
    for j in range(cols):
        for q, flip in ((j, True), (rows * W + j, False)):
            f = (q, off + q, off + q + 1, q + 1)
            faces.append(f[::-1] if flip else f)
    o = Q.P.poly(name, [Q.T(v) for v in verts], faces, m, bone, smooth=True)
    uv = o.data.uv_layers.new(name="UVMap")
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[o.data.loops[li].vertex_index]
    if blend:
        b2, zh, zl = blend[0], blend[1] * Q.s, blend[2] * Q.s
        g1, g2 = o.vertex_groups[bone], o.vertex_groups.new(name=b2)
        for v in o.data.vertices:
            w = min(1.0, max(0.0, (zh - v.co.z) / (zh - zl)))
            g1.add([v.index], 1.0 - w, "REPLACE")
            g2.add([v.index], w, "REPLACE")
    return o


def materials(p, st=None):
    h = lib.hexrgb
    return {
        "robe": lib.mat("Robe", h(p["robe"]), 0.85),
        # inside of the sleeves: the robe colour in shadow
        "lining": lib.mat("Lining", tuple(c * 0.35 for c in h(p["robe"])), 0.9),
        "trim": lib.mat("Trim", h(p["trim"]), 0.7),
        "skin": lib.mat("Skin", h(p["skin"]), 0.55),
        "hair": lib.mat("Hair", h(p["hair"]), 0.9),
        "eye": lib.mat("EyeWhite", (0.95, 0.95, 0.93), 0.3),
        "pupil": lib.mat("Pupil", h("#0d0907"), 0.25),
        "iris": lib.mat("Iris", h(p["iris"]), 0.2),
        "glint": lib.mat("EyeGlint", (1, 1, 1), 0.1, emit=(1, 1, 1)),
        "mouth": lib.mat("Mouth", h("#6b2f2a"), 0.6),
        "teeth": lib.mat("Teeth", (0.97, 0.97, 0.95), 0.3),
        "wand": lib.mat("Wand", h("#3b2617"), 0.6),
        "tip": lib.mat("WandTip", h("#ffd6ea"), 0.3, emit=h("#ff4fa3")),
        "gold": lib.mat("Gold", h("#c9a44a"), 0.3, metal=0.9),
        "metal": lib.mat("Metal", h("#8a8f96"), 0.3, metal=0.9),
        "dark": lib.mat("Dark", h("#1a1410"), 0.7),
        "blush": lib.mat("Blush", h("#e8a49a"), 0.6),
        # lips: the skin pulled toward a muted rose
        "lip": lib.mat("Lip", tuple(c * k for c, k in zip(h(p["skin"]), (0.78, 0.5, 0.48))), 0.5),
        "boot": lib.mat("Boot", h(st["shoes"]) if st else h("#1a1410"), 0.45),
        "trouser": lib.mat("Trouser", h("#141216"), 0.85),
        "cloak": lib.mat("Cloak", h(st["cloak"]), 0.85) if st and st["cloak"] else None,
        "leather": lib.mat("Leather", h(st["belt"]), 0.5) if st and st["belt"] else None,
        "sash": lib.mat("Sash", h(st["sash"]), 0.7) if st and st["sash"] else None,
    }


def robe_folds(th, z):
    """Radial offset of the robe: nine irregular pleats that deepen toward the hem, plus three soft
    horizontal fold rings (reference-figure meters)."""
    a = 0.022 * max(0.0, (0.95 - z) / 0.95) ** 1.5
    pleat = a * math.sin(9 * th + 0.6 * math.sin(3 * th))
    rings = 0.006 * sum(math.exp(-(((z - zk) / 0.035) ** 2)) for zk in (0.3, 0.55, 0.78))
    return pleat + rings


def base_body(Q, M, who):
    robe, trim, skin = M["robe"], M["trim"], M["skin"]
    belly = who == "slughorn"
    # robe skirt: a 12 mm thick lathed shell with pleats and fold rings; the hem is a rolled trim band
    r_out = lambda z: 0.37 - 0.137 * z
    outer = [(r_out(z), z) for z in [0.0] + [0.03 + 0.093 * i for i in range(14)]]
    outer[-1] = (r_out(1.24), 1.24)
    inner = [(r_out(z) - 0.012, z) for z in (1.24, 0.3, 0.1, 0.0)]
    Q.lathe("robe", outer + inner, robe, "spine", seg=36, disp=robe_folds, closed=True, loc=(0, 0, H0))
    hem = [(0.37, 0.0), (0.384, 0.004), (0.389, 0.02), (0.389, 0.058), (0.384, 0.074), (0.371, 0.079),
           (0.358, 0.075), (0.353, 0.06), (0.353, 0.014), (0.358, 0.002)]
    Q.lathe("hem", hem, trim, "spine", seg=36, disp=robe_folds, closed=True, loc=(0, 0, H0))
    Q.cyl("torso", (0, 0, 1.33), 0.2, 0.215, 0.3, robe, "chest", verts=24)
    Q.sphere("shoulders", (0, 0, 1.47), (0.27, 0.17, 0.09), robe, "chest", seg=12, rings=6, subd=1)
    if belly:
        Q.sphere("belly", (0, -0.06, 1.1), (0.31, 0.3, 0.33), robe, "spine", seg=20, rings=12, subd=1)
        for z in (1.2, 1.1, 1.0, 0.9):
            Q.sphere(f"btn{z}", (0, front_y(z, who) - 0.004, z), (0.02, 0.012, 0.02), M["gold"], "spine", seg=8, rings=5)
    # legs and shoes under the lifted hem; the toes stick out past the hem trim
    for s in (1, -1):
        Q.cyl(f"leg{s}", (0.09 * s, -0.02, 0.17), 0.05, 0.055, 0.26, M["trouser"], "root", verts=8)
        if who == "moody" and s == 1:
            continue  # his left leg is wooden (extras)
        Q.sphere(f"shoe{s}", (0.095 * s, -0.25, 0.048), (0.06, 0.17, 0.05), M["boot"], "root", seg=12, rings=6)
        Q.box(f"sole{s}", (0.095 * s, -0.25, 0.007), (0.085, 0.26, 0.014), M["dark"], "root")
    Q.cyl("neck", (0, 0, 1.57), 0.05, 0.05, 0.1, skin, "head", verts=12)
    # head: smooth skull, a chin and soft cheekbones so the face is not a flat disc, ears with an inner bowl
    Q.sphere("head", HEAD_C, HEAD_R, skin, "head", seg=16, rings=10, subd=1)
    Q.sphere("chin", head_pt(0, 1.6, -0.035), (0.05, 0.045, 0.04), skin, "head", seg=10, rings=6)
    for s in (1, -1):
        Q.sphere(f"cheek{s}", head_pt(0.058 * s, 1.672, -0.024), (0.046, 0.026, 0.034), skin, "head", seg=10, rings=6)
        Q.sphere(f"ear{s}", (0.121 * s, 0.0, 1.7), (0.016, 0.03, 0.04), skin, "head", rot=(0, 0, -0.25 * s), seg=10, rings=6)
        Q.sphere(f"earin{s}", (0.132 * s, -0.004, 1.698), (0.006, 0.018, 0.026), lib.mat("EarIn", tuple(c * 0.72 for c in lib.hexrgb(PROFESSORS[who]["skin"])), 0.6), "head", rot=(0, 0, -0.25 * s), seg=8, rings=4)
    # arms: upper sleeve, a thick bell sleeve with a few pleats, cuff, and a mitt hand. A lining
    # disc closes the bell 6 cm above the opening, so a raised arm shows dark cloth instead of
    # the hollow tube; the mitt (wrist, flat palm, thumb) starts inside the cuff
    bell = [(0.11, -0.12), (0.095, -0.06), (0.08, 0.0), (0.068, 0.12), (0.056, 0.12), (0.069, 0.0), (0.084, -0.06), (0.099, -0.116)]
    for s, side in ((1, "L"), (-1, "R")):
        Q.cyl(f"upsleeve.{side}", (0.275 * s, 0, 1.33), 0.07, 0.065, 0.28, robe, f"upperarm.{side}", rot=(0, 0.15 * s, 0), verts=14)
        Q.lathe(f"bell.{side}", bell, robe, f"lowerarm.{side}", seg=20, loc=(0.305 * s, 0, 1.08), rot=(0, 0.03 * s, 0),
                disp=lambda th, z: 0.006 * math.sin(7 * th) * (0.12 - z) / 0.24, closed=True)
        Q.torus(f"cuff.{side}", (0.307 * s, 0, 0.965), 0.108, 0.012, trim, f"lowerarm.{side}", seg=16, minor=4)
        Q.cyl(f"sleevecap.{side}", (0.305 * s, 0, 1.02), 0.086, 0.086, 0.012, M["lining"], f"lowerarm.{side}", rot=(0, 0.03 * s, 0), verts=20)
        Q.cyl(f"wrist.{side}", (0.31 * s, -0.012, 0.985), 0.03, 0.028, 0.07, skin, f"lowerarm.{side}", verts=10)
        Q.sphere(f"hand.{side}", (0.31 * s, -0.018, 0.918), (0.027, 0.046, 0.058), skin, f"lowerarm.{side}", seg=12, rings=8)
        Q.sphere(f"thumb.{side}", (0.29 * s, -0.05, 0.935), (0.015, 0.016, 0.032), skin, f"lowerarm.{side}", rot=(0.5, 0, 0), seg=8, rings=6)


def dress(Q, M, who):
    """Collar, buttons down the front, belt or sash, and a cape hung from the shoulders with a clasp."""
    st = STYLE[who]
    trim = M["trim"]
    if st["collar"]:
        top, flare = {"stand": (1.59, 0.0), "high": (1.635, 0.006), "flare": (1.645, 0.035)}[st["collar"]]
        gap = math.radians(32 if st["collar"] != "flare" else 48)
        rings = [(0.083 + flare, 0.083 + flare * 0.8, 0.012 * (flare > 0), top), (0.08, 0.08, 0.0, 1.55), (0.1, 0.095, 0.0, 1.5)]
        shell(Q, "collar", trim, -math.pi + gap, math.pi - gap, rings, thick=0.008, cols=14, bone="chest")
        if who == "snape":  # the white edge of his shirt collar
            Q.torus("shirtcollar", (0, 0, 1.6), 0.058, 0.006, lib.mat("Collar", (0.92, 0.92, 0.9), 0.6), "head", seg=14, minor=4)
    # a placket strip following the front of the body, with the buttons on it
    zs = [1.47 - (1.47 - (H0 + 0.1)) * k / 9 for k in range(10)]
    if who not in ("slughorn", "dumbledore", "hagrid"):
        Q.strand("placket", [(0, front_y(z, who) - 0.003, z) for z in zs], 0.03, 0.03, trim, "chest",
                 sides=4, flat=0.12, wide=(1, 0, 0), blend=("spine", 1.3, 1.2))
    btn = lib.mat("Button", lib.hexrgb("#c9a44a" if st["clasp"] == "gold" or who in ("lockhart", "flitwick") else "#2a2a33"), 0.35, metal=0.6)
    n = st["buttons"]
    for i in range(n):
        z = 1.45 - i * (0.5 if n < 8 else 0.62) / max(n - 1, 1)
        if st["belt"] and abs(z - 1.12) < 0.04:
            continue
        r = 0.022 if who == "hagrid" else 0.012
        Q.sphere(f"btn{i}", (0, front_y(z, who) - 0.008, z), (r, r * 0.7, r), btn, "chest" if z > 1.3 else "spine", seg=8, rings=4)
    if st["belt"]:
        R = 0.232 if who != "hagrid" else 0.236
        Q.torus("belt", (0, 0, 1.12), R, 0.013, M["leather"], "spine", seg=28, minor=4, scale=(1, 1, 2.2))
        Q.box("buckle", (0, -R - 0.014, 1.12), (0.064, 0.012, 0.054), M["gold"] if who != "moody" else M["metal"], "spine")
        Q.box("buckleIn", (0, -R - 0.019, 1.12), (0.04, 0.006, 0.03), M["leather"], "spine")
    if st["sash"]:
        Q.torus("sash", (0, 0, 1.12), 0.236, 0.016, M["sash"], "spine", rot=(0, 0.08, 0), seg=28, minor=5, scale=(1, 1, 2.4))
        Q.sphere("sashknot", (0.16, -0.18, 1.115), (0.035, 0.022, 0.03), M["sash"], "spine", seg=8, rings=5)
        for k, dx in enumerate((0.0, 0.035)):
            Q.strand(f"sashtail{k}", curve([(0.16 + dx, -0.19, 1.1), (0.175 + dx * 1.3, -0.2, 0.98), (0.17 + dx * 1.5, -0.215, 0.84 - 0.04 * k)], 6),
                     0.022, 0.018, M["sash"], "spine", sides=4, flat=0.18, wide=(1, 0.2, 0))
    if st["cloak"]:
        cl = M["cloak"]
        fold = lambda a, z: 0.012 * math.sin(7 * a + 1.3) * max(0.0, (1.3 - z) / 1.1)
        rings = [(0.215, 0.15, 0.0, 1.535), (0.3, 0.2, 0.02, 1.47), (0.315, 0.24, 0.03, 1.38),
                 (0.325, 0.29, 0.04, 1.1), (0.37, 0.35, 0.04, 0.62), (0.43, 0.42, 0.04, H0 + 0.12)]
        span = math.radians(80)
        shell(Q, "cloak", cl, -span, span, rings, thick=0.01, cols=22, bone="chest", blend=("spine", 1.38, 1.1), fold=fold)
        # straps over the shoulders to a clasp on the chest
        metal = M["gold"] if st["clasp"] == "gold" else M["metal"]
        for s in (1, -1):
            Q.strand(f"cloakstrap{s}", curve([(0.27 * s, 0.03, 1.5), (0.22 * s, -0.08, 1.545), (0.13 * s, -0.18, 1.52), (0.075 * s, -0.215, 1.49)], 7),
                     0.02, 0.016, cl, "chest", sides=4, flat=0.3, wide=(0, 0, 1))
            Q.cyl(f"clasp{s}", (0.068 * s, -0.222, 1.49), 0.022, 0.022, 0.01, metal, "chest", rot=(math.pi / 2, 0, 0), verts=12)
        Q.strand("claspchain", curve([(-0.05, -0.226, 1.488), (0, -0.232, 1.475), (0.05, -0.226, 1.488)], 5), 0.004, 0.004, metal, "chest", sides=4)


def face(Q, M, who):
    """Brow ridge, nose bridge and nostrils, eyes with whites, coloured irises, pupils and a highlight,
    strand eyebrows, mouth, blush."""
    ez = 1.722
    skin = M["skin"]
    Q.sphere("browridge", head_pt(0, ez + 0.02, -0.011), (0.072, 0.024, 0.014), skin, "head", seg=12, rings=6)
    Q.sphere("bridge", head_pt(0, 1.706, -0.004), (0.013, 0.02, 0.03), skin, "head", seg=8, rings=6)
    nose = {"slughorn": 1.25, "snape": 1.2, "hagrid": 1.3, "moody": 1.15, "flitwick": 1.1}.get(who, 1.0)
    Q.sphere("nose", head_pt(0, 1.684, 0.012), (0.019 * nose, 0.022 * nose, 0.019 * nose), skin, "head", seg=8, rings=6, subd=1)
    for s in (1, -1):
        Q.sphere(f"nostril{s}", head_pt(0.013 * s, 1.676, 0.004), (0.011, 0.013, 0.009), skin, "head", seg=8, rings=5)
    brow_col = M["hair"] if who not in ("dumbledore", "flitwick") else lib.mat("BrowWhite", (0.9, 0.9, 0.9), 0.9)
    big = 1.3 if who == "trelawney" else 1.0  # magnified by her glasses
    for s in (1, -1):
        x = 0.045 * s
        if who == "moody" and s == -1:
            # the magical eye: a large pale eyeball with an electric-blue iris in a steel rim, on a leather strap
            Q.sphere("magiceye", head_pt(x, ez, 0.004), (0.031, 0.022, 0.031), lib.mat("MagicEye", lib.hexrgb("#e4ecf0"), 0.15), "head", seg=14, rings=10)
            Q.sphere("magiciris", head_pt(x + 0.004, ez, 0.022), (0.015, 0.005, 0.015), lib.mat("MagicIris", lib.hexrgb("#2f8fff"), 0.15, emit=lib.hexrgb("#2f8fff")), "head", seg=12, rings=6)
            Q.sphere("magicpupil", head_pt(x + 0.004, ez, 0.026), (0.0065, 0.003, 0.0065), M["pupil"], "head", seg=8, rings=4)
            Q.torus("magicring", head_pt(x, ez, 0.01), 0.034, 0.0055, M["metal"], "head", rot=(math.pi / 2, 0, 0), seg=18, minor=5)
            moody_strap(Q, M, x, ez)
            continue
        Q.sphere(f"eyew{s}", head_pt(x, ez, -0.004), (0.022 * big, 0.012, 0.017 * big), M["eye"], "head", seg=12, rings=8)
        # upper eyelid: a skin cap over the top of the eye, lower for the stern and the sleepy
        lid = {"snape": 0.0, "mcgonagall": 0.002, "moody": 0.0, "slughorn": 0.001, "dumbledore": 0.004}.get(who, 0.006)
        o = Q.sphere(f"lid{s}", head_pt(x, ez, -0.002), (0.025 * big, 0.0155, 0.02 * big), skin, "head", seg=14, rings=8)
        cut_above(o, Q.T((0, 0, ez + lid * big))[2])
        Q.sphere(f"iris{s}", head_pt(x, ez - 0.001, 0.005), (0.0115 * big, 0.004, 0.0115 * big), M["iris"], "head", seg=12, rings=6)
        Q.sphere(f"pupil{s}", head_pt(x, ez - 0.001, 0.0075), (0.0055 * big, 0.003, 0.0055 * big), M["pupil"], "head", seg=8, rings=4)
        Q.sphere(f"glint{s}", head_pt(x - 0.004, ez + 0.004, 0.0095), (0.0025, 0.0012, 0.0025), M["glint"], "head", seg=6, rings=4)
        # eyebrow: a flat tapered strand along the brow ridge, slanted per character
        tilt = 0.012 if who in ("snape", "mcgonagall") else (-0.006 if who in ("dumbledore", "hagrid", "slughorn") else 0.0)
        pts = [head_pt(s * (0.018 + 0.056 * k), ez + 0.039 + 0.008 * math.sin(math.pi * k) - tilt * (k - 0.5) * 2, 0.004) for k in (0, 0.33, 0.66, 1.0)]
        thick = 0.0085 if who in ("dumbledore", "hagrid", "moody", "slughorn") else 0.0055
        Q.strand(f"brow{s}", pts, thick, 0.002, brow_col, "head", sides=4, flat=0.45, wide=(0, 0, 1))
    # mouth: a dark crease between an upper lip (a tapered bow) and a fuller lower lip; thin for the stern
    thin = 0.55 if who in ("snape", "mcgonagall", "moody") else 1.0
    wide = 1.25 if who == "lockhart" else 1.0
    if who == "lockhart":  # the famous smile
        Q.sphere("smile", head_pt(0, 1.645, -0.001), (0.034, 0.009, 0.008), M["teeth"], "head", seg=12, rings=6)
    Q.box("mouth", head_pt(0, 1.646, 0.006), (0.05 * wide, 0.004, 0.0035), M["mouth"], "head")
    up = [head_pt(s * 0.028 * wide * k, 1.649 + 0.004 * (1 - k) ** 2 + 0.002 * math.sin(math.pi * k), 0.008) for k, s in
          ((1.0, -1), (0.55, -1), (0.0, 1), (0.55, 1), (1.0, 1))]
    if who == "lockhart":
        up = [(q[0], q[1], q[2] + 0.004 * abs(q[0]) / 0.03) for q in up]
    Q.strand("lipup", up, 0.0055 * thin, 0.0045 * thin, M["lip"], "head", sides=5, flat=0.6, wide=(0, 0, 1))
    Q.sphere("liplow", head_pt(0, 1.638 - 0.004 * (who == "lockhart"), 0.003), (0.021 * wide, 0.009, 0.0075 * thin), M["lip"], "head", seg=12, rings=6)
    if who not in ("snape", "moody"):
        for s in (1, -1):
            Q.sphere(f"blush{s}", head_pt(0.062 * s, 1.672, -0.0005), (0.028, 0.004, 0.017), M["blush"], "head", seg=10, rings=5)


WAND_TILT = math.radians(35)  # the wand leaves the fist 35 degrees forward of the forearm, so the Point clip aims it level


def wand(Q, M, side="R"):
    """Wand gripped in the hand, running forward and down out of the fist; tip, silver ferrule and pommel."""
    s = 1 if side == "L" else -1
    g = Vector((0.31 * s, -0.03, 0.915))
    d = Vector((0, -math.sin(WAND_TILT), -math.cos(WAND_TILT)))
    rot = Vector((0, 0, 1)).rotation_difference(d).to_euler()
    at = lambda k: tuple(g + d * k)
    Q.cyl("wand", at(0.095), 0.009, 0.006, 0.33, M["wand"], f"lowerarm.{side}", rot=rot, verts=8)
    Q.cyl("wandferrule", at(0.245), 0.0075, 0.0068, 0.03, M["metal"], f"lowerarm.{side}", rot=rot, verts=10)
    Q.sphere("wandtip", at(0.262), (0.013, 0.013, 0.013), M["tip"], f"lowerarm.{side}", seg=8, rings=6)
    Q.sphere("wandpommel", at(-0.072), (0.012, 0.012, 0.012), M["metal"], f"lowerarm.{side}", seg=8, rings=6)


def curve(ctrl, n):
    """n points on a Catmull-Rom spline through the control points (ends clamped)."""
    C = [ctrl[0]] + list(ctrl) + [ctrl[-1]]
    out = []
    for k in range(n):
        u = k / (n - 1) * (len(ctrl) - 1)
        i = min(int(u), len(ctrl) - 2)
        t = u - i
        p0, p1, p2, p3 = (C[i + j] for j in range(4))
        out.append(tuple(0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t
                                + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t ** 3) for d in range(3)))
    return out


def jit(i, k=0):
    """Deterministic pseudo-random number in [-1, 1] for strand i (so rebuilds are identical)."""
    return math.sin(i * 12.9898 + k * 78.233) * 43758.5453 % 1.0 * 2 - 1


def temples(Q, m, x_frame, z, off):
    """Glasses arms: from the outer edge of each frame back along the side of the head to the ear."""
    for s in (1, -1):
        a = head_pt(s * x_frame, z, off)
        Q.strand(f"temple{s}", curve([a, (s * 0.118, -0.06, z + 0.004), (s * 0.128, 0.0, z - 0.004), (s * 0.12, 0.03, z - 0.03)], 6),
                 0.0028, 0.0024, m, "head", sides=4)


def dumbledore_hair(Q, M):
    hair = M["hair"]
    Q.sphere("hairback", (0, 0.03, 1.73), (0.135, 0.12, 0.14), hair, "head", seg=10, rings=6, subd=1)
    Q.sphere("beardtop", (0, -0.115, 1.6), (0.105, 0.06, 0.07), hair, "head", seg=10, rings=6, subd=1)
    # beard core behind the locks (no gaps), tapering to the point of the beard
    Q.sphere("beardcore", (0, -0.235, 1.22), (0.085, 0.032, 0.3), hair, "chest", rot=(math.pi, 0, 0), seg=8, rings=8, taper=(0.0, 0.8), subd=1)
    # beard: three layers of tapered locks from the jaw, the centre ones longest
    i = 0
    for layer, (dy, n) in enumerate(((0.0, 11), (0.022, 9), (0.044, 7))):
        for k in range(n):
            u = -1 + 2 * (k + 0.5) / n
            x0, z0 = 0.09 * u, 1.645 - 0.03 * (1 - u * u)
            root = head_pt(x0, z0, -0.008)
            tipz = 0.9 + 0.2 * abs(u) ** 1.2 + 0.07 * layer + 0.03 * jit(i)
            y = lambda z: -(0.245 + 0.045 * (1.45 - z) / 0.55) + dy
            sway = 0.012 * jit(i, 1)
            ctrl = [root, (x0 * 1.1, root[1] - 0.05, z0 - 0.07), (x0 * 1.05 + sway, y(1.45), 1.45),
                    (x0 * 0.78 - sway, y(1.22), 1.22), (x0 * 0.45 + sway, y(1.05), (1.05 + tipz) / 2 + 0.06), (x0 * 0.25, y(tipz), tipz)]
            Q.strand(f"beard{i}", curve(ctrl, 7), 0.021, 0.002, hair, "head", sides=5, flat=0.55, wide=(1, 0, 0), blend=("chest", 1.6, 1.45))
            i += 1
    # mustache: locks from under the nose sweeping out and down past the mouth corners
    for s in (1, -1):
        for k in range(5):
            a = head_pt(s * (0.006 + 0.004 * k), 1.668 - 0.002 * k, 0.014)
            b = head_pt(s * (0.045 + 0.006 * k), 1.655 - 0.004 * k, 0.016)
            c = head_pt(s * (0.07 + 0.008 * k), 1.618 - 0.01 * k, 0.012)
            Q.strand(f"mst{s}{k}", curve([a, b, c], 6), 0.009, 0.0018, hair, "head", sides=4, flat=0.6, wide=(0, 0, 1))
    # long hair: locks from under the hat brim over the sides and down the back
    for k in range(16):
        a = math.radians(-105 + 210 * k / 15)  # 0 = straight back (+Y)
        sx, cy = math.sin(a), math.cos(a)
        side = abs(sx)
        z_end = 1.56 + 0.2 * side ** 2 * (1 if cy < 0.3 else 0.5) - 0.25 * max(cy, 0) + 0.03 * jit(k, 2)
        ctrl = [(0.12 * sx, 0.115 * cy + 0.02, 1.76), (0.142 * sx, 0.14 * cy + 0.03, 1.67), (0.16 * sx, 0.17 * cy + 0.05, 1.56),
                (0.165 * sx, 0.2 * cy + 0.07, max(z_end + 0.05, 1.42)), (0.165 * sx, 0.21 * cy + 0.08, z_end)]
        Q.strand(f"hair{k}", curve(ctrl, 6), 0.026, 0.003, hair, "head", sides=4, flat=0.35, wide=(cy, -sx, 0), blend=("chest", 1.6, 1.48))


def mcgonagall_hair(Q, M):
    hair = M["hair"]
    Q.sphere("hair", (0, 0.02, 1.75), (0.13, 0.12, 0.12), hair, "head", seg=10, rings=6, subd=1)
    # bun: one thick strand coiled 2.5 turns, facing back
    c = (0, 0.138, 1.715)
    pts = []
    for k in range(34):
        t = k / 33
        a = t * 2.5 * math.tau
        r = 0.05 * (1 - t) + 0.01
        pts.append((c[0] + r * math.cos(a), c[1] + 0.02 * t, c[2] + r * math.sin(a)))
    Q.strand("bun", pts, 0.017, 0.009, hair, "head", sides=6)
    # hair combed from the hairline back to the bun
    for k in range(12):
        s = 1 if k < 6 else -1
        a = math.radians(55 + 22 * (k % 6))  # angle from the back
        ctrl = []
        for t in (0.0, 0.35, 0.7, 1.0):
            aa = a * (1 - t)
            ctrl.append((s * 0.136 * math.sin(aa), 0.126 * math.cos(aa) + 0.02, 1.765 - 0.045 * t))
        Q.strand(f"comb{k}", curve(ctrl, 6), 0.012, 0.006, hair, "head", sides=4, flat=0.5, wide=(0, 0, 1))


def trelawney_hair(Q, M):
    hair = M["hair"]
    for i in range(10):
        a = i / 10 * math.tau
        Q.sphere(f"frizz{i}", (math.cos(a) * 0.14, math.sin(a) * 0.09 + 0.03, 1.74 + math.sin(a * 2) * 0.05), (0.07, 0.07, 0.08), hair, "head", seg=6, rings=4, subd=1)
    Q.sphere("hairtop", (0, 0.02, 1.83), (0.15, 0.12, 0.08), hair, "head", seg=8, rings=6, subd=1)
    Q.sphere("haircap", (0, 0.025, 1.76), (0.138, 0.13, 0.125), hair, "head", seg=8, rings=6, subd=1)
    # corkscrew curls hanging round the sides and back (none over the face)
    for k in range(20):
        a = math.radians(-140 + 280 * k / 19)  # 0 = back
        sx, cy = math.sin(a), math.cos(a)
        top = (0.17 * sx, 0.14 * cy + 0.03, 1.73 + 0.03 * jit(k))
        length = 0.2 + 0.06 * jit(k, 1)
        pts = []
        for j in range(12):
            t = j / 11
            w = t * 2.2 * math.tau + k
            r = 0.028 * (1 - 0.3 * t)
            pts.append((top[0] * (1 + 0.15 * t) + r * math.cos(w) * cy, top[1] * (1 + 0.15 * t) + r * math.cos(w) * -sx, top[2] - length * t + r * math.sin(w)))
        Q.strand(f"curl{k}", pts, 0.015, 0.006, hair, "head", sides=4)


def hair_sheet(Q, name, m, a0, a1, z_top, z_bot, r, thick=0.012, cols=18, rows=8):
    """A closed shell of hair hanging round the head from z_top to z_bot at radius r (x, y radii), open
    over the face: angles a0..a1 measured from the back (+Y). It fills the gaps between the strand locks."""
    verts, faces = [], []
    for side, dr in (("out", 0.0), ("in", -thick)):
        for i in range(rows + 1):
            z = z_top + (z_bot - z_top) * i / rows
            k = min(1.0, (z_top - z) / 0.08)  # rounds in over the crown
            for j in range(cols + 1):
                a = a0 + (a1 - a0) * j / cols
                rr = (0.6 + 0.4 * k ** 0.5)
                verts.append(((r[0] * rr + dr) * math.sin(a), (r[1] * rr + dr) * math.cos(a) + 0.015, z))
    W = cols + 1
    off = (rows + 1) * W
    for i in range(rows):
        for j in range(cols):
            q = i * W + j
            faces.append((q, q + W, q + W + 1, q + 1))  # outer, facing out
            faces.append((off + q, off + q + 1, off + q + W + 1, off + q + W))  # inner, facing in
    for i in range(rows):  # side edges
        for j, flip in ((0, False), (cols, True)):
            q = i * W + j
            f = (q, off + q, off + q + W, q + W)
            faces.append(f[::-1] if flip else f)
    for j in range(cols):  # bottom edge
        q = rows * W + j
        faces.append((q, q + 1, off + q + 1, off + q))
    return Q.P.poly(name, [Q.T(v) for v in verts], faces, m, "head", smooth=True)


def snape_hair(Q, M):
    hair = M["hair"]
    Q.sphere("hair", (0, 0.015, 1.755), (0.138, 0.13, 0.12), hair, "head", seg=10, rings=6, subd=1)
    hair_sheet(Q, "curtain", hair, math.radians(-148), math.radians(148), 1.84, 1.54, (0.147, 0.14))
    # curtains: locks from a centre parting over the skull and straight down to the jaw, framing the face
    for k in range(34):
        s = 1 if k % 2 else -1
        a = math.radians(170 - 340 * (k // 2) / 16) * s  # from the front parting round to the back
        sx, cy = abs(math.sin(a)) * s, math.cos(a)
        front = cy < -0.55
        z_end = (1.57 if front else 1.53) + 0.02 * jit(k)
        ctrl = [(0.02 * s, 0.12 * cy * 0.3 - 0.02, 1.875), (0.12 * sx, 0.12 * cy, 1.82), (0.148 * sx, 0.142 * cy + 0.01, 1.72),
                (0.152 * sx, 0.146 * cy + 0.015, 1.62), (0.15 * sx, 0.15 * cy + 0.02, z_end)]
        if front and abs(sx) < 0.75:
            continue  # keep the face clear
        Q.strand(f"lock{k}", curve(ctrl, 7), 0.034, 0.006, hair, "head", sides=4, flat=0.28, wide=(cy, -sx, 0))


def hagrid_hair(Q, M):
    hair = M["hair"]
    hair_sheet(Q, "mane", hair, math.radians(-128), math.radians(128), 1.86, 1.6, (0.168, 0.162))
    Q.sphere("hair", (0, 0.06, 1.78), (0.17, 0.15, 0.13), hair, "head", seg=10, rings=6, subd=1)
    Q.sphere("beard", (0, -0.07, 1.55), (0.16, 0.12, 0.11), hair, "head", seg=10, rings=6, subd=1)
    for i in range(12):
        a = i / 12 * math.tau
        Q.sphere(f"bush{i}", (math.cos(a) * 0.15, 0.03 + abs(math.sin(a)) * 0.02, 1.66 + math.sin(a) * 0.14), (0.06, 0.06, 0.06), hair, "head", seg=6, rings=4, subd=1)
    # wild wavy strands: out of the beard (down and forward) and the hair (up and out)
    for k in range(44):
        beard = k < 26
        if beard:
            a = math.radians(-80 + 160 * (k / 25))  # round the front of the beard
            base = (0.15 * math.sin(a), -0.07 - 0.11 * math.cos(a), 1.53 - 0.04 * abs(math.sin(a)))
            out = (math.sin(a) * 0.3, -math.cos(a) * 0.45, -1.0)
        else:
            a = (k - 26) / 18 * math.tau
            base = (0.16 * math.cos(a), 0.06 + 0.14 * math.sin(a), 1.8 + 0.04 * math.sin(3 * a))
            out = (math.cos(a) * 0.55, math.sin(a) * 0.55, -0.6)
        L = 0.065 + 0.02 * jit(k)
        ctrl = []
        for j in range(5):
            t = j / 4
            wig = 0.014 * math.sin(t * 7 + k)
            ctrl.append((base[0] + out[0] * L * t + wig, base[1] + out[1] * L * t, base[2] + out[2] * L * t + wig * 0.5))
        Q.strand(f"wild{k}", curve(ctrl, 6), 0.018, 0.004, hair, "head", sides=4)


def slughorn_hair(Q, M):
    """Bald crown with a thin comb-over, a fuller fringe round the back above the ears, short sideburns,
    and a big drooping walrus mustache over the mouth."""
    hair = M["hair"]
    for k in range(20):
        a = math.radians(-112 + 224 * k / 19)  # 0 = back
        sx, cy = math.sin(a), math.cos(a)
        side = abs(sx)
        ztop = 1.79 - 0.02 * side
        zend = 1.745 if side > 0.8 else 1.635 + 0.015 * jit(k) + 0.06 * side
        ctrl = [(0.112 * sx, 0.118 * cy, ztop), (0.13 * sx, 0.136 * cy + 0.006, (ztop + zend) / 2 + 0.01),
                (0.137 * sx, 0.142 * cy + 0.012, zend + 0.012), (0.132 * sx, 0.138 * cy + 0.014, zend)]
        Q.strand(f"fringe{k}", curve(ctrl, 6), 0.022, 0.005, hair, "head", sides=4, flat=0.4, wide=(cy, -sx, 0))
    for s in (1, -1):  # sideburns in front of the ears
        for k in range(3):
            Q.strand(f"burn{s}{k}", curve([(0.118 * s, -0.025 - 0.012 * k, 1.75), (0.122 * s, -0.03 - 0.012 * k, 1.71), (0.12 * s, -0.03 - 0.014 * k, 1.665)], 5),
                     0.011, 0.004, hair, "head", sides=4, flat=0.5, wide=(0, 1, 0))
    for k in range(11):  # comb-over from a low parting on his left
        y = -0.08 + 0.016 * k
        xm = HEAD_R[0] * math.sqrt(max(0.0, 1 - ((y - HEAD_C[1]) / HEAD_R[1]) ** 2)) * 0.92
        pts = [skull_pt(xm - 2 * xm * t, y + 0.01 * math.sin(math.pi * t), 0.0015) for t in (0, 0.25, 0.5, 0.75, 0.95)]
        Q.strand(f"comb{k}", pts, 0.0045, 0.002, hair, "head", sides=4, flat=0.25, wide=(0, 1, 0))
    for s in (1, -1):  # walrus mustache: thick locks from under the nose, drooping past the mouth corners
        for k in range(8):
            u = k / 7
            pts = [head_pt(s * (0.004 + 0.02 * u), 1.668 - 0.002 * u, 0.017), head_pt(s * (0.02 + 0.034 * u), 1.657 - 0.004 * u, 0.026),
                   head_pt(s * (0.028 + 0.046 * u), 1.636 - 0.01 * u, 0.022), head_pt(s * (0.03 + 0.05 * u), 1.616 - 0.014 * u + 0.004 * jit(k), 0.012)]
            Q.strand(f"walrus{s}{k}", curve(pts, 6), 0.012, 0.003, hair, "head", sides=4, flat=0.6, wide=(0, 0, 1))


def flitwick_hair(Q, M):
    """White hair thin on top with wild tufts flaring over the ears, a curled white mustache and a pointed beard."""
    hair = M["hair"]
    Q.sphere("haircap", (0, 0.018, 1.76), (0.127, 0.128, 0.103), hair, "head", seg=12, rings=7)
    for s in (1, -1):
        for k in range(14):
            a = math.radians(40 + 95 * (k % 7) / 6)  # from the back round the side, two layers
            z0 = 1.74 + (0.05 if k >= 7 else 0.0) + 0.012 * math.sin(k * 1.7)
            sx, cy = s * math.sin(a), math.cos(a)
            base = (0.118 * sx, 0.118 * cy + 0.01, z0)
            L = 0.055 + 0.015 * jit(k, s)
            lift = 0.5 if k >= 7 else 0.15
            ctrl = [base, (base[0] + sx * L * 0.5, base[1] + cy * L * 0.4, z0 + lift * L * 0.6),
                    (base[0] + sx * L, base[1] + cy * L * 0.7 + 0.01 * jit(k, 5), z0 + lift * L * 0.5 - 0.01)]
            Q.strand(f"tuft{s}{k}", curve(ctrl, 5), 0.022, 0.004, hair, "head", sides=4, flat=0.6, wide=(0, 0, 1))
    for s in (1, -1):  # mustache, ends curled down
        for k in range(4):
            pts = [head_pt(s * (0.005 + 0.004 * k), 1.667 - 0.002 * k, 0.015), head_pt(s * (0.04 + 0.005 * k), 1.66 - 0.004 * k, 0.02),
                   head_pt(s * (0.065 + 0.005 * k), 1.64 - 0.006 * k, 0.012), head_pt(s * (0.07 + 0.004 * k), 1.615 - 0.006 * k, 0.006)]
            Q.strand(f"mst{s}{k}", curve(pts, 6), 0.0085, 0.002, hair, "head", sides=4, flat=0.6, wide=(0, 0, 1))
    for k in range(11):  # pointed beard from the jaw to a tip below the chin
        u = -1 + 2 * k / 10
        root = head_pt(0.075 * u, 1.632 - 0.02 * (1 - u * u), -0.004)
        ctrl = [root, (0.06 * u, root[1] - 0.025, 1.585), (0.03 * u, -0.15, 1.53), (0.006 * u, -0.155, 1.47 + 0.01 * abs(u))]
        Q.strand(f"beard{k}", curve(ctrl, 6), 0.016, 0.002, hair, "head", sides=4, flat=0.6, wide=(1, 0, 0), blend=("chest", 1.58, 1.5))


def lockhart_hair(Q, M):
    """Voluminous wavy golden hair from a parting on his left: locks root along the parting, sweep over the skull
    and down the sides with a wave and an outward flick at the collar; the front locks lift into a pompadour;
    the back locks fall from the crown."""
    hair = M["hair"]
    Q.sphere("haircap", (0, 0.012, 1.765), (0.136, 0.134, 0.118), hair, "head", seg=14, rings=8)
    i = 0
    for s, n, phi1 in ((-1, 12, 1.95), (1, 8, 1.85)):  # his right side (more hair) and left side
        for k in range(n):
            u = k / (n - 1)
            y0 = -0.1 + 0.16 * u
            y1 = min(y0 + 0.14 - 0.05 * u, 0.09)
            phi0 = -0.3 if s == -1 else 0.32
            ctrl = []
            for t in [j / 7 for j in range(8)]:
                y = y0 + (y1 - y0) * t ** 1.2
                kk = math.sqrt(max(0.08, 1 - (y / HEAD_R[1]) ** 2))
                vol = 0.02 + 0.012 * math.sin(math.pi * t) + 0.007 * math.sin(5 * t + k) + 0.02 * t ** 4
                if s == -1 and k < 4:
                    vol += (0.04 - 0.009 * k) * math.exp(-(((t - 0.18) / 0.13) ** 2))  # the pompadour
                phi = phi0 + (phi1 - phi0) * t
                ctrl.append((s * (HEAD_R[0] * kk + vol) * math.sin(phi), y, HEAD_C[2] + (HEAD_R[2] * kk + vol) * math.cos(phi)))
            Q.strand(f"wave{i}", curve(ctrl, 9), 0.032, 0.007, hair, "head", sides=4, flat=0.3, wide=(0, 1, 0))
            i += 1
    for k in range(9):  # back of the head, from the crown down to the collar
        a = math.radians(-80 + 160 * k / 8)
        sx, cy = math.sin(a), math.cos(a)
        ctrl = [skull_pt(0.03 * sx, 0.05 + 0.02 * cy, 0.01), (0.12 * sx, 0.13 * cy + 0.03, 1.8), (0.15 * sx, 0.16 * cy + 0.03, 1.71),
                (0.155 * sx + 0.008 * math.sin(k), 0.165 * cy + 0.035, 1.64), (0.175 * sx, 0.185 * cy + 0.045, 1.6)]
        Q.strand(f"back{k}", curve(ctrl, 7), 0.034, 0.008, hair, "head", sides=4, flat=0.3, wide=(cy, -sx, 0))


def moody_hair(Q, M):
    """A long grizzled mane in two greys, uneven bangs, and scars across the face; a chunk out of the nose."""
    hair, grey = M["hair"], lib.mat("HairGrey", lib.hexrgb("#5f5a52"), 0.9)
    Q.sphere("haircap", (0, 0.015, 1.765), (0.133, 0.13, 0.115), hair, "head", seg=12, rings=8)
    hair_sheet(Q, "manesheet", grey, math.radians(-118), math.radians(118), 1.85, 1.56, (0.158, 0.158))
    for k in range(30):
        a = math.radians(-138 + 276 * k / 29)
        sx, cy = math.sin(a), math.cos(a)
        side = abs(sx)
        front = cy < -0.4
        zend = (1.66 if front else 1.5 + 0.06 * side) + 0.03 * jit(k)
        j1, j2 = 0.015 * jit(k, 1), 0.02 * jit(k, 2)
        ctrl = [(0.04 * sx, 0.04 * cy, 1.865), (0.13 * sx, 0.125 * cy + 0.005, 1.81), (0.155 * sx + j1, 0.15 * cy + 0.02, 1.71),
                (0.17 * sx + j2, 0.17 * cy + 0.045, 1.6), (0.18 * sx + j1 + j2, 0.18 * cy + 0.06, zend)]
        if front:
            ctrl = ctrl[:3] + [(0.16 * sx + j2, 0.155 * cy + 0.02, zend)]
        Q.strand(f"mane{k}", curve(ctrl, 7), 0.03, 0.005, grey if k % 3 == 1 else hair, "head", sides=4, flat=0.3, wide=(cy, -sx, 0),
                 blend=None if front else ("chest", 1.6, 1.52))
    for k in range(6):  # ragged bangs that stop above the brows
        x = -0.07 + 0.028 * k
        ctrl = [(x * 0.5, -0.03, 1.875), (x * 0.9, -0.105, 1.85), head_pt(x * 1.05, 1.795 + 0.012 * jit(k, 4), 0.008)]
        Q.strand(f"bang{k}", curve(ctrl, 5), 0.02, 0.004, grey if k % 2 else hair, "head", sides=4, flat=0.3, wide=(1, 0, 0))
    scar = lib.mat("Scar", lib.hexrgb("#a8665a"), 0.6)
    for i, ((x0, z0), (x1, z1)) in enumerate((((0.005, 1.805), (0.07, 1.75)), ((-0.03, 1.703), (0.03, 1.692)), ((0.05, 1.705), (0.088, 1.628)), ((-0.022, 1.615), (0.018, 1.597)), ((-0.075, 1.68), (-0.06, 1.62)))):
        pts = [head_pt(x0 + (x1 - x0) * t + 0.003 * math.sin(9 * t), z0 + (z1 - z0) * t, 0.002 + 0.008 * (i == 1)) for t in (0, 0.33, 0.66, 1)]
        Q.strand(f"scar{i}", pts, 0.0042, 0.0025, scar, "head", sides=4, flat=0.6)
    Q.sphere("nosechunk", head_pt(0.014, 1.69, 0.024), (0.009, 0.007, 0.009), lib.mat("ScarDark", lib.hexrgb("#6a3a32"), 0.7), "head", seg=8, rings=5)


def moody_strap(Q, M, x, ez):
    """The leather strap of the magical eye: a loop on the head through the eye socket, running up across the
    forehead to the far side of the crown and back under the near ear (like an eyepatch strap)."""
    c = Vector(HEAD_C)
    u = (Vector(head_pt(x, ez, 0.0)) - c).normalized()
    v = Vector((0.7, 0.0, 1.0))
    v = (v - u * v.dot(u)).normalized()
    pts = []
    for k in range(25):
        t = math.radians(14 + (360 - 28) * k / 24)  # leave out the stretch behind the eye rim
        dvec = u * math.cos(t) + v * math.sin(t)
        r = 1 / math.sqrt((dvec.x / HEAD_R[0]) ** 2 + (dvec.y / HEAD_R[1]) ** 2 + (dvec.z / HEAD_R[2]) ** 2)
        pts.append(tuple(c + dvec * (r + 0.006)))
    Q.strand("eyestrap", pts, 0.0045, 0.0045, lib.mat("Leather", lib.hexrgb("#2a1d12"), 0.5), "head", sides=4, flat=0.5)


def extras(Q, M, who):
    hair = M["hair"]
    if who == "dumbledore":
        dumbledore_hair(Q, M)
        # half-moon spectacles: torus frames cut at the middle, a bridge, and arms back to the ears
        gl = Q.torus("glassesL", head_pt(0.046, 1.716, 0.024), 0.025, 0.0035, M["gold"], "head", rot=(math.pi / 2, 0, 0), seg=24, minor=5)
        cut_half(gl, Q.T((0, 0, 1.716))[2] + 0.002)
        gr = Q.torus("glassesR", head_pt(-0.046, 1.716, 0.024), 0.025, 0.0035, M["gold"], "head", rot=(math.pi / 2, 0, 0), seg=24, minor=5)
        cut_half(gr, Q.T((0, 0, 1.716))[2] + 0.002)
        Q.strand("bridge", curve([head_pt(-0.022, 1.716, 0.026), head_pt(0, 1.722, 0.03), head_pt(0.022, 1.716, 0.026)], 5), 0.0028, 0.0028, M["gold"], "head")
        temples(Q, M["gold"], 0.072, 1.717, 0.012)
        hat = lib.mat("Hat", lib.hexrgb(PROFESSORS["dumbledore"]["robe"]), 0.85)
        Q.cyl("hatbrim", (0, 0, 1.81), 0.19, 0.19, 0.02, hat, "head", verts=20)
        Q.cyl("hat1", (0, 0, 1.98), 0.15, 0.08, 0.34, hat, "head", verts=16, rot=(0.08, 0, 0))
        Q.cyl("hat2", (0, 0.04, 2.25), 0.082, 0.0, 0.26, hat, "head", verts=12, rot=(0.35, 0, 0))
        Q.torus("hatband", (0, 0, 1.84), 0.145, 0.012, M["trim"], "head", seg=16, minor=4)
        for i in range(4):
            a = i * 1.6
            Q.sphere(f"star{i}", (math.sin(a) * 0.1, -math.cos(a) * 0.1 - 0.04, 1.9 + i * 0.07), (0.015, 0.008, 0.015), M["gold"], "head", seg=6, rings=4)
        wand(Q, M)
    elif who == "mcgonagall":
        mcgonagall_hair(Q, M)
        for s in (1, -1):
            Q.torus(f"glass{s}", head_pt(0.046 * s, 1.722, 0.024), 0.026, 0.0035, M["dark"], "head", rot=(math.pi / 2, math.pi / 4, 0), seg=4, minor=6)
        Q.box("bridge", head_pt(0, 1.722, 0.03), (0.03, 0.004, 0.004), M["dark"], "head")
        temples(Q, M["dark"], 0.072, 1.722, 0.012)
        hat = lib.mat("Hat", lib.hexrgb("#0a2219"), 0.85)
        Q.cyl("hatbrim", (0, 0, 1.82), 0.3, 0.3, 0.015, hat, "head", verts=24)
        Q.cyl("hat", (0, 0.01, 2.07), 0.14, 0.0, 0.5, hat, "head", verts=16, rot=(-0.1, 0, 0))
        Q.torus("hatband", (0, 0, 1.84), 0.135, 0.012, M["trim"], "head", seg=16, minor=4)
        wand(Q, M)
    elif who == "trelawney":
        trelawney_hair(Q, M)
        for s in (1, -1):
            Q.torus(f"glass{s}", head_pt(0.05 * s, 1.722, 0.026), 0.04, 0.005, M["gold"], "head", rot=(math.pi / 2, 0, 0), seg=20, minor=5)
        Q.strand("bridge", curve([head_pt(-0.012, 1.722, 0.03), head_pt(0, 1.728, 0.034), head_pt(0.012, 1.722, 0.03)], 5), 0.003, 0.003, M["gold"], "head")
        temples(Q, M["gold"], 0.09, 1.722, 0.016)
        shawl = lib.mat("Shawl", lib.hexrgb("#b5643c"), 0.9)
        Q.cyl("shawl", (0, 0, 1.43), 0.255, 0.225, 0.18, shawl, "chest", verts=20, cap=False)
        Q.cyl("shawlfringe", (0, 0, 1.31), 0.275, 0.255, 0.06, lib.mat("Fringe", lib.hexrgb("#3f7a5a"), 0.9), "chest", verts=20, cap=False)
        for i in range(3):
            Q.torus(f"beads{i}", (0, -0.03, 1.42 - i * 0.05), 0.13 - i * 0.008, 0.01, M["gold"], "chest", rot=(1.25, 0, 0), seg=12, minor=4)
        Q.sphere("crystal", (0.31, -0.08, 0.86), (0.1, 0.1, 0.1), lib.mat("Crystal", lib.hexrgb("#bfe3ff"), 0.05, emit=lib.hexrgb("#7fb2ff")), "lowerarm.L", seg=16, rings=10)
        wand(Q, M)
    elif who == "slughorn":
        slughorn_hair(Q, M)
        # watch chain from the middle button to a waistcoat pocket
        Q.strand("watchchain", curve([(0, front_y(1.0, who) - 0.008, 1.0), (0.09, front_y(0.96, who) + 0.02, 0.955), (0.18, -0.29, 0.99)], 7), 0.004, 0.004, M["gold"], "spine", sides=4)
        Q.box("pocket", (0.19, -0.288, 1.0), (0.07, 0.012, 0.006), M["dark"], "spine", rot=(0, 0, 0.5))
        # an hourglass in the left hand: wooden caps and posts round two glass cones, sand in the bottom one
        wood, glass = lib.mat("Staff", lib.hexrgb("#4a3524"), 0.8), lib.mat("Glass", lib.hexrgb("#d8ecf4"), 0.05)
        hx, hy = 0.31, -0.085
        for z in (1.0, 0.86):
            Q.cyl(f"hgcap{z}", (hx, hy, z), 0.042, 0.042, 0.012, wood, "lowerarm.L", verts=14)
        for k in range(3):
            a = k * math.tau / 3
            Q.cyl(f"hgpost{k}", (hx + 0.034 * math.cos(a), hy + 0.034 * math.sin(a), 0.93), 0.004, 0.004, 0.14, wood, "lowerarm.L", verts=6)
        Q.cyl("hgtop", (hx, hy, 0.96), 0.004, 0.03, 0.068, glass, "lowerarm.L", verts=14)
        Q.cyl("hgbot", (hx, hy, 0.9), 0.03, 0.004, 0.068, glass, "lowerarm.L", verts=14)
        Q.cyl("hgsand", (hx, hy, 0.882), 0.026, 0.012, 0.032, lib.mat("Sand", lib.hexrgb("#e2b04a"), 0.8), "lowerarm.L", verts=12)
        wand(Q, M)
    elif who == "snape":
        snape_hair(Q, M)
        wand(Q, M)
    elif who == "lockhart":
        lockhart_hair(Q, M)
        Q.sphere("cravat", (0, -0.2, 1.5), (0.06, 0.035, 0.045), lib.mat("Cravat", lib.hexrgb("#f2e6ff"), 0.6), "chest", seg=10, rings=6)
        Q.sphere("star", (0, -0.222, 1.4), (0.025, 0.008, 0.025), lib.mat("Star", lib.hexrgb("#ffd700"), 0.3, emit=lib.hexrgb("#ffd700")), "chest", seg=6, rings=4)
        wand(Q, M)
    elif who == "moody":
        moody_hair(Q, M)
        staff = lib.mat("Staff", lib.hexrgb("#4a3524"), 0.8)
        Q.cyl("staff", (0.31, -0.06, 0.95), 0.022, 0.022, 1.9, staff, "lowerarm.L", verts=8)
        Q.sphere("knob", (0.31, -0.06, 1.92), (0.04, 0.04, 0.04), staff, "lowerarm.L", seg=8, rings=6, subd=1)
        Q.cyl("staffcap", (0.31, -0.06, 0.03), 0.026, 0.024, 0.06, M["metal"], "lowerarm.L", verts=10)
        # wooden left leg ending in a clawed foot
        Q.cyl("peg", (0.09, -0.03, 0.09), 0.028, 0.02, 0.15, staff, "root", verts=8)
        for k in range(3):
            a = (k - 1) * 0.5
            Q.strand(f"claw{k}", curve([(0.09, -0.03, 0.03), (0.09 + 0.05 * math.sin(a), -0.03 - 0.05 * math.cos(a), 0.018), (0.09 + 0.08 * math.sin(a), -0.03 - 0.08 * math.cos(a), 0.004)], 5),
                     0.012, 0.004, M["metal"], "root", sides=4)
        # hip flask on the belt
        Q.box("flask", (0.21, -0.13, 1.03), (0.05, 0.022, 0.085), M["metal"], "spine", rot=(0, 0, -0.55))
        Q.cyl("flaskcap", (0.21, -0.13, 1.08), 0.01, 0.01, 0.02, M["dark"], "spine", verts=8)
        wand(Q, M)
    elif who == "flitwick":
        flitwick_hair(Q, M)
        bow = lib.mat("Bowtie", lib.hexrgb("#8a1f2a"), 0.6)
        for s in (1, -1):
            Q.sphere(f"bow{s}", (0.032 * s, -0.16, 1.535), (0.03, 0.012, 0.02), bow, "chest", rot=(0, 0, 0.2 * s), seg=8, rings=5)
        Q.sphere("bowknot", (0, -0.168, 1.535), (0.012, 0.01, 0.013), bow, "chest", seg=8, rings=5)
        # a book carried by its top edge in the left hand
        Q.box("book", (0.31, -0.03, 0.83), (0.04, 0.15, 0.19), lib.mat("BookCover", lib.hexrgb("#1f3f7a"), 0.6), "lowerarm.L")
        Q.box("bookpages", (0.31, -0.034, 0.83), (0.032, 0.148, 0.182), lib.mat("Pages", lib.hexrgb("#efe6cf"), 0.9), "lowerarm.L")
        Q.box("bookband", (0.31, -0.03, 0.79), (0.042, 0.152, 0.012), M["gold"], "lowerarm.L")
        wand(Q, M)
    elif who == "hagrid":
        hagrid_hair(Q, M)
        # keep the eyes and nose clear of the beard: the beard sits below z=1.68
        pink = lib.mat("Umbrella", lib.hexrgb("#f4a6c8"), 0.7)
        Q.cyl("ushaft", (-0.31, -0.08, 0.75), 0.008, 0.008, 0.75, M["wand"], "lowerarm.R", rot=(-0.12, 0, 0), verts=8)
        Q.cyl("ucanopy", (-0.31, -0.05, 0.62), 0.045, 0.012, 0.45, pink, "lowerarm.R", rot=(-0.12, 0, 0), verts=10)
        Q.torus("uhandle", (-0.31, -0.12, 1.0), 0.03, 0.008, M["wand"], "lowerarm.R", rot=(0, math.pi / 2, 0), seg=10, minor=4)
        Q.sphere("wandtip", (-0.31, -0.02, 0.38), (0.012, 0.012, 0.012), M["tip"], "lowerarm.R", seg=6, rings=4)
        Q.cyl("uferrule", (-0.31, -0.018, 0.4), 0.009, 0.007, 0.03, M["metal"], "lowerarm.R", rot=(-0.12, 0, 0), verts=8)


BONES_REF = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("spine", (0, 0, 0.3), (0, 0, 1.2), "root"),
    ("chest", (0, 0, 1.2), (0, 0, 1.55), "spine"),
    ("head", (0, 0, 1.55), (0, 0, 1.95), "chest"),
    ("upperarm.L", (SH_X, 0, SH_Z), (0.3, 0, EL_Z), "chest"),
    ("lowerarm.L", (0.3, 0, EL_Z), (0.31, 0, WR_Z), "upperarm.L"),
    ("upperarm.R", (-SH_X, 0, SH_Z), (-0.3, 0, EL_Z), "chest"),
    ("lowerarm.R", (-0.3, 0, EL_Z), (-0.31, 0, WR_Z), "upperarm.R"),
]


def build_one(who, lod=1.0):
    lib.reset()
    p = PROFESSORS[who]
    s, w = p["height"] / 1.9, WIDE.get(who, 1.0)
    M = materials(p, STYLE[who])
    P = lib.Parts(lod)
    Q = Sc(P, s, w)
    base_body(Q, M, who)
    dress(Q, M, who)
    face(Q, M, who)
    extras(Q, M, who)
    mesh = P.join(f"Professor_{who}")
    rig = lib.armature(f"ProfessorRig_{who}", [(n, Q.T(h), Q.T(t), par) for n, h, t, par in BONES_REF])
    lib.bind(mesh, rig)
    return rig, mesh


# Rotation conventions (probed): upperarm.R local X + swings the arm forward and up; local Z - swings it
# out to the side. upperarm.L local X + forward; local Z + out. head/chest local X + nods forward.
def animate(rig, who=""):
    A = lib.Anim(rig)
    A.reset()
    # Idle: 120 frames, breathe and a gentle sway, wand arm slightly forward
    for f, k in ((1, 0), (31, 1), (61, 0), (91, -1), (121, 0)):
        A.key("spine", "rotation_euler", f, (0, 0, 0.025 * k))
        A.key("chest", "scale", f, (1 + 0.012 * abs(k), 1, 1 + 0.012 * abs(k)))
        A.key("head", "rotation_euler", f, (0.03 * abs(k), 0, -0.06 * k))
        A.key("upperarm.R", "rotation_euler", f, (0.25, 0, 0))
        A.key("lowerarm.R", "rotation_euler", f, (0.35 + 0.03 * k, 0, 0))
        A.key("upperarm.L", "rotation_euler", f, (0.05, 0, 0.04))
        A.key("lowerarm.L", "rotation_euler", f, (0.15, 0, 0))
    A.push("Idle")
    # Lecture: 60 frames, open-palm gesture with the left arm out toward the class
    for f, k in ((1, 0), (16, 1), (31, 0.3), (46, 1), (61, 0)):
        if who == "moody":  # his left hand holds the staff, so he gestures with the wand hand
            A.key("upperarm.R", "rotation_euler", f, (0.3 + 0.3 * k, 0, -0.4 - 0.35 * k))
            A.key("lowerarm.R", "rotation_euler", f, (0.8 + 0.3 * k, 0, 0))
            A.key("upperarm.L", "rotation_euler", f, (0.05, 0, 0.04))
            A.key("lowerarm.L", "rotation_euler", f, (0.15, 0, 0))
        else:
            A.key("upperarm.L", "rotation_euler", f, (0.3 + 0.3 * k, 0, 0.4 + 0.35 * k))
            A.key("lowerarm.L", "rotation_euler", f, (0.8 + 0.3 * k, 0, 0))
            A.key("upperarm.R", "rotation_euler", f, (0.25, 0, 0))
            A.key("lowerarm.R", "rotation_euler", f, (0.35, 0, 0))
        A.key("head", "rotation_euler", f, (-0.04 * k, 0, 0.1 * k))
        A.key("chest", "rotation_euler", f, (0, 0, 0.06 * k))
    A.push("Lecture")
    # WandRaise: 73 frames (2.4 s): from the idle pose, wand arm sweeps up and forward, holds, comes back
    for f, k in ((1, 0), (16, 0.75), (25, 1), (49, 1), (61, 0.35), (73, 0)):
        A.key("upperarm.R", "rotation_euler", f, (0.25 + 1.5 * k, 0, -0.75 * k))
        A.key("lowerarm.R", "rotation_euler", f, (0.35 + 0.25 * k, 0, 0))
        A.key("upperarm.L", "rotation_euler", f, (0.05, 0, 0.04 + 0.15 * k))
        A.key("lowerarm.L", "rotation_euler", f, (0.15, 0, 0))
        A.key("head", "rotation_euler", f, (-0.1 * k, 0, 0))
        A.key("chest", "rotation_euler", f, (-0.05 * k, 0, 0))
    A.push("WandRaise")
    # Point: 37 frames (1.2 s): from the idle pose the wand arm comes up and aims the wand level at the class
    # (forearm about 60 degrees forward plus the 35 degree wand tilt), a small jab, then back to idle
    for f, k, jab in ((1, 0, 0), (9, 0.85, 0), (13, 1, 0), (18, 1, 1), (24, 1, 0), (29, 0.85, 0), (37, 0, 0)):
        A.key("upperarm.R", "rotation_euler", f, (0.25 + 0.5 * k + 0.08 * jab, 0, -0.12 * k))
        A.key("lowerarm.R", "rotation_euler", f, (0.35 + 0.15 * k - 0.04 * jab, 0, 0))
        A.key("upperarm.L", "rotation_euler", f, (0.05, 0, 0.04))
        A.key("lowerarm.L", "rotation_euler", f, (0.15, 0, 0))
        A.key("head", "rotation_euler", f, (0.04 * k + 0.03 * jab, 0, -0.08 * k))
        A.key("chest", "rotation_euler", f, (0.02 * k, 0, -0.07 * k))
    A.push("Point")
    # Nod: 31 frames (1.0 s): two nods of the head with a slight bow of the chest, arms at idle
    for f, k in ((1, 0), (7, 1), (13, 0.15), (19, 0.8), (25, 0.1), (31, 0)):
        A.key("head", "rotation_euler", f, (0.24 * k, 0, 0))
        A.key("chest", "rotation_euler", f, (0.04 * k, 0, 0))
        A.key("upperarm.R", "rotation_euler", f, (0.25, 0, 0))
        A.key("lowerarm.R", "rotation_euler", f, (0.35, 0, 0))
        A.key("upperarm.L", "rotation_euler", f, (0.05, 0, 0.04))
        A.key("lowerarm.L", "rotation_euler", f, (0.15, 0, 0))
    A.push("Nod")
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 120


def build(who, previews=True):
    rig, mesh = build_one(who)
    animate(rig, who)
    n = lib.tris([mesh])
    path = os.path.join(lib.MODELS, f"professor_{who}.glb")
    os.makedirs(lib.MODELS, exist_ok=True)
    kb = lib.export(path, [rig, mesh])
    print(f"[professor] {who} tris={n} kb={kb:.1f}")
    if previews and lib.PREVIEWS:
        H = PROFESSORS[who]["height"]
        s = H / 1.9
        lib.clips_preview(rig, f"professor-{who}", [
            ("Idle", 1, (0, 0, H * 0.55), H * 1.75 + 1.0, -25, 0.2, ""),
            ("Idle", 1, (0, 0, 1.7 * s), 0.75 * s + 0.15, 0, 0.0, "_face"),
            ("Lecture", 16, (0, 0, H * 0.55), H * 1.75 + 1.0, 20, 0.2, ""),
            ("WandRaise", 37, (0, 0, H * 0.6), H * 1.9 + 1.0, -45, 0.2, ""),
            ("Point", 18, (0, 0, H * 0.6), H * 1.9 + 1.0, -70, 0.2, ""),
            ("Nod", 7, (0, 0, 1.7 * s), 0.75 * s + 0.3, -60, 0.0, "_face"),
        ])
    return n, kb


if __name__ == "__main__":
    a = lib.args()
    keys = [a["who"]] if "who" in a else list(PROFESSORS)
    for k in keys:
        build(k)
