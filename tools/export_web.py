"""把合成用的素材切成網頁端的圖層，並產生一份 layers.json 清單。

網頁不在瀏覽器裡跑影像運算，而是把「背景 / 人物 / 造型貼」三層直接疊起來，
所以選項一按就換圖，沒有等待。這裡負責先把每一層算好存成檔案。
"""
from __future__ import annotations

import json
import shutil
from dataclasses import asdict
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from scene_light import relight  # noqa: E402
from scenes import ORDER, SCENES  # noqa: E402
from place_sticker import load_points  # noqa: E402

OUT = ROOT / "web" / "assets"
FRAME_W = 1000                      # 圖層輸出寬度
ASPECT = 0.8                        # 4:5
FRAME_H = round(FRAME_W / ASPECT)
STICKER_W = 256
JPEG_QUALITY = 82
PLATE_QUALITY = 82                  # 10-06 背景改 webp：同畫質比 jpg 小
WEBP_QUALITY = 80
SHAPES = ("heart", "star", "teardrop", "tomato", "wing", "clover")   # 10-08 雲朵改蕃茄；10-12 加兩款隱藏款
HIDDEN = ("wing", "clover")         # 隱藏款：不進題目，只在修圖「+ADD」往左滑才看得到（web/scripts/config.js HIDDEN_SHAPES）


def _crop_exact_aspect(img: Image.Image) -> Image.Image:
    """裁成剛好 4:5，這樣人物層與背景層的座標系統完全一致。"""
    w, h = img.size
    if abs(w / h - ASPECT) < 1e-6:
        return img
    if w / h > ASPECT:
        nw = round(h * ASPECT)
        left = (w - nw) // 2
        return img.crop((left, 0, left + nw, h))
    nh = round(w / ASPECT)
    top = (h - nh) // 2
    return img.crop((0, top, w, top + nh))


def _crop_offset(size: tuple[int, int]) -> tuple[int, int]:
    """_crop_exact_aspect 造成的座標平移量。"""
    w, h = size
    if w / h > ASPECT:
        return ((w - round(h * ASPECT)) // 2, 0)
    return (0, (h - round(w / ASPECT)) // 2)


def _fit(img: Image.Image) -> Image.Image:
    return _crop_exact_aspect(img).resize((FRAME_W, FRAME_H), Image.LANCZOS)


def _assert_no_border(img: Image.Image, name: str) -> None:
    """背景圖四邊不能有一圈白框（10-02 Jimmy：棒球場的調色版四邊各有 9–14px 白邊，
    自拍的人蓋過去，看起來像人超出相片框）。整條邊 97% 以上是近白色就算白框。"""
    gray = img.convert("L")
    w, h = gray.size
    edges = {
        "上": [gray.getpixel((x, 0)) for x in range(w)],
        "下": [gray.getpixel((x, h - 1)) for x in range(w)],
        "左": [gray.getpixel((0, y)) for y in range(h)],
        "右": [gray.getpixel((w - 1, y)) for y in range(h)],
    }
    bad = [side for side, px in edges.items() if sum(v > 245 for v in px) / len(px) > 0.97]
    if bad:
        raise SystemExit(f"{name} 的{'、'.join(bad)}邊是一整條白框，先把原圖的白邊裁掉再匯出")


def export_scenes() -> dict:
    """每個場景輸出背景層；有去背人物的場景另外輸出打完光的人物層。"""
    (OUT / "scene").mkdir(parents=True, exist_ok=True)
    (OUT / "person").mkdir(parents=True, exist_ok=True)

    cutout = Image.open(ROOT / "assets" / "people" / "couple_cutout.png")
    photo = Image.open(ROOT / "assets" / "people" / "couple_clean.jpg")
    manifest = {}

    for key in ORDER:
        scene = SCENES[key]
        if scene.plate is None:                     # 校園活動日：原照就是背景
            _fit(photo.convert("RGB")).save(OUT / "scene" / f"{key}.webp", quality=PLATE_QUALITY, method=6)
            manifest[key] = {"label": scene.label, "plate": f"scene/{key}.webp", "person": None}
            continue

        plate = Image.open(ROOT / "assets" / "scenes" / "graded" / scene.plate).convert("RGB")
        _assert_no_border(plate, scene.plate)
        _fit(plate).save(OUT / "scene" / f"{key}.webp", quality=PLATE_QUALITY, method=6)

        person = relight(_crop_exact_aspect(cutout), scene.lighting)
        person.resize((FRAME_W, FRAME_H), Image.LANCZOS).save(
            OUT / "person" / f"{key}.webp", quality=WEBP_QUALITY, method=6)
        manifest[key] = {
            "label": scene.label,
            "plate": f"scene/{key}.webp",
            "person": f"person/{key}.webp",
            # 自拍在瀏覽器裡用同一組參數打光（web/scripts/selfie/relight.js）
            "lighting": asdict(scene.lighting),
        }
    return manifest


def export_idle() -> dict:
    """還沒選場景時 LCD 顯示的待機人物層，不打光，背景由 CSS 出。"""
    (OUT / "person").mkdir(parents=True, exist_ok=True)
    cutout = Image.open(ROOT / "assets" / "people" / "couple_cutout.png")
    person = _crop_exact_aspect(cutout).resize((FRAME_W, FRAME_H), Image.LANCZOS)
    person.save(OUT / "person" / "idle.webp", quality=WEBP_QUALITY, method=6)
    return {"person": "person/idle.webp"}


def export_stickers() -> dict:
    (OUT / "sticker").mkdir(parents=True, exist_ok=True)
    out = {}
    for shape in SHAPES:
        src = Image.open(ROOT / "assets" / "stickers" / f"{shape}_product.png").convert("RGBA")
        h = round(STICKER_W * src.height / src.width)
        src.resize((STICKER_W, h), Image.LANCZOS).save(OUT / "sticker" / f"{shape}.png")
        out[shape] = {"src": f"sticker/{shape}.png", "ratio": round(h / STICKER_W, 4)}
        if shape in HIDDEN:
            out[shape]["hidden"] = True     # 網頁的讀取畫面不等它（layers.js preload）
    return out


def export_points() -> dict:
    """把貼點換算成 0–1 比例座標，網頁端用百分比定位就好。"""
    pts = load_points()
    src = Image.open(ROOT / "assets" / "people" / "couple_cutout.png")
    dx, dy = _crop_offset(src.size)
    w, h = _crop_exact_aspect(src).size

    out = {}
    for who in ("W", "M"):
        person = pts[who]
        out[who] = {
            "size": round(person["size"] / w, 5),
            "at": {
                name: {
                    "xy": [round((spot["xy"][0] - dx) / w, 5),
                           round((spot["xy"][1] - dy) / h, 5)],
                    "roll": spot.get("roll", person["roll"]),
                }
                for name, spot in person["at"].items()
            },
        }
    return out


def export_camera() -> dict:
    (OUT / "camera").mkdir(parents=True, exist_ok=True)
    png = ROOT / "assets" / "camera" / "ccd_back.png"
    meta = json.loads((ROOT / "assets" / "camera" / "ccd_back.json").read_text(encoding="utf-8"))
    Image.open(png).save(OUT / "camera" / "ccd_back.webp", quality=92, method=6)
    return {"src": "camera/ccd_back.webp", "screen": meta["screen"]}


def export_logo() -> dict:
    (OUT / "logo").mkdir(parents=True, exist_ok=True)
    names = (
        "spotime_lab_horizontal_white.png",   # 壓在照片上的浮水印
        "spotime_lab_horizontal_black.png",   # 銀色底的讀取畫面
        "spt_symbol.png",
    )
    for name in names:
        shutil.copy(ROOT / "assets" / "logo" / name, OUT / "logo" / name)
    return {
        "wordmark": "logo/spotime_lab_horizontal_white.png",
        "wordmark_dark": "logo/spotime_lab_horizontal_black.png",
        "symbol": "logo/spt_symbol.png",
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "_note": "由 tools/export_web.py 產生，不要手改",
        "frame": {"width": FRAME_W, "height": FRAME_H, "aspect": ASPECT},
        "order": list(ORDER),
        "scenes": export_scenes(),
        "idle": export_idle(),
        "stickers": export_stickers(),
        "points": export_points(),
        "camera": export_camera(),
        "logo": export_logo(),
    }
    (OUT / "layers.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    total = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"輸出 {OUT}，共 {total / 1024:.0f} KB")
    for p in sorted(OUT.rglob("*")):
        if p.is_file():
            print(f"  {p.relative_to(OUT)}  {p.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
