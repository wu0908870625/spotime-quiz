"""依深度分層模糊：把一張全部都很清楚的場景照，做成「手機人像模式」的樣子。

為什麼要這道：結果圖是把去背的情侶貼到場景上。如果場景每一張臉都跟情侶一樣銳利，
眼睛立刻看得出來是拼貼；真的自拍是主角清楚、旁邊的路人化成色塊。
順帶解決兩件事——路人的臉不再是「可以認出來的人」，背景衣服上的隊徽也糊掉了。

這裡不做真的深度估計，用一個很土但很有效的近似：看台是往上遠離鏡頭的，
所以模糊量沿 y 軸給一條曲線，對焦面放在情侶站的位置，往上愈遠愈糊，
往下（比情侶更靠近鏡頭的前景）也給一點糊，那是前景散景。

用法：
    python3 tools/depth_blur.py 來源.png 輸出.png [--focus 0.62] [--far 16] [--near 6]
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageFilter

# 分幾層去插值。層數少會看到模糊量的階梯，多了只是變慢，5 層就夠了。
LEVELS = 5
# 對焦面本身也留一點點糊：整張圖都是「隔著一點距離拍的背景」，沒有東西該是全清的
BASE_BLUR = 0.6


def graded_blur(
    img: Image.Image,
    focus: float = 0.62,
    far: float = 16.0,
    near: float = 6.0,
    falloff: float = 1.6,
) -> Image.Image:
    """
    @param focus   對焦面在畫面高度的哪個位置（0 是最上緣，1 是最下緣）
    @param far     對焦面以上、畫面最頂端的模糊半徑（px，以輸入圖尺寸為準）
    @param near    對焦面以下、畫面最底端的模糊半徑（px）
    @param falloff 離焦的衰減曲線指數。1 是線性，愈大代表對焦面附近愈清楚
    """
    if not 0.0 <= focus <= 1.0:
        raise ValueError(f"focus 要在 0 到 1 之間，收到 {focus}")
    if far < 0 or near < 0:
        raise ValueError("模糊半徑不能是負的")

    src = img.convert("RGB")
    w, h = src.size
    peak = max(far, near, 1e-6)

    # 每個 y 的目標模糊半徑
    def radius_at(y: int) -> float:
        t = y / max(h - 1, 1)
        if t <= focus:
            k = (focus - t) / focus if focus > 0 else 0.0
            return BASE_BLUR + far * (k ** falloff)
        k = (t - focus) / (1 - focus) if focus < 1 else 0.0
        return BASE_BLUR + near * (k ** falloff)

    # 先備好幾個模糊程度的完整版本，再依每一列的目標半徑在相鄰兩層之間混色
    levels = [src.filter(ImageFilter.GaussianBlur(peak * i / (LEVELS - 1))) for i in range(LEVELS)]
    out = Image.new("RGB", (w, h))
    step = peak / (LEVELS - 1)

    for y in range(h):
        r = min(radius_at(y), peak)
        i = min(int(r / step), LEVELS - 2)
        frac = (r - i * step) / step
        row = Image.blend(
            levels[i].crop((0, y, w, y + 1)),
            levels[i + 1].crop((0, y, w, y + 1)),
            frac,
        )
        out.paste(row, (0, y))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="把場景照做成淺景深的樣子")
    ap.add_argument("src", type=Path)
    ap.add_argument("dst", type=Path)
    ap.add_argument("--focus", type=float, default=0.62)
    ap.add_argument("--far", type=float, default=16.0)
    ap.add_argument("--near", type=float, default=6.0)
    ap.add_argument("--falloff", type=float, default=1.6)
    args = ap.parse_args()

    if not args.src.exists():
        raise SystemExit(f"找不到來源圖：{args.src}")
    img = Image.open(args.src)
    out = graded_blur(img, args.focus, args.far, args.near, args.falloff)
    args.dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.dst)
    print(f"{args.dst}  {out.size[0]}×{out.size[1]}")


if __name__ == "__main__":
    main()
