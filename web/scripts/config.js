/** 題目與選項文案。要改字只要改這個檔。
   09-24 依 Jimmy 的版本改寫：大標題走英文短句、小標題才是中文說明，
   而且題序改成「造型 → 場景 → 位置」——第一題問符號，最貼近品牌本身。 */
export const QUESTIONS = Object.freeze([
  /* 09-29 晚加的兩題（Jimmy：「先照你的建議順序並挑選適合的選項，之後再微調」）。
     affects 決定這題按下去相機螢幕會怎麼變：
       image ＝ 換圖層（造型、場景、位置），也算進稀有度的組合
       mood  ＝ 心情：不進組合、不改結果圖，只決定結果頁的英文短句（選完的特效 09-30 待 Jimmy 從 demo 挑）
       none  ＝ 什麼都不變、不按快門（最後一題），答完直接出結果 */
  Object.freeze({
    key: "mood",
    affects: "mood",
    title: "How’s the mood today?",
    sub: "今天心情如何",
    options: Object.freeze([
      { value: "happy", label: "剛打扮完自己|心情正好 🍅" },   // 10-12 雲朵款取消，C083 改寫
      { value: "bored", label: "好無聊~|想找點|有趣的事情做 ⭐" },
      { value: "crush", label: "最近有了|喜歡的人 🩷" },
      { value: "blue", label: "遇到壞事|小難過qq 💧" },
    ]),
  }),
  Object.freeze({
    key: "shape",
    affects: "image",
    title: "Find your SPOT",
    sub: "找出最能代表我的符號",
    options: Object.freeze([
      { value: "heart", label: "愛心", code: "HEART" },
      { value: "star", label: "星星", code: "STAR" },
      { value: "teardrop", label: "水滴", code: "DROP" },
      { value: "tomato", label: "蕃茄", code: "TOMATO" },   // 10-08 打樣後雲朵款取消，換成蕃茄款
    ]),
  }),
  Object.freeze({
    key: "scene",
    affects: "image",
    title: "Where’s the spot?",
    sub: "這個週末想去哪走走",
    options: Object.freeze([
      { value: "concert", label: "演唱會", code: "CONCERT" },
      { value: "baseball", label: "棒球場", code: "BALLPARK" },
      { value: "photobooth", label: "拍貼機", code: "PHOTOBOOTH" },
      { value: "campus", label: "校園活動", code: "CAMPUS" },
    ]),
  }),
  Object.freeze({
    key: "position",
    affects: "image",
    title: "Be yourself",
    sub: "其實不管貼在哪都好看",
    options: Object.freeze([
      { value: "cheek", label: "臉頰", code: "CHEEK" },
      { value: "under_eye", label: "眼下", code: "UNDER EYE" },
      { value: "forehead_side", label: "額角", code: "TEMPLE" },
      { value: "neck", label: "脖子", code: "NECK" },
    ]),
  }),
  /* 分眾用（email 內容分流），結果頁不顯示。由深到淺的四階，選項 09-30 Jimmy 定稿。
     大小標 09-30 晚改：盲測說英文和中文各講各的；Jimmy 要大標英文、小標中文，講「貼出門炫耀」。 */
  Object.freeze({
    key: "familiarity",
    affects: "none",
    title: "Time to flex?",
    sub: "找到你的造型貼了！|平常會貼出門|跟朋友炫耀嗎？",
    options: Object.freeze([
      { value: "daily", label: "出門必貼！" },
      { value: "events", label: "有活動、節慶才會貼" },
      { value: "curious", label: "想嘗試，但怕駕馭不來" },
      { value: "new", label: "我沒聽過什麼是造型貼" },
    ]),
  }),
]);

/** 會改變結果圖的三題。稀有度的組合、相紙上的代號都只看這三題。 */
export const IMAGE_QUESTIONS = Object.freeze(QUESTIONS.filter((q) => q.affects === "image"));

/** 隱藏款（10-12 Jimmy）：不進題目、不算稀有度，只在修圖「+ADD」膠囊往左滑才看得到。
   不做左右翻轉（Jimmy 定）。顏色：翅膀深藍、四葉草薄荷綠（tools/make_stickers.py） */
export const HIDDEN_SHAPES = Object.freeze([
  Object.freeze({ value: "wing", label: "翅膀" }),
  Object.freeze({ value: "clover", label: "四葉草" }),
]);

/** 第一題之前的開場：要不要用自己的自拍。
   09-30 Jimmy：小標題說明這個網頁在做什麼（造型貼合成到照片上）、邀請一起創作，不提誘因。
   選了自拍也可以中途關掉，一樣走完測驗；結果頁的「換成我的自拍」一直都在。 */
export const INTRO = Object.freeze({
  kicker: "READY?",
  title: "Ready to start?",
  sub: "把 SPOTIME 造型貼|合成到你的照片上，|一起創作屬於你的 SPOTIME 吧！",
  selfie: "使用我的自拍照",
  couple: "略過至下一步",
  // 再測一次、上次用過自拍（10-02 Jimmy：預設沿用，但要能換）
  reuse: "沿用剛才的自拍",
  change: "換一張自拍照",
});

/** 答完最後一題的「按快門」畫面（?demo=shutter）。純粹是拍照的儀式感 */
/** 10-02 Jimmy：相機拉近、下面的字減少——不要 SHUTTER 小標、說明前面不要箭頭，提示交給快門本身的效果 */
export const FINALE = Object.freeze({
  kicker: "",
  title: "Look cute!",   // 10-06 Jimmy：引號拿掉
  sub: "按下相機右邊的快門，拍下你的 SPOTIME",
});

/** 結果頁的大標題。 */
export const RESULT_TITLE = "My SPOTIME";

/**
 * 結果頁講稀有度的中文句。前半段（比例）才是真正在報稀有度的地方，
 * 所以它綁級距、不隨機；後半段的英文短句 RARITY_TAGLINES 才隨機。
 * ratio <= rare 用「只有」的講法，其他用平述句。
 */
export const RARITY_RARE_MAX = 0.03;
export const RARITY_LINES = Object.freeze({
  rare: (pct) => `只有 ${pct} 的人跟你選擇一樣。`,
  normal: (pct) => `${pct} 的人跟你有相同選擇。`,
});

/**
 * 英文短句，依心情分四組（草稿，等 Jimmy 定）。**只換句子，不影響稀有度的數字**。
 * 每一句都可以出現在任何稀有度——講的是態度不是稀有度。
 * 難過那組刻意把焦點放回自己，不說「跟你一樣難過的人有 3%」這種話。
 * 要加句子直接往下加，程式不用改；沒答心情時用 any。
 */
export const RARITY_TAGLINES = Object.freeze({
  happy: Object.freeze([
    "that's fire 🔥",
    "ripe & ready to glow 🍅",   // 10-12 C143，原本 feel like cloud 9 ☁️
    "not too late for the party 🎧",
  ]),
  bored: Object.freeze([
    "boring day? not anymore ⭐",
    "Let's make your SPOTIME with us <3",
    "Not a SPOT, your SPOTIME >ᴗo",
  ]),
  crush: Object.freeze([
    "a little hint, a lot of heart 🩷",
    "they'll notice. trust us ♥︎",
    "My SPOTIME created by me ♥︎",
  ]),
  blue: Object.freeze([
    "today is about you 💧",
    "be gentle with yourself <3",
    "your SPOTIME, your pace ♥︎",
  ]),
  any: Object.freeze([
    "that's fire 🔥",
    "not too late for the party 🎧",
    "Let's make your SPOTIME with us <3",
    "My SPOTIME created by me ♥︎",
    "Not a SPOT, your SPOTIME >ᴗo",
  ]),
});

/** 選完到開始換題的停頓：看得到粉紅色選到了就換。
   09-30 以前是等快門跑完再停 620ms，每題鎖 1.2 秒；專家 A1 建議 0.4 秒內就能點下一題。
   快門和 LOADED 會跟換題同時跑完，圖層疊上去還是看得到。 */
export const PICK_BEAT_MS = 150;   // 09-30 二測：200＋換題 150 剛好卡在 0.4 秒邊緣，有一下點擊被吃掉

/** 後端網址。email 與作答統計都送這裡，設定步驟在 backend/README.md。
   為 null 時表單只驗格式、不會真的送出，console 會警告。

   後端是 Apps Script 專案「SPOTIME QUIZ 後端」，繫結在試算表「SPOTIME 測驗結果」。
   試算表裡有訂閱者的 email，所以試算表 ID 不寫在任何檔案裡。
   改了 Code.gs 之後要「管理部署作業 → 編輯 → 版本：新版本」重新部署，
   只按存檔線上跑的還是舊版。

   10-05 起網頁不直接打 Google，改打同網域的 /api（worker/api.js）：
   那一層做每個 IP 的限流、補通行碼、失敗自動重送，再轉給 Apps Script。
   Apps Script 的網址存在 Cloudflare 的 secret（APPS_SCRIPT_URL），不放公開檔案。
   本機 127.0.0.1 沒有 /api，要測送出請用測試站。 */
export const API_ENDPOINT = "/api";

/** 稀有度要不要讀真實資料。
   true＝每次出結果都問後端「這個組合有幾人」，但**累計不到 300 筆時
   rarity.js 還是會用估計值**，過了 300 才自動換成真實比例，不用再回來改。
   false＝永遠用估計值（後端出狀況時的緊急開關）。

   09-29 以前這個開關同時管「要不要記作答」，關著的結果是作答一筆都沒進
   試算表。現在兩件事拆開了：作答一律照記，這裡只管稀有度讀不讀。 */
export const USE_LIVE_STATS = true;

/** 結果頁最多再等多久。統計表一進站就在背景抓（見 stats.js），
   到結果頁時通常已經在手上；還沒到就再等這麼久，超過就先用估計值。 */
export const STATS_TIMEOUT_MS = 2500;

/** 進站時背景抓統計表的上限。Google 回應實測 9～27 秒（09-29），給寬一點。 */
export const PREFETCH_TIMEOUT_MS = 30000;
