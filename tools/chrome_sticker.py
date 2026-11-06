"""把黑色剪影刀模轉成鉻金屬質感的造型貼 PNG。

作法是 Y2K 液態鉻的標準假反射：整片形狀套一條垂直的環境反射帶
（天空亮 → 地平線暗 → 地面回亮），再用倒角算出的法線去「扭曲」取樣位置，
邊緣就會出現拉長的鏡面反射。最後疊高光與極淡的虹彩。
輸出 RGBA，不含陰影（陰影在合成階段依場景光源另外加）。
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

SHAPES = ("heart", "star", "teardrop", "tomato")   # 10-08 雲朵改蕃茄

# 垂直環境反射帶：位置 → RGB。中間那道暗帶是鉻金屬「像鏡子」的關鍵。
CHROME_RAMP = (
    (0.00, (246, 248, 252)),
    (0.18, (186, 196, 212)),
    (0.36, (96, 102, 118)),
    (0.47, (62, 66, 80)),
    (0.55, (168, 176, 190)),
    (0.63, (253, 253, 254)),
    (0.80, (212, 216, 224)),
    (1.00, (150, 156, 168)),
)

IRIDESCENT = np.array([0xDD, 0xAE, 0xFF], dtype=np.float32)   # Guideline 炫彩
PATTERN_PINK = np.array([0xFF, 0x97, 0xCE], dtype=np.float32)  # Guideline 印花

BEVEL_RATIO = 0.055      # 倒角寬度佔短邊比例；太大會變成塑膠件
DISTORT = 0.55           # 法線扭曲取樣的強度，決定邊緣反射被拉多長
TINT = 0.10              # 虹彩混入比例
SUPERSAMPLE = 3


def _ramp(sample: np.ndarray) -> np.ndarray:
    pos = np.array([s[0] for s in CHROME_RAMP], dtype=np.float32)
    cols = np.array([s[1] for s in CHROME_RAMP], dtype=np.float32)
    out = np.empty(sample.shape + (3,), dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(np.clip(sample, 0.0, 1.0), pos, cols[:, c])
    return out


def _height_field(alpha: np.ndarray, bevel_px: float) -> np.ndarray:
    """中央微微隆起、邊緣圓弧下降的高度圖（0–1）。"""
    inside = distance_transform_edt(alpha > 0.5)
    t = np.clip(inside / max(bevel_px, 1.0), 0.0, 1.0)
    bevel = np.sqrt(1.0 - (1.0 - t) ** 2)          # 四分之一圓，邊緣才不會有折角
    dome = np.clip(inside / max(inside.max(), 1.0), 0.0, 1.0) ** 0.5
    return gaussian_filter(bevel * 0.88 + dome * 0.12, bevel_px * 0.18)


def _normals(height: np.ndarray, strength: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    gy, gx = np.gradient(height)
    nx, ny = -gx * strength, -gy * strength
    nz = np.ones_like(height)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    return nx / norm, ny / norm, nz / norm


def _iridescence(nx: np.ndarray, ny: np.ndarray) -> np.ndarray:
    phase = np.clip((nx * 0.7 + ny * 0.7 + 1.0) / 2.0, 0.0, 1.0)
    mix = (np.sin(phase * np.pi * 2.0) * 0.5 + 0.5)[..., None]
    return IRIDESCENT * mix + PATTERN_PINK * (1.0 - mix)


def render(src: Path, out: Path, size: int = 512) -> None:
    img = Image.open(src).convert("RGBA")
    scale = size * SUPERSAMPLE / max(img.size)
    img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)

    alpha = np.array(img)[..., 3].astype(np.float32) / 255.0
    h, w = alpha.shape
    bevel = min(h, w) * BEVEL_RATIO
    height = _height_field(alpha, bevel)
    nx, ny, nz = _normals(height, strength=min(h, w) * 0.09)

    # 形狀自身的垂直座標當基準取樣位置，再被法線扭曲
    base = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None] * np.ones((1, w), dtype=np.float32)
    colour = _ramp(base - ny * DISTORT)
    colour = colour * (1.0 - TINT) + _iridescence(nx, ny) * TINT

    # 左上主光源的鏡面高光
    spec = np.clip(nx * -0.42 + ny * -0.80 + nz * 0.43, 0.0, 1.0) ** 34
    colour += spec[..., None] * 235.0
    # 最外一圈壓暗，形狀在亮背景上才立得住
    rim = np.clip(1.0 - height / 0.22, 0.0, 1.0) * (alpha > 0.5)
    colour *= (1.0 - 0.40 * rim)[..., None]

    rgba = np.dstack([np.clip(colour, 0, 255), alpha * 255.0]).astype(np.uint8)
    res = Image.fromarray(rgba, "RGBA")
    res = res.resize((res.width // SUPERSAMPLE, res.height // SUPERSAMPLE), Image.LANCZOS)
    res.save(out)


def main() -> None:
    root = Path(__file__).resolve().parent.parent / "assets" / "stickers"
    for name in SHAPES:
        src = root / f"{name}_black.png"
        if not src.exists():
            raise FileNotFoundError(f"找不到刀模檔：{src}")
        dst = root / f"{name}_chrome.png"
        render(src, dst)
        print(f"{name}: {src.name} -> {dst.name}")


if __name__ == "__main__":
    main()
