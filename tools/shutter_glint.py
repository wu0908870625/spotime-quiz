"""快門的白色反光圖（10-02 Jimmy：反光沒貼著快門的輪廓，近看像一塊閃光的長方形）。

ccd_shutter_v6.webp 左邊 0–10 欄是機身的一條邊（不透明），之前整張拿來當遮罩，反光就把那條機身也蓋進去，
看起來是長方形。這裡只取快門本體（第 11 欄以後）、透明度跟著快門本身的明暗走（亮的斜面亮、暗的溝暗），
所以反光掃過去時看得到快門的弧面和溝紋。接機身那一側淡入 3 欄，不會有一條硬邊。
換快門圖要重跑：python3 tools/shutter_glint.py

10-02 第三版（Jimmy 紅框：快門左半邊、上下兩個凹口之間，反光還是沒有）：
以前把左邊 0–10 欄整條當機身切掉，但機身其實只有最左 2 欄；2–10 欄在上下凹口「之間」是快門本體，
只有凹口外面（上面、下面那兩段）才是機身的軌道。現在每一欄自己找上下凹口（最暗那一列），
凹口之間算快門，反光才會蓋滿整顆。
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "web" / "assets" / "camera"
SRC = ROOT / "ccd_shutter_v6.webp"
OUT = ROOT / "ccd_shutter_v6_glint.png"
BODY_COLS = 2         # 最左這幾欄一定是機身
RAIL_COLS = 11        # 這幾欄以內：凹口之間是快門，凹口外面是機身軌道
NOTCH_TOP = range(22, 37)     # 上凹口大概落在這幾列
NOTCH_BOTTOM = range(136, 154)
NOTCH_PAD = 2         # 凹口本身是陰影，再往內縮幾列
FEATHER = 3           # 接機身那側淡入幾欄／幾列
FLOOR, SPAN = 0.75, 0.25   # 透明度 = 原本透明度 ×（FLOOR + SPAN × 亮度）。10-02 第二版：0.35→0.75，下半部比較暗的金屬也要亮得起來


def luminance(px) -> float:
    r, g, b = px[:3]
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255


NOTCH_DARK = 0.4     # 凹口陰影至少這麼暗；不夠暗＝這一欄看不到凹口，沿用左邊那欄


def notch(sp, x, rows):
    for col in range(x, BODY_COLS - 1, -1):
        y = min(rows, key=lambda r: luminance(sp[col, r]))
        if luminance(sp[col, y]) < NOTCH_DARK:
            return y
    return rows[0]


def cap_rows(sp, x):
    """這一欄快門本體的上下界（凹口之間）"""
    return notch(sp, x, NOTCH_TOP) + NOTCH_PAD, notch(sp, x, NOTCH_BOTTOM) - NOTCH_PAD


def weight(sp, x, y) -> float:
    """這一點算不算快門：0＝機身、1＝快門，邊上淡入"""
    side = min(1.0, (x - BODY_COLS + 1) / FEATHER)
    if x >= RAIL_COLS:
        return side
    top, bottom = cap_rows(sp, x)
    if y <= top or y >= bottom:
        return 0.0
    return side * min(1.0, (y - top) / FEATHER, (bottom - y) / FEATHER)


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    w, h = src.size
    out = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    sp, op = src.load(), out.load()
    for y in range(h):
        for x in range(BODY_COLS, w):
            a = sp[x, y][3]
            if a == 0:
                continue
            lum = luminance(sp[x, y])
            edge = weight(sp, x, y)
            op[x, y] = (255, 255, 255, round(a * (FLOOR + SPAN * lum) * edge))
    out.save(OUT, optimize=True)
    print(OUT, out.size)


if __name__ == "__main__":
    main()
