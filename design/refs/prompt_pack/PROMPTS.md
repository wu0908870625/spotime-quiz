# SPOTIME 測驗 高保真設計稿 生圖提示詞（2026-09-22）

兩張都是「純手機畫面、9:16 直式、無手機外框」。中文字有可能被模型寫壞，這版只看版面與質感，文字之後寫程式時才正式排。

## 圖 A：Q1 場景選擇頁
附圖：Q1-ref1（版面比例）、Q1-ref2（鉻金屬＋粉紅大標）、Q1-ref3（半調點底紋）、Q1-ref4（情侶照，畫面裡的照片請照這張）

```
Mobile app screen, 9:16 portrait, full-bleed, no phone frame, no hands.
Style: Y2K chrome / cyber aesthetic, NOT kawaii, NOT bubblegum. Think early-2000s silver electronics and a clean lab.
Background: brushed-silver to white gradient (#D9D9D9 → #FFFFFF) with a subtle black halftone dot halo (like ref 3) fading in from the top-right corner.
Top-left: small black wordmark "SPOTIME®LAB" in a neutral grotesk. Top-right: a black pill tag "Q1 / 3".
Headline, top third: the word "WHERE?" rendered as 3D liquid chrome lettering with a hot-pink (#FF97CE) inner fill and a thin black outline, like ref 2. Under it, a short black bold sans-serif line: "你們在哪裡？".
Middle: a photo card with 12px rounded corners and a 1px silver metallic border showing the couple selfie from ref 4 (two young people, two small chrome heart stickers on the cheek). A tiny silver CCD compact digital camera (early-2000s Canon IXUS style, brushed metal) sits tilted at the card's top-left corner as a decoration, with a small white lens flare.
Bottom half: four stacked option pills, full width, white with 1.5px black outline and a soft chrome bevel highlight, black bold text with a small monochrome line icon on the left:
  "🎤 演唱會 / 音樂祭"  "⚾ 棒球應援"  "📸 拍貼機"  "🏫 校園活動日"
The second pill is in the pressed state: filled hot pink (#FF97CE), black text, with two tiny four-point sparkles at its corner.
Very bottom: three progress dots, first one black, others silver.
Details: proportions like ref 1 (generous margins, large tap targets); one chrome four-point star and one small "Lab Cross" crosshair mark as the only decorations; no gradients other than the silver background; no flowers, no smiley faces, no checkerboard.
```

## 圖 B：結果頁（出片後、稀有度、兩顆按鈕）
附圖：R-ref1（相片條結構）、R-ref2（液態鉻字）、R-ref3（全息徽章）、R-ref4（結果圖，相片條裡就放這張）、R-ref5（Logo）

```
Mobile app screen, 9:16 portrait, full-bleed, no phone frame, no hands.
Style: Y2K chrome / cyber aesthetic, NOT kawaii. Dark photobooth room.
Background: pure black with a soft spotlight cone from the top center, made of halftone dots that fade out (like a stage light), plus a faint silver film-grain texture.
Top: the word "RESULT" in 3D liquid chrome lettering (like ref 2), silver only, no pink, centered, taking about 60% of the width. Above it, tiny silver text "SPOTIME QUIZ — 拍貼機".
Center: a vertical white photo-booth strip, slightly rotated -3°, with a thin brushed-silver metallic edge and a soft white glow beneath it, as if it just printed. The strip has ONE big photo (the couple selfie from ref 4, two chrome hearts on the cheeks) and a white footer band printed with small black monospace text "2026.12.01  ♥ HEART × CHEEK" and, bottom-right of the band, the small black "SPOTIME®LAB" wordmark from ref 5.
Right of the strip, overlapping its top-right corner: a round holographic foil badge (like ref 3, rainbow-chrome), 64px, with tiny black text around the rim and a big number in the middle: "#23".
Below the strip: one line of black-on-silver monospace-style text on a silver pill: "你是第 23 位選這組的人".
Bottom: two full-width buttons stacked. First: filled hot pink (#FF97CE) with a chrome bevel highlight and black bold text "留 Email 拿 9 折". Second: white with 1.5px black outline and black text "發到限動 @spotime". Both with 12px rounded corners.
Details: two chrome four-point sparkles near the strip, nothing else; no confetti, no emoji faces, no checkerboard, no flowers.
```

## 給模型時的規則
1. 每張最多附 4–5 張 ref，多了反而亂。
2. 出來的圖若把「相片條裡的照片」自己畫成別人，沒關係，那塊之後程式會換成真的。
3. 若鉻字被畫成一般粉紅字，補一句「the headline must look like polished liquid mercury with sharp white highlights and dark reflections」。
4. 若整體變可愛（出現笑臉花、格紋、圓潤 emoji），補一句「remove all cute elements; keep it cold, metallic, minimal」。

---
# v2（2026-09-22 看過 Gemini 第一版後）

第一版方向對了，結果頁不用重生。只重生 Q1，改四件事：標題改鉻字、選項去 emoji 改 2×2、照片先不貼貼片、比例改成真手機。

## 圖 A v2：Q1 場景選擇頁
附圖：Q1-ref2（鉻金屬粉紅大標）、Q1-ref4（情侶照）、gen_v1_gemini.jpg（第一版，告訴模型「保留這張的背景、相機、氣氛，只改下面幾點」）

```
Regenerate ONLY the left screen (Q1) of the attached first draft. Keep its brushed-silver background, halftone dot halo, the silver CCD camera, the SPOTIME®LAB wordmark, the "Q1 / 3" pill, the Lab Cross marks and the progress dots exactly as they are.
Output a single mobile screen at 9:19.5 aspect ratio (1080 × 2340), full-bleed, no phone frame. Everything must fit in one screen without scrolling.
Change these five things:
1. Headline "WHERE?": NOT a pink bubble font. Render it as polished liquid-chrome 3D lettering like the "RESULT" on the right screen of the draft, with a hot-pink (#FF97CE) inner face and mirror-silver bevel edges, sharp white highlights, dark reflections, thin black outline. Keep "你們在哪裡？" below it in black bold sans.
2. The photo card: show the couple selfie from ref with NO stickers on their faces (stickers are chosen later). Crop the card to 4:5 so it takes about 38% of the screen height.
3. The four options become a 2 × 2 grid of capsule-shaped pills (fully rounded ends, like a medicine capsule), white with a 1.5px black outline and a soft chrome bevel. Remove all emoji. Each pill has a small black monochrome line icon on the left (microphone / baseball / photo booth / school bell) and black bold text: "演唱會 / 音樂祭", "棒球應援", "拍貼機", "校園活動日".
4. The "棒球應援" pill is pressed: filled hot pink #FF97CE, black text, two tiny four-point chrome sparkles at its top-right corner.
5. Under the grid, one line of small grey text: "點一個，背景會跟著換".
Style guard: cold, metallic, minimal Y2K chrome; no cute faces, no flowers, no checkerboard, no extra gradients.
```

---
# v3（2026-09-22 依 Jimmy 五點回饋重寫，取代 v2）

概念改為：**整個測驗＝情侶拿 CCD 相機自拍**。Q1–Q3 的畫面是相機背面的螢幕即時預覽（選什麼場景，螢幕背景就換什麼），結果頁是按下快門後洗出來的那張照片。拍貼機退回去當四個場景之一，不再是介面的主題。

兩張分開生、各自 9:19.5（1080×2340）、無手機外框。

## 圖 A v3：Q1 場景選擇頁
附圖：Q1-ref4（情侶照）、gen_v1_gemini.jpg（第一版，只借背景質感與按鈕樣式）

```
One mobile screen, 9:19.5 portrait (1080 × 2340), full-bleed, no phone frame, no hands. Everything fits without scrolling.
Style: cold Y2K chrome / early-2000s silver electronics, minimal. Palette: brushed silver, white, black, one accent hot pink #FF97CE. No cute faces, no flowers, no checkerboard, no emoji.
Background: brushed-silver to white vertical gradient with a black halftone-dot halo fading in from the top-right corner (same as the attached draft).
Top bar: left, small black wordmark "SPOTIME®LAB"; right, a black capsule tag "Q1 / 3".
Headline (compact, about 12% of height): "WHERE TO?" in polished liquid-chrome 3D lettering with a hot-pink inner face and mirror-silver bevel, sharp white highlights, thin black outline. Below it in black bold sans: "你們今天要去哪？".
Center piece (about 50% of the screen height, 88% of the width): the BACK of a silver CCD compact digital camera held VERTICALLY (portrait orientation), photographed straight-on, brushed aluminium body, a few tiny round buttons and a small mode dial on the right edge, a tiny engraved "SPT®" mark on the body instead of any brand name. Its LCD screen is a 3:4 portrait screen that fills most of the camera back and shows a LIVE PREVIEW: the couple selfie from ref (NO stickers on their faces, keep their faces and pose), but the background behind them is a baseball stadium at night with stands and floodlights, slightly soft. LCD overlays in a small pixel font: a battery icon top-left, "[ 23 ]" top-right, a thin white focus bracket in the middle, and an orange seven-segment date stamp " '26 12 01 " bottom-right.
Below the camera: a 2 × 2 grid of capsule-shaped pills (fully rounded ends), white with a 1.5px black outline and a soft chrome bevel, black bold text, no icons: "演唱會 / 音樂祭", "棒球應援", "拍貼機", "校園活動日". The "棒球應援" pill is pressed: filled hot pink #FF97CE, black text, two tiny four-point chrome sparkles at its top-right corner.
Under the grid, one line of small grey text: "點一個，螢幕會跟著換場景".
Bottom: three progress dots (first black, others silver) with a small "Lab Cross" crosshair mark on each side.
Only decorations allowed: one chrome four-point star near the headline.
```

## 圖 B v3：結果頁
附圖：R-ref4（結果圖，臉上愛心請照這張的大小與位置）、R-ref3（全息徽章）、R-ref5（Logo）、gen_v1_gemini.jpg（右半邊，保留它的黑底聚光、鉻字、按鈕）

```
One mobile screen, 9:19.5 portrait (1080 × 2340), full-bleed, no phone frame, no hands.
Style: same cold Y2K chrome system as the attached draft's right screen; keep its black background, halftone spotlight cone from the top, film grain, the liquid-chrome "RESULT" headline, the rarity pill and the two buttons.
Small silver text above the headline: "SPOTIME QUIZ".
Center piece (about 50% of height): a freshly printed photo, 3:4 portrait, like a convenience-store photo print — a thin white paper border, a hair-thin brushed-silver edge, rotated −3°, with a soft white glow beneath it and a faint white flash bloom at its top edge as if the shutter just fired. The photo shows the couple from ref in front of a night baseball stadium (stands, floodlights, a little bokeh), each with ONE small chrome-metallic heart sticker on the cheek — the sticker is SMALL, about the diameter of the person's eye, exactly like the size and placement in ref, not bigger. Inside the photo, bottom-right: an orange seven-segment date stamp " '26 12 01 ". On the white border under the photo: left, tiny black monospace text "♥ HEART × CHEEK"; right, the small black "SPOTIME®LAB" wordmark from ref.
Overlapping the photo's top-right corner: a round holographic rainbow-foil badge, about 14% of the screen width, with a big black "#23" in the middle and tiny text around the rim.
Scene touch, very light: three or four tiny pink and white confetti pieces drifting near the photo, nothing more.
Below the photo: a silver capsule with black text "你是第 23 位選這組的人".
Bottom: two full-width capsule buttons stacked — first filled hot pink #FF97CE with a chrome bevel and black bold text "留 Email 拿 9 折"; second white with a 1.5px black outline and black text "發到限動 @spotime".
Two chrome four-point sparkles near the photo; nothing else. No cute faces, no flowers, no checkerboard, no emoji.
```

## 兩張共用的補救句
- 貼片畫太大 → "make the stickers much smaller, coin-sized, no larger than the eye"
- 相機背面畫成正面（有鏡頭）→ "show the BACK of the camera with the LCD screen, not the lens side"
- 場景沒換 → "the background behind the couple must be a baseball stadium, not a photo studio"

---
# 素材篇（2026-09-22，v3 兩頁定案後，做網站要用的圖）

只剩兩種圖需要生：相機機身、三張場景背景。貼片鉻質感、人物去背、文字、徽章都由我在程式端做。

## 素材 1：CCD 相機背面（介面用，四頁共用一張）
附圖：gen_v3_q1.jpg（叫它照這台）

```
Product render of the BACK of the silver CCD compact digital camera shown in the reference, held vertically (portrait), straight-on, centered, on a plain pure white background, no shadow on the background, no hands, no text on screen.
The LCD screen must be completely BLACK and empty (I will place the live preview into it later). Keep the brushed-aluminium body, the "BACK" label, the four small round buttons with flash / timer / play icons, the knurled mode dial on the right edge, and the small engraved "SPT®" mark. No other brand names or logos anywhere.
Square output, 2048 × 2048, camera filling about 90% of the frame. Sharp, clean edges, studio lighting.
```

## 素材 2：三張場景背景（3:4 直式，沒有人）
附圖：gen_v3_q1.jpg 的 LCD 畫面（給它看棒球場那張的視角與夜色）

三張各生一次，共用開頭，只換場景那句：

```
Photo background plate for a couple's selfie, 3:4 portrait, 1536 × 2048. Shot at arm's length selfie height, wide-angle phone lens, slight tilt, taken at night with a small flash, so the far background is slightly soft and darker while the foreground is empty. NO people, NO text, NO logos anywhere. The middle-bottom 60% of the frame must stay uncluttered (two people will be composited there).
Scene: [換這句]
Colour: natural, a touch of the cool greenish tint of early-2000s CCD cameras, mild grain.
```

- 演唱會／音樂祭：`Scene: outdoor music festival at night, big stage with colourful LED screen and stage lights far in the background, a crowd of silhouettes with raised hands, light haze.`
- 棒球應援：`Scene: night baseball stadium from the stands, floodlights, green outfield, scoreboard far away, a few blurred fans in the front rows.`
- 拍貼機：`Scene: inside a Taiwanese photo-booth machine, bright even white light, pastel pink curtain on one side, the booth's LED-lit frame and a small screen with a countdown out of focus behind.`

校園活動日用原本情侶照的背景，不用生。

## 補救句
- 出現人 → "remove all people, empty foreground"
- 背景太清楚搶戲 → "make the far background softer and darker, like a night flash photo"

---
# 素材篇 v2（2026-09-23 驗收後的兩個重生）

演唱會、棒球兩張通過，直接用（色調我在程式端統一加 CCD 綠調＋顆粒＋暗角）。以下兩張要重生。

## 重生 1：CCD 相機背面（螢幕要改成 3:4 直式）
附圖：前一張相機圖（ccd_back_raw）

```
Regenerate the attached camera in exactly the same style — brushed-aluminium back of a silver CCD compact camera, plain pure white background, straight-on, no hands, no brand names, engraved "SPT®" mark, black empty LCD.
Change only the proportions: the LCD must be a 3:4 PORTRAIT screen (taller than wide), filling about 70% of the camera back's height and 78% of its width, positioned slightly above centre. Shrink the blank area below the screen so the four round buttons and the "BACK" label sit in a slim strip, not a wide chin. Keep the knurled mode dial on the right edge.
Square output 2048 × 2048, camera filling about 92% of the frame, sharp edges, studio lighting, no shadow on the background.
```

## 重生 2：拍貼機場景（改成韓系）
先生 A，A 不滿意再生 B。兩者都是 3:4 直式、沒有人。

### A. 韓系拍貼館棚內（建議先生這張）
```
Photo background plate for a couple's selfie, 3:4 portrait, 1536 × 2048. Arm's-length selfie height, wide-angle phone lens, slight tilt. NO people, NO text, NO logos, NO brand names. The middle-bottom 60% of the frame must stay uncluttered (two people will be composited there).
Scene: inside a modern Korean-style photo studio (인생네컷 / Plan.B style), NOT an old western coin-operated booth. A seamless pale-pink backdrop wall, bright even light from a large ring light and white LED strips running along the ceiling and the doorway frame, glossy white floor with a soft reflection. At the left edge, partly out of frame: a white vanity counter with a lit mirror and a few colourful plastic props (sunglasses, a heart sign) in a basket. At the right edge, partly out of frame: the studio's white kiosk with a glowing screen, out of focus.
Colour: clean, bright, slightly cool white balance, mild grain. Everything beyond the backdrop softly out of focus.
```

### B. 地鐵車廂造景（Plan.B 真的有這個造景，跟銀色鉻金屬方向最合）
```
(same opening paragraph as A)
Scene: a themed photo-studio set built to look like the inside of a Korean subway carriage — brushed stainless-steel wall panels, a row of blue fabric seats, vertical chrome grab poles, a red LED destination sign above the door, cool fluorescent ceiling light, a window with a dark blurred tunnel outside. It is a studio set, so it is clean, bright and empty.
Colour: cool silver-blue, mild grain, background softly out of focus.
```

## 補救句
- 又變成老式投幣拍貼亭 → "modern Korean photo studio interior, not a coin-operated booth cabin"
- 整張糊掉 → "keep the backdrop wall and the floor in focus; only the far edges are blurred"

---
# 素材篇 v3（2026-09-23）：演唱會場景重生

相機 v2 通過（螢幕量到 4:5 直式，正好對上情侶照比例）。拍貼機 A 版通過。只剩演唱會要重生。

舊那張是「戶外音樂祭、小舞台、彩虹 LED、群眾剪影」＝2015 年前後的畫面。查了 aespa / TWICE / BABYMONSTER 近年巡演的實際照片，現在的辨識點是四個：**整片同色的應援手燈海**（紫、粉紫、蜜桃色）、**室內巨蛋或 Arena 的碗狀看台**、**整面 LED 牆＋垂直成員螢幕**、**雷射光束與垂直光柱**；色調是紫粉冷藍，不是七彩。

附圖：kpop_stage_refs.jpg（六張實際舞台參考）

```
Photo background plate for a couple's selfie taken by a fan in the audience, 3:4 portrait, 1536 × 2048. Arm's-length selfie height, wide-angle phone lens, slight tilt, shot with a small flash so the empty foreground is a bit brighter. NO people's faces, NO text, NO logos, NO band names. The middle-bottom 60% of the frame must stay uncluttered (two people will be composited there).
Scene: inside a huge modern indoor K-pop arena concert, seen from the middle of the audience. Far in the background, a giant wall-to-wall LED screen and several tall vertical LED panels showing abstract violet and pink graphics only — no faces, no words. A symmetrical stage with a runway, bright white beam lights and thin laser fans cutting through light haze from the truss above. Around and below the camera, an ocean of thousands of identical handheld lightsticks all glowing the same violet-pink, rendered as soft out-of-focus glowing dots filling the lower edges of the frame. The curved tiers of arena seating are visible far left and right, also covered in the same glowing dots.
Colour: violet, magenta and cool blue, deep blacks, mild grain, slight haze. Nothing outdoors, no daylight, no grass, no rainbow colours.
```

## 補救句
- 又變成戶外音樂祭 → "indoor arena with a roof and tiered seating, not an outdoor festival field"
- 手燈海不明顯 → "the lower third must be filled with thousands of small glowing violet dots — a lightstick ocean"
- 螢幕上出現人臉／團名 → "the LED screens show abstract gradients only, no people, no text"

---

# 素材篇 v4（2026-09-23）：演唱會重生 2 — 問題是構圖不是風格

v3 生出來的圖風格全中（室內 Arena、同色手燈海、LED 牆抽象無字、雷射、紫粉冷藍），但**構圖錯位**：舞台與 LED 牆落在畫面正中央 40–60%，正好是情侶合成後會蓋住的位置。實測把情侶照套上去，剩下看得到的只有最上面那條近黑的天花板桁架，整張圖等於白做。棒球那張之所以成立，是因為照明塔和看台本來就在上緣。

另一個寫實問題：中間那片灰色場地是空的。滿場的看台配空的搖滾區＝開演前的畫面。

所以 v4 只改三件事：**視角壓低**、**舞台上移**、**手燈海從兩側往上長**。

```
Photo background plate for a couple's selfie taken by a fan standing inside the crowd at a K-pop arena concert. 3:4 portrait, 1536 x 2048. Wide-angle phone lens at arm's length, held at eye level, slight tilt, small on-camera flash.

COMPOSITION IS CRITICAL:
- The stage, the giant wall-to-wall LED screen and the tall vertical LED panels must all sit in the TOP 30% of the frame. Low camera angle, looking slightly UP at the stage from floor level.
- The left third and the right third of the frame are filled, from the bottom all the way up to the middle of the frame, with an ocean of thousands of identical handheld lightsticks all glowing the same violet-pink, close to the lens and strongly out of focus as big soft glowing bokeh dots, over the dark silhouetted backs and heads of the standing crowd.
- The CENTRE of the frame, from 30% down to the bottom, must stay dark, simple and uncluttered — only dark crowd silhouettes and faint haze. Two people will be composited there.

Scene details: huge modern indoor arena, roof trusses and curved tiers of seating visible high on both sides, also covered in the same glowing dots. The floor is packed with standing fans — never an empty floor. Thin laser fans and white beam lights cut down through heavy haze from the truss. The LED screens show abstract violet and pink gradients ONLY.

NO people's faces, NO text, NO logos, NO band names, no daylight, no outdoor festival, no grass, no rainbow colours. Colour: violet, magenta, cool blue, deep blacks, mild grain.
```

## 補救句
- 舞台又跑回中央 → "the stage must be at the very top of the frame, the bottom two thirds is only crowd"
- 中間被手燈塞滿 → "keep the centre column of the frame dark and empty, lightsticks only on the left and right edges"
- 搖滾區又空了 → "the arena floor is completely packed with standing people, shoulder to shoulder"

---
# 素材篇 v4（2026-10-02）：拍貼機場景重生（評估報告第 6 條：現在那張像攝影棚）

問題：認得出「拍貼機」的東西（道具籃、拍照機台）都在左右兩邊，人一合成進去就被蓋掉，
剩下一面粉色牆＋環形燈＝攝影棚。所以這次把辨識點放在**人頭上方那 40%**（合成後還看得到的地方）。
附圖：現在的 photobooth.jpg（給它看視角、亮度和顏色）

```
Photo background plate for a couple's selfie, 3:4 portrait, 1536 × 2048. Arm's-length selfie height, wide-angle phone lens, slight tilt. NO people, NO faces, NO readable text, NO logos, NO brand names. The middle-bottom 60% of the frame must stay uncluttered and fairly plain (two people will be composited there); everything that tells you "this is a photo booth" must sit in the TOP 40% of the frame and the outer edges.
Scene: inside a modern Korean self-photo studio (인생네컷 style) in Taiwan. The back wall, in the top 40% of the frame, is covered edge to edge with dozens of printed 4-cut photo strips (long narrow white strips, each with four small frames) pinned in neat rows — the photos on them are abstract soft colour blocks only, no faces. Above them, a slim white LED light bar. On the upper left, a wall rail of hanging props: pastel headbands with bunny and cat ears, oversized heart sunglasses, a sparkly tiara, a small mirror with round bulbs. On the upper right, out of focus, the edge of the photo kiosk's glowing touchscreen and a big round ring light. The lower wall behind the people is a plain pale-pink backdrop.
Colour: clean, bright, slightly cool white balance, silver-white fixtures, mild grain. Keep the strip wall and props readable but slightly soft; the bottom of the frame plain and calm.
```

## 補救句
- 照片牆上出現臉 → "the photo strips show only blurred colour blocks, no faces, no people"
- 辨識點又跑到下半部 → "move the photo-strip wall and the props higher, into the top third; keep the lower half plain"
- 又像老式投幣亭 → "modern Korean self-photo studio, not a coin-operated booth cabin"

## v5（2026-10-02 下午）：只改照片牆
Jimmy 看 v4 生圖：道具、環形燈、機台都 OK；問題是照片牆——真的拍貼館不會貼那麼多，而且每張都長一樣，很假。
做法：拿 v4 生出來那張（Gemini_Generated_Image_6ynxf16ynxf16ynx.jpeg）當底圖，**只改牆**，其他不動。

```
Edit the attached image. Keep EVERYTHING the same — camera angle, lighting, colours, the ring light, the kiosk on the right, the props rail and the bulb mirror on the left, the plain pink lower wall and the floor. Change ONLY the photo wall in the upper middle:
- Far fewer photos: about 14–20 prints in total, arranged loosely in an uneven cluster with natural gaps of bare wall between them — NOT a full grid, NOT neat rows.
- Mixed formats, like real customers left them: long 4-cut strips, 2×2 square prints, single instant-film style prints, a couple of small wallet-size ones. Different sizes.
- Mixed frame designs: white, black, pastel pink, baby blue, glitter silver, one holographic, one with a simple doodle border. No two neighbours look the same.
- Hung in different ways: some with clear tape, some with mini clothes-pegs on a thin wire, a few with small heart magnets. Some slightly tilted, a few overlapping, one or two corners curling.
- The pictures inside the prints are tiny and slightly out of focus, so no face is recognisable. NO readable text anywhere, NO logos.
Photoreal, same soft bright light and mild grain as the original.
```

補救句
- 又排成整齊格子 → "scatter them unevenly, different heights, leave empty wall between groups"
- 照片裡的臉太清楚 → "the photos inside the prints are tiny and blurry, faces not recognisable"
- 別的地方被改掉 → "do not change anything except the photo wall"

## v6（2026-10-02 傍晚）：照片牆往兩側補
v5 生回來那張（Gemini_Generated_Image_65lmdb65lmdb65lm.jpeg）已套進網站（graded/photobooth.jpg；舊的攝影棚留成 assets/scenes/photobooth_v2_studio.jpg）。
照片牆本身過關（量少、樣式雜、掛法不一），**但合成後整片被兩個人的頭擋住**：牆在畫面中上（x 28–83%、y 18–50%），兩個人的頭剛好蓋在那裡。
合成後還看得到的只有：最左邊一條（鏡子、髮箍）、最右邊一條（環形燈、機台）、最上面一條（燈條）。所以照片要補在這三條裡。

```
Edit the attached image. Keep EVERYTHING the same — camera angle, lighting, colours, the existing photo wall in the middle, the ring light, the kiosk, the props and the bulb mirror. ADD a few more prints ONLY at the outer edges of the frame:
- Left edge: 4–6 prints taped around the bulb-mirror frame and on the wall just below the headband rail — mixed formats (a 4-cut strip, two instant-film prints, a 2×2 print), mixed frame colours, slightly tilted.
- Right edge: a short column of 3 prints (one 4-cut strip, two small square prints) stuck on the wall between the ring light and the kiosk, overlapping a little.
- Top: 2–3 small prints clipped with mini pegs on a thin wire hanging just under the ceiling light bar.
The pictures inside the prints stay tiny and blurry, no recognisable faces. NO readable text, NO logos. Do not change anything else.
```

補救句
- 照片加到中間去了 → "only add prints in the outer 15% of the frame on the left and right, and the top 10%"
- 原本的牆被改掉 → "keep the existing middle photo wall exactly as it is"
