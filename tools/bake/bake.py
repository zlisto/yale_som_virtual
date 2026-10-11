"""Bake lightmaps for the Evans Hall floor 2 building in Blender Cycles.

Run headless from the repo root, after export-building.mjs:

    blender -b --factory-startup --python tools/bake/bake.py -- [--samples 64] [--ao-samples 128] [--size 2048] [--ao-size 1024] [--atlases 4]
    python3 tools/bake/encode.py

Input: tools/bake/building.glb and tools/bake/lights.json from export-building.mjs.
Steps: import, detail pass (detail.py: bevels, canopy, rails, mullions, coves, desks), lights,
atlas assignment, lightmap UVs, then per atlas a lighting bake, a sun-only direct bake that is
subtracted from it, an AO bake, and OIDN denoising in the compositor.
Output:
    tools/bake/out/lm<i>.npy, ao<i>.npy   denoised float lighting and AO per atlas (gitignored)
    tools/bake/out/atlas.json             which object went to which atlas, texel density, timings
    public/baked/building.glb             baked surfaces with the lightmap UV set, Draco
encode.py turns the .npy files into the JPEG maps the app loads.

What the map contains: Cycles 'Diffuse' bake with direct and indirect light and the colour
contribution switched off, so each texel is the light arriving at the surface. The app
multiplies it by its own albedo textures. Light sources follow src/render/Lighting.jsx: the sun
(same direction, 3.2 W/m2, which is three's lux in its physically based units), the two
library point lights (three candela times 4 pi watts), the classroom cove strips that replace
the classroom point lights, and the app's HDRI sky with its sun disc clipped off so the sun is
not counted twice. The sun's direct light is then subtracted, because the app keeps a
real-time sun with a shadow map for crisp shadows; its bounce light stays in the map.
"""

import json
import math
import os
import sys
import time

import bpy
import bmesh
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import detail  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, 'out')

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {'samples': 256, 'ao-samples': 128, 'size': 2048, 'ao-size': 1024, 'atlases': 4, 'ao-distance': 1.0}
for i in range(0, len(argv) - 1, 2):
    opt[argv[i].lstrip('-')] = type(opt[argv[i].lstrip('-')])(argv[i + 1])
SIZE = opt['size']
N_ATLAS = opt['atlases']

# Texel density weights, as multipliers on surface area before atlas assignment and packing.
# The concourse floor and what is seen of the courtyard get the most texels; faces nobody
# sees (the top of the canopy) get the fewest. My judgment, from where the camera spends time.
WEIGHTS = {
    'floor': 2.0, 'lawn': 1.5, 'paving': 1.5, 'canopy_back': 1.5, 'columns': 1.5, 'fascia': 1.0,
    'fascia_back': 1.0, 'ceiling': 1.2, 'drum': 1.2, 'walls': 1.0, 'drumin': 0.8, 'room': 0.8,
    'tiers': 0.5, 'canopy': 1.0, 'terrace_soffit': 0.6, 'rail': 0.5, 'transom': 0.5, 'soffit_edge': 1.2,
    'mullions': 0.4, 'doorframes': 0.6, 'baseboards': 0.4, 'coves': 0.8, 'desks': 0.8,
}
# Cove strips replace the classroom point lights (16 cd each in the app, about 200 W): a
# 0.11 m strip round a 40-50 m perimeter is about 5 m2, so about 40 W/m2. Tuned by eye.
COVE_STRENGTH = 40.0
# Baked.jsx multiplies the map by this gain: an exposure for the interior. With the physical
# sky alone the shaded concourse comes out near a twentieth of the sunlit floor and reads as a
# cave next to the reference photos; 5.5 is my judgment by eye (the maps shipped on
# 2026-10-09 divided the library lamps by 4, an earlier value). Kept in step with LM_GAIN there.
LM_GAIN = 5.5
SUN_DIRECT_SAMPLES = 8  # the sun-only direct pass is shadow rays from one lamp; low noise
SKY_CLAMP = 12.0  # HDRI luminance above this is the sun disc (p99.9 of the sky is 7.9)
PACK_MARGIN = 6 / 2048  # UV-space gap between islands, 6 texels at 2048
BAKE_MARGIN = 8  # texels of edge extension around each island, covers mip level 3


def log(*a):
    print('[bake]', *a, flush=True)


def to_blender(v):
    """three.js (x, y up, z) to Blender (x, -z, y up)."""
    return Vector((v[0], -v[2], v[1]))


def srgb_to_linear(hexstr):
    c = [int(hexstr.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == 'METAL'
    sc.cycles.device = 'GPU'
    log('devices', [(d.name, d.type, d.use) for d in prefs.devices])
    sc.cycles.samples = opt['samples']
    sc.cycles.use_denoising = False  # bakes are denoised in the compositor afterwards
    # 4 diffuse bounces: each bounce off pale plaster and carpet keeps well under 80% of the
    # light, so later bounces add little; fewer bounces keep the bake under 25 min (my judgment,
    # not measured)
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 1
    sc.cycles.transmission_bounces = 1
    sc.cycles.max_bounces = 5
    # fireflies from small bright patches; the map's useful range tops out near 2
    sc.cycles.sample_clamp_indirect = 1.5
    return sc


def import_building():
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, 'building.glb'))
    bake, occ = [], []
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH':
            continue
        (bake if o.name.startswith('bake_') else occ).append(o)
    log(f'{len(bake)} baked objects, {len(occ)} occluders')
    return bake, occ


def add_lights(L):
    sc = bpy.context.scene
    # sun: +Z of the lamp points at the sun, it shines along -Z
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = L['sun']['intensity']
    sun.color = srgb_to_linear(L['sun']['color'])
    sun.angle = math.radians(1.0)  # a little softer than the 0.53 degree disc, like the app's PCF
    ob = bpy.data.objects.new('sun', sun)
    ob.rotation_euler = to_blender(L['sun']['dir']).normalized().to_track_quat('Z', 'Y').to_euler()
    sc.collection.objects.link(ob)

    lay = L['layout']
    in_drum = lambda x, z: any(((x - d['c'][0]) / d['rx']) ** 2 + ((z - d['c'][1]) / d['rz']) ** 2 < 1 for d in lay['drums'])
    for i, p in enumerate(L['points']):
        if in_drum(p['p'][0], p['p'][2]):
            continue  # classrooms are lit by their cove strips (detail.py) in the bake
        lt = bpy.data.lights.new(f'room{i}', 'POINT')
        # candela to watts (the glTF 'compat' mapping), divided by the app's lightmap gain
        # (LM_GAIN in Baked.jsx), which brightens the whole map like a camera exposure; the
        # lamps should keep the brightness they have in the real-time app
        lt.energy = p['intensity'] * 4 * math.pi / LM_GAIN
        lt.color = srgb_to_linear(p['color'])
        lt.shadow_soft_size = 0.4  # 0.7 m under the ceiling: a point source leaves a hot spot
        ob = bpy.data.objects.new(f'room{i}', lt)
        ob.location = to_blender(p['p'])
        sc.collection.objects.link(ob)

    # The app's ceiling downlights (8 cm discs at radiance 4) are left out. As emissive discs
    # they added nothing measurable to the room and their stray hits showed up as blotches
    # round every disc in the 32-sample pilot.

    # sky: the app's HDRI with the sun disc clipped
    w = bpy.data.worlds.new('sky')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(ROOT, 'public', L['hdri']))
    clamp = nt.nodes.new('ShaderNodeVectorMath')
    clamp.operation = 'MINIMUM'
    clamp.inputs[1].default_value = (SKY_CLAMP, SKY_CLAMP, SKY_CLAMP)
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 1.0
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(env.outputs['Color'], clamp.inputs[0])
    nt.links.new(clamp.outputs[0], bg.inputs['Color'])
    nt.links.new(bg.outputs[0], out.inputs['Surface'])
    w.light_settings.distance = opt['ao-distance']


def set_sources(sun=True, rest=True):
    """Switch the sun or everything else (sky, coves, room lights, downlights) on and off."""
    for o in bpy.context.scene.objects:
        if o.type == 'LIGHT':
            o.hide_render = not (sun if o.data.type == 'SUN' else rest)
    bpy.context.scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0 if rest else 0.0
    m = bpy.data.materials.get('cove')
    if m:
        m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = COVE_STRENGTH if rest else 0.0


def world_area(o):
    me = o.data
    mw = o.matrix_world
    return sum((mw.to_3x3() @ (me.vertices[p.vertices[1]].co - me.vertices[p.vertices[0]].co))
               .cross(mw.to_3x3() @ (me.vertices[p.vertices[2]].co - me.vertices[p.vertices[0]].co)).length / 2
               for p in me.polygons if len(p.vertices) == 3) + sum(p.area for p in me.polygons if len(p.vertices) != 3)


def weight(o):
    role = o.get('role', o.name[5:].split('__')[0])
    if role in WEIGHTS:
        return WEIGHTS[role]
    return WEIGHTS.get(role.split('_')[0], 1.0)


def assign_atlases(objs):
    items = sorted(((world_area(o) * weight(o), world_area(o), o) for o in objs), key=lambda t: -t[0])
    load = [0.0] * N_ATLAS
    atlas = [[] for _ in range(N_ATLAS)]
    for wa, a, o in items:
        i = load.index(min(load))
        load[i] += wa
        atlas[i].append(o)
        o['atlas'] = i
        o['area'] = a
    for i in range(N_ATLAS):
        log(f'atlas {i}: weighted area {load[i]:.0f} m2, {len(atlas[i])} objects, largest {atlas[i][0].name}')
    return atlas


def select_only(objs):
    bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


# curved pieces open into strips with an angle-based unwrap (the exporter keeps three's uv
# seams); everything else is planar faces, which Smart UV Project maps without distortion
CURVED = ('drum', 'drumin', 'columns', 'bein_column', 'bein_curtain', 'bein_mural', 'fascia', 'rail', 'transom',
          'soffit_edge', 'coves', 'desks', 'baseboards', 'tiers')


def is_curved(o):
    role = o.get('role', o.name[5:].split('__')[0])
    return role in CURVED or role.split('_')[0] in CURVED


def unwrap_atlas(objs):
    """Second UV set 'lightmap': unwrap (see CURVED), islands scaled to equal texel density,
    then scaled by the role weight, then packed together."""
    for o in objs:
        uv = o.data.uv_layers.get('lightmap') or o.data.uv_layers.new(name='lightmap')
        o.data.uv_layers.active = uv
        if len(o.data.uv_layers) > 1:
            o.data.uv_layers[0].active_render = True
    for group, curved in (([o for o in objs if is_curved(o)], True), ([o for o in objs if not is_curved(o)], False)):
        if not group:
            continue
        select_only(group)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.select_all(action='SELECT')
        if curved:
            bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.0)
        else:
            bpy.ops.uv.smart_project(angle_limit=math.radians(30), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
    select_only(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in objs:
        s = math.sqrt(weight(o))
        uv = o.data.uv_layers['lightmap'].data
        a = np.empty(len(uv) * 2, dtype=np.float32)
        uv.foreach_get('uv', a)
        uv.foreach_set('uv', a * s)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='FRACTION', margin=PACK_MARGIN, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    # texel density report
    for o in objs:
        uv = o.data.uv_layers['lightmap'].data
        me = o.data
        uvarea = 0.0
        for p in me.polygons:
            pts = [uv[li].uv for li in p.loop_indices]
            for k in range(1, len(pts) - 1):
                uvarea += abs((pts[k] - pts[0]).cross(pts[k + 1] - pts[0])) / 2
        o['texels_per_m'] = math.sqrt(uvarea * SIZE * SIZE / max(o['area'], 1e-6))


def bake_target(objs, name, size=None):
    size = size or SIZE
    img = bpy.data.images.get(name) or bpy.data.images.new(name, size, size, float_buffer=True, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    for o in objs:
        for slot in o.material_slots:
            nt = slot.material.node_tree
            node = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage')
            node.name = 'BAKE_TARGET'
            node.image = img
            nt.nodes.active = node
    return img


def unique_materials(objs):
    for o in objs:
        for slot in o.material_slots:
            m = slot.material.copy()
            m.name = f'{o.name}:{slot.material.name}'
            slot.material = m


def denoise(img, path):
    """OIDN through the compositor in a throwaway scene; writes and reloads a float EXR."""
    main = bpy.context.window.scene if bpy.context.window else bpy.context.scene
    sc = bpy.data.scenes.new('denoise')
    sc.render.resolution_x, sc.render.resolution_y = img.size
    sc.render.resolution_percentage = 100
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    sc.render.image_settings.exr_codec = 'ZIP'
    sc.render.filepath = path
    cam = bpy.data.objects.new('dncam', bpy.data.cameras.new('dncam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    nt = bpy.data.node_groups.new('denoise', 'CompositorNodeTree')
    nt.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    src = nt.nodes.new('CompositorNodeImage')
    src.image = img
    dn = nt.nodes.new('CompositorNodeDenoise')
    if 'HDR' in dn.inputs:
        dn.inputs['HDR'].default_value = True
    if 'Quality' in dn.inputs:
        try:
            dn.inputs['Quality'].default_value = 'High'
        except TypeError:
            pass
    out = nt.nodes.new('NodeGroupOutput')
    nt.links.new(src.outputs['Image'], dn.inputs['Image'])
    nt.links.new(dn.outputs['Image'], out.inputs[0])
    sc.compositing_node_group = nt
    sc.view_settings.view_transform = 'Standard'
    bpy.ops.render.render(write_still=True, scene=sc.name)
    res = bpy.data.images.load(path if path.endswith('.exr') else path + '.exr', check_existing=False)
    res.colorspace_settings.name = 'Non-Color'
    bpy.data.scenes.remove(sc)
    if main:
        bpy.context.window.scene = main if bpy.context.window else None
    return res


def to_numpy(img):
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)[:, :, :3]


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    L = json.load(open(os.path.join(HERE, 'lights.json')))
    sc = setup_scene()
    bake_objs, occ = import_building()
    bake_objs, emitters = detail.run(L['layout'], bake_objs, log=log)
    add_lights(L)
    set_sources(True, True)
    unique_materials(bake_objs)
    atlases = assign_atlases(bake_objs)
    t_uv = time.time()
    for objs in atlases:
        unwrap_atlas(objs)
    log(f'unwrap and pack {time.time() - t_uv:.0f} s')
    report = {'triangles': sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bake_objs + emitters), 'size': SIZE, 'samples': opt['samples'], 'ao_samples': opt['ao-samples'], 'atlases': []}
    sc.render.bake.margin = BAKE_MARGIN
    sc.render.bake.margin_type = 'EXTEND'
    timings = {}
    for i, objs in enumerate(atlases):
        select_only(objs)
        img = bake_target(objs, f'lm{i}')
        sc.cycles.samples = opt['samples']
        t = time.time()
        set_sources(True, True)
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=BAKE_MARGIN, margin_type='EXTEND',
                            use_clear=True, target='IMAGE_TEXTURES', uv_layer='lightmap')
        full = to_numpy(img)
        timings[f'lm{i}'] = time.time() - t
        # The app keeps the real-time sun (crisp shadows, specular), so the sun's direct light
        # comes out of the map: bake it alone and subtract. Its bounce light stays in.
        t = time.time()
        set_sources(True, False)
        sc.cycles.samples = SUN_DIRECT_SAMPLES
        sc.cycles.max_bounces = 0
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT'}, margin=BAKE_MARGIN, margin_type='EXTEND',
                            use_clear=True, target='IMAGE_TEXTURES', uv_layer='lightmap')
        sun = to_numpy(img)
        set_sources(True, True)
        sc.cycles.max_bounces = 5
        timings[f'sun{i}'] = time.time() - t
        log(f'lm{i} baked in {timings[f"lm{i}"]:.0f} s, sun direct {timings[f"sun{i}"]:.0f} s')
        np.save(os.path.join(OUT, f'lm{i}_full_raw.npy'), full.astype(np.float16))
        np.save(os.path.join(OUT, f'sun{i}.npy'), sun.astype(np.float16))
        rest = np.maximum(full - sun, 0.0)
        px = np.ones((SIZE, SIZE, 4), dtype=np.float32)
        px[:, :, :3] = rest
        img.pixels.foreach_set(px.ravel())
        dn = denoise(img, os.path.join(OUT, f'lm{i}_dn.exr'))
        np.save(os.path.join(OUT, f'lm{i}.npy'), to_numpy(dn).astype(np.float16))

        # AO is smooth, so it bakes at half resolution, which buys the full 128 samples
        ao = bake_target(objs, f'ao{i}', opt['ao-size'])
        sc.cycles.samples = opt['ao-samples']
        t = time.time()
        bpy.ops.object.bake(type='AO', margin=BAKE_MARGIN * opt['ao-size'] // SIZE, margin_type='EXTEND', use_clear=True,
                            target='IMAGE_TEXTURES', uv_layer='lightmap')
        timings[f'ao{i}'] = time.time() - t
        log(f'ao{i} baked in {timings[f"ao{i}"]:.0f} s')
        dn = denoise(ao, os.path.join(OUT, f'ao{i}_dn.exr'))
        np.save(os.path.join(OUT, f'ao{i}.npy'), to_numpy(dn)[:, :, 0].astype(np.float16))
        report['atlases'].append({
            'index': i,
            'objects': {o.name: {'area_m2': round(o['area'], 1), 'texels_per_m': round(o['texels_per_m'], 1)} for o in objs},
        })
    report['timings_s'] = {k: round(v) for k, v in timings.items()}

    # glTF for the app: baked objects only, no images, material names are the app keys
    for o in bake_objs:
        for slot in o.material_slots:
            nt = slot.material.node_tree
            n = nt.nodes.get('BAKE_TARGET')
            if n:
                nt.nodes.remove(n)
    bpy.ops.object.select_all(action='DESELECT')
    for o in emitters:
        o.select_set(True)
        o['key'] = 'cove'
        o['atlas'] = -1
    for o in bake_objs:
        o.select_set(True)
        o['key'] = o.name.split('__')[1].split('.')[0]
    out_glb = os.path.join(ROOT, 'public', 'baked', 'building.glb')
    os.makedirs(os.path.dirname(out_glb), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_glb, export_format='GLB', use_selection=True, export_extras=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='NONE',
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=14,
    )
    report['glb_bytes'] = os.path.getsize(out_glb)
    report['wall_time_s'] = round(time.time() - t0)
    json.dump(report, open(os.path.join(OUT, 'atlas.json'), 'w'), indent=1)
    log(f'done in {time.time() - t0:.0f} s, glb {report["glb_bytes"] / 1e6:.2f} MB')


main()
