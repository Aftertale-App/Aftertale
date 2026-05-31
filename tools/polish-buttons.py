#!/usr/bin/env python3
"""
polish-buttons.py -- second-pass chroma cleanup for the button assets.

The button + CTA assets shipped via prep-frames.py have a faint magenta
halo at their antialiased edges -- the standard chroma key handles
magenta vs. gold well, but the violet button body confuses the de-spill
and leaves pink residue in the edge transparency band that WoW samples
during bilinear filtering.

`kill_pink` in prep-frames.py is too aggressive for buttons (it drops
every non-gold pixel, which erases the violet body). This script applies
a button-tuned version that:

  * Distinguishes pink residue from violet body. Pink: r ~= b, g much
    lower than both. Violet: b significantly > r, b much greater than g.
    The discriminator is the r/b ratio + the absolute g value.
  * For pixels matching the pink signature, force alpha to 0.
  * Then run a bleed pass so the now-transparent margin holds real edge
    colour (violet or gold), not magenta, before WoW's filter samples it.

Run once after prep-frames.py has shipped the button assets, or any time
the source art is re-keyed.
"""

from __future__ import annotations
import sys
from pathlib import Path

try:
    from PIL import Image
    import numpy as np
except ImportError:
    sys.exit("Requires Pillow + numpy: pip install Pillow numpy")

ROOT = Path(__file__).resolve().parent.parent
ART  = ROOT / "addon" / "Aftertale" / "Art" / "frame"
PUBLIC_FRAME = ROOT / "public" / "frame"

TARGETS = [
    "button-idle.png",
    "button-hover.png",
    "cta-chronicle-idle.png",
    "cta-chronicle-hover.png",
]


def kill_pink_keep_violet(img: Image.Image) -> Image.Image:
    """Drop pink/magenta edge residue while preserving violet button body.

    Pink residue signature (from magenta key de-spill at edges):
      * red and blue both high (>100)
      * red and blue similar in magnitude (|r-b| / max(r,b) < ~0.3)
      * green significantly lower than both (g < min(r,b) - 60)

    Violet body signature (what we want to keep):
      * blue significantly higher than red (b > r * 1.1)
      OR
      * everything dark (max channel < 100) -- shadow / deep plum

    Gold signature (also keep):
      * red >= green > blue
    """
    arr = np.asarray(img.convert("RGBA")).astype(np.float32)
    r, g, b, alpha = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]

    mn_rb = np.minimum(r, b)
    mx_rb = np.maximum(r, b)
    rb_close = np.abs(r - b) < (mx_rb * 0.30 + 1.0)  # +1 to avoid div-by-zero edge
    g_deficit = mn_rb - g

    pink_residue = (
        (r > 100) & (b > 100) &
        rb_close &
        (g_deficit > 60)
    )

    # Force the pink-tagged pixels fully transparent.
    new_alpha = np.where(pink_residue, 0.0, alpha)
    arr[..., 3] = new_alpha
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def bleed_edges(img: Image.Image, iters: int = 6) -> Image.Image:
    """Iteratively extrude opaque colour into transparent pixels.

    Lifted from prep-frames.py and re-applied so the now-larger transparent
    margin (after the pink kill) holds real edge colour instead of whatever
    the chroma key left behind. WoW samples textures bilinearly; any pixel
    that's transparent but holds magenta RGB will bleed magenta into the
    visible edge as a halo.
    """
    arr = np.asarray(img).astype(np.float32)
    rgb   = arr[..., :3]
    alpha = arr[..., 3]
    filled = alpha > 0.0
    for _ in range(iters):
        if filled.all():
            break
        todo = ~filled
        acc = np.zeros_like(rgb)
        cnt = np.zeros(rgb.shape[:2], dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh_rgb = np.roll(rgb, (dy, dx), axis=(0, 1))
            sh_f   = np.roll(filled, (dy, dx), axis=(0, 1))
            acc += sh_rgb * sh_f[..., None]
            cnt += sh_f
        newly = todo & (cnt > 0)
        safe = np.where(cnt > 0, cnt, 1.0)[..., None]
        avg = acc / safe
        rgb[newly] = avg[newly]
        filled = filled | newly
    arr[..., :3] = rgb
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def process(path: Path) -> None:
    if not path.exists():
        print(f"  SKIP (missing): {path}")
        return
    img = Image.open(path)
    before = img.copy()
    img = kill_pink_keep_violet(img)
    img = bleed_edges(img)
    img.save(path, "PNG", optimize=True)
    # Quick stat for sanity: how many pixels did we cut?
    a_before = np.asarray(before.convert("RGBA"))[..., 3]
    a_after  = np.asarray(img)[..., 3]
    cut = int(((a_before > 0) & (a_after == 0)).sum())
    print(f"  {path.name:32s} cut {cut:>6d} pink pixels")


def main() -> int:
    print(f"\n  scanning: {ART}\n")
    for name in TARGETS:
        process(ART / name)
    # Buttons aren't mirrored to public/ today, but be tidy if that changes.
    if PUBLIC_FRAME.exists():
        for name in TARGETS:
            p = PUBLIC_FRAME / name
            if p.exists():
                process(p)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
