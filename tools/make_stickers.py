"""把刀模輪廓畫成實際產品長相的造型貼。

產品是「白色外框 + 印花內裡」的模切貼片（照片：產品 - 造型痘痘貼/S__51839014_0.jpg）。
刀模 PDF 抽出來的 *_black.png 只有外輪廓，這裡負責上色：
外圈留白邊、內裡填系列色、再壓一層白色印花（點點或星星）。

顏色取自產品照再往飽和一點推，因為貼片在測驗畫面上只有幾個 px，
照片上那種洗白的粉彩貼到膚色上會完全看不見。
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "stickers"

WORK = 1024                 # 內部作圖解析度
SS = 2                      # 超取樣倍率，邊緣才不會鋸齒
RIM_RATIO = 0.060           # 白邊寬度，佔貼片長邊（用短邊的話星形的角會被吃光）
EDGE_RATIO = 0.012          # 最外圈那條印刷細線
PATTERN_ALPHA = 235

# 每個造型配一個系列色與一種印花，對齊產品照那張四欄的排法。
STYLES = {
    "heart":    {"color": (255, 158, 200), "line": (236, 122, 172), "pattern": "dot"},
    "star":     {"color": (127, 196, 232), "line": (96, 165, 205),  "pattern": "star"},
    "teardrop": {"color": (174, 178, 184), "line": (140, 145, 152), "pattern": "dot"},
    # 10-08 打樣後雲朵款取消，改成蕃茄款（Jimmy 給的黃色蕃茄：檸檬黃橢圓、邊緣漸淡、右上一顆白星）。
    # 輪廓 tomato_black.png 是 make_tomato_outline() 畫的橢圓，比例照 Jimmy 給的圖量（高÷寬 0.816）
    # 10-12 Jimmy：原本的 #FDF252 偏涼，加深一點讓右上白星更明顯（三案挑 B）
    "tomato":   {"color": (255, 218, 38),  "line": (224, 180, 20),  "pattern": "spark",
                 "fade": (255, 232, 128)},
    # 10-12 隱藏款：只出現在修圖「+ADD」往左滑才看得到，不進題目。素色、沒有印花。
    # 輪廓 *_black.png 從送印版 edit-05 最右欄（黑色）切出來；顏色用測驗沒用到的兩色：
    # 翅膀＝edit-05 深藍 #004EA2，四葉草＝edit-06 薄荷綠 #D5EAD7 往飽和推（原色貼在膚色上看不見）
    "wing":     {"color": (0, 78, 162),    "line": (0, 58, 128),    "pattern": "solid"},
    "clover":   {"color": (172, 222, 186), "line": (120, 186, 140), "pattern": "solid"},
}

# 蕃茄右上那顆星：從 Jimmy 給的圖量的（230×194，橢圓中心 109,95.5、半徑 95×77.5）。
# 手繪的星，五個角長短不一。座標都是「除以橢圓半寬」之後的比例
TOMATO_RATIO = 155 / 190
TOMATO_STAR = {
    "center": ((140 - 109) / 95, (73 - 95.5) / 95),
    # (角度°, 半徑)：角與角之間的凹處交錯排
    "points": ((-165, 39.5), (-125, 13.5), (-85, 25), (-50, 14.9), (-15, 35.5), (10, 14.8),
               (42, 38.2), (90, 7.5), (140, 37.2), (170, 14.2)),
}


def make_tomato_outline() -> None:
    """蕃茄的刀模輪廓：一個橢圓（其他三款的 *_black.png 是從刀模 PDF 抽的）"""
    w = 1000
    h = round(w * TOMATO_RATIO)
    img = Image.new("RGBA", (w + 8, h + 8), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse([4, 4, w + 4, h + 4], fill=(0, 0, 0, 255))
    img.save(SRC / "tomato_black.png")


def _spark(out: Image.Image, inner: Image.Image, style: dict) -> None:
    """蕃茄的內裡：中間檸檬黃、靠邊漸淡，右上一顆白星（不是滿版印花）"""
    w, h = out.size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy, rx, ry = w / 2, h / 2, w / 2, h / 2
    rho = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    t = np.clip((rho - 0.72) / (0.94 - 0.72), 0, 1)
    t = t * t * (3 - 2 * t)
    core = np.array(style["color"], np.float32)
    fade = np.array(style["fade"], np.float32)
    rgb = core * (1 - t[..., None]) + fade * t[..., None]
    fill = Image.fromarray(np.dstack([rgb, np.full((h, w), 255, np.float32)]).astype(np.uint8), "RGBA")
    out.paste(fill, (0, 0), inner)

    sx, sy = TOMATO_STAR["center"]
    pts = [(cx + (sx + r / 95 * math.cos(math.radians(a))) * rx,
            cy + (sy * rx + r / 95 * rx * math.sin(math.radians(a))))
           for a, r in TOMATO_STAR["points"]]
    star = Image.new("L", (w, h), 0)
    ImageDraw.Draw(star).polygon(pts, fill=255)
    out.paste(Image.new("RGBA", (w, h), (255, 255, 255, 255)), (0, 0), star)


def _silhouette(shape: str) -> Image.Image:
    """讀刀模輪廓，回傳放大過、留好邊界的 L 模式遮罩。"""
    src = Image.open(SRC / f"{shape}_black.png").convert("RGBA")
    alpha = src.getchannel("A")
    box = alpha.getbbox()
    alpha = alpha.crop(box)

    w, h = alpha.size
    scale = WORK * SS / max(w, h)
    alpha = alpha.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    return alpha.point(lambda v: 255 if v > 128 else 0)


def _shrink(mask: Image.Image, px: float) -> Image.Image:
    """把遮罩往內縮 px，用來切出白邊與最外圈的細線。

    用距離轉換而不是 MinFilter：白邊要縮掉 80 多個 px，
    那個尺寸的形態學核心在 PIL 裡會慢到不能用。
    """
    if px <= 0:
        return mask
    # 外面先墊一圈空白：形狀頂到圖邊的地方（橢圓四個頂點、愛心上緣），
    # 距離才會算到圖外，不然外圈細線在那裡會斷掉（10-08 做蕃茄時發現）
    pad = int(px) + 2
    dist = distance_transform_edt(np.pad(np.asarray(mask) > 127, pad))[pad:-pad, pad:-pad]
    return Image.fromarray(((dist >= px) * 255).astype(np.uint8))


def _dot_pattern(size: tuple[int, int], step: float, radius: float) -> Image.Image:
    layer = Image.new("L", size, 0)
    d = ImageDraw.Draw(layer)
    rows = int(size[1] / step) + 3
    cols = int(size[0] / step) + 3
    for r in range(rows):
        for c in range(cols):
            x = (c - 1) * step + (step / 2 if r % 2 else 0)
            y = (r - 1) * step
            d.ellipse([x - radius, y - radius, x + radius, y + radius], fill=255)
    return layer


def _star_polygon(cx: float, cy: float, r: float, turn: float) -> list[tuple[float, float]]:
    pts = []
    for i in range(10):
        ang = turn + i * math.pi / 5 - math.pi / 2
        rad = r if i % 2 == 0 else r * 0.42
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    return pts


def _star_pattern(size: tuple[int, int], step: float, radius: float) -> Image.Image:
    layer = Image.new("L", size, 0)
    d = ImageDraw.Draw(layer)
    rows = int(size[1] / step) + 3
    cols = int(size[0] / step) + 3
    for r in range(rows):
        for c in range(cols):
            x = (c - 1) * step + (step / 2 if r % 2 else 0)
            y = (r - 1) * step
            d.polygon(_star_polygon(x, y, radius, 0.35 * ((r + c) % 3)), fill=255)
    return layer


def build(shape: str) -> Image.Image:
    style = STYLES[shape]
    mask = _silhouette(shape)
    w, h = mask.size
    span = max(w, h)

    inner = _shrink(mask, span * RIM_RATIO)          # 印花內裡
    edge = _shrink(mask, span * EDGE_RATIO)          # 外圈細線的內側

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(Image.new("RGBA", (w, h), (*style["line"], 255)), (0, 0), mask)
    out.paste(Image.new("RGBA", (w, h), (255, 255, 255, 255)), (0, 0), edge)
    out.paste(Image.new("RGBA", (w, h), (*style["color"], 255)), (0, 0), inner)

    if style["pattern"] == "spark":
        _spark(out, inner, style)
        out.putalpha(mask)
        return out.resize((round(w / SS), round(h / SS)), Image.LANCZOS)

    if style["pattern"] == "solid":
        out.putalpha(mask)
        return out.resize((round(w / SS), round(h / SS)), Image.LANCZOS)

    dot = style["pattern"] == "dot"
    step = span * (0.26 if dot else 0.34)
    radius = step * 0.30
    pattern = (_dot_pattern if style["pattern"] == "dot" else _star_pattern)((w, h), step, radius)
    pattern = Image.fromarray(np.minimum(np.asarray(pattern), np.asarray(inner)))
    out.paste(Image.new("RGBA", (w, h), (255, 255, 255, PATTERN_ALPHA)), (0, 0), pattern)

    out.putalpha(mask)
    return out.resize((round(w / SS), round(h / SS)), Image.LANCZOS)


def main() -> None:
    make_tomato_outline()
    for shape in STYLES:
        img = build(shape)
        img.save(SRC / f"{shape}_product.png")
        print(f"{shape}_product.png  {img.size}")

    # 排成一張對照表，方便跟產品照並排看
    sheet = Image.new("RGBA", (len(STYLES) * 300, 320), (255, 255, 255, 255))
    for i, shape in enumerate(STYLES):
        im = Image.open(SRC / f"{shape}_product.png")
        s = 260 / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        sheet.alpha_composite(im, (i * 300 + (300 - im.width) // 2, (320 - im.height) // 2))
    sheet.convert("RGB").save(SRC / "_product_preview.jpg", quality=92)


if __name__ == "__main__":
    main()
