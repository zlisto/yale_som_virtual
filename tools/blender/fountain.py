# Courtyard fountain, the lawn's centrepiece (Lan, round 4: "the fountain also looks pretty low poly"). Headless:
#   blender -b --factory-startup -P tools/blender/fountain.py -> public/models/fountain.glb
# Three tiers of pale limestone, 5.0 m across and 4.0 m tall: an eight-lobed ground basin with a moulded rim, a
# fluted pedestal, a twelve-lobed middle bowl on six scroll brackets, a slim column, an eight-lobed upper bowl,
# and a wizard-hat finial whose tip bends toward +x (three.js +x). The basin floors are a darker wet stone
# (material BasinInside) so the water above them reads. Static, unskinned, Draco. Z up here, Y up in three.js.
# The water (surfaces, falling sheets, spray, mist) is drawn by src/life/CourtyardFountain.jsx at the heights in
# WATER below; keep the two in step.
import bpy, bmesh, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

STONE = "#d3ccbc"
WET = "#4f5a57"
# water levels and lip radii the app uses: (water z, inner radius at the waterline, lip radius, lobes, depth)
WATER = {"basin": (0.58, 2.12, 2.48, 8, 0.05), "middle": (1.80, 1.30, 1.48, 12, 0.07), "upper": (2.87, 0.70, 0.82, 8, 0.06)}
HAT_TIP = (0.30, 0.0, 3.93)  # Blender coords of the finial tip, where the spray starts


def hat_warp(x, y, z):
    # bend the upper half of the crown toward +x and let the very tip droop a little
    if z <= 3.5:
        return x, y, z
    u = (z - 3.5) / 0.55
    return x + 0.3 * u * u, y, z - 0.12 * u ** 3


def bracket(name, a, mat):
    """A scroll bracket in the plane at angle `a`: a curved stone rib from the pedestal capital out under the bowl."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    n = 10
    t = 0.07  # half thickness
    outer, inner = [], []
    for i in range(n + 1):
        u = i / n
        r = 0.42 + 0.58 * u
        z_top = 1.36 + 0.34 * u ** 1.6  # follows the bowl's underside
        z_bot = z_top - (0.24 * (1 - u) + 0.05) - 0.06 * math.sin(math.pi * u)
        outer.append((r, z_top))
        inner.append((r, z_bot))
    loop = outer + inner[::-1]
    ca, sa = math.cos(a), math.sin(a)
    front, back = [], []
    for (r, z) in loop:
        front.append(bm.verts.new((r * ca - t * sa, r * sa + t * ca, z)))
        back.append(bm.verts.new((r * ca + t * sa, r * sa - t * ca, z)))
    bm.faces.new(front)
    bm.faces.new(back[::-1])
    m = len(loop)
    for i in range(m):
        bm.faces.new((front[i], back[i], back[(i + 1) % m], front[(i + 1) % m]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    me.materials.append(mat)
    return o


def build():
    lib.reset()
    S = lib.mat("FountainStone", lib.hexrgb(STONE), 0.85)
    W = lib.mat("BasinInside", lib.hexrgb(WET), 0.45)
    objs = []
    # step ring the basin stands on
    objs.append(lib.lathe("step", [(2.05, 0.0), (2.78, 0.0), (2.78, 0.1), (2.72, 0.15), (2.05, 0.15)], S, seg=96, lobes=8, depth=0.05, r_min=1))
    # ground basin wall: base moulding, wall, a rope band, an overhanging rim with a rounded top, inner wall
    basin = [(2.5, 0.15), (2.5, 0.24), (2.43, 0.29), (2.4, 0.42), (2.44, 0.45), (2.44, 0.49), (2.4, 0.52), (2.4, 0.62),
             (2.47, 0.66), (2.53, 0.7), (2.53, 0.76), (2.47, 0.8), (2.2, 0.8), (2.14, 0.76), (2.12, 0.35)]
    objs.append(lib.lathe("basin", basin, S, seg=128, lobes=8, depth=0.05, r_min=1))
    objs.append(lib.lathe("basin_floor", [(2.13, 0.35), (0.6, 0.35), (0.0, 0.35)], W, seg=128, lobes=8, depth=0.05, r_min=1))
    # pedestal: square-ish base mouldings, a fluted shaft, a capital
    ped = [(0.66, 0.35), (0.66, 0.46), (0.58, 0.5), (0.56, 0.56), (0.46, 0.6), (0.42, 0.66)]
    objs.append(lib.lathe("ped_base", ped, S, seg=64))
    objs.append(lib.lathe("ped_shaft", [(0.38, 0.66), (0.37, 0.9), (0.36, 1.2), (0.38, 1.24)], S, seg=96, lobes=16, depth=0.035))
    objs.append(lib.lathe("ped_cap", [(0.38, 1.24), (0.46, 1.27), (0.47, 1.31), (0.42, 1.34), (0.44, 1.38)], S, seg=64))
    # middle bowl: underside curve, lip with a bead, inner slope down to a dark floor
    mid = [(0.44, 1.38), (0.7, 1.43), (1.0, 1.53), (1.25, 1.63), (1.42, 1.73), (1.49, 1.79), (1.49, 1.86), (1.43, 1.89),
           (1.35, 1.88), (1.31, 1.82)]
    objs.append(lib.lathe("mid_bowl", mid, S, seg=144, lobes=12, depth=0.07, r_min=0.6))
    objs.append(lib.lathe("mid_floor", [(1.31, 1.82), (1.0, 1.72), (0.6, 1.68), (0.0, 1.68)], W, seg=144, lobes=12, depth=0.07, r_min=0.6))
    for k in range(6):
        objs.append(bracket(f"bracket{k}", k * math.pi / 3 + math.pi / 6, S))
    # slim column with a knop
    col = [(0.27, 1.68), (0.27, 1.76), (0.21, 1.82), (0.18, 1.98), (0.25, 2.03), (0.27, 2.09), (0.25, 2.14), (0.19, 2.19),
           (0.16, 2.46), (0.22, 2.52)]
    objs.append(lib.lathe("column", col, S, seg=48))
    # upper bowl
    up = [(0.22, 2.52), (0.45, 2.6), (0.66, 2.71), (0.79, 2.81), (0.83, 2.88), (0.82, 2.93), (0.76, 2.95), (0.71, 2.89)]
    objs.append(lib.lathe("up_bowl", up, S, seg=96, lobes=8, depth=0.06, r_min=0.4))
    objs.append(lib.lathe("up_floor", [(0.71, 2.89), (0.45, 2.84), (0.0, 2.83)], W, seg=96, lobes=8, depth=0.06, r_min=0.4))
    # finial: a short drum, then the wizard hat (wavy brim, band, crown bending to a drooping tip)
    objs.append(lib.lathe("drum", [(0.17, 2.83), (0.17, 2.96), (0.21, 2.99), (0.21, 3.03)], S, seg=40))
    objs.append(lib.lathe("brim", [(0.12, 3.03), (0.44, 3.0), (0.5, 3.02), (0.46, 3.06), (0.24, 3.1)], S, seg=72, lobes=5, depth=0.07, r_min=0.3))
    crown = [(0.24, 3.1), (0.235, 3.18), (0.25, 3.2), (0.25, 3.27), (0.22, 3.29)] + [
        (0.22 * (1 - i / 16) ** 1.1 + 0.004, 3.29 + 0.76 * i / 16) for i in range(1, 17)]
    objs.append(lib.lathe("crown", crown, S, seg=40, warp=hat_warp))
    for o in objs:
        if o.name.startswith("bracket"):
            lib.bevel_sharp(o, width=0.012, segments=1, angle_deg=40)
        lib.smooth_by_angle(o, 40)
    print(f"[fountain] {lib.tris(objs)} tris")
    return objs


if __name__ == "__main__":
    objs = build()
    os.makedirs(lib.MODELS, exist_ok=True)
    lib.export(os.path.join(lib.MODELS, "fountain.glb"), objs, animations=False, skins=False)
    if lib.PREVIEWS:
        lib.preview_setup(2.0, 9.0, height=3.0)
        lib.shot(os.path.join(lib.PREVIEWS, "fountain.png"), (0, 0, 1.8), 9.0, yaw_deg=-30, elev=1.6)
        lib.shot(os.path.join(lib.PREVIEWS, "fountain_top.png"), (0, 0, 3.3), 3.0, yaw_deg=10, elev=0.3)
