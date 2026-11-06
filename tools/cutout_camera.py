"""把相機機身從白底切出來，輸出透明 PNG，並記下 LCD 螢幕在裁切後的位置。

白底用「從畫面四邊往內灌水」的方式判定，不用亮度門檻——機身本身是銀色
也很亮，單純用亮度會把機身一起挖掉。
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import binary_fill_holes, label

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "camera" / "ccd_back_v2.jpg"
OUT_PNG = ROOT / "assets" / "camera" / "ccd_back.png"
OUT_META = ROOT / "assets" / "camera" / "ccd_back.json"

WHITE_MIN = 249          # 視為白底的最低亮度
EDGE_FEATHER = 0.8       # 邊緣羽化半徑（px）
MARGIN = 6               # 裁切時保留的邊界

# LCD 螢幕在原圖 1024×1024 座標系裡的位置（量出來的，559×700 ≈ 4:5）
SCREEN = (227, 106, 786, 806)


def _background_mask(gray: np.ndarray) -> np.ndarray:
    """與畫面邊界相連的白色區域才算背景，機身內部的白不算。"""
    white = gray >= WHITE_MIN
    labels, n = label(white)
    border = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])
    border.discard(0)
    if not border:
        raise RuntimeError("找不到與邊界相連的白色區域，來源圖可能不是白底")
    return np.isin(labels, list(border))


def cutout() -> None:
    src = Image.open(SRC).convert("RGB")
    gray = np.asarray(src.convert("L"))

    body = ~_background_mask(gray)
    body = binary_fill_holes(body)

    alpha = Image.fromarray((body * 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.GaussianBlur(EDGE_FEATHER))

    rgba = src.convert("RGBA")
    rgba.putalpha(alpha)

    ys, xs = np.where(body)
    box = (max(0, xs.min() - MARGIN), max(0, ys.min() - MARGIN),
           min(src.width, xs.max() + 1 + MARGIN), min(src.height, ys.max() + 1 + MARGIN))
    cropped = rgba.crop(box)
    cropped.save(OUT_PNG)

    w, h = cropped.size
    x0, y0, x1, y1 = SCREEN
    screen = {
        "left": (x0 - box[0]) / w,
        "top": (y0 - box[1]) / h,
        "width": (x1 - x0) / w,
        "height": (y1 - y0) / h,
    }
    OUT_META.write_text(json.dumps({
        "_note": "screen 是 LCD 在 ccd_back.png 上的位置，0–1 比例，給 CSS 用",
        "size": [w, h],
        "screen": {k: round(v, 5) for k, v in screen.items()},
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{OUT_PNG.name}  {w}x{h}  crop={box}")
    print(f"screen  {json.dumps(screen)}")
    print(f"screen aspect  {(x1 - x0) / (y1 - y0):.4f}")


if __name__ == "__main__":
    cutout()
