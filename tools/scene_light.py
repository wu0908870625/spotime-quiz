"""依場景的光線條件替人物打光，讓合成上去的人不像剪紙貼上去。

兩件事：
  環境色  暗部往場景的主色偏，模擬環境光的反射
  輪廓光  沿著人物邊緣加一圈場景色的光，模擬背後光源的溢光
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter


@dataclass(frozen=True)
class Lighting:
    """一個場景的打光設定。"""

    ambient: tuple[int, int, int]   # 環境色
    ambient_mix: float              # 環境色在暗部的混入強度 0–1
    rim: tuple[int, int, int]       # 輪廓光顏色
    rim_mix: float                  # 輪廓光強度 0–1
    rim_width: float                # 輪廓光寬度，佔人物寬度的比例
    exposure: float = 1.0           # 整體曝光微調


def _ambient_tint(rgb: np.ndarray, light: Lighting) -> np.ndarray:
    """暗部染上環境色，亮部幾乎不動——這才是環境光的行為。"""
    luma = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    weight = (1.0 - luma / 255.0)[..., None] * light.ambient_mix
    return rgb * (1.0 - weight) + np.array(light.ambient, dtype=np.float32) * weight


def _rim_mask(alpha: Image.Image, width_px: float) -> np.ndarray:
    """人物邊緣往內縮一圈的遮罩。"""
    inner = alpha.filter(ImageFilter.MinFilter(3))
    for _ in range(max(1, int(width_px // 6))):
        inner = inner.filter(ImageFilter.MinFilter(3))
    edge = np.clip(np.asarray(alpha, dtype=np.float32) - np.asarray(inner, dtype=np.float32), 0, 255)
    return np.asarray(Image.fromarray(edge.astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(max(1.0, width_px * 0.35))), dtype=np.float32) / 255.0


def relight(person: Image.Image, light: Lighting) -> Image.Image:
    """回傳打完光的新 RGBA 影像，不改動輸入。"""
    if person.mode != "RGBA":
        raise ValueError("人物圖必須是 RGBA")
    alpha = person.getchannel("A")
    rgb = np.asarray(person.convert("RGB"), dtype=np.float32)

    rgb = _ambient_tint(rgb, light) * light.exposure

    mask = _rim_mask(alpha, person.width * light.rim_width)
    # 輪廓光只打在上半身，下緣通常被人群擋住不會有溢光
    fade = np.linspace(1.0, 0.25, person.height, dtype=np.float32)[:, None]
    glow = mask * fade * light.rim_mix
    rgb = 255.0 - (255.0 - rgb) * (1.0 - glow[..., None] * (np.array(light.rim, dtype=np.float32) / 255.0))

    out = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    out.putalpha(alpha)
    return out
