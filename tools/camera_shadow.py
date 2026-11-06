"""相機底下的陰影圖（10-02 Jimmy：Q4 修完圖、相機縮回去的那一下，相機下面閃一塊灰色方塊）。

陰影以前用 CSS 算：先是 filter: drop-shadow，後來改 box-shadow。兩種都要手機每一幀重新算模糊，
iPhone Safari 在相機一邊縮放、一邊 3D 轉的時候，偶爾有一幀模糊還沒算好，陰影就變成一塊硬邊的灰色方塊。
現在改成事先模糊好的圖：手機只要把圖貼上去，不用再算，也就不會閃。
換機身圖要重跑：python3 tools/camera_shadow.py（數值對應 camera.css 的 .camera::before）
"""
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent / "web" / "assets" / "camera"
SRC = ROOT / "ccd_back_v6.webp"
OUT = ROOT / "ccd_shadow_v6.webp"
CSS_WIDTH = 370        # 相機平常的寬度（px），下面兩個數字是在這個寬度下量的
OFFSET_Y = 16          # 陰影往下多少（px）
BLUR = 34              # 模糊半徑（px），跟原本 box-shadow 的 34px 一樣
OPACITY = 0.38
PAD = 0.25             # 圖四周多留機身寬度的這麼多，模糊才不會被切掉
SCALE = 0.5            # 陰影很糊，半解析度就夠


def main() -> None:
    body = Image.open(SRC).convert("RGBA")
    w, h = body.size
    k = w / CSS_WIDTH
    pad = round(w * PAD)
    alpha = Image.new("L", (w + pad * 2, h + pad * 2), 0)
    alpha.paste(body.getchannel("A"), (pad, pad + round(OFFSET_Y * k)))
    # CSS 的模糊半徑約等於 2 個標準差
    alpha = alpha.filter(ImageFilter.GaussianBlur(BLUR * k / 2))
    alpha = alpha.point(lambda v: round(v * OPACITY))
    out = Image.new("RGBA", alpha.size, (16, 20, 28, 0))
    out.putalpha(alpha)
    out = out.resize((round(out.width * SCALE), round(out.height * SCALE)), Image.LANCZOS)
    out.save(OUT, quality=80)
    print(OUT, out.size, "pad", PAD)


if __name__ == "__main__":
    main()
