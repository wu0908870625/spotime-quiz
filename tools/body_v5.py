"""機身 v5：Gemini 09-30 生的新機身（assets/camera/ccd_back_v5_src.jpg）做成網站用的圖層。

Gemini 不太聽比例數字，所以比例在這裡修，Gemini 只負責長相：
  1. 螢幕是 3:4，網站要 4:5：從螢幕正中間剪掉幾十列（這幾列左右兩邊只有直的邊框，剪了看不出來）
  2. 右側有一顆 prompt 沒要的小側鍵，而且被圖片邊緣切掉一半：用上面同一段直的側邊蓋掉
  3. 四邊補白、從邊界灌水判定白底 → 透明（cutout_camera.py 的做法）
  4. 快門切成獨立一層：網頁上按下去它要往下沉。機身圖上快門原本的位置，
     凸出去的部分變透明、嵌在頂蓋裡的部分保留（沉下去時露出來的是底座）
  5. SPT® 字形從舊機身（ccd_back_clean）搬過來，只搬筆畫，放在螢幕左上方那條邊
輸出：web/assets/camera/ccd_back_v5.webp、ccd_shutter_v5.webp，位置寫進 assets/camera/ccd_back_v5.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "camera" / "ccd_back_v5_src.jpg"
OLD = ROOT / "web" / "assets" / "camera" / "ccd_back_clean.webp"
OUT_BODY = ROOT / "web" / "assets" / "camera" / "ccd_back_v5.webp"
OUT_SHUTTER = ROOT / "web" / "assets" / "camera" / "ccd_shutter_v5.webp"
OUT_META = ROOT / "assets" / "camera" / "ccd_back_v5.json"

# 以下座標都是原圖 896×1200 量出來的
SCREEN = (97, 123, 797, 1048)          # 螢幕外框 x0, y0, x1, y1（含細黑框）
SIDE_BUTTON = (872, 540, 896, 650)     # 右側小側鍵要蓋掉的範圍
SIDE_PATCH_FROM = 400                  # 拿 y=400 開始同樣高度的側邊來蓋
SHUTTER = (574, 0, 758, 42)            # 快門：x0, y0, x1, 凹槽底（y）
TOP_PLATE = 24                         # 頂蓋上緣：快門在這之上是凸出去的
KEYS = ((283, 1117), (444.5, 1117), (609, 1117))
KEY_DIAMETER = 72
LED = (506.5, 38)
PAD = 24                               # 四邊補白
WHITE_MIN = 247
LOGO_OLD = (526, 626, 794, 832)        # 舊機身上 SPT® 的範圍 x0, x1, y0, y1
LOGO_HEIGHT = 20                       # 新位置的字高（px，原圖座標）
LOGO_AT = (104, 99)                    # 新位置：左緣 x、垂直中心 y（螢幕左上方那條邊）


def trim_screen(a: np.ndarray) -> tuple[np.ndarray, int, int]:
    """剪掉螢幕中間的列，讓螢幕變 4:5。回傳新圖、剪掉的起點和列數。"""
    x0, y0, x1, y1 = SCREEN
    target = round((x1 - x0) / 0.8)
    cut = (y1 - y0) - target
    start = (y0 + y1) // 2 - cut // 2
    return np.concatenate([a[:start], a[start + cut:]], 0), start, cut


def after_trim(y: float, start: int, cut: int) -> float:
    return y if y < start else y - cut


def background_alpha(rgb: np.ndarray) -> np.ndarray:
    """跟邊界連在一起的白才是背景；機身本身也很亮，不能單看亮度。"""
    gray = rgb.mean(2)
    lab, _ = label(gray >= WHITE_MIN)
    border = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1])
    border.discard(0)
    bg = np.isin(lab, list(border))
    alpha = np.where(bg, 0.0, 1.0)
    # 邊緣半像素的柔化：背景旁邊、亮度接近白的像素給半透明
    soft = (gray - 225) / (WHITE_MIN - 225)
    edge = ~bg & np.pad(bg, 1)[2:, 1:-1] | ~bg & np.pad(bg, 1)[:-2, 1:-1] \
        | ~bg & np.pad(bg, 1)[1:-1, 2:] | ~bg & np.pad(bg, 1)[1:-1, :-2]
    alpha[edge] = np.clip(1 - soft[edge], 0.35, 1)
    return alpha


def logo_glyph() -> np.ndarray:
    """舊機身的 SPT® 只取筆畫：原圖減掉「沒有字時底下的亮度」（左右兩側內插）。"""
    old = np.asarray(Image.open(OLD).convert("RGB")).astype(float)
    x0, x1, y0, y1 = LOGO_OLD
    k = 3
    left = old[y0:y1, x0 - k:x0].mean(1)
    right = old[y0:y1, x1:x1 + k].mean(1)
    t = np.linspace(0, 1, x1 - x0)[None, :, None]
    glyph = old[y0:y1, x0:x1] - (left[:, None] * (1 - t) + right[:, None] * t)
    glyph[np.abs(glyph).max(2) < 5] = 0
    return glyph


def paste_logo(rgb: np.ndarray, start: int, cut: int) -> None:
    glyph = logo_glyph()
    h = LOGO_HEIGHT
    w = round(glyph.shape[1] * h / glyph.shape[0])
    planes = [np.asarray(Image.fromarray(glyph[:, :, c].astype(np.float32), "F").resize((w, h), Image.LANCZOS))
              for c in range(3)]
    small = np.stack(planes, 2)
    x = PAD + LOGO_AT[0]
    y = PAD + round(after_trim(LOGO_AT[1], start, cut) - h / 2)
    rgb[y:y + h, x:x + w] += small


def build() -> None:
    src = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
    a = src.copy()
    sx0, sy0, sx1, sy1 = SIDE_BUTTON
    a[sy0:sy1, sx0:sx1] = src[SIDE_PATCH_FROM:SIDE_PATCH_FROM + (sy1 - sy0), sx0:sx1]
    a, start, cut = trim_screen(a)
    h, w = a.shape[:2]
    rgb = np.full((h + 2 * PAD, w + 2 * PAD, 3), 255.0)
    rgb[PAD:PAD + h, PAD:PAD + w] = a
    alpha = background_alpha(rgb)

    # 快門獨立一層（在頂蓋上緣以下的部分全不透明，以上照去背的結果）
    qx0, qy0, qx1, qy1 = (v + PAD for v in SHUTTER)
    plate = TOP_PLATE + PAD
    cap_rgb = rgb[qy0:qy1, qx0:qx1].copy()
    cap_a = alpha[qy0:qy1, qx0:qx1].copy()
    cap_a[plate - qy0:] = 1.0
    # 機身：凸出去的部分挖空；頂蓋裡那段保留原圖（跟快門圖同一批像素，邊緣縮放時才不會露出一條線，
    # 快門壓下去時露出來的就是它自己的底座）
    alpha[qy0:plate, qx0:qx1] = 0.0
    paste_logo(rgb, start, cut)

    body = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    cap = np.dstack([np.clip(cap_rgb, 0, 255), cap_a * 255]).astype(np.uint8)
    Image.fromarray(body, "RGBA").save(OUT_BODY, quality=92, method=6)
    Image.fromarray(cap, "RGBA").save(OUT_SHUTTER, quality=92, method=6)

    W, H = body.shape[1], body.shape[0]
    x0, y0, x1, y1 = SCREEN
    sy1 = after_trim(y1, start, cut)
    meta = {
        "_note": "0–1 比例（x 對機身寬、y 對機身高），給 camera.css／camedit.css／index.html 用",
        "size": [W, H],
        "screen": {"left": (x0 + PAD) / W, "top": (y0 + PAD) / H,
                   "width": (x1 - x0) / W, "height": (sy1 - y0) / H},
        "keys": [{"x": (kx + PAD) / W, "y": (after_trim(ky, start, cut) + PAD) / H} for kx, ky in KEYS],
        "key_diameter": KEY_DIAMETER / W,
        "shutter": {"left": qx0 / W, "top": qy0 / H, "width": (qx1 - qx0) / W, "height": (qy1 - qy0) / H,
                    "plate": (plate - qy0) / (qy1 - qy0)},
        "led": {"x": (LED[0] + PAD) / W, "y": (LED[1] + PAD) / H},
    }
    OUT_META.write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(json.dumps(meta, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    build()
