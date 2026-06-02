"""Author CLEAN frame chrome (SVG) to replace the busy, magenta-keyed rasters.

The shipped frame-rectangle / inner-frame / inner-cell are ornate (starburst,
rays, scrollwork) AND magenta-chroma-keyed, so darkening them re-exposed pink
halos + grain. The mockup's chrome is the opposite: a thin gold border with
small 4-point corner stars and small edge-midpoint diamonds, on a flat
near-black interior. Authored as SVG with the fill BAKED IN, this is crisp at
any scale, has true-alpha transparency (no chroma key -> magenta impossible),
and a mathematically flat fill (no grain).

Three surfaces, dimensioned to match the existing assets so the addon's draw
code (whole-texture outer, 9-slice columns, stretched cell) is unchanged apart
from the texture name:

  frame-clean.svg       1418x1000  outer Hub frame   (whole texture)
  inner-frame-clean.svg 1433x 920  columns           (9-slice; corner=100px)
  inner-cell-clean.svg   256x 256  stat tiles        (stretched)
"""
import os

HERE = os.path.dirname(__file__)
FILL  = "#0c0a17"   # mockup near-black interior
GOLD  = "#d4a373"
GOLDB = "#f0c896"

def star(cx, cy, arm, fill=GOLDB):
    w = max(2.0, arm * 0.22)
    pts = f"{cx},{cy-arm} {cx+w},{cy-w} {cx+arm},{cy} {cx+w},{cy+w} {cx},{cy+arm} {cx-w},{cy+w} {cx-arm},{cy} {cx-w},{cy-w}"
    return f'<polygon points="{pts}" fill="{fill}"/>'

def diamond(cx, cy, d, fill=GOLD):
    return f'<polygon points="{cx},{cy-d} {cx+d},{cy} {cx},{cy+d} {cx-d},{cy}" fill="{fill}"/>'

def frame(w, h, inset, rx, bw, double, corner_off, star_arm, dia, stars=True, diamonds=True, border_op=1.0):
    x0, y0, rw, rh = inset, inset, w - 2*inset, h - 2*inset
    e = [f'<rect x="{x0}" y="{y0}" width="{rw}" height="{rh}" rx="{rx}" ry="{rx}" '
         f'fill="{FILL}" stroke="{GOLD}" stroke-width="{bw}" stroke-opacity="{border_op}"/>']
    if double:
        g = 7
        e.append(f'<rect x="{x0+g}" y="{y0+g}" width="{rw-2*g}" height="{rh-2*g}" rx="{rx-4}" ry="{rx-4}" '
                 f'fill="none" stroke="{GOLD}" stroke-width="{bw*0.5}" stroke-opacity="0.65"/>')
    if stars:
        for cx, cy in [(x0+corner_off, y0+corner_off), (x0+rw-corner_off, y0+corner_off),
                       (x0+corner_off, y0+rh-corner_off), (x0+rw-corner_off, y0+rh-corner_off)]:
            e.append(star(cx, cy, star_arm))
    if diamonds:
        for cx, cy in [(x0+rw/2, y0), (x0+rw/2, y0+rh), (x0, y0+rh/2), (x0+rw, y0+rh/2)]:
            e.append(diamond(cx, cy, dia))
    body = "\n  ".join(e)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">\n  {body}\n</svg>\n'

SPECS = [
    # name,                 w,    h,    inset, rx, bw,  double, corner_off, star_arm, dia, stars, diamonds, border_op
    ("frame-clean",        1418, 1000, 16,   30, 4.5, True,  44, 17, 7, True,  True,  1.0),
    ("inner-frame-clean",  1433, 920,  16,   58, 5.0, False, 52, 15, 6, True,  True,  0.85),
    ("inner-cell-clean",   256,  256,  6,    18, 2.0, False, 0,  0,  0, False, False, 0.22),
]
for name, w, h, inset, rx, bw, double, co, sa, dia, st, di, bo in SPECS:
    svg = frame(w, h, inset, rx, bw, double, co, sa, dia, st, di, bo)
    open(os.path.join(HERE, name + ".svg"), "w").write(svg)
    print("wrote", name + ".svg", f"({w}x{h})")
print("svgs done")
