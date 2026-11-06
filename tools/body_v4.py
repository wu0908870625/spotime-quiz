"""機身 v4：以網站現在的 ccd_back_clean 為底
1. 右側旋鈕拿掉：用上方乾淨那段機身右緣（直向一致、拉絲是橫的）往下補
2. SPT® 從第四顆鍵上方搬到螢幕正下方置中：只搬「字的筆畫」（原圖減掉底下的拉絲），
   新位置保留機身原本的紋理，才不會有一塊補丁的方框；舊位置用左右兩邊的亮度內插＋旁邊的拉絲紋理補平"""
from PIL import Image
import numpy as np
BASE = '/Users/jimmy.wu/spotime-quiz/web/assets/camera/ccd_back_clean.webp'
b = np.array(Image.open(BASE).convert('RGBA')).astype(float)
out = b.copy()
X0, X1, Y0, Y1 = 526, 626, 794, 832          # 舊 logo（含一點邊）
SCREEN_CX = 352.5                            # 螢幕中心：CSS --screen-left 9.918% + width 75.951% 的一半

def row_interp(img, x0, x1, y0, y1, k=3):
    """每一列用左右兩側 k 格的平均做直線內插＝沒有字時底下大概的亮度"""
    L = img[y0:y1, x0 - k:x0].mean(1)
    R = img[y0:y1, x1:x1 + k].mean(1)
    t = np.linspace(0, 1, x1 - x0)[None, :, None]
    return L[:, None, :] * (1 - t) + R[:, None, :] * t

rgb = b[:, :, :3]
bg_old = row_interp(rgb, X0, X1, Y0, Y1)
glyph = rgb[Y0:Y1, X0:X1] - bg_old
glyph[np.abs(glyph).max(2) < 5] = 0          # 太小的差是拉絲本身，不搬
# 舊位置：內插亮度＋左邊同一列的拉絲細節（原值減掉它自己的內插）
W = X1 - X0
src_x0 = X0 - W - 8
tex = rgb[Y0:Y1, src_x0:src_x0 + W] - row_interp(rgb, src_x0, src_x0 + W, Y0, Y1)
out[Y0:Y1, X0:X1, :3] = bg_old + tex
# 新位置：原本的拉絲＋字的筆畫
nx0 = int(round(SCREEN_CX - W / 2))
out[Y0:Y1, nx0:nx0 + W, :3] = rgb[Y0:Y1, nx0:nx0 + W] + glyph
print('logo', X0, '->', nx0)

# 旋鈕：y 636–866、x>=640 用 y 200–430 那段蓋掉（上下羽化 14px）
y0, y1, x0, f = 636, 866, 640, 14
src = b[y0 - 436:y1 - 436, x0:].copy()
H, Wd = y1 - y0, b.shape[1] - x0
wy = np.ones(H); wy[:f] = np.linspace(0, 1, f); wy[-f:] = np.linspace(1, 0, f)
wx = np.ones(Wd); wx[:f] = np.linspace(0, 1, f)
w = (wy[:, None] * wx[None, :])[..., None]
out[y0:y1, x0:] = out[y0:y1, x0:] * (1 - w) + src * w
out[y0:y1, 698:, :] = src[:, 698 - x0:, :]  # 機身外面（旋鈕凸出去的地方）整段照上方，透明度才乾淨

im = Image.fromarray(out.clip(0, 255).astype(np.uint8))
im.save('ccd_back_v4.png')
bgw = Image.new('RGBA', im.size, (255, 255, 255, 255)); bgw.alpha_composite(im); bgw.convert('RGB').save('ccd_back_v4_white.png')
