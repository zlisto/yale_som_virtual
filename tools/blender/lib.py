# Shared helpers for the character build scripts (Blender 5.x, run headless).
# Convention: Z up, the character faces -Y (glTF export turns this into +Z forward, Y up in three.js).
# Every part is skinned rigidly to one bone through a vertex group named after that bone. We never use
# heat weighting: parts inside the head (eyes, teeth) then follow the head bone exactly.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(REPO, "public", "models")
PREVIEWS = os.environ.get("CHAR_PREVIEWS", "")  # set to a folder to render EEVEE previews


def args():
    """Arguments after `--` on the Blender command line, as key=value pairs."""
    out = {}
    if "--" in sys.argv:
        for a in sys.argv[sys.argv.index("--") + 1:]:
            k, _, v = a.partition("=")
            out[k] = v
    return out


def reset(fps=30):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = fps
    MATS.clear()


# ---------- materials (cached by name; the name becomes the glTF material name the app looks up)
MATS = {}


def mat(name, rgb, rough=0.8, metal=0.0, emit=None, fur_bump=False):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = 3.0
    if fur_bump:  # preview-only fur: glTF drops procedural bumps, the app adds its own fur bump map
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 180.0
        noise.inputs["Detail"].default_value = 6.0
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.45
        nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    MATS[name] = m
    return m


def set_color(name, rgb):
    bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1)


def hexrgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


# ---------- parts
class Parts:
    """Collects part objects, each tagged with the bone it is rigidly bound to."""

    def __init__(self, lod=1.0, subd=0):
        self.objs = []
        self.lod = lod  # multiplies segment counts (the seated crowd builds at a lower lod)
        self.subd = subd  # default Catmull-Clark levels for spheres and tori (applied, so the GLB carries it)

    def n(self, k, lo=4):
        return max(lo, int(round(k * self.lod)))

    def _finish(self, o, name, m, bone, smooth=True):
        o.name = name
        o.data.materials.append(m)
        vg = o.vertex_groups.new(name=bone)
        vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
        for p in o.data.polygons:
            p.use_smooth = smooth
        self.objs.append(o)
        return o

    def sphere(self, name, loc, radii, m, bone, rot=(0, 0, 0), seg=16, rings=10, taper=None, displace=0.0, subd=None):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=self.n(seg, 6), ring_count=self.n(rings, 4), radius=1)
        o = bpy.context.active_object
        if taper:  # pull the top toward a point: taper=(start, amount); start in [-1,1] of local z
            s0, amt = taper
            for v in o.data.vertices:
                if v.co.z > s0:
                    k = (v.co.z - s0) / (1 - s0)
                    f = 1 - amt * k ** 1.3
                    v.co.x *= f
                    v.co.y *= f
        for v in o.data.vertices:
            v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        if displace:
            fuzz(o, displace)
        subdivide(o, self.subd if subd is None else subd)
        o.rotation_euler = rot
        o.location = loc
        apply_tf(o)
        return self._finish(o, name, m, bone)

    def cyl(self, name, loc, r1, r2, depth, m, bone, rot=(0, 0, 0), verts=12, scale=(1, 1, 1), cap=True):
        bpy.ops.mesh.primitive_cone_add(vertices=self.n(verts, 6), radius1=r1, radius2=r2, depth=depth,
                                        end_fill_type="NGON" if cap else "NOTHING")
        o = bpy.context.active_object
        for v in o.data.vertices:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
        o.rotation_euler = rot
        o.location = loc
        apply_tf(o)
        o = self._finish(o, name, m, bone)
        return o

    def box(self, name, loc, size, m, bone, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1)
        o = bpy.context.active_object
        o.scale = size
        o.rotation_euler = rot
        o.location = loc
        apply_tf(o)
        return self._finish(o, name, m, bone, smooth=False)

    def torus(self, name, loc, R, r, m, bone, rot=(0, 0, 0), seg=20, minor=8, scale=(1, 1, 1), subd=None):
        bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=self.n(seg, 8), minor_segments=self.n(minor, 4))
        o = bpy.context.active_object
        for v in o.data.vertices:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
        subdivide(o, self.subd if subd is None else subd)
        o.rotation_euler = rot
        o.location = loc
        apply_tf(o)
        return self._finish(o, name, m, bone)

    def poly(self, name, verts, faces, m, bone, smooth=False):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in verts], [], faces)
        me.update()
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return self._finish(o, name, m, bone, smooth=smooth)

    def strand(self, name, pts, r0, r1, m, bone, sides=4, flat=1.0, wide=None, blend=None):
        """Tapered tube along the polyline `pts` (radius r0 at the root to r1 at the tip), closed at both ends.
        flat < 1 squashes the cross-section into a ribbon whose wide side lies along `wide` (a direction).
        blend=(bone2, z_hi, z_lo): vertices fade from `bone` (above z_hi) to bone2 (below z_lo), so a beard
        hangs from the head at the chin and from the chest at its tip."""
        P = [Vector(q) for q in pts]
        n = len(P)
        t = (P[1] - P[0]).normalized()
        ref = Vector(wide) if wide else (Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0)))
        u = (ref - t * ref.dot(t)).normalized()
        verts, faces, prev = [], [], t
        for i, q in enumerate(P):
            t = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized()
            ax = prev.cross(t)
            if ax.length > 1e-7:
                u = Matrix.Rotation(prev.angle(t), 3, ax.normalized()) @ u
            prev = t
            v = t.cross(u).normalized()
            u = v.cross(t).normalized()
            k = i / (n - 1)
            r = r0 * (1 - k) ** 0.85 + r1 * k
            for j in range(sides):
                a = 2 * math.pi * j / sides
                verts.append(q + u * (math.cos(a) * r) + v * (math.sin(a) * r * flat))
        for i in range(n - 1):
            for j in range(sides):
                j1 = (j + 1) % sides
                faces.append((i * sides + j, i * sides + j1, (i + 1) * sides + j1, (i + 1) * sides + j))
        root, tip = len(verts), len(verts) + 1
        verts.append(P[0])
        verts.append(P[-1] + t * max(r1, 0.0005))
        last = (n - 1) * sides
        for j in range(sides):
            j1 = (j + 1) % sides
            faces.append((root, j1, j))
            faces.append((tip, last + j, last + j1))
        o = self.poly(name, verts, faces, m, bone, smooth=True)
        if blend:
            b2, zh, zl = blend
            g1, g2 = o.vertex_groups[bone], o.vertex_groups.new(name=b2)
            for vv in o.data.vertices:
                w = min(1.0, max(0.0, (zh - vv.co.z) / (zh - zl)))
                g1.add([vv.index], 1.0 - w, "REPLACE")
                g2.add([vv.index], w, "REPLACE")
        return o

    def lathe(self, name, profile, m, bone, seg=32, loc=(0, 0, 0), rot=(0, 0, 0), disp=None, closed=False, subd=0):
        """Surface of revolution about local Z from (r, z) pairs, with an optional radial offset disp(theta, z).
        Draw a closed profile counterclockwise (outer side going up) so the normals face out of the solid."""
        verts, faces = [], []
        for r, z in profile:
            for j in range(seg):
                th = 2 * math.pi * j / seg
                rr = r + (disp(th, z) if disp else 0.0)
                verts.append((rr * math.cos(th), rr * math.sin(th), z))
        rings = len(profile)
        for i in range(rings if closed else rings - 1):
            i1 = (i + 1) % rings
            for j in range(seg):
                j1 = (j + 1) % seg
                faces.append((i * seg + j, i * seg + j1, i1 * seg + j1, i1 * seg + j))
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        me.update()
        # UVs for the cloth normal map: u around (4 repeats), v up the profile in meters x 4
        uv = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                i, j = divmod(vi, seg)
                if j == 0 and any(me.loops[l].vertex_index % seg == seg - 1 for l in poly.loop_indices):
                    j = seg  # the seam column closes at u = 1
                uv.data[li].uv = (4 * j / seg, 4 * profile[i][1])
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        bpy.context.view_layer.objects.active = o
        subdivide(o, subd)
        o.rotation_euler = rot
        o.location = loc
        apply_tf(o)
        return self._finish(o, name, m, bone)

    def text(self, name, body, m, bone, size, place):
        """Flat text mesh in the XZ plane (reads from -Y), then `place(v)` maps each vertex onto a surface."""
        bpy.ops.object.text_add()
        t = bpy.context.active_object
        t.data.body = body
        t.data.size = size
        t.data.align_x = "CENTER"
        t.data.align_y = "CENTER"
        t.data.resolution_u = 2
        t.data.fill_mode = "FRONT"
        t.rotation_euler = (math.pi / 2, 0, 0)
        bpy.ops.object.convert(target="MESH")
        o = bpy.context.active_object
        apply_tf(o)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.to_mesh(o.data)
        bm.free()
        for v in o.data.vertices:
            v.co = place(v.co)
        return self._finish(o, name, m, bone, smooth=False)

    def join(self, name, objs=None):
        objs = objs if objs is not None else self.objs
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        o = bpy.context.active_object
        o.name = name
        o.data.name = name
        if objs is self.objs:
            self.objs = []
        else:
            self.objs = [x for x in self.objs if x not in objs]
        return o


def apply_tf(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def subdivide(o, levels):
    """Apply Catmull-Clark, then rescale about the centre so the bounding box matches the cage (subdivision
    shrinks a coarse sphere by a few percent). Runs before the part gets its single-bone vertex group, so the
    rigid weight of 1.0 holds for every new vertex."""
    if not levels:
        return
    def box(o):
        xs = [v.co for v in o.data.vertices]
        lo = Vector((min(c.x for c in xs), min(c.y for c in xs), min(c.z for c in xs)))
        hi = Vector((max(c.x for c in xs), max(c.y for c in xs), max(c.z for c in xs)))
        return lo, hi
    lo0, hi0 = box(o)
    m = o.modifiers.new("subd", "SUBSURF")
    m.levels = m.render_levels = levels
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)
    lo1, hi1 = box(o)
    c0, c1 = (lo0 + hi0) / 2, (lo1 + hi1) / 2
    k = [((hi0[i] - lo0[i]) / (hi1[i] - lo1[i])) if hi1[i] - lo1[i] > 1e-9 else 1.0 for i in range(3)]
    for v in o.data.vertices:
        d = v.co - c1
        v.co = Vector((c0.x + d.x * k[0], c0.y + d.y * k[1], c0.z + d.z * k[2]))


def fuzz(o, amount, size=0.035):
    """Lumpy fur silhouette: displace along normals with a fine cloud noise, applied to the mesh."""
    tex = bpy.data.textures.get("FurNoise") or bpy.data.textures.new("FurNoise", "CLOUDS")
    tex.noise_scale = size
    tex.noise_depth = 2
    d = o.modifiers.new("fuzz", "DISPLACE")
    d.texture = tex
    d.strength = amount
    d.mid_level = 0.5
    d.texture_coords = "GLOBAL"
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=d.name)


def ellipsoid_front(c, r, x, z, off=0.0):
    """Point on the front (-Y) surface of an ellipsoid at (x, z), pushed `off` outward along the normal."""
    u = 1 - ((x - c[0]) / r[0]) ** 2 - ((z - c[2]) / r[2]) ** 2
    y = c[1] - r[1] * math.sqrt(max(u, 0.0))
    p = Vector((x, y, z))
    n = Vector(((x - c[0]) / r[0] ** 2, (y - c[1]) / r[1] ** 2, (z - c[2]) / r[2] ** 2)).normalized()
    return p + n * off


# ---------- armature
def armature(name, bones):
    """bones: list of (name, head, tail, parent or None)."""
    data = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for bn, h, t, par in bones:
        b = data.edit_bones.new(bn)
        b.head, b.tail = Vector(h), Vector(t)
        # predictable axes: local Z points forward (-Y) where possible, so rotation about local Z is a
        # sideways swing in the XZ plane and rotation about local X is a forward/back swing
        d = (b.tail - b.head).normalized()
        fwd = Vector((0, -1, 0)) if abs(d.y) < 0.9 else Vector((0, 0, 1))
        b.align_roll(fwd)
        if par:
            b.parent = data.edit_bones[par]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    return rig


def bind(mesh, rig):
    """Parent with an armature modifier, keeping the explicit vertex groups."""
    mesh.parent = rig
    mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    missing = [g.name for g in mesh.vertex_groups if g.name not in rig.data.bones]
    assert not missing, f"vertex groups without bones: {missing}"
    for v in mesh.data.vertices:
        assert sum(g.weight for g in v.groups) > 0.99, f"unweighted vertex {v.index} in {mesh.name}"


# ---------- animation
class Anim:
    def __init__(self, rig):
        self.rig = rig
        self.pb = rig.pose.bones
        rig.animation_data_create()

    def reset(self):
        for pb in self.pb:
            pb.location = (0, 0, 0)
            pb.rotation_euler = (0, 0, 0)
            pb.scale = (1, 1, 1)

    def key(self, bone, prop, frame, value):
        pb = self.pb[bone]
        setattr(pb, prop, value)
        pb.keyframe_insert(prop, frame=frame)

    def keys(self, bone, prop, frames):
        for f, v in frames:
            self.key(bone, prop, f, v)

    def push(self, name, all_bones=True, end=None):
        """Key every bone at the clip's first frame (so clips fully override each other), then stash in NLA."""
        ad = self.rig.animation_data
        act = ad.action
        if all_bones:
            first = int(min(kp.co.x for fc in fcurves(act) for kp in fc.keyframe_points))
            last = int(max(kp.co.x for fc in fcurves(act) for kp in fc.keyframe_points))
            keyed = {fc.data_path for fc in fcurves(act)}
            for pb in self.pb:
                for prop, v in (("location", (0, 0, 0)), ("rotation_euler", (0, 0, 0)), ("scale", (1, 1, 1))):
                    if f'pose.bones["{pb.name}"].{prop}' not in keyed:  # per channel, so no channel leaks between clips
                        setattr(pb, prop, v)
                        pb.keyframe_insert(prop, frame=first)
                        pb.keyframe_insert(prop, frame=last)
        act.name = name
        act.use_fake_user = True
        tr = ad.nla_tracks.new()
        tr.name = name
        s = tr.strips.new(name, int(act.frame_range[0]), act)
        s.name = name
        ad.action = None
        self.reset()
        return act


def fcurves(act):
    """Blender 5 layered actions keep F-curves in channelbags; older ones on the action."""
    if hasattr(act, "fcurves") and len(getattr(act, "fcurves", [])):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.extend(cb.fcurves)
    return out


def solo(rig, name):
    for t in rig.animation_data.nla_tracks:
        t.mute = t.name != name
        t.is_solo = False


def unmute_all(rig):
    for t in rig.animation_data.nla_tracks:
        t.mute = False


# ---------- stats + export
def tris(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in objs:
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
    return n


def export(path, objs, animations=True, skins=True):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    kw = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_skins=skins,
        export_animations=animations,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_yup=True,
    )
    if animations:
        kw.update(export_animation_mode="NLA_TRACKS", export_force_sampling=True)
    bpy.ops.export_scene.gltf(**kw)
    kb = os.path.getsize(path) / 1024
    print(f"[export] {os.path.basename(path)} {kb:.1f} KB")
    return kb


def bake_pose(mesh, rig, track, frame, name):
    """Copy of `mesh` frozen in the pose at `frame` of NLA track `track`, unparented, no skin."""
    solo(rig, track)
    bpy.context.scene.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(mesh.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    o = bpy.data.objects.new(name, me)
    o.matrix_world = mesh.matrix_world.copy()
    bpy.context.scene.collection.objects.link(o)
    o.vertex_groups.clear()
    return o


# ---------- previews (EEVEE, headless)
def preview_setup(target_z, dist, height=None, lens=50, res=640):
    sc = bpy.context.scene
    names = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in names else "BLENDER_WORKBENCH"
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"
    if not sc.world:
        w = bpy.data.worlds.new("Studio")
        sc.world = w
        w.use_nodes = True
        bg = w.node_tree.nodes["Background"]
        bg.inputs["Color"].default_value = (0.5, 0.52, 0.56, 1)
        bg.inputs["Strength"].default_value = 0.7
        cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
        sc.collection.objects.link(cam)
        sc.camera = cam
        for nm, loc, e, size in (("Key", (-2.5, -3.5, 4), 500, 3), ("Fill", (3.5, -2.5, 2), 220, 4), ("Rim", (0, 3.5, 3.5), 300, 2)):
            l = bpy.data.objects.new(nm, bpy.data.lights.new(nm, "AREA"))
            l.data.energy = e
            l.data.size = size
            l.location = loc
            sc.collection.objects.link(l)
            look(l, Vector((0, 0, 0.6)))
        bpy.ops.mesh.primitive_plane_add(size=30)
        fl = bpy.context.active_object
        fl.name = "PreviewFloor"
        fm = bpy.data.materials.new("PreviewFloor")
        fm.use_nodes = True
        fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.55, 0.57, 1)
        fl.data.materials.append(fm)
    cam = sc.camera
    cam.data.lens = lens
    return cam


def look(obj, at):
    obj.rotation_euler = (at - obj.location).to_track_quat("-Z", "Y").to_euler()


def shot(path, target, dist, yaw_deg=-30, elev=0.25, lens=50, res=640):
    """Camera `dist` from `target`, `yaw_deg` around Z from the front (-Y), raised by `elev` m."""
    cam = preview_setup(target[2], dist, lens=lens, res=res)
    a = math.radians(yaw_deg)
    t = Vector(target)
    cam.location = (t.x + dist * math.sin(a), t.y - dist * math.cos(a), t.z + elev)
    look(cam, t)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[preview] {path}")


def clips_preview(rig, name, shots):
    """shots: list of (clip, frame, target, dist, yaw, elev, suffix)."""
    if not PREVIEWS:
        return
    os.makedirs(PREVIEWS, exist_ok=True)
    for clip, frame, target, dist, yaw, elev, suffix in shots:
        solo(rig, clip)
        bpy.context.scene.frame_set(frame)
        fn = f"{name}_{clip}_f{frame}{suffix}.png"
        shot(os.path.join(PREVIEWS, fn), target, dist, yaw, elev)
    unmute_all(rig)


# ---------- props (static, unskinned): lathes with a lobed plan, used by fountain.py
def lathe(name, profile, mat_, seg=96, lobes=0, depth=0.0, r_min=0.0, warp=None, cap=False):
    """Revolve a (radius, z) profile about Z into a smooth-shaded mesh. With `lobes`, every radius above `r_min`
    is scaled by 1 + depth * cos(lobes * angle), which gives a scalloped or quatrefoil plan. `warp(x, y, z)`
    may move each vertex afterwards. `cap` closes the top or bottom when the profile ends off the axis."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            k = 1 + depth * math.cos(lobes * a) if lobes and r > r_min else 1
            x, y, zz = r * k * math.cos(a), r * k * math.sin(a), z
            if warp:
                x, y, zz = warp(x, y, zz)
            ring.append(bm.verts.new((x, y, zz)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        a, b = rings[j], rings[j + 1]
        for i in range(seg):
            bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
    if cap:
        for ring in (rings[0], rings[-1]):
            if profile[rings.index(ring)][0] > 1e-6:
                bm.faces.new(ring)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    me.materials.append(mat_)
    for p in me.polygons:
        p.use_smooth = True
    return o


def bevel_sharp(o, width=0.012, segments=2, angle_deg=40):
    """Bevel the edges sharper than `angle_deg` and apply it (carved stone edges catch the light)."""
    m = o.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle_deg)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.ops.object.modifier_apply(modifier=m.name)


def smooth_by_angle(o, angle_deg=35):
    """Smooth shading with hard edges past `angle_deg` (Blender 4.1+ operator)."""
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))
