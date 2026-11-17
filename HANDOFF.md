# SPOTIME 拍立得測驗站：交接說明

> 2026-11-17 寫給接手調整的設計師。用 AI 工具（Claude Code、Cursor 等）改程式的話，先讓它讀這份。

- 正式站：https://spotime-quiz.spotime.workers.dev（Cloudflare Workers）
- 測試站：https://spotime-quiz-preview.spotime.workers.dev
- 這個 repo 的 `main` 分支＝正式站現在跑的版本。

## 一、怎麼在自己電腦上跑起來

需要：Python 3（看網頁）；要改素材再裝 `pip install pillow numpy scipy`。

```bash
python3 tools/serve.py        # 開 http://127.0.0.1:8765
```

Mac 也可以直接雙擊 `開啟測驗網頁.command`。

不能用 file:// 直接開 `index.html`，瀏覽器會擋 module 腳本，畫面會一直停在讀取動畫。
本機沒有 `/api`，所以寫進試算表、稀有度、漏斗不會動，畫面和互動都正常。

## 二、資料夾地圖

| 位置 | 是什麼 | 能不能改 |
|---|---|---|
| `web/index.html` | 唯一的頁面，所有畫面都在裡面（開場、五題、結果頁） | 可以 |
| `web/styles/*.css` | 樣式。`tokens.css` 是顏色、字級等變數，`result.css` 是結果頁 | 可以 |
| `web/scripts/*.js` | 互動邏輯（下面挑重點） | 可以，改之前先看檔案開頭的註解 |
| `web/assets/` | **網站實際讀的圖**，由 `tools/export_web.py` 產生 | 不要手改，改原始素材再匯出 |
| `assets/` | 原始素材：`stickers/` 造型貼、`scenes/` 場景、`camera/` 相機、`people/` 範例人物 | 可以 |
| `tools/` | Python 素材工具，`export_web.py` 最重要 | 小心改 |
| `worker/` | Cloudflare 上跑的後端：防灌票、轉送 Google 試算表、流量漏斗 | **不要動** |
| `backend/Code.gs` | Google Apps Script（試算表那端） | **不要動** |
| `design/` | 設計紀錄、文案、提示詞、參考圖 | 參考用 |
| `tests/` | 自動測試，`node --test tests/*.test.mjs` | 改到邏輯時跑一下 |

### scripts 重點

- `main.js`：總指揮，串起整個流程。
- `quiz.js`：五題的題目與選項。`state.js`：答案存放。
- `layers.js` / `render.js`：把「背景／人物／造型貼」三層疊成照片。
- `result.js`：結果頁。`save.js`：存圖。`igstory.js`：發 IG 限動的兩步引導。
- `line-oa.js`：加 LINE 好友按鈕。
- `selfie/`：上傳自拍、去背、貼到照片上（MediaPipe，在手機端跑）。說明見 `design/selfie.md`。
- `camedit.js`（在相機螢幕上修圖）、`shutter.js`、`halo-*.js`、`fx.js`：相機、快門與光效。

## 三、改素材的流程（最容易漏）

網站不讀 `assets/` 裡的原檔，讀的是 `web/assets/` 裡匯出過的版本。**改完原始素材一定要跑：**

```bash
python3 tools/export_web.py
```

跑完 `web/assets/` 和 `web/assets/layers.json` 會更新，兩個都要一起存進 git。

### 造型貼

- 網站用的是 `assets/stickers/<形狀>_product.png`，共 7 款：`star heart teardrop clover tomato cloud wing`（`wing`、`clover` 是隱藏款）。
- `*_product.png` 原本是 `tools/make_stickers.py` 從刀模輪廓（`*_black.png`）畫出來的。設計師有正式圖檔的話，**直接用同檔名覆蓋 `*_product.png`**（透明背景 PNG），再跑 `export_web.py` 就好，不用跑 make_stickers。
- 匯出時會縮成寬 256px（`tools/export_web.py` 的 `STICKER_W`）。在高解析度手機上可能偏糊，可以考慮調大，但檔案會變大、讀取會變慢。
- 貼在臉上的位置在 `tools/place_sticker.py` / `derive_sticker_points.py`。

## 四、已經研究過的事（避免重工）

- **IG 限動沒辦法一鍵發**：IG 的限動分享只開放給 App，網頁不能把圖直接塞進限動。系統分享面板裡也沒有「IG 限動」可選，IG 內建瀏覽器的限制更多。所以現在做成兩步：存到相簿 → 打開 IG 限動相機。細節寫在 `web/scripts/igstory.js` 開頭。
- **手機第一屏要看得到 LINE 按鈕**：結果頁照片寬度是用螢幕高度反推的（`result.css` 的 `.slot`，`--above` / `--below`）。改結果頁的文字或間距時，要在 iPhone SE、iPhone 13 的 IG 內建瀏覽器、Pro Max 上檢查 LINE 鈕有沒有被擠到第一屏外面。
- **背景**：場景是預先合成好、依場景打光的圖（`tools/scene_light.py`）。自拍會依場景重新打光（`selfie/relight.js`）。**「保留自拍原本的背景」已經有了**（`selfie/backdrop.js`，10-06 加的，不去背、照片直接裁成合照框），想改成「另外上傳一張照片當背景」可以從這支和 `selfie/compose.js` 延伸。
- 視覺方向是「鉻金屬／銀色 Y2K」＋拍貼機結構，不是泡泡糖可愛風。

## 五、怎麼上線

設計師不需要 Cloudflare 權限。流程：

1. 開一個分支改（例如 `design/sticker-v2`），改好推上 GitHub，開 Pull Request。
2. Jimmy 那邊先部署到**測試站**，用手機看。
3. 確認後合併進 `main`，再部署正式站。

不要把任何密碼、通行碼、試算表網址寫進 repo。這些都只存在 Cloudflare 上。
