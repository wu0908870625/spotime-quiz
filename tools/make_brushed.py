"""畫髮絲紋：可無縫平鋪的拉絲金屬紋理，給網頁背景疊在銀色漸層上。

真的金屬拉絲不是等距條紋，是三個尺度疊在一起：
  1. 極細的隨機髮絲（幾 px 寬，決定「摸起來有紋路」）
  2. 中段的刷痕（幾十 px，決定方向感）
  3. 大片的明暗雲（幾百 px，決定「這塊板子不是平的」）
等距的 repeating-linear-gradient 只有第 1 層而且週期固定，
放大就露餡，所以改成離線產生一張貼圖。

第 3 層不放進貼圖：它的尺度比貼圖本身還大，平鋪時會變成看得出來的格子。
那一層交給 CSS 的大漸層（styles/base.css 的 --silver 與 body::after）。

輸出是 LA（灰階＋alpha）：亮髮絲存白、暗髮絲存深灰，濃淡走 alpha，
這樣同一張圖疊在任何底色上都成立，顏色仍然由 CSS 決定。

平鋪用循環卷積（在頻域上乘高斯），所以左右、上下接縫都對得起來。
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "assets" / "bg" / "brushed.png"

W, H = 1024, 256
SEED = 20261201

# (沿紋路方向的模糊, 垂直紋路方向的模糊, 權重)。sigma 單位是 px。
LAYERS = (
    (11.0, 0.35, 1.00),    # 髮絲：拉長才是「刷」出來的，短就變成木紋
    (130.0, 1.10, 0.55),   # 刷痕
)

ALPHA_LIGHT = 0.30         # 亮髮絲最濃的 alpha
ALPHA_DARK = 0.22          # 暗髮絲最濃的 alpha。暗的要比亮的收斂，不然整片會發灰
CLIP = 2.6                 # 超過幾個標準差就截斷（免得少數幾根特別黑）
LIGHT_RGB = 255
DARK_RGB = 26
ALPHA_LEVELS = 16          # 量化階數。肉眼看不出差別，但 PNG 會小很多


def _blur_cyclic(field: np.ndarray, sigma_x: float, sigma_y: float) -> np.ndarray:
    """頻域上的循環高斯模糊。用循環是為了讓貼圖左右上下都能無縫接。"""
    fy = np.fft.fftfreq(field.shape[0])[:, None]
    fx = np.fft.fftfreq(field.shape[1])[None, :]
    kernel = np.exp(-2.0 * (np.pi ** 2) * ((sigma_y * fy) ** 2 + (sigma_x * fx) ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(field) * kernel))


def build() -> Image.Image:
    rng = np.random.default_rng(SEED)
    total = np.zeros((H, W), dtype=np.float64)
    for sigma_x, sigma_y, weight in LAYERS:
        layer = _blur_cyclic(rng.standard_normal((H, W)), sigma_x, sigma_y)
        std = layer.std()
        if std < 1e-9:
            raise ValueError(f"模糊過頭，這層整片沒有變化：sigma=({sigma_x}, {sigma_y})")
        total += weight * layer / std
    total /= total.std()

    strength = np.clip(np.abs(total) / CLIP, 0.0, 1.0)
    lit = total > 0
    alpha = strength * np.where(lit, ALPHA_LIGHT, ALPHA_DARK)
    # 量化到固定階數，相鄰像素容易相同，PNG 的壓縮才吃得住
    alpha = np.round(alpha * ALPHA_LEVELS) / ALPHA_LEVELS

    out = np.zeros((H, W, 2), dtype=np.uint8)
    out[..., 0] = np.where(lit, LIGHT_RGB, DARK_RGB)
    out[..., 1] = np.round(alpha * 255).astype(np.uint8)
    return Image.fromarray(out, mode="LA")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    build().save(OUT, optimize=True)
    print(f"{OUT.relative_to(ROOT)}  {W}×{H}  {OUT.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
