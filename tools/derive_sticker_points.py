"""由 Vision 偵測到的五官特徵點，算出四個造型貼位置與建議尺寸。

偏移量會跟著臉的傾角一起旋轉，所以歪頭的人也會貼在正確的位置。
四個位置的定義（全部用雙眼間距 IOD 當比例尺，換照片也能沿用）：
  under_eye     外側眼睛正下方，避開眼鏡下框
  cheek         外側眼角與同側嘴角的中點，再往外推一點
  forehead_side 外側眉尾的斜上方
  neck          下顎最低點再往下，偏向外側
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

Point = tuple[float, float]

# 各位置相對 IOD 的偏移量（outward, down）
OFFSETS = {
    "under_eye": (0.06, 0.58),    # 再往下一點，避開眼鏡下框
    "cheek": (0.16, 0.16),
    "forehead_side": (0.10, -0.20),  # 太高會貼到頭髮
    "neck": (-0.10, 0.52),
}
STICKER_TO_EYE = 1.0   # 貼片直徑＝眼睛寬度


def _centre(points: list[list[float]]) -> Point:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _face_points(face: dict, outward: int) -> dict[str, list[int]]:
    """outward = -1 表示這張臉的外側在畫面左邊，+1 在右邊。"""
    eyes = [face["leftEye"], face["rightEye"]]
    eyes.sort(key=lambda e: _centre(e)[0])
    outer_eye = eyes[0] if outward < 0 else eyes[1]
    ec_l, ec_r = _centre(eyes[0]), _centre(eyes[1])
    iod = math.dist(ec_l, ec_r) or 1.0
    roll = math.atan2(ec_r[1] - ec_l[1], ec_r[0] - ec_l[0])   # 臉的傾角
    oc = _centre(outer_eye)
    eye_w = max(p[0] for p in outer_eye) - min(p[0] for p in outer_eye)

    brows = [face["leftEyebrow"], face["rightEyebrow"]]
    brows.sort(key=lambda b: _centre(b)[0])
    outer_brow = brows[0] if outward < 0 else brows[1]
    brow_tip = min(outer_brow, key=lambda p: p[0] * outward * -1)

    lips = face["outerLips"]
    mouth_corner = min(lips, key=lambda p: p[0] * outward * -1)
    chin = max(face["faceContour"], key=lambda p: p[1])

    anchors = {
        "under_eye": oc,
        "cheek": ((oc[0] + mouth_corner[0]) / 2, (oc[1] + mouth_corner[1]) / 2),
        "forehead_side": brow_tip,
        "neck": chin,
    }
    cos_r, sin_r = math.cos(roll), math.sin(roll)
    out: dict[str, list[int]] = {}
    for name, (ox, oy) in OFFSETS.items():
        ax, ay = anchors[name]
        dx, dy = ox * iod * outward, oy * iod
        out[name] = [round(ax + dx * cos_r - dy * sin_r), round(ay + dx * sin_r + dy * cos_r)]
    out["_eye_width"] = round(eye_w)
    out["_iod"] = round(iod)
    out["_roll_deg"] = round(math.degrees(roll), 1)
    return out


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: derive_sticker_points.py <faces.json> <out.json>")
    faces = json.loads(Path(sys.argv[1]).read_text())
    if len(faces) != 2:
        raise SystemExit(f"預期兩張臉，實際偵測到 {len(faces)} 張")
    faces.sort(key=lambda f: f["box"][0])          # 左邊那位是女生
    result = {
        "W": _face_points(faces[0], outward=-1),
        "M": _face_points(faces[1], outward=+1),
    }
    Path(sys.argv[2]).write_text(json.dumps(result, ensure_ascii=False, indent=1))
    for who, p in result.items():
        print(f"{who}: 眼寬 {p['_eye_width']}px, IOD {p['_iod']}px")


if __name__ == "__main__":
    main()
