/** 啟動流程：讀取畫面 → 載圖層 → 測驗 → 結果頁。 */
import { lcdDate } from "./lcd-date.js";
import { createHalo, prefersReducedMotion } from "./halo-canvas.js";
import { createSheen } from "./sheen.js";
import { loadManifest, preload, scenePersons, scenePlates, url, warm } from "./layers.js";
import { flush, startFunnel, track } from "./funnel.js";
import { createLoader } from "./loader.js";
import { createMoodFx } from "./moodfx.js";
import { createCameraEdit } from "./camedit.js";
import { demoOn } from "./demo.js";
import { watchResolve } from "./fx.js";
import { createPrint } from "./printfx.js";
import { createPreview } from "./preview.js";
import { createQuiz } from "./quiz.js";
import { createResult } from "./result.js";
import { createShutter } from "./shutter.js";
import { createTilt } from "./tilt.js";
import { createSelfieFlow } from "./selfie/flow.js";
import { FINALE, HIDDEN_SHAPES, INTRO, QUESTIONS } from "./config.js";

const KEEP_WAIT_MS = 2000;      // 再測一次前存自拍最多等多久

const els = {
  loader: document.querySelector("#loader"),
  quiz: document.querySelector("#quiz"),
  question: document.querySelector(".question"),
  kicker: document.querySelector("#q-kicker"),
  title: document.querySelector("#q-title"),
  sub: document.querySelector("#q-sub"),
  options: document.querySelector("#options"),
  back: document.querySelector("#back"),
  count: document.querySelector("#hud-count"),
  date: document.querySelector("#hud-date"),
  flash: document.querySelector("#lcd-flash"),
  lcd: document.querySelector(".lcd"),
  frame: document.querySelector("#preview"),
  shutter: document.querySelector("#shutter"),
  preview: document.querySelector("#preview"),
  sheen: document.querySelector(".sheen"),
  haloCanvas: document.querySelector("#halo-canvas"),

  result: document.querySelector("#result"),
  paper: document.querySelector("#paper"),
  paperImg: document.querySelector("#paper-img"),
  paperCaption: document.querySelector("#paper-caption"),
  verdictTitle: document.querySelector("#verdict-title"),
  verdictTag: document.querySelector("#verdict-tag"),
  actions: document.querySelector("#actions"),
  igStory: document.querySelector("#ig-story"),
  faceAsk: {
    box: document.querySelector("#faceask"),
    yes: document.querySelector("#faceask-yes"),
    no: document.querySelector("#faceask-no"),
  },
  igGuide: {
    guide: document.querySelector("#igguide"),
    saveText: document.querySelector("#igguide-save"),
    postText: document.querySelector("#igguide-post"),
    open: document.querySelector("#igguide-open"),
    close: document.querySelector("#igguide-close"),
  },
  restart: document.querySelector("#restart"),
  lineOa: document.querySelector("#line-oa"),

  saveover: document.querySelector("#saveover"),
  saveoverImg: document.querySelector("#saveover-img"),
  saveoverClose: document.querySelector("#saveover-close"),

  selfieOpen: document.querySelector("#selfie-open"),
  selfie: {
    root: document.querySelector("#selfie"),
    panel: document.querySelector(".selfie__panel"),
    grab: document.querySelector("#selfie-grab"),
    close: document.querySelector("#selfie-close"),
    ruleNeck: document.querySelector("#selfie-rule-neck"),
    prep: document.querySelector("#selfie-prep"),
    meter: document.querySelector("#selfie-meter"),
    progress: document.querySelector("#selfie-progress"),
    busyMeterWrap: document.querySelector("#selfie-busy-meter"),
    busyMeter: document.querySelector("#selfie-busy-meter-fill"),
    skip: document.querySelector("#selfie-skip"),
    thumb: document.querySelector("#selfie-thumb"),
    busy: document.querySelector("#selfie-busy"),
    bg: document.querySelector("#selfie-bg"),
    canvas: document.querySelector("#selfie-canvas"),
    hint: document.querySelector("#selfie-hint"),
    tools: document.querySelector("#selfie-tools"),
    rotCcw: document.querySelector("#selfie-rot-ccw"),
    rotCw: document.querySelector("#selfie-rot-cw"),
    reset: document.querySelector("#selfie-reset"),
    verdict: document.querySelector("#selfie-verdict"),
    done: document.querySelector("#selfie-done"),
    cheek: document.querySelector("#selfie-cheek"),
    again: document.querySelector("#selfie-again"),
    file: document.querySelector("#selfie-file"),
  },
};

/** 背景的動態層。壞掉也只是少了動畫，不能讓整個頁面停在讀取畫面，
   所以自己吞掉錯誤、退回 CSS 的靜態 PNG。 */
function startBackground() {
  createSheen(els.sheen);
  // 陀螺儀 10-02 起預設打開（Jimmy 反映手機上不會動：網址少帶 ?demo=tilt 就沒開）；?tilt=off 關掉
  if (new URLSearchParams(location.search).get("tilt") !== "off") createTilt(document.querySelector(".camera"));
  if (prefersReducedMotion()) return;
  if (!els.haloCanvas) { document.body.classList.add("halo-static"); return; }
  try {
    els.haloCanvas.hidden = false;
    createHalo(els.haloCanvas);
    document.body.classList.add("is-live");
  } catch (error) {
    console.error("背景動畫啟動失敗，改用靜態圖", error);
    els.haloCanvas.hidden = true;
    document.body.classList.remove("is-live");
    document.body.classList.add("halo-static");
  }
}

/** 開機動畫靠這兩個 class 驅動。刻意在 JS 裡加而不是寫死在 HTML：
   萬一模組整個沒載到，畫面要維持可見，不能被藏起來。 */
function markBooting() {
  document.body.classList.add("is-booting");
}

function markBooted() {
  document.body.classList.remove("is-booting");
  document.body.classList.add("is-booted");
}

async function boot() {
  markBooting();
  startFunnel();
  // iOS Safari 要有 touchstart 監聽，:active 才會在手指按下的當下生效（按鈕的按下回饋）
  document.addEventListener("touchstart", () => {}, { passive: true });
  const loader = createLoader(els.loader, { onFadeStart: markBooted });
  els.date.textContent = lcdDate();
  // 11-17 結果頁不再顯示比例，進站不必再抓組合統計表（stats.js prefetchStats）
  startBackground();

  let manifest;
  try {
    manifest = await loadManifest();
    await preload(manifest);
  } catch (error) {
    console.error("素材載入失敗", error);
    loader.fail("素材載入失敗，重新整理試試");
    return;
  }

  const preview = createPreview(manifest, els.preview);
  // 選了範例照片才需要合照在各場景的人物層；用自拍的人省下約 600 KB
  const warmPersons = () => warm(scenePersons(manifest)).catch(() => {});
  const moodFx = createMoodFx(els.preview.closest(".lcd"));
  const result = createResult({
    manifest,
    els: {
      quiz: els.quiz,
      result: els.result,
      paper: els.paper,
      paperImg: els.paperImg,
      paperCaption: els.paperCaption,
      title: els.verdictTitle,
      tag: els.verdictTag,
      actions: els.actions,
      igStory: els.igStory,
      faceAsk: els.faceAsk,
      igGuide: els.igGuide,
      restart: els.restart,
      lineOa: els.lineOa,
      saveover: els.saveover,
      saveoverImg: els.saveoverImg,
      saveoverClose: els.saveoverClose,
      page: document.querySelector("main.stage"),
      selfieOpen: els.selfieOpen,
    },
    // 存自拍要寫 IndexedDB（非同步）；最多等 KEEP_WAIT_MS，存不進去也照樣重新開始
    onRestart: () => {
      Promise.race([selfie.keep(), new Promise((r) => setTimeout(r, KEEP_WAIT_MS))])
        .finally(() => location.reload());
    },
  });

  const selfie = createSelfieFlow({
    els: { ...els.selfie, open: els.selfieOpen },
    manifest,
    currentAnswers: result.answers,
    onApply: result.applySelfie,
    onPreview: (next) => preview.useSelfie(next),
  });
  selfie.restoreKept();

  // 選完位置在相機螢幕上修圖、答完按快門才出結果（09-30 Jimmy 看過 demo 定案）
  const cameraEdit = createCameraEdit({
    quiz: els.quiz,
    lcd: els.lcd,
    keys: document.querySelector("#cam-keys"),
    shutter: document.querySelector("#cam-shutter"),
    hint: document.querySelector("#cam-hint"),
    hintText: document.querySelector("#cam-hint-text"),
    ok: document.querySelector("#cam-ok"),
    add: document.querySelector("#cam-add"),
    bin: document.querySelector("#cam-bin"),
    bg: document.querySelector("#cam-bg"),
  }, selfie, [...QUESTIONS.find((q) => q.key === "shape").options, ...HIDDEN_SHAPES].map((o) => ({
    shape: o.value, label: o.label, src: url(manifest.stickers[o.value].src),
    hidden: HIDDEN_SHAPES.includes(o),
  })));
  // transitions.dev 挑的動效（fx.js、motion.css 的 body.fx 區塊）：09-30 Jimmy 看過，全部留
  document.body.classList.add("fx");
  watchResolve(document.querySelector('.selfie__step[data-step="busy"]'), document.querySelector(".selfie__thumb"));

  createQuiz({
    preview,
    shutter: createShutter(els.shutter, {
      lcd: els.lcd, frame: els.frame, flash: els.flash,
    }),
    els,
    intro: {
      kicker: INTRO.kicker,
      title: INTRO.title,
      sub: INTRO.sub,
      options: selfie.hasKept()
        ? [
          // funnel：選了這個算「用自拍」（流量漏斗，funnel.js）
          { label: INTRO.reuse, funnel: "selfie", onPick: () => selfie.openEarly() },
          { label: INTRO.change, variant: "wide", funnel: "selfie", onPick: () => selfie.openEarly({ fresh: true }) },
          // 開場螢幕已經換成上次的自拍（restoreKept），選範例照片就換回來
          { label: INTRO.couple, variant: "skip", onPick: async () => { warmPersons(); return selfie.forget(); } },
        ]
        : [
          { label: INTRO.selfie, funnel: "selfie", onPick: () => selfie.openEarly() },
          { label: INTRO.couple, variant: "skip", onPick: async () => { warmPersons(); } },
        ],
    },
    // 自拍的人選完位置，馬上校正貼片；結果頁只負責展示
    onMood: (value, btn) => moodFx.play(value, btn),
    // 等快門打開、看得到貼片疊上去，再開校正面板
    onAnswered: (key, answers, shot) => {
      if (key !== "position") return null;
      return shot.then(() => cameraEdit.edit(answers));
    },
    finale: { ...FINALE, arm: cameraEdit.arm, disarm: cameraEdit.disarm },
    // 保留原本背景的自拍：場景題畫面不會變，當普通題目，不按快門（10-06 Jimmy）
    still: (key) => key === "scene" && selfie.keepsBackground(),
    onFinish: (answers, timing = {}) => {
      // 出片 demo：一按快門就黑掉，結果圖在背景畫；畫好了相機才吐出相紙
      const print = demoOn("print") ? createPrint({ quiz: els.quiz, lcd: els.lcd, camera: els.quiz.querySelector(".camera") }) : null;
      print?.shutter();
      let picked = null;
      try {
        picked = selfie.customFor(answers);
      } catch (error) {
        console.error("自拍合成失敗，改用預設合照", error);
      }
      result.show(answers, picked, print, timing).catch((error) => {
        console.error("結果頁出錯", error);
        els.verdictTitle.textContent = "出圖失敗";
        els.verdictTag.textContent = "重新整理再試一次。";
        els.verdictTag.classList.add("is-on");
      });
    },
  }).start();

  await loader.dismiss();
  track("ready");
  flush();                               // 進站、讀取完成先送一次：就算離開時沒送成，這兩格也有
  // 場景背景第 3 題才用到，讀取畫面收掉後才在背景載（10-06 載入速度）
  warm(scenePlates(manifest)).catch(() => {});
}

boot().catch((error) => {
  // 這裡接到的是啟動流程自己壞掉（不是素材載不到），
  // 不攔的話讀取畫面會一直轉，使用者只看得到 LOADING
  console.error("啟動失敗", error);
  markBooted();                        // 失敗也要把畫面放出來，不能停在全透明
  const hint = document.querySelector("#loader-hint");
  if (hint) hint.textContent = "頁面啟動失敗，請重新整理";
  document.documentElement.dataset.boot = "failed";
  document.querySelector(".loader__blocks")?.remove();
});
