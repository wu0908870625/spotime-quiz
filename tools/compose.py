"""把場景背景、去背人物、造型貼組成一張結果圖。

人物來源抽成 `person_source` 參數，之後要換成使用者上傳的照片
只要換掉這個來源，合成流程不用動。
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from place_sticker import apply_choice, positions  # noqa: E402
from scene_light import relight  # noqa: E402
from scenes import SCENES, Scene  # noqa: E402

ASPECT = 0.8                 # 4:5，與相機螢幕、情侶照一致
OUTPUT_WIDTH = 1080
GRAIN_SIGMA = 3.0


def _crop_to_aspect(img: Image.Image, aspect: float = ASPECT) -> Image.Image:
    w, h = img.size
    if w / h > aspect:                      # 太寬，裁兩側
        nw = round(h * aspect)
        left = (w - nw) // 2
        return img.crop((left, 0, left + nw, h))
    nh = round(w / aspect)                  # 太高，裁上下
    top = (h - nh) // 2
    return img.crop((0, top, w, top + nh))


def _load_plate(scene: Scene, width: int) -> Image.Image:
    path = ROOT / "assets" / "scenes" / "graded" / scene.plate
    if not path.exists():
        raise FileNotFoundError(f"找不到場景背景：{path}")
    plate = _crop_to_aspect(Image.open(path).convert("RGB"))
    return plate.resize((width, round(width / ASPECT)), Image.LANCZOS)


def _add_grain(img: Image.Image, sigma: float = GRAIN_SIGMA) -> Image.Image:
    arr = np.asarray(img, dtype=np.float32)
    arr += np.random.normal(0.0, sigma, arr.shape).astype(np.float32)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def compose(
    scene_key: str,
    shape: str,
    position: str,
    person_source: Path | None = None,
    width: int = OUTPUT_WIDTH,
) -> Image.Image:
    """回傳一張 4:5 的結果圖。"""
    if scene_key not in SCENES:
        raise KeyError(f"沒有這個場景：{scene_key}")
    scene = SCENES[scene_key]

    if scene.plate is None:                 # 校園活動日用原照背景，不去背
        photo = Image.open(person_source or ROOT / "assets" / "people" / "couple_clean.jpg")
        out = apply_choice(photo, shape, position).convert("RGB")
        out = _crop_to_aspect(out).resize((width, round(width / ASPECT)), Image.LANCZOS)
        return _add_grain(out)

    cutout = Image.open(person_source or ROOT / "assets" / "people" / "couple_cutout.png")
    person = apply_choice(cutout, shape, position)
    if scene.lighting is not None:
        person = relight(person, scene.lighting)

    plate = _load_plate(scene, width).convert("RGBA")
    ph = round(width / (person.width / person.height))
    plate.alpha_composite(person.resize((width, ph), Image.LANCZOS), (0, plate.height - ph))
    return _add_grain(plate.convert("RGB"))


def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit("usage: compose.py <scene> <shape> <position> <out.jpg>")
    scene_key, shape, position, out = sys.argv[1:]
    if position not in positions():
        raise SystemExit(f"沒有這個位置：{position}")
    compose(scene_key, shape, position).save(out, quality=94)
    print(f"{scene_key} / {shape} / {position} -> {out}")


if __name__ == "__main__":
    main()
