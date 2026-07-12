"""Generates 8x8x8 3D-LUT strip textures (64x8 PNG) for the built-in color grades.

Strip layout: width = SIZE*SIZE, height = SIZE. Slice b (0..SIZE-1) occupies
columns [b*SIZE, (b+1)*SIZE); within a slice, column = r index, row = g index.
This matches the sampling formula in gl.ts's applyLut().
"""
import numpy as np
from PIL import Image

SIZE = 8
OUT_DIR = "public/builtin-assets/luts"


def clamp01(x):
    return np.clip(x, 0.0, 1.0)


def build(transform, name):
    img = np.zeros((SIZE, SIZE * SIZE, 3), dtype=np.uint8)
    for b in range(SIZE):
        bl = b / (SIZE - 1)
        for g in range(SIZE):
            gr = g / (SIZE - 1)
            for r in range(SIZE):
                rd = r / (SIZE - 1)
                rgb = transform(np.array([rd, gr, bl]))
                rgb = clamp01(rgb)
                img[g, b * SIZE + r] = (rgb * 255).round().astype(np.uint8)
    Image.fromarray(img, mode="RGB").save(f"{OUT_DIR}/{name}.png")
    print(f"wrote {name}.png")


def identity(rgb):
    return rgb


def warm(rgb):
    r, g, b = rgb
    r = r * 1.08 + 0.02
    b = b * 0.88
    g = g * 1.02
    return np.array([r, g, b])


def cool(rgb):
    r, g, b = rgb
    r = r * 0.9
    b = b * 1.12 + 0.02
    return np.array([r, g, b])


def noir(rgb):
    r, g, b = rgb
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    luma = clamp01((luma - 0.5) * 1.15 + 0.5)
    return np.array([luma, luma, luma])


build(identity, "identity")
build(warm, "warm")
build(cool, "cool")
build(noir, "noir")
