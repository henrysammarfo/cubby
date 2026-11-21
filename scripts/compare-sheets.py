#!/usr/bin/env python3
"""Side-by-side Apeex (left) vs Cubby (right) compare sheets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np

APEEX = Path('/workspace/bch/design/v3/refs/apeex')
SHOTS = Path('/workspace/bch/design/v3/shots')
OUT = Path('/workspace/bch/design/v3/compare')
OUT.mkdir(parents=True, exist_ok=True)

# Cubby shot name -> (apeex file, side)
MAP = [
    ('welcome-splash', '01.jpg', 'left'),
    ('welcome-slides', '01.jpg', 'right'),
    ('welcome', '03.jpg', 'left'),
    ('welcome-face', '05.jpg', 'right'),
    ('welcome-ready', '06.jpg', 'right'),
    ('wallet', '07.jpg', 'left'),
    ('coin', '07.jpg', 'right'),
    ('activity', '08.jpg', 'right'),
    ('receive', '10.jpg', 'left'),
    ('send-assets', '10.jpg', 'right'),
    ('send', '11.jpg', 'left'),
    ('send-confirm', '11.jpg', 'right'),
    ('success', '12.jpg', 'left'),
    ('receipt', '12.jpg', 'left'),
    ('connect', '10.jpg', 'left'),
    ('settings', '07.jpg', 'left'),
    ('landing', None, None),
    ('how', None, None),
    ('terms', None, None),
    ('privacy', None, None),
    ('allowance', '07.jpg', 'left'),
    ('id', '06.jpg', 'right'),
]

def crop_phone(path: Path, side: str) -> Image.Image:
    im = Image.open(path).convert('RGB')
    a = np.array(im)
    bg = a[8, 8].astype(int)
    mask = np.abs(a.astype(int) - bg).sum(axis=2) > 28
    col = mask.any(axis=0)
    runs = []
    inr = False
    start = 0
    for i, v in enumerate(col):
        if v and not inr:
            start = i
            inr = True
        elif not v and inr:
            if i - start > 200:
                runs.append((start, i - 1))
            inr = False
    if inr and len(col) - start > 200:
        runs.append((start, len(col) - 1))
    if not runs:
        return im
    x0, x1 = runs[0] if side == 'left' else runs[-1]
    sl = mask[:, x0:x1 + 1]
    ys = np.where(sl.any(axis=1))[0]
    y0, y1 = int(ys[0]), int(ys[-1])
    if y1 - y0 > 1600:
        y1 = y0 + 1600
    return im.crop((x0, y0, x1 + 1, y1 + 1))

def fit(im: Image.Image, h: int) -> Image.Image:
    w = int(im.width * (h / im.height))
    return im.resize((w, h), Image.Resampling.LANCZOS)

def font(size: int, bold=False):
    for p in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    ):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def sheet(name: str, apeex_file: str | None, side: str | None):
    cubby_path = SHOTS / f'{name}-chromium-390.png'
    if not cubby_path.exists():
        print('missing shot', name)
        return
    cubby = Image.open(cubby_path).convert('RGB')
    target_h = 1400
    cubby = fit(cubby, target_h)
    if apeex_file:
        apeex = fit(crop_phone(APEEX / apeex_file, side or 'left'), target_h)
        cap_l = 'Apeex reference'
    else:
        apeex = Image.new('RGB', cubby.size, '#EDEDEF')
        d = ImageDraw.Draw(apeex)
        msg = 'No matching Apeex frame.\nCubby marketing / legal page.'
        d.multiline_text((40, apeex.height // 2 - 40), msg, fill='#6B6B73', font=font(28), spacing=8)
        cap_l = 'No Apeex frame'
    pad = 48
    gap = 48
    header = 110
    footer = 36
    W = pad * 2 + apeex.width + gap + cubby.width
    H = header + target_h + footer
    canvas = Image.new('RGB', (W, H), '#F4F4F5')
    canvas.paste(apeex, (pad, header))
    canvas.paste(cubby, (pad + apeex.width + gap, header))
    d = ImageDraw.Draw(canvas)
    d.text((pad, 28), 'Cubby v3 compare', font=font(20), fill='#8E8E96')
    d.text((pad, 58), cap_l, font=font(28, True), fill='#0B0B0F')
    d.text((pad + apeex.width + gap, 58), f'Cubby  ·  {name}', font=font(28, True), fill='#0B0B0F')
    out = OUT / f'{name}.png'
    canvas.save(out, quality=92)
    print('wrote', out)

def main():
    for name, ape, side in MAP:
        sheet(name, ape, side)

if __name__ == '__main__':
    main()
