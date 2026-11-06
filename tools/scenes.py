"""四個場景的設定：背景圖、打光、以及結果圖上的文字。"""
from __future__ import annotations

from dataclasses import dataclass

from scene_light import Lighting


@dataclass(frozen=True)
class Scene:
    key: str
    label: str
    plate: str | None       # None 代表用人物照原本的背景
    lighting: Lighting | None


SCENES: dict[str, Scene] = {
    "concert": Scene(
        key="concert",
        label="演唱會 / 音樂祭",
        plate="concert.jpg",
        lighting=Lighting(
            ambient=(88, 58, 132), ambient_mix=0.22,
            rim=(206, 132, 255), rim_mix=0.85, rim_width=0.024, exposure=0.93,
        ),
    ),
    "baseball": Scene(
        key="baseball",
        label="棒球應援",
        plate="baseball.jpg",
        # 09-24 換成白天的看台，原本是夜間冷藍（ambient 44,62,84）。
        # 傍晚的斜陽偏暖，天空給一點藍當補光；輪廓光比校園強，因為太陽在人物斜後方
        lighting=Lighting(
            ambient=(142, 160, 180), ambient_mix=0.17,
            rim=(255, 238, 206), rim_mix=0.52, rim_width=0.018, exposure=1.05,
        ),
    ),
    "photobooth": Scene(
        key="photobooth",
        label="拍貼機",
        plate="photobooth.jpg",
        lighting=Lighting(
            ambient=(255, 214, 224), ambient_mix=0.22,
            rim=(255, 246, 250), rim_mix=0.45, rim_width=0.014, exposure=1.06,
        ),
    ),
    "campus": Scene(
        key="campus",
        label="校園活動日",
        plate="campus.jpg",
        # 走廊那張是晴天的自然光，天空和操場把暗部往冷綠推一點點；
        # 輪廓光很弱，因為光是從側邊窗戶進來的，不是從人物背後
        lighting=Lighting(
            ambient=(150, 168, 172), ambient_mix=0.18,
            rim=(255, 252, 240), rim_mix=0.38, rim_width=0.014, exposure=1.03,
        ),
    ),
}

ORDER = ("concert", "baseball", "photobooth", "campus")
