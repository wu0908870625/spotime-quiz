# 怎麼把站放上網給別人看

> **09-29 現況**：已經上線在 **https://spotime-quiz.spotime.workers.dev**
> （Cloudflare Workers 專案 `spotime-quiz`，帳號子網域 `spotime`；
> 舊的 `black-sunset-7ce5.wu0908870625.workers.dev` 已經停用）。
>
> **更新網站：終端機在 `~/spotime-quiz` 執行 `wrangler deploy`**（設定在 `wrangler.jsonc`，
> 這台電腦已經登入，只授權了部署 Workers 需要的權限）。
> 10-05 起 `/api` 多了一段 Worker 程式（`worker/`，限流＋轉給 Apps Script），
> **不能再用後台上傳 `web/` 資料夾**，那樣會把 Worker 程式蓋掉。
>
> `web/.assetsignore` 列的工具頁（preview.html、demo-*.html）不會被放上去。
>
> **流量分析**：Cloudflare → Analytics → Web analytics →
> `spotime-quiz.spotime.workers.dev`。看得到瀏覽量、裝置、國家、從哪個網站點進來。
> 之後換成 quiz.spotime.tw 要在那裡**另外加一個站**，追蹤碼的 token 也會換。

現在的站只跑在你自己的電腦上（`http://127.0.0.1:8765`），
那個網址只有你打得開。要給別人看就得把 `web/` 這個資料夾放到網路上。

整個站是純靜態的——HTML + CSS + JS + 圖，沒有伺服器程式要跑。
所以任何一家靜態託管都能放，而且都免費。

---

## 建議：Cloudflare Pages（拖曳上傳）

不用裝任何東西、不用 git、不用信用卡，**拖一個資料夾就好**。
之後要綁 `quiz.spotime.tw` 也是在同一個地方設定。

1. 到 [dash.cloudflare.com](https://dash.cloudflare.com) 註冊／登入
2. 左邊選 **Workers & Pages** → **Create application** → **Pages** →
   **Upload assets**（直接拖曳）
3. 專案名稱填 `spotime-quiz`
4. 把 **`~/spotime-quiz/web` 這個資料夾整個拖進去**
   （是 `web` 資料夾本身，不是它的上一層，也不要壓縮）
5. 按 **Deploy site**

大約 30 秒後會拿到 `https://spotime-quiz.pages.dev`，
這個網址就可以直接丟給任何人。

要更新的時候：同一個專案 → **Create new deployment** → 再拖一次 `web`。

### 之後要換成 quiz.spotime.tw

在這個 Pages 專案裡 **Custom domains → Set up a domain**，
填 `quiz.spotime.tw`，它會給你一筆 CNAME 記錄。
把那筆記錄加到 spotime.tw 的 DNS 就完成。

> 🔴 **這一步卡在一個還沒回答的問題：spotime.tw 的 DNS 現在誰在管？**
> 是 meepshop 代管、還是我們自己在某家註冊商的後台？
> 查出來之前先用 `.pages.dev` 的網址就好，不影響任何測試。

---

## 想「現在馬上」丟給一個人看

[app.netlify.com/drop](https://app.netlify.com/drop) 把 `web` 拖進去，
幾秒就有網址。**但沒登入的話網址是暫時的**，隔天可能就不在了。
拿來給人看一眼可以，正式的還是走上面那條。

---

## 上線前一定要確認的四件事

| | 為什麼 |
|---|---|
| `config.js` 的 `API_ENDPOINT` 有填 | 沒填的話 email 表單只會在 console 印警告，不會真的存起來 |
| 網址是 **https** | IG 站內瀏覽器會擋 http 的頁面；Pages 自動有 https，不用設定 |
| 手機實測一次「存下這張圖」 | 手機瀏覽器會忽略下載檔名，所以改成了全螢幕長按儲存。要在真手機上確認長按存得進相簿 |
| 在 IG 限動的連結裡點一次 | IG 站內瀏覽器是最容易出事的環境，桌機 Chrome 過了不代表它會過 |

---

## 不要放的東西

`web/preview.html` 是我們自己對照手機／電腦版型用的工具頁。
它會出現在上線後的網址下（`.../preview.html`），沒有連結指向它，
一般人不會找到，但如果你介意，**上傳前把這一個檔案刪掉就好**，
其他檔案都不依賴它。

`backend/`、`tools/`、`assets/`、`design/` 都**不要**上傳，
那些是生素材與寫文件的地方，站上用不到。上傳的永遠只有 `web/`。
