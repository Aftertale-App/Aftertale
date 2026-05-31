#!/usr/bin/env python3
# tools/prep-icon-set.py
#
# One-shot processor for the AI-generated icon set (addon/Aftertale/Art/1.png
# .. 13.png). For each input:
#   * chroma-keys out the magenta (or white for #3) background to transparent
#     so the icon drops cleanly onto any panel color
#   * resizes to a power-of-two square (1024x1024) for Classic compatibility
#     (Vanilla/TBC/Wrath/etc. render non-POT UI textures blank)
#   * renames + relocates to the addon's Art tree under descriptive names
#   * mirrors the frame + book assets into public/ for the web side
#
# Run once after dropping 1.png..13.png into addon/Aftertale/Art/.

from __future__ import annotations
import shutil
from pathlib import Path
from PIL import Image

ROOT     = Path(__file__).resolve().parent.parent
ART_DIR  = ROOT / "addon" / "Aftertale" / "Art"
ICON_DIR = ART_DIR / "icons"
PUBLIC   = ROOT / "public"
ICON_DIR.mkdir(parents=True, exist_ok=True)

# (numbered source, destination path under ART_DIR, chroma-key color, tolerance, target size)
JOBS = [
    # The frame asset replaces the existing one. Keep at 1024 (already POT).
    ("1.png",  "frame/aftertale-9slice-frame.png", (255, 0, 255), 36, 1024),
    # The floating header sigil. 1024 keeps mip detail crisp at small display
    # sizes (we render it ~56-72px on screen; the bigger source means the GPU
    # picks a higher-resolution mip level when sampling).
    ("2.png",  "sigil-header.png",                  (255, 0, 255), 36, 1024),
    # 3.png has a white background with a purple vignette; key out the white
    # tightly so the vignette survives as part of the art.
    ("3.png",  "icons/moments.png",                 (255, 255, 255), 24, 1024),
    # Remaining icons all came back on bright magenta. Source size 1024 (up
    # from 512) -- icons get rendered ~56px on stat tiles and 24px on rows,
    # and the bigger source eliminates the soft/pixelated look of the first
    # pass without a meaningful file-size cost (~600KB each, 6MB total).
    ("4.png",  "icons/time.png",                    (255, 0, 255), 36, 1024),
    ("5.png",  "icons/zones.png",                   (255, 0, 255), 36, 1024),
    ("6.png",  "icons/quests.png",                  (255, 0, 255), 36, 1024),
    ("7.png",  "icons/feats.png",                   (255, 0, 255), 36, 1024),
    ("8.png",  "icons/dungeons.png",                (255, 0, 255), 36, 1024),
    ("9.png",  "icons/character.png",               (255, 0, 255), 36, 1024),
    ("10.png", "icons/level.png",                   (255, 0, 255), 36, 1024),
    ("11.png", "icons/death.png",                   (255, 0, 255), 36, 1024),
    ("12.png", "icons/items.png",                   (255, 0, 255), 36, 1024),
    # Book already came back on dark violet -- no chroma key, just resize.
    ("13.png", "book.png",                          None,            0, 1024),
]


def chroma_key(img: Image.Image, target: tuple[int, int, int], tol: int) -> Image.Image:
    """Remove a chroma background. Two algorithms:

    * For magenta (the AI-gen default) we use a hue-aware key with spill
      suppression. Pixels are scored by how "magenta-leaning" they are
      (deficit = min(R,B) - G). Strong deficit -> fully transparent; moderate
      deficit (the soft pink halo at the edge of foreground objects) -> partial
      alpha + green channel lifted to neutralize the pink tint, so we get a
      clean soft edge instead of a colored fringe.

    * For any other key colour we fall back to a per-channel tolerance check.

    Returns an RGBA image."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size

    is_magenta = target == (255, 0, 255)

    if is_magenta:
        # Tunable thresholds in terms of the magenta "deficit" -- how much
        # less green there is than the min of red/blue. Deeply magenta pixels
        # (BG) have deficit near 255; foreground pixels have deficit near 0;
        # soft anti-aliased edges sit between.
        SOFT = 30   # below this, treat as foreground (keep)
        HARD = 150  # above this, fully transparent
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if r < 100 or b < 100:
                    continue
                mn = min(r, b)
                if g >= mn:
                    continue
                deficit = mn - g
                if deficit <= SOFT:
                    continue
                if deficit >= HARD:
                    px[x, y] = (r, g, b, 0)
                else:
                    # Partial alpha across the soft band, with spill suppression:
                    # lift green to match min(R,B) so the pixel reads neutral
                    # instead of pink as it fades out.
                    t = (deficit - SOFT) / (HARD - SOFT)
                    alpha = int(255 * (1 - t))
                    px[x, y] = (r, mn, b, alpha)
        return img

    # Generic per-channel key (used for the white BG on the moments icon).
    tr, tg, tb = target
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if (abs(r - tr) <= tol and
                abs(g - tg) <= tol and
                abs(b - tb) <= tol):
                px[x, y] = (r, g, b, 0)
    return img


def fit_square_pot(img: Image.Image, size: int) -> Image.Image:
    """Resize the image into a `size x size` square (POT), preserving aspect by
    centering on a transparent canvas if the source isn't square."""
    iw, ih = img.size
    scale = size / max(iw, ih)
    nw, nh = int(round(iw * scale)), int(round(ih * scale))
    resized = img.resize((nw, nh), Image.LANCZOS)
    if (nw, nh) == (size, size):
        return resized
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def process(job) -> Path:
    src_name, dst_rel, key, tol, target_size = job
    src = ART_DIR / src_name
    dst = ART_DIR / dst_rel
    dst.parent.mkdir(parents=True, exist_ok=True)

    print(f"  {src_name:7s} -> {dst_rel}")
    img = Image.open(src)
    if key is not None:
        img = chroma_key(img, key, tol)
    else:
        img = img.convert("RGBA")
    img = fit_square_pot(img, target_size)
    img.save(dst, "PNG", optimize=True)
    return dst


def main() -> int:
    print(f"\n  source : {ART_DIR}")
    print(f"  output : {ART_DIR}\n")

    produced = []
    for job in JOBS:
        produced.append(process(job))

    # Mirror the frame and book illustration into public/ for the web side.
    pairs = [
        (ART_DIR / "frame" / "aftertale-9slice-frame.png",
         PUBLIC  / "frame" / "aftertale-9slice-frame.png"),
        (ART_DIR / "book.png",          PUBLIC / "book.png"),
        (ART_DIR / "sigil-header.png",  PUBLIC / "sigil-header.png"),
    ]
    print()
    for src, dst in pairs:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        print(f"  mirrored -> {dst.relative_to(ROOT)}")

    # Clean up the numbered originals so the Art tree stays tidy.
    print()
    for n in range(1, 14):
        f = ART_DIR / f"{n}.png"
        if f.exists():
            f.unlink()
            print(f"  removed   {f.relative_to(ROOT)}")

    print(f"\n  done. {len(produced)} assets produced.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
