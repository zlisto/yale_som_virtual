"""Encode the baked float maps from bake.py into the files the app loads.

    python3 tools/bake/encode.py [--format jpg|png] [--quality 92]

Lightmaps: value / scale, sRGB transfer curve, 8 bits per channel. sRGB spends its codes on
the dark end, where banding shows first; three decodes it on the GPU (colorSpace SRGB) and
Baked.jsx multiplies by pi * scale. `scale` is the 99.5th percentile of the brightest channel
over covered texels, rounded up to 0.25 and capped at 3, so hot texels clip instead of costing precision.
AO maps: linear 8-bit greyscale.
Writes public/baked/lm<i>.<fmt>, public/baked/ao<i>.jpg and src/render/bakedManifest.json.
"""
import argparse
import glob
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, 'out')
PUB = os.path.join(ROOT, 'public', 'baked')

ap = argparse.ArgumentParser()
ap.add_argument('--format', default='png')  # JPEG blocks showed on the smooth soffit
ap.add_argument('--quality', type=int, default=92)
args = ap.parse_args()
DESATURATE = 0.4

n = len(glob.glob(os.path.join(OUT, 'lm[0-9].npy')))
lms = [np.load(os.path.join(OUT, f'lm{i}.npy')).astype(np.float32)[::-1] for i in range(n)]  # Blender rows run bottom-up
peak = np.concatenate([a.max(-1)[a.max(-1) > 1e-4] for a in lms])
# capped at 3: texels right beside the cove strips run far brighter and may clip
scale = float(min(np.ceil(np.percentile(peak, 99.5) * 4) / 4, 3.0))


def srgb(x):
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


files, aofiles, total = [], [], 0
for i, a in enumerate(lms):
    # pull the bounce colour 40% toward grey: the green lawn bounce tinted the white soffit far
    # more than the reference photos show (my judgment by eye)
    lum = (a * np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).sum(-1, keepdims=True)
    a = lum + (a - lum) * (1 - DESATURATE)
    v = np.clip(srgb(np.clip(a / scale, 0, 1)) * 255 + 0.5, 0, 255).astype(np.uint8)
    f = f'lm{i}.{args.format}'
    im = Image.fromarray(v)
    if args.format == 'jpg':
        im.save(os.path.join(PUB, f), quality=args.quality, subsampling=0, optimize=True)
    else:
        im.save(os.path.join(PUB, f), optimize=True)
    files.append(f)
    ao = np.load(os.path.join(OUT, f'ao{i}.npy')).astype(np.float32)[::-1]
    g = np.clip(ao * 255 + 0.5, 0, 255).astype(np.uint8)
    fa = f'ao{i}.jpg'
    Image.fromarray(g).save(os.path.join(PUB, fa), quality=90, optimize=True)
    aofiles.append(fa)
    total += os.path.getsize(os.path.join(PUB, f)) + os.path.getsize(os.path.join(PUB, fa))
    print(f, os.path.getsize(os.path.join(PUB, f)) // 1024, 'KB;', fa, os.path.getsize(os.path.join(PUB, fa)) // 1024, 'KB')
json.dump({'scale': scale, 'lightmaps': files, 'ao': aofiles}, open(os.path.join(ROOT, 'src', 'render', 'bakedManifest.json'), 'w'), indent=1)
print(f'scale {scale}, maps total {total / 1e6:.1f} MB')
