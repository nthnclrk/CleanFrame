"""Build Minimal depth masks offline: the foreground below a clean skyline, as an alpha-only PNG.

Usage: python3 scripts/build-depth-masks.py summit,alpine [--threshold 26]

Works only for photos whose sky is smooth above a solid foreground (mountain ridges, towers). Each column is
walked down from the top against a running sky estimate; the first sustained departure is the skyline.
Output goes to ignored .local/materials/depth/ with a review composite; copy an approved
<id>-depth.png to app/assets/wallpapers/ and add "depth" to that catalogue entry. Requires Pillow.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.local/materials/depth'
# Per-photo settings reviewed against the Minimal clock. top: rows always treated as sky.
# Summit was tried and rejected: its shaded slopes match the hazy sky, so it needs a hand-cut mask.
PRESETS = {
    'alpine': {'threshold': 26, 'top': 80},
}


def skyline(img, threshold, top, run=4, rate=0.06):
    w, h = img.size
    px = img.load()
    line = []
    for x in range(w):
        sky = [sum(px[x, y][c] for y in range(top, top + 6)) / 6 for c in range(3)]
        found, streak = h, 0
        for y in range(top, h):
            r, g, b = px[x, y]
            d = ((r - sky[0]) ** 2 + (g - sky[1]) ** 2 + (b - sky[2]) ** 2) ** 0.5
            if d > threshold:
                streak += 1
                if streak >= run:
                    found = y - run + 1
                    break
            else:
                streak = 0
                sky = [s + (v - s) * rate for s, v in zip(sky, (r, g, b))]
        line.append(found)
    # Opening (min then max over a window) removes narrow downward drop-outs where a shaded slope matches the
    # sky, while keeping sharp summits, which are upward (smaller y). Then step 1px inside the edge, so no sky
    # pixels are carried in front of the clock.
    def window(values, op, radius=7):
        return [op(values[max(0, x - radius):x + radius + 1]) for x in range(len(values))]
    return [min(h, y + 1) for y in window(window(line, min), max)]


def build(wall, threshold, top):
    photo = Image.open(ROOT / 'app/assets/wallpapers' / (wall + '.jpg')).convert('RGB')
    assert photo.size == (1920, 1080), 'Wallpapers use the 1920 x 1080 stage crop'
    line = skyline(photo.filter(ImageFilter.GaussianBlur(0.7)), threshold, top)
    alpha = Image.new('L', photo.size, 0)
    draw = ImageDraw.Draw(alpha)
    for x, y in enumerate(line):
        draw.line([(x, y), (x, photo.size[1])], fill=255)
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    mask = Image.merge('LA', (Image.new('L', photo.size, 0), alpha))
    OUT.mkdir(parents=True, exist_ok=True)
    mask.save(OUT / (wall + '-depth.png'), optimize=True)
    # Review: the clock box at the Minimal position, with the masked photo composited above it.
    review = photo.copy()
    ink = Image.new('RGBA', photo.size, (0, 0, 0, 0))
    ImageDraw.Draw(ink).rectangle([486, 236, 1437, 548], fill=(255, 255, 255, 150))
    review = Image.alpha_composite(review.convert('RGBA'), ink)
    review.paste(photo, (0, 0), alpha)
    review.convert('RGB').save(OUT / (wall + '-review.jpg'), quality=85)
    print(wall, 'skyline rows', min(line), '-', max(line), '->', OUT / (wall + '-depth.png'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('ids')
    parser.add_argument('--threshold', type=float)
    args = parser.parse_args()
    for wall in args.ids.split(','):
        preset = PRESETS.get(wall, {'threshold': 26, 'top': 60})
        build(wall, args.threshold or preset['threshold'], preset['top'])
