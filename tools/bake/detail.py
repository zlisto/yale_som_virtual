"""Detail pass on the exported building, run by bake.py inside Blender before the unwrap.

The app builds the building from boxes, planes and open cylinders. This pass rebuilds the
parts that read as boxes, from the plan numbers in lights.json['layout'] (src/layout.js):

  bevels       walls, shelves, library tables and columns get 2-segment bevels
  canopy       the flat roof plane becomes a 0.6 m slab, the courtyard opening gets a
               profiled fascia with a rounded lip
  rails        a silver rail along the courtyard glass at the level 4 line and a transom
  soffit edge  a curved fascia under the ceiling following the wavy courtyard glass
  mullions     T sections at every other courtyard glass point (about 1.6 m apart)
  door frames  steel jambs and head at every drum door
  baseboards   along the plaster walls and round the inside of every classroom
  coves        a ledge ring with an emissive strip near the top of every classroom; the
               strips replace the classroom point lights as the bake's light source
  desks        continuous horseshoe desks swept along each seating row, replacing the
               segmented desk boxes (same rows and radii, so CHAIRS and the crowd stay put)

Every new object is named bake_<role>__<key> with an app material key from World.jsx, so the
app gives it its own material and the bake gives it lightmap texels. Coordinates below are
three.js (x, y up, z); mesh() converts them to Blender's z-up axes.
"""

import math

import bmesh
import bpy
from mathutils import Vector

TAU = math.tau


def B(p):
    return Vector((p[0], -p[2], p[1]))


def material(key, color=(0.8, 0.8, 0.8), metallic=0.0, roughness=0.8, emit=None):
    m = bpy.data.materials.get(key)
    if m:
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit[0], 1)
        bsdf.inputs['Emission Strength'].default_value = emit[1]
    return m


def mesh(name, verts, faces, mat, role):
    me = bpy.data.meshes.new(name)
    me.from_pydata([B(v) for v in verts], [], faces)
    me.update()
    me.uv_layers.new(name='UVMap')  # uv0 slot; the app's materials on these keys use world-space UVs
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    ob['role'] = role
    fix_normals(ob)
    return ob


def fix_normals(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    for p in ob.data.polygons:
        p.use_smooth = False


class Builder:
    """Collects verts and faces for one object."""

    def __init__(self):
        self.v, self.f = [], []

    def box(self, c, size, yaw=0.0):
        """Axis box centred at c=(x, y, z) with size (along u, y, along w), rotated by yaw
        about y, where u = (cos yaw, 0, -sin yaw) like three's rotation.y."""
        cu, su = math.cos(yaw), math.sin(yaw)
        u = (cu, 0, -su)
        w = (su, 0, cu)
        base = len(self.v)
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    self.v.append((c[0] + u[0] * sx * size[0] / 2 + w[0] * sz * size[2] / 2,
                                   c[1] + sy * size[1] / 2,
                                   c[2] + u[2] * sx * size[0] / 2 + w[2] * sz * size[2] / 2))
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.f.append(tuple(base + i for i in q))

    def sweep(self, path, profile, normals, closed_path=False, closed_profile=True, caps=True):
        """Sweep a 2D profile [(a, b)] along a path of (x, y, z) points. a runs along the
        horizontal normal given per point, b along +y."""
        base = len(self.v)
        n = len(profile)
        for p, nv in zip(path, normals):
            for a, b in profile:
                self.v.append((p[0] + nv[0] * a, p[1] + b, p[2] + nv[1] * a))
        rings = len(path)
        segs = rings if closed_path else rings - 1
        pe = n if closed_profile else n - 1
        for i in range(segs):
            i2 = (i + 1) % rings
            for j in range(pe):
                j2 = (j + 1) % n
                self.f.append((base + i * n + j, base + i2 * n + j, base + i2 * n + j2, base + i * n + j2))
        if caps and not closed_path and closed_profile:
            self.f.append(tuple(base + j for j in range(n)))
            self.f.append(tuple(base + (rings - 1) * n + j for j in reversed(range(n))))

    def build(self, name, mat, role):
        return mesh(name, self.v, self.f, mat, role)


def loop_normals(pts, center=(0, 0)):
    """Horizontal unit normals of a closed polyline [(x, z)], pointing away from center."""
    out = []
    m = len(pts)
    for i in range(m):
        a, b = pts[i - 1], pts[(i + 1) % m]
        tx, tz = b[0] - a[0], b[1] - a[1]
        l = math.hypot(tx, tz) or 1
        nx, nz = tz / l, -tx / l
        if nx * (pts[i][0] - center[0]) + nz * (pts[i][1] - center[1]) < 0:
            nx, nz = -nx, -nz
        out.append((nx, nz))
    return out


def offset(pts, normals, d):
    return [(p[0] + n[0] * d, p[1] + n[1] * d) for p, n in zip(pts, normals)]


def round_rect(hx, hz, r, n=8):
    pts = []
    for cx, cz, q in ((hx - r, hz - r, 0), (-(hx - r), hz - r, 1), (-(hx - r), -(hz - r), 2), (hx - r, -(hz - r), 3)):
        for i in range(n + 1):
            a = (q + i / n) * math.pi / 2
            pts.append((cx + math.cos(a) * r, cz + math.sin(a) * r))
    return pts


def ell(c, rx, rz, th):
    return (c[0] + rx * math.sin(th), c[1] + rz * math.cos(th))


def select_only(objs):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def bevel(ob, width, segments=2, angle=30):
    """Weld the box faces (the exporter keeps three's split vertices), then bevel every edge
    sharper than `angle` degrees and shade the round-overs smooth."""
    me = ob.data
    if me.has_custom_normals:
        select_only([ob])
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(me)
    bm.free()
    mod = ob.modifiers.new('bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    mod.use_clamp_overlap = True
    mod.harden_normals = False
    select_only([ob])
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))


def run(L, bake_objs, log=print):
    by_name = {o.name: o for o in bake_objs}
    H, ROOF = L['H'], L['ROOF']
    court = [tuple(p) for p in L['courtyard']]
    cn = loop_normals(court)  # outward = from the courtyard into the concourse
    new = []
    removed = []

    def drop(name):
        o = by_name.pop(name, None)
        if o:
            removed.append(name)
            bpy.data.objects.remove(o, do_unlink=True)

    # ---- bevels
    for name, w in (('bake_walls__white', 0.03), ('bake_walls__sage', 0.03), ('bake_walls__shelf', 0.02),
                    ('bake_walls__slats', 0.015), ('bake_walls__leather', 0.04), ('bake_walls__desk', 0.015),
                    ('bake_columns__column', 0.02), ('bake_bein_column__column', 0.02)):
        if name in by_name:
            bevel(by_name[name], w)

    # ---- canopy slab and fascia
    can = by_name.get('bake_canopy__canopy')
    drop('bake_canopy_back__canopy')
    drop('bake_fascia__canopy')
    drop('bake_fascia_back__canopy')
    if can:
        mod = can.modifiers.new('slab', 'SOLIDIFY')
        mod.thickness = 0.6
        mod.offset = -1.0  # the plane faces up; the slab hangs below it
        mod.use_even_offset = True
        select_only([can])
        bpy.ops.object.modifier_apply(modifier=mod.name)
        fix_normals(can)
        can['role'] = 'canopy'
    hole = round_rect(13.5, 12.5, 2.5)
    hn = loop_normals(hole)  # outward = from the sky opening into the canopy
    # fascia: 1.3 m deep band with a rounded lip at the bottom, 0.45 m back into the slab
    lip = [(0.15 - 0.15 * math.cos(k / 4 * math.pi / 2), -1.0 + 0.15 - 0.15 * math.sin(k / 4 * math.pi / 2)) for k in range(5)]
    prof = [(0.0, 0.3)] + [(a, b) for a, b in [(0.0, -0.85)]] + lip[1:] + [(0.45, -1.0), (0.45, -0.55), (0.45, 0.3)]
    f = Builder()
    f.sweep([(x, ROOF, z) for x, z in hole], prof, hn, closed_path=True)
    new.append(f.build('bake_fascia__canopy', material('canopy', (0.88, 0.87, 0.84)), 'fascia'))

    # ---- silver rail at the level 4 line and a transom, both on the inside face of the glass
    silver = material('silver', (0.33, 0.37, 0.40), metallic=0.8, roughness=0.3)
    for y, r, name in ((H - 0.3, 0.11, 'rail'), (3.1, 0.07, 'transom')):
        circle = [(0.12 + r * math.cos(k / 12 * TAU), r * math.sin(k / 12 * TAU)) for k in range(12)]
        f = Builder()
        f.sweep([(x, y, z) for x, z in court], circle, cn, closed_path=True)
        new.append(f.build(f'bake_{name}__silver', silver, name))

    # ---- curved soffit edge: a downstand 0.8 m back from the glass with a rounded bottom
    edge = offset(court, cn, 0.8)
    en = loop_normals(edge)
    rnd = [(0.06 - 0.06 * math.cos(k / 3 * math.pi / 2), -0.45 + 0.06 - 0.06 * math.sin(k / 3 * math.pi / 2)) for k in range(4)]
    prof = [(0.0, -0.002)] + rnd + [(0.14, -0.45), (0.14, -0.002)]
    f = Builder()
    f.sweep([(x, H, z) for x, z in edge], prof, en, closed_path=True)
    new.append(f.build('bake_soffit_edge__ceiling', material('ceiling', (0.92, 0.91, 0.88)), 'soffit_edge'))

    # ---- mullions: T sections, flange on the glass, stem into the concourse
    f = Builder()
    for i in range(0, len(court), 2):
        (x, z), (nx, nz) = court[i], cn[i]
        yaw = math.atan2(-nz, nx)  # box u axis along the normal
        mid = (-5 + ROOF) / 2
        hgt = ROOF + 5
        f.box((x, mid, z), (0.03, hgt, 0.12), yaw)
        f.box((x + nx * 0.095, mid, z + nz * 0.095), (0.16, hgt, 0.04), yaw)
    drop('bake_mullions__mullion')
    new.append(f.build('bake_mullions__mullion', material('mullion', (0.025, 0.027, 0.033), metallic=0.6, roughness=0.4), 'mullions'))

    # ---- drum door frames, coves, inner baseboards
    steel = material('steel', (0.55, 0.58, 0.62), metallic=0.9, roughness=0.25)
    # 'dark', not 'plinth': Scenery.jsx puts leather maps on materials coloured like the plinth
    plinth = material('dark', (0.011, 0.012, 0.014), roughness=0.6)
    frames = Builder()
    bases = Builder()
    DW = L['DRUM_WALL']
    cove_ledge = Builder()
    for d in L['drums']:
        c, rx, rz = d['c'], d['rx'], d['rz']
        for a in d['doors']:
            for e in (a + d['gap'], a - d['gap']):
                po = ell(c, rx + 0.03, rz + 0.03, e)
                pi = ell(c, rx - DW - 0.03, rz - DW - 0.03, e)
                mid = ((po[0] + pi[0]) / 2, (po[1] + pi[1]) / 2)
                yaw = math.atan2(-(po[1] - pi[1]), po[0] - pi[0])
                frames.box((mid[0], 1.25, mid[1]), (math.dist(po, pi), 2.5, 0.07), yaw)
            e1, e2 = ell(c, rx - DW / 2, rz - DW / 2, a + d['gap']), ell(c, rx - DW / 2, rz - DW / 2, a - d['gap'])
            yaw = math.atan2(-(e2[1] - e1[1]), e2[0] - e1[0])
            frames.box(((e1[0] + e2[0]) / 2, 2.47, (e1[1] + e2[1]) / 2), (math.dist(e1, e2), 0.1, DW + 0.08), yaw)
        # baseboard strip round the inside wall, on the shell arcs only
        for a0, a1 in d['arcs']:
            n = max(8, int((a1 - a0) / TAU * 96))
            path = [ell(c, rx - DW, rz - DW, a0 + (a1 - a0) * k / n) for k in range(n + 1)]
            nrm = [(-(p[0] - c[0]), -(p[1] - c[1])) for p in path]
            nrm = [(x / math.hypot(x, z), z / math.hypot(x, z)) for x, z in nrm]
            bases.sweep([(x, 0.0, z) for x, z in path], [(0, 0), (0.015, 0), (0.015, 0.1), (0, 0.1)], nrm, closed_profile=True)
        # cove: ledge 0.35 m wide 0.7 m below the ceiling with a 0.15 m upstand; the emitter
        # strip lies on the ledge against the wall, hidden from the floor
        ring = [ell(c, rx - DW, rz - DW, k / 96 * TAU) for k in range(96)]
        rn = [((c[0] - x), (c[1] - z)) for x, z in ring]
        rn = [(x / math.hypot(x, z), z / math.hypot(x, z)) for x, z in rn]  # inward
        y = H - 0.7
        cove_ledge.sweep([(x, y, z) for x, z in ring], [(0, -0.05), (0.35, -0.05), (0.35, 0.15), (0.32, 0.15), (0.32, 0.0), (0, 0.0)], rn, closed_path=True)
        em = Builder()
        em.sweep([(x, y + 0.004, z) for x, z in ring], [(0.03, 0), (0.14, 0)], rn, closed_path=True, closed_profile=False, caps=False)
        o = em.build(f'emit_cove_{d["id"]}__cove', material('cove', emit=((1.0, 0.86, 0.68), 1.0)), 'cove')
        o['emitter'] = 1
        new.append(o)
    new.append(frames.build('bake_doorframes__steel', steel, 'doorframes'))
    new.append(cove_ledge.build('bake_coves__ceiling', material('ceiling'), 'coves'))

    # baseboards on the plaster walls (floor-standing, tall)
    for w in L['walls']:
        if w['mat'] not in ('white', 'sage') or w['y0'] > 0.01 or w['h'] < 2:
            continue
        (ax, az), (bx, bz) = w['a'], w['b']
        ln = math.hypot(bx - ax, bz - az)
        yaw = -math.atan2(bz - az, bx - ax)
        bases.box(((ax + bx) / 2, 0.05, (az + bz) / 2), (ln + 0.05, 0.1, w['t'] + 0.03), yaw)
    new.append(bases.build('bake_baseboards__dark', plinth, 'baseboards'))

    # ---- continuous horseshoe desks
    drop('bake_drumdesks__desk')
    desk = material('desk')
    f = Builder()
    for d in L['drums']:
        F, back = d['F'], d['back']
        t = (-back[1], back[0])
        for row in d['deskRows']:
            y0 = row['y0']
            for side in (1, -1):
                ds = sorted((x for x in row['desks'] if x['th'] * side > 0), key=lambda x: abs(x['th']))
                if not ds:
                    continue
                r = sum(x['r'] for x in ds) / len(ds)
                runs, cur = [], [ds[0]]
                for x in ds[1:]:
                    if (abs(x['th']) - abs(cur[-1]['th'])) * r > 1.7:  # a skipped desk: break the run
                        runs.append(cur)
                        cur = []
                    cur.append(x)
                runs.append(cur)
                for run_ in runs:
                    half = 0.6 / r
                    t0, t1 = abs(run_[0]['th']) - half, abs(run_[-1]['th']) + half
                    n = max(2, int((t1 - t0) / 0.06))
                    path, nrm = [], []
                    for k in range(n + 1):
                        th = side * (t0 + (t1 - t0) * k / n)
                        u = (math.cos(th) * back[0] + math.sin(th) * t[0], math.cos(th) * back[1] + math.sin(th) * t[1])
                        path.append((F[0] + u[0] * r, y0, F[1] + u[1] * r))
                        nrm.append(u)
                    # top 0.5 m deep at seat floor + 0.95 (the crowd puts laptops there), modesty
                    # panel on the front edge facing the lecturer
                    prof = [(-0.25, 0.0), (-0.22, 0.0), (-0.22, 0.91), (0.25, 0.91), (0.25, 0.95), (-0.25, 0.95)]
                    f.sweep(path, prof, nrm)
    new.append(f.build('bake_desks__desk', desk, 'desks'))

    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in list(by_name.values()) + new)
    log(f'detail pass: removed {removed}, added {len(new)} objects, baked building now {tris} triangles')
    return list(by_name.values()) + [o for o in new if not o.get('emitter')], [o for o in new if o.get('emitter')]
