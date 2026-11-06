"""機身 v6：Gemini 10-01 生的新機身（assets/camera/ccd_back_v6_src.jpg）做成網站用的圖層。

v6 是把 W800 轉直來拿（Jimmy 10-01：快門要在長邊、按鍵是黑的、logo 在長邊正中間），
所以快門在右邊長邊、偏下，SPT® 直著放在螢幕左邊那條邊的正中間。
跟 v5 一樣，比例在這裡修，Gemini 只負責長相：
  1. 螢幕是 0.69:1，網站要 4:5：從螢幕正中間剪掉一百多列（這幾列左右只有直的邊框）
  2. 四邊補白、從邊界灌水判定白底 → 透明（跟 v5 同一套）
  2b. 螢幕下緣到按鍵之間剪掉 GAP_CUT 列（10-01 Jimmy：手機上螢幕太小）。快門剛好在這段的右邊，
      所以分兩條剪：螢幕那面剪按鍵上方的空白，右側面另外剪電源燈上方一段乾淨的側邊，兩邊一樣多列，
      交界在 BAND_X（機身正面靠右、上下都是平的金屬），接縫看不出來
  3. 快門切成獨立一層：網頁上按下去它要往左縮進機身。機身圖上快門原本的位置，
     凸出去的部分變透明、嵌在側邊裡的部分保留（壓進去時露出來的是底座）
  4. SPT® 字形從舊機身（ccd_back_clean）搬過來，轉 90 度（順時針，跟轉直的 W800 上 SONY 同方向）
輸出：web/assets/camera/ccd_back_v6.webp、ccd_shutter_v6.webp，位置寫進 assets/camera/ccd_back_v6.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from body_v5 import background_alpha, logo_glyph

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "camera" / "ccd_back_v6_src.jpg"
OUT_BODY = ROOT / "web" / "assets" / "camera" / "ccd_back_v6.webp"
OUT_SHUTTER = ROOT / "web" / "assets" / "camera" / "ccd_shutter_v6.webp"
OUT_META = ROOT / "assets" / "camera" / "ccd_back_v6.json"

# 以下座標都是原圖 848×1264 量出來的
SCREEN = (125, 99, 702, 935)           # 螢幕黑色部分 x0, y0, x1, y1（外面那圈灰框是機身的）
SHUTTER = (784, 912, 824, 1088)        # 快門：側邊凹槽 x0, y0, 外緣 x1, y1
SIDE_PLATE = 795                       # 機身右側面：快門在這右邊是凸出去的
KEYS = ((237, 1088), (404, 1088), (571, 1088))
KEY_DIAMETER = 110                     # 黑色鍵面（不含銀邊）
LED = (766, 805.5)
GAP_CUT = 50                           # 螢幕和按鍵之間剪掉幾列
FACE_GAP_AT = 845                      # 正面從哪一列開始剪（螢幕剪成 4:5 之後的座標，螢幕灰框下緣 826、按鍵上緣 920）
RAIL_GAP_AT = 520                      # 右側面從哪一列開始剪（原圖 635，側鍵 480 和電源燈 795 中間）
BAND_X = 742                           # 正面和右側面的交界
PAD = 24                               # 四邊補白
LOGO_HEIGHT = 30                       # 字高（轉直以後是字的寬度方向，px，原圖座標；W800 的 SONY 約佔那條邊的四成）
LOGO_CENTER_X = 82                     # 左邊那條邊的中線（機身左緣 ~45 到螢幕灰框 118）
LOGO_INK = 1.3                         # 舊機身的字比較淡，放到這條邊上再深一點


def trim_screen(a: np.ndarray) -> tuple[np.ndarray, int, int]:
    """剪掉螢幕中間的列，讓螢幕變 4:5。回傳新圖、剪掉的起點和列數。"""
    x0, y0, x1, y1 = SCREEN
    target = round((x1 - x0) / 0.8)
    cut = (y1 - y0) - target
    start = (y0 + y1) // 2 - cut // 2
    return np.concatenate([a[:start], a[start + cut:]], 0), start, cut


def after_trim(y: float, start: int, cut: int) -> float:
    return y if y < start else y - cut


def cut_gap(a: np.ndarray) -> np.ndarray:
    """正面、右側面各剪 GAP_CUT 列（位置不同），兩邊拼回去。"""
    face = np.concatenate([a[:FACE_GAP_AT, :BAND_X], a[FACE_GAP_AT + GAP_CUT:, :BAND_X]], 0)
    rail = np.concatenate([a[:RAIL_GAP_AT, BAND_X:], a[RAIL_GAP_AT + GAP_CUT:, BAND_X:]], 0)
    return np.concatenate([face, rail], 1)


def below(y: float, start: int, cut: int) -> float:
    """按鍵、快門、電源燈這些在兩段剪口下面的東西：兩次剪掉的都要扣"""
    return after_trim(y, start, cut) - GAP_CUT


def paste_logo(rgb: np.ndarray, start: int, cut: int) -> None:
    """SPT® 轉直貼在螢幕左邊那條邊，垂直置中對齊螢幕。"""
    glyph = np.rot90(logo_glyph(), k=-1)                 # 順時針轉 90 度：字從上往下讀
    w = LOGO_HEIGHT
    h = round(glyph.shape[0] * w / glyph.shape[1])
    planes = [np.asarray(Image.fromarray(np.ascontiguousarray(glyph[:, :, c]).astype(np.float32), "F")
                         .resize((w, h), Image.LANCZOS)) for c in range(3)]
    small = np.stack(planes, 2)
    _, y0, _, y1 = SCREEN
    mid = (y0 + after_trim(y1, start, cut)) / 2
    x = PAD + round(LOGO_CENTER_X - w / 2)
    y = PAD + round(mid - h / 2)
    rgb[y:y + h, x:x + w] += small * LOGO_INK


def build() -> None:
    a = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
    a, start, cut = trim_screen(a)
    a = cut_gap(a)
    h, w = a.shape[:2]
    rgb = np.full((h + 2 * PAD, w + 2 * PAD, 3), 255.0)
    rgb[PAD:PAD + h, PAD:PAD + w] = a
    alpha = background_alpha(rgb)

    # 快門獨立一層（機身側面以左全不透明，以右照去背的結果）
    qx0, qx1 = SHUTTER[0] + PAD, SHUTTER[2] + PAD
    qy0, qy1 = (round(below(v, start, cut)) + PAD for v in (SHUTTER[1], SHUTTER[3]))
    plate = SIDE_PLATE + PAD
    cap_rgb = rgb[qy0:qy1, qx0:qx1].copy()
    cap_a = alpha[qy0:qy1, qx0:qx1].copy()
    cap_a[:, :plate - qx0] = 1.0
    # 機身：凸出去的部分挖空；側面裡那段保留原圖（跟快門圖同一批像素，縮放時邊緣才不會露出一條線）
    alpha[qy0:qy1, plate:qx1] = 0.0
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
        "keys": [{"x": (kx + PAD) / W, "y": (below(ky, start, cut) + PAD) / H} for kx, ky in KEYS],
        "key_diameter": KEY_DIAMETER / W,
        "shutter": {"left": qx0 / W, "top": qy0 / H, "width": (qx1 - qx0) / W, "height": (qy1 - qy0) / H,
                    "plate": (plate - qx0) / (qx1 - qx0)},
        "led": {"x": (LED[0] + PAD) / W, "y": (below(LED[1], start, cut) + PAD) / H},
    }
    OUT_META.write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(json.dumps(meta, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    build()
