"""把鉻金屬造型貼貼到人物照上。

貼片會跟著臉的傾角旋轉，並在右下方壓一層模糊的接觸陰影，
讓它看起來是貼在皮膚上而不是浮在上面。
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageFilter

SHADOW_ALPHA = 0.40
SHADOW_BLUR_RATIO = 0.05
SHADOW_OFFSET_RATIO = (0.03, 0.04)

ROOT = Path(__file__).resolve().parent.parent


@lru_cache(maxsize=8)
def _sticker(shape: str) -> Image.Image:
    path = ROOT / "assets" / "stickers" / f"{shape}_chrome.png"
    if not path.exists():
        raise FileNotFoundError(f"找不到造型貼：{path}")
    return Image.open(path).convert("RGBA")


def load_points(path: Path | None = None) -> dict:
    path = path or ROOT / "assets" / "people" / "sticker_points.json"
    return json.loads(path.read_text(encoding="utf-8"))


def place(canvas: Image.Image, shape: str, xy: tuple[int, int], size: int, roll: float = 0.0) -> None:
    """就地把一枚造型貼合成到 RGBA 畫布上。"""
    if canvas.mode != "RGBA":
        raise ValueError("畫布必須是 RGBA")
    src = _sticker(shape)
    s = src.resize((size, round(size * src.height / src.width)), Image.LANCZOS)
    if roll:
        s = s.rotate(-roll, resample=Image.BICUBIC, expand=True)

    shadow = Image.new("RGBA", s.size, (0, 0, 0, 0))
    shadow.putalpha(s.getchannel("A").point(lambda v: int(v * SHADOW_ALPHA)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * SHADOW_BLUR_RATIO))

    x, y = xy[0] - s.width // 2, xy[1] - s.height // 2
    canvas.alpha_composite(shadow, (x + round(size * SHADOW_OFFSET_RATIO[0]),
                                    y + round(size * SHADOW_OFFSET_RATIO[1])))
    canvas.alpha_composite(s, (x, y))


def placement(person: dict, position: str) -> tuple[tuple[int, int], float]:
    """取出某個位置的座標與傾角。

    傾角是每個位置各自一個值，不是整個人共用一個——共用的話不管貼哪裡都平行，
    看起來像蓋章不像貼上去的。沒有單獨給就退回這個人的預設 roll。
    """
    spot = person.get("at", {}).get(position)
    if spot is None:
        raise KeyError(f"沒有 {position} 這個位置")
    return tuple(spot["xy"]), float(spot.get("roll", person["roll"]))


def positions(points: dict | None = None) -> list[str]:
    """所有可用的位置名稱，照 W 的順序。"""
    pts = points or load_points()
    return list(pts["W"]["at"])


def apply_choice(photo: Image.Image, shape: str, position: str, points: dict | None = None) -> Image.Image:
    """一人一枚，回傳新影像，不改動原圖。"""
    pts = points or load_points()
    out = photo.convert("RGBA").copy()
    for who in ("W", "M"):
        person = pts[who]
        try:
            xy, roll = placement(person, position)
        except KeyError as err:
            raise KeyError(f"{who} {err}") from err
        place(out, shape, xy, person["size"], roll)
    return out
