# 場景生圖：四張全部定案，棒球 09-29 換成 v8（一壘側看台視角）

2026-09-24 第六版。**四個場景的背景板都已經確定並套進站上，這個檔從「還要生什麼」
改成「怎麼生出來的、下次要生新場景時照這個做」。**

## 現況

| 場景 | 背景板 | 來源 |
|---|---|---|
| 演唱會 | `assets/scenes/graded/concert.jpg` | 生圖 |
| 棒球應援 | `assets/scenes/graded/baseball.jpg` | **v6：白天、從看台往場內看**（09-24 換掉第五輪那張看台圖） |
| 拍貼機 | `assets/scenes/graded/photobooth.jpg` | 生圖 |
| 校園活動日 | `assets/scenes/graded/campus.jpg` | 第四輪走廊 |

## 棒球：第五輪收掉

第五版 prompt（人群集中上半部、下半部空座椅、明寫 East Asian ＋ 黑髮）生了三張，
Jimmy 選 C。三張的共同問題還是「觀眾太多太密集」，但**合成之後就不是問題了**——
情侶蓋掉中間，看台只剩畫面上緣一條，密不密集看不出來。

真正做的處理是 `tools/depth_blur.py`：

```
python3 tools/depth_blur.py 來源.jpg assets/scenes/graded/baseball.jpg \
    --focus 0.55 --far 12 --near 2
```

對焦面放在情侶站的位置，往上（遠處看台）拉到 12px 模糊，往下幾乎不動
（原圖前景本來就有散景，再糊會變成一團）。效果：

- 中景那排觀眾化成色塊，沒有一張臉認得出來
- 隊徽和布條上的字一起糊掉，不會有商標問題
- 上緣的頂棚和藍天保留清楚，「這是球場」還讀得出來

**試過 far=22 的重糊版本，不行**：上緣糊成一片，就認不出是球場了。
散景是為了讓路人退場，不是為了把場景抹掉。

打光也跟著改：`tools/scenes.py` 的 `baseball` 從夜間冷藍（ambient 44,62,84）
換成傍晚日光（ambient 142,160,180 / rim 255,238,206 / exposure 1.05）。
不改的話情侶是照夜景打的光，貼到白天的圖上臉會偏暗，一眼看得出是合成。

## 棒球 v6 prompt（轉 180 度，往場內看）

Jimmy 09-24 放棄「生一片觀眾」這條路，改走他找到的參考照：
**不要拍看台，拍從看台往場內看出去的那一面。**

這個構圖把問題整個消掉，不是壓下去：
鏡頭裡本來就沒有觀眾，「觀眾太多太密集」這件事不可能再發生。
而且「這是球場」的線索（草皮、紅土、計分板、燈柱、藍天）全部落在畫面上半部，
剛好符合〈一、先想情侶貼上去之後還剩什麼〉那一節的判準。

代價是畫面會偏空，所以要靠「場上有幾個守備球員」把「比賽進行中」講出來——
這也是 Jimmy 指定的那一點。球員要遠、要失焦，只剩人形。

### 中文版（主要）

> 白天的棒球場，從觀眾席前排往場內看出去。
> 畫面上半部是修剪出條紋的綠色外野草皮和紅土內野，
> 場上有五、六個穿白色球衣的球員散開站在守備位置，
> 他們距離很遠而且失焦，只看得出人形和動作，看不清臉，球衣是素面的。
> 草皮後方是一整排深色的空看台，和一座深色計分板，
> 計分板上只有簡單的白色數字與燈泡點陣，沒有隊名也沒有商標。
> 再往上是四座白色燈柱和晴朗的藍天，有幾朵薄雲。
> 畫面下半部是深綠色的全壘打牆，牆面有布面護墊的質感，被日光照到，
> 牆前是一支銀色金屬欄杆和一小段網子，
> 最前景是兩張空的深藍色塑膠座椅，前景失焦。
> 正午過後的強烈日光從左上方斜射進來，影子短而清楚。
> 手持手機隨手拍的角度，畫面略為傾斜，鏡頭接近水平，
> 手機人像模式的淺景深，對焦在中距離。
> 直式 4:5，日光白平衡，輕微顆粒。

### 英文版（備用）

> Daytime view from the front row of a ballpark's seating bowl, looking out over
> the field. Upper half: striped green outfield grass and red clay infield, with
> five or six players in plain white uniforms spread across their defensive
> positions — distant and out of focus, readable as human shapes only, faces
> indistinct, uniforms unbranded. Behind them a long band of empty dark seating
> and a dark scoreboard showing plain white bulb-matrix numbers, no team names,
> no logos. Above that, four white floodlight towers and a clear blue sky with
> thin clouds. Lower half: a dark green outfield wall with padded fabric
> texture catching the sunlight, a silver metal railing and a short run of
> netting in front of it, and two empty navy plastic seats in the extreme
> foreground, out of focus. Strong early-afternoon sunlight from the upper left,
> short crisp shadows. Handheld phone snapshot, frame slightly tilted, lens
> roughly level, phone portrait-mode shallow depth of field focused at
> mid-distance. Vertical 4:5, daylight white balance, light grain.

### 生完要檢查的三件事

1. **中間那道牆不能是純黑。** 參考照是夜拍，牆整片死黑；
   情侶去背貼上去之後，邊緣會在黑底上炸出一圈白邊。
   所以 prompt 裡明寫「被日光照到」「布面護墊的質感」。
2. **計分板不能有字。** 有隊名就是別人的商標，跟 NY／Yankees 那次一樣不能用。
3. **球員不能清楚。** 清楚就會變成「這是某支球隊的某場比賽」，
   而且臉一清楚就跟情侶的解析度打架。糊不夠可以事後補：
   `python3 tools/depth_blur.py 來源.jpg 輸出.jpg --focus 0.62 --far 10 --near 3`

打光設定（`tools/scenes.py` 的 `baseball`）已經是白天日光，不用再改。

## 下次要生新場景時

### 一、先想「情侶貼上去之後還剩什麼」

這是前五輪學到最重要的一條。覆蓋率實測：

| 畫面高度 | 被人物蓋掉 |
|---|---|
| 最上面 10% | 1% |
| 10–30% | 30–48% |
| 30–40% | 76% |
| 40% 以下 | 87–100% |

**所有「一看就知道是哪裡」的元素都要在畫面上半部。** 校園那輪用三張圖驗證過：
空教室的黑板桌椅全在情侶後面，只剩天花板燈管，看不出是教室；
走廊的藍天、操場、綠欄杆、磁磚柱都在上半部，所以走廊贏。

### 二、prompt 的五個坑

1. **不吃 negative prompt。** 寫 `Negative: scoreboard` 只會讓計分板出現。
   只描述畫面裡該有什麼。不要隊徽就寫「素面」，不要寫「沒有隊徽」。
2. **「留白」會被照字面執行。** 寫 `keep the lower half simple` 就真的清空給你。
3. **第一句的主詞決定整張畫面。** `A baseball stadium...` 畫的是一座（空的）球場。
   要人群就從人群寫起，要模糊就把「模糊」寫進第一句。
4. **同一個對話串＝微調上一張。** 每段都開新串。
5. **不指定人種就會給歐美臉。** 要寫 East Asian／黑髮／亞洲身形。

### 三、規格

- 直式 4:5，愈大愈好，我會裁
- 一次生四張挑一張
- 存到 `assets/scenes/graded/`，跑 `python3 tools/export_web.py`
- **生不出散景就不要硬拗**，把最接近的給我，`depth_blur.py` 可以補

## 棒球第五版 prompt（留檔）

> 白天的棒球場看台，畫面上半部是一整片模糊的東亞觀眾，黑髮，坐滿一排一排的座位，
> 有人站著、有人舉著手。他們全部都是柔和的失焦色塊，白色和深藍色的衣服混在一起，
> 認不出任何一張臉。畫面下半部是幾排空的深綠色塑膠座椅，也是失焦的。
> 畫面最上緣露出一小截看台頂棚和藍天。
> 手機自拍的傾斜角度，鏡頭略為朝上，手機人像模式的淺景深。
> 明亮的午後陽光從左上方斜射下來。直式 4:5，手機隨手拍的質感，
> 日光白平衡，輕微顆粒。

## 版權

`refs/scene_v2/campus_corridor_*.png`、`baseball_kbo_*.png` 是網路上的照片，
**只能當參考**。`refs/scene_v2/gemini_r3/`、`gemini_r4/`、`gemini_r5/` 是我們自己生的，可以用。


---

## 棒球 v6 生出來了（09-24）

Jimmy 拿 v6 prompt 生了一張，存在
`design/refs/scene_v2/gemini_r6/baseball_v6_day_field.jpg`（928×1152，跟其他背景板同規格），
已經換上 `assets/scenes/graded/baseball.jpg`。舊的那張看台圖改名成
`baseball_v5_day_crowd_RETIRED.jpg` 留在同一個資料夾。

### 三件要檢查的事，全部過

| 檢查 | 結果 |
|---|---|
| 中間那道牆不能是純黑 | ✅ 綠色軟墊、被日光照到，有面板接縫與高光。去背邊緣不會炸白邊 |
| 計分板不能有字 | ✅ 只有 `HOME / GUEST / INNING` 這種通用字，沒有任何隊名或商標 |
| 球員要糊 | ✅ 八九個白色身影散在外野與內野，夠遠夠軟，不用再跑 `depth_blur.py` |

### 但有一個沒解決的問題

**球員全部被情侶擋掉了。** 他們集中在畫面中段 60% 的寬度，
而情侶合成上去之後正好蓋住那一塊。實際輸出看得到的只剩：
左右兩側的燈柱、空看台、一條綠色外野、下面那道綠牆、藍天。
場景仍然明確讀得出是棒球場，但 Jimmy 要的「比賽進行中」這件事看不到。

要真的看到球員，下一版 prompt 只要加一句：

> 守備球員要**散開到畫面最左邊與最右邊**（左外野邊線、右外野邊線附近），
> 不要集中在中間；中間的內野可以空著。

因為情侶只蓋得住中段，畫面左右各留 15% 左右的可見寬度，球員站在那裡才會露出來。

英文加在 v6 prompt 的球員那一句後面：

> `spread the fielders toward the far left and far right edges of the frame
> (near the left-field and right-field foul lines), leaving the middle of the
> infield empty; they must stay small and out of focus`

---

## 棒球 v7：球員散開成功，但視角太正（09-24 晚間）

Jimmy 用「球員散開到左右兩側」那句生了 v7，存在
`design/refs/scene_v2/gemini_r7/baseball_v7_field_spread.jpg`（825×1024），
已經換上 `assets/scenes/graded/baseball.jpg`；v6 留在 `gemini_r6/`。

### 散開的修正有效，量得出來

把畫面切成十等分，數草地上白色人影的像素：

| 區段 | 0–20%（看得到） | 20–80%（被情侶蓋掉） | 80–100%（看得到） |
|---|---|---|---|
| 人影像素 | 323 | 493 | 333 |

v6 是幾乎全部落在中段，一個都活不下來。v7 兩側共 656 像素，
**合成之後左邊確實看得到一個守備球員站在外野草地上**。三件檢查也仍然全過。

### Jimmy 的意見：視角太過正中間

相機正對中外野，兩側燈柱對稱、外野牆與畫面下緣完全平行，
看起來像球場的官方形象照，不像一個觀眾隨手拍的自拍背景。
真的坐在看台上，幾乎不可能剛好坐在正中軸線上。

### v8 要改的一句話

這一版**只改視角，其他全部沿用 v7 的 prompt**——球員散開、綠牆、無商標計分板
都已經對了，不要一起重寫，不然會連對的地方一起變掉。

> 相機不要在中外野的正中軸線上。改成**坐在一壘側（或三壘側）的看台**，
> 斜斜地望向場內：外野牆和護欄要**斜著穿過畫面**、不要跟畫面下緣平行，
> 左右兩根燈柱不要對稱，內野的邊線朝畫面一側收斂。
> 看台上要有零星幾個觀眾的背影，不要整片空位。

英文版：

> `shoot from the stands along the first-base line, not from dead center field —
> an off-axis spectator viewpoint. The outfield wall and the railing should run
> diagonally across the frame, not parallel to the bottom edge; the light towers
> must not be symmetrical; the foul line converges toward one side of the frame.
> Scatter a few out-of-focus spectators in the seats instead of leaving them empty.`

### 為什麼不要求「完全側面」

情侶佔掉畫面中段 60%，背景只剩左右兩條約 15% 寬的縫。
視角偏太多會讓那兩條縫裡剩下看台結構而不是球場，反而更認不出場景。
**偏一點就夠了**——牆斜過去、燈柱不對稱，就不像形象照了。

---

## 棒球 v8：視角改對了，場景定案（09-29）

Jimmy 用上面那句只改視角的 prompt 生了 v8，存在
`design/refs/scene_v2/gemini_r8/baseball_v8_first_base_view.jpg`（928×1152），
已經換上 `assets/scenes/graded/baseball.jpg`；v7 留在 `gemini_r7/`。

### 視角這次對了

外野牆與護欄斜穿畫面、燈柱左右不對稱（右邊一根大的、左邊三根小的）、
內野邊線朝右下收斂、前景有一排藍色看台座椅與扶手。
看台上是零星觀眾不是整片空位，也不是滿場。
這就是「一個觀眾隨機坐在一壘側看台」的視角。

三件檢查照舊全過：

| 檢查 | 結果 |
|---|---|
| 綠牆不是純黑 | 圍牆帶平均 RGB (123, 137, 115)，綠的 |
| 計分板無商標 | 只有 `3 / 3 / 0` 和糊掉的欄位名，隊名讀不出來 |
| 看台招牌無商標 | 兩塊招牌都是糊成一團的色塊，讀不出字 |
| 球員夠糊 | 七名守備員都是小小的白色人影，背號與隊徽都看不到 |

### 代價：那名露出來的守備球員不見了

v7 合成後左緣看得到一名外野手；**v8 沒有**。
量過了：v8 最左邊那兩名守備員落在成品座標 x≈129 與 157，
而情侶在那個高度只讓出 x 0–121，差了幾個像素就被頭髮蓋掉。

還是選 v8，因為換到的東西更值：

- v7 的右緣是**空的看台座椅**，v8 的右緣是**有屋頂的主看台**，兩邊都認得出是球場了
- v8 的天空有捲雲、草地有割草條紋，v7 是平的藍天加素面草皮

一顆看不太清楚的小白點，換兩側都讀得出場景，划算。

### 如果之後想把守備員救回來

不要重生整張，只加一句：

> 讓**一名外野守備員站在畫面最左緣**，離左邊界不超過畫面寬度的十分之一。

> `place one outfielder within the leftmost 10% of the frame width, standing on
> the outfield grass`

但這件事優先度很低——現在兩側都已經讀得出是棒球場了。
