"""畫 Spot Halo：點陣球體，給網頁背景用。

Guideline 的輔助圖型，實際用法是擺在版面角落、被邊界裁掉一部分，
點沿著球的經緯線排列，愈靠近球的邊緣愈小愈密，看起來是一顆立體的球
（見 Launch Brief PART 4 的黑底頁與封底的粉紅版本）。

輸出是只有 alpha 的遮罩，顏色交給 CSS 決定，同一張圖就能在銀底和深底上用。
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "assets" / "bg"

SIZE = 1100                # 輸出邊長
SS = 3                     # 超取樣
MARGIN = 0.03              # 球的邊緣留一點空，避免被裁掉時出現硬邊

SPACING = 34.0             # 點沿著球面的間距（輸出 px），決定疏密
DOT = 9.6                  # 正對鏡頭時的點半徑。點徑佔球徑約 1.7%，對齊簡報那頁的比例
DOT_MIN_RATIO = 0.30       # 球緣的點縮到多小（透視壓縮）

TILT = math.radians(-24)   # 往下傾，看得到一點上半球，球才不會像平面圓
LIGHT = (-0.34, 0.52, 0.78)  # 光從左上前方來
AMBIENT = 0.06             # 背光面留一點點，讓球不會硬生生切一半
GAMMA = 0.85


def _normalize(v: tuple[float, float, float]) -> tuple[float, float, float]:
    length = math.sqrt(sum(c * c for c in v))
    return tuple(c / length for c in v)


def _points():
    """球面上大致等距的點：每條緯線的點數隨 cos(緯度) 遞減。

    間距一律用「輸出圖的 px」算，緯線和經線都是，不然兩個方向的疏密會對不上。
    """
    radius = SIZE / 2
    rows = max(3, round(math.pi * radius / SPACING))
    for i in range(rows + 1):
        lat = -math.pi / 2 + math.pi * i / rows
        ring = math.cos(lat)
        if ring <= 1e-3:
            continue
        count = max(1, round(2 * math.pi * ring * radius / SPACING))
        for k in range(count):
            lon = 2 * math.pi * k / count
            yield (ring * math.sin(lon), math.sin(lat), ring * math.cos(lon))


def build() -> Image.Image:
    n = SIZE * SS
    img = Image.new("L", (n, n), 0)
    draw = ImageDraw.Draw(img)
    radius = n / 2 * (1 - MARGIN)
    light = _normalize(LIGHT)
    cos_t, sin_t = math.cos(TILT), math.sin(TILT)

    for x, y, z in _points():
        # 繞 X 軸傾斜，經緯線才會彎成弧線而不是平行直線
        ty = y * cos_t - z * sin_t
        tz = y * sin_t + z * cos_t
        if tz <= 0:                                   # 背面的點看不到
            continue

        shade = max(0.0, x * light[0] + ty * light[1] + tz * light[2])
        alpha = (AMBIENT + (1 - AMBIENT) * shade) ** GAMMA
        if alpha < 0.03:
            continue

        # 愈靠近球緣，點被透視壓得愈小
        dot = DOT * SS * (DOT_MIN_RATIO + (1 - DOT_MIN_RATIO) * tz)
        px = n / 2 + x * radius
        py = n / 2 - ty * radius
        draw.ellipse([px - dot, py - dot, px + dot, py + dot], fill=round(255 * alpha))

    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    # 只當遮罩用，所以存灰階＋alpha 兩通道，alpha 降到 16 階；
    # 存 RGBA 的話同一張圖會大三倍，背景圖不值得那個重量。
    img = img.point(lambda v: round(v / 17) * 17)
    return Image.merge("LA", (Image.new("L", (SIZE, SIZE), 255), img))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    halo = build()
    path = OUT / "halo.png"
    halo.save(path, optimize=True)
    print(f"{path.relative_to(ROOT)}  {halo.size}  {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
