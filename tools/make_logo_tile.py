"""產生 LCD 待機畫面用的滿版 logo 圖樣（可無縫平鋪）。

為什麼要自己生而不是直接用品牌手冊那張 PNG：手冊那張是裁切好的成品，
四邊接不起來，拿去 repeat 會看到接縫。這裡在「沒有旋轉」的座標系上排版，
所有元素都用環繞貼法（超出邊界的同時貼到對邊），保證四邊都接得上；
斜角留給 CSS 的 rotate 去做——旋轉一個本來就無縫的圖樣，結果還是無縫。

用法：python3 tools/make_logo_tile.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "assets" / "bg" / "logo_tile.png"

CELL = (280, 150)          # 一個母題佔的格子
COLS, ROWS = 2, 2          # 圖樣本體 = 2×2 格
ROW_SHIFT = 140            # 奇數列往右錯開半格，才不會排成死板的棋盤

WORDMARK_W = 232
BADGE_W = 40
CAPTION = ("NOT A SPOT.", "YOUR SPOTIME.")
CAPTION_SIZE = 13
CAPTION_TRACKING = 0.6
FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"
FONT_INDEX = 1             # Helvetica Bold

# 母題裡三個元素在格子裡的中心位置
AT_WORDMARK = (140, 42)
AT_BADGE = (58, 112)
AT_CAPTION = (186, 114)


def _wordmark() -> Image.Image:
    src = Image.open(ROOT / "assets" / "logo" / "spotime_lab_horizontal_white.png").convert("RGBA")
    h = round(WORDMARK_W * src.height / src.width)
    return src.resize((WORDMARK_W, h), Image.LANCZOS)


def _badge() -> Image.Image:
    """把「黑底灰字」的 SPT 章翻成「實心塊＋挖空字」，才跟手冊的圖樣一致。"""
    src = Image.open(ROOT / "assets" / "logo" / "spt_symbol.png").convert("RGBA")
    h = round(BADGE_W * src.height / src.width)
    src = src.resize((BADGE_W, h), Image.LANCZOS)

    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    px_src, px_out = src.load(), out.load()
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = px_src[x, y]
            if a < 8:
                continue
            # 原圖裡橢圓是黑的、字是灰的：亮度低的留成實心，亮的挖掉
            lum = (r + g + b) / 3
            px_out[x, y] = (255, 255, 255, round(a * max(0.0, 1.0 - lum / 128)))
    return out


def _caption() -> Image.Image:
    font = ImageFont.truetype(FONT_PATH, CAPTION_SIZE, index=FONT_INDEX)
    pad = 4
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    width = max(probe.textlength(line, font=font) for line in CAPTION)
    width += CAPTION_TRACKING * max(len(line) for line in CAPTION)
    line_h = CAPTION_SIZE + 4
    img = Image.new("RGBA", (round(width) + pad * 2, line_h * len(CAPTION) + pad * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for i, line in enumerate(CAPTION):
        x = float(pad)
        for ch in line:                       # 逐字畫才做得出字距
            draw.text((x, pad + i * line_h), ch, font=font, fill=(255, 255, 255, 255))
            x += probe.textlength(ch, font=font) + CAPTION_TRACKING
    return img


def _stamp(canvas: Image.Image, piece: Image.Image, center: tuple[int, int]) -> None:
    """環繞貼上：同一個元素也貼到對邊，超出邊界的部分才接得起來。"""
    w, h = canvas.size
    x = center[0] - piece.width // 2
    y = center[1] - piece.height // 2
    for dx in (-w, 0, w):
        for dy in (-h, 0, h):
            canvas.alpha_composite(piece, (x + dx, y + dy)) if _inside(
                (x + dx, y + dy), piece.size, canvas.size) else None


def _inside(xy: tuple[int, int], size: tuple[int, int], canvas: tuple[int, int]) -> bool:
    x, y = xy
    return x + size[0] > 0 and y + size[1] > 0 and x < canvas[0] and y < canvas[1]


def build() -> Image.Image:
    tile_w, tile_h = CELL[0] * COLS, CELL[1] * ROWS
    canvas = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    pieces = ((_wordmark(), AT_WORDMARK), (_badge(), AT_BADGE), (_caption(), AT_CAPTION))

    for row in range(ROWS):
        for col in range(COLS):
            ox = (col * CELL[0] + row * ROW_SHIFT) % tile_w
            oy = row * CELL[1]
            for piece, (cx, cy) in pieces:
                _stamp(canvas, piece, ((ox + cx) % tile_w, (oy + cy) % tile_h))
    return canvas


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tile = build()
    tile.save(OUT, optimize=True)
    print(f"{OUT.relative_to(ROOT)}  {tile.width}×{tile.height}  {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
